/**
 * Enhanced Webhook Controller
 * Handles all 20+ ClickUp webhook events with full AI integration
 * Stores complete task data and processes with AI analysis
 */

import logger from '../core/logger.js';
import eventBus, { EVENTS } from '../core/eventBus.js';
import enhancedClickUpService from '../services/clickup/enhancedClickupService.js';
import taskWeightingService from '../services/ai/taskWeightingService.js';
import gamificationService from '../services/gamification/gamificationService.js';
import databaseService from '../database/index.js';
import { findMemberById, findMemberByEmail } from '../config/team.js';
import { TASK_STATUS } from '../config/constants.js';

// Event trigger types mapping
const TRIGGER_TYPES = {
  // Task Management
  TASK_CREATED: 'task_created',
  TASK_UPDATED: 'task_updated',
  TASK_DELETED: 'task_deleted',
  ASSIGNEE_ADDED: 'assignee_add',
  ASSIGNEE_REMOVED: 'assignee_rem',
  STATUS_CHANGED: 'status_updated',
  PRIORITY_CHANGED: 'priority_updated',
  NAME_CHANGED: 'name_updated',
  DESCRIPTION_CHANGED: 'description_updated',
  TAG_ADDED: 'tag_added',
  TAG_REMOVED: 'tag_removed',
  CUSTOM_FIELD_CHANGED: 'custom_field_updated',
  TASK_LINKED: 'task_linked',
  TASK_UNLINKED: 'task_unlinked',
  TASK_TYPE_CHANGED: 'task_type_changed',

  // Checklists
  CHECKLIST_ITEM_CREATED: 'checklistItem_created',
  CHECKLIST_ITEM_UPDATED: 'checklistItem_updated',
  CHECKLIST_ITEM_RESOLVED: 'checklistItem_resolved',
  ALL_CHECKLISTS_RESOLVED: 'all_checklists_resolved',

  // Subtasks
  SUBTASK_CREATED: 'subtask_created',
  SUBTASK_UPDATED: 'subtask_updated',
  ALL_SUBTASKS_RESOLVED: 'all_subtasks_resolved',

  // Dates
  DUE_DATE_CHANGED: 'dueDate_updated',
  START_DATE_CHANGED: 'startDate_updated',
  DUE_DATE_ARRIVES: 'taskDueDateUpdated',
  START_DATE_ARRIVES: 'taskStartDateUpdated',
  DATE_CUSTOM_FIELD_ARRIVES: 'taskDateCustomFieldUpdated',

  // Time
  TIME_TRACKED: 'taskTimeTracked',
  TIME_ESTIMATE_CHANGED: 'taskTimeEstimateUpdated',

  // Comments
  COMMENT_POSTED: 'taskCommentPosted',
  COMMENT_UPDATED: 'taskCommentUpdated'
};

const TRIGGER_CATEGORIES = {
  TASK_MANAGEMENT: 'task_management',
  DATES_TIME: 'dates_time',
  ASSIGNMENTS: 'assignments',
  CHECKLIST: 'checklist',
  SUBTASKS: 'subtasks',
  COMMENTS: 'comments'
};

/**
 * Main webhook handler - routes to specific handlers
 */
export async function handleWebhook(req, res) {
  try {
    // Extract webhook ID from URL (if provided)
    const webhookId = req.params.webhookId || 'default';

    // Parse body - handle Buffer, string, or object
    let body;
    if (Buffer.isBuffer(req.body)) {
      body = JSON.parse(req.body.toString('utf8'));
    } else if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    // Handle ClickUp test ping
    if (body.body && body.body.includes('Test message')) {
      logger.info('Received ClickUp webhook test ping', { webhookId });
      return res.status(200).json({ success: true, message: 'Webhook endpoint is working!', webhookId });
    }

    // Handle ClickUp webhook challenge (initial setup)
    if (body.challenge) {
      logger.info('Received ClickUp webhook challenge', { webhookId });
      return res.status(200).json({ challenge: body.challenge });
    }

    // Handle automation webhook structure: {auto_id, trigger_id, date, payload}
    let event, taskId, taskData = null;

    if (body.auto_id && body.trigger_id && body.payload) {
      // This is an automation webhook - extract task from payload
      taskData = body.payload;
      taskId = taskData.id;

      // Determine event type from task status or default to updated
      if (taskData.status) {
        const statusName = taskData.status.status?.toLowerCase();
        if (statusName === 'complete' || statusName === 'closed') {
          event = TRIGGER_TYPES.STATUS_CHANGED;
        } else {
          event = TRIGGER_TYPES.TASK_UPDATED;
        }
      } else {
        event = TRIGGER_TYPES.TASK_UPDATED;
      }

      logger.info('Automation webhook received', {
        webhookId,
        autoId: body.auto_id,
        triggerId: body.trigger_id,
        taskId,
        taskName: taskData.name
      });
    } else {
      // Standard webhook structure: {event, task_id, ...}
      event = body.event;
      taskId = body.task_id;

      if (!event || !taskId) {
        logger.warn('Webhook missing event or task_id', {
          webhookId,
          hasEvent: !!event,
          hasTaskId: !!taskId,
          bodyKeys: Object.keys(body),
          bodyPreview: JSON.stringify(body).substring(0, 200)
        });
        return res.status(400).json({ error: 'Missing event or task_id' });
      }

      logger.info('Standard webhook received', { webhookId, event, taskId });
    }

    // Fetch or use complete task data
    let task;
    if (taskData) {
      // Use task data from automation webhook payload - transform and store
      task = enhancedClickUpService.transformTaskData(taskData);
      await databaseService.upsertTask(task);
    } else {
      // Fetch complete task data from ClickUp API and store in database
      task = await enhancedClickUpService.fetchCompleteTaskData(taskId);
    }

    // Calculate AI weight if not already done
    if (!task.ai_weight) {
      await taskWeightingService.calculateTaskWeight(task);
    }

    // Store event in database
    const eventData = {
      event_id: body.webhook_id || body.trigger_id || `${taskId}_${Date.now()}`,
      task_id: taskId,
      trigger_type: event,
      trigger_category: categorizeTrigger(event),
      changed_by_id: body.history_items?.[0]?.user?.id?.toString() || taskData?.creator?.id?.toString() || null,
      changed_by_username: body.history_items?.[0]?.user?.username || taskData?.creator?.username || null,
      changed_at: body.history_items?.[0]?.date ? parseInt(body.history_items[0].date) : (body.date ? new Date(body.date).getTime() : Date.now()),
      field_name: body.history_items?.[0]?.field || null,
      prev_value: body.history_items?.[0]?.before ? JSON.stringify(body.history_items[0].before) : null,
      next_value: body.history_items?.[0]?.after ? JSON.stringify(body.history_items[0].after) : null,
      raw_payload: JSON.stringify(body)
    };

    // Store event in database (async for file database)
    if (databaseService.insertEvent) {
      try {
        await databaseService.insertEvent(eventData);
      } catch (dbError) {
        logger.warn('Failed to store event in database', {
          error: dbError.message,
          event_id: eventData.event_id
        });
      }
    }

    // Route to specific handler
    try {
      await routeToHandler(event, body, task);
    } catch (handlerError) {
      logger.error('Event handler failed', {
        event,
        error: handlerError.message,
        stack: handlerError.stack
      });
      // Continue anyway - don't fail the webhook
    }

    res.status(200).json({ success: true, event, taskId, webhookId });
  } catch (error) {
    logger.error('Webhook handling error', {
      error: error.message,
      stack: error.stack,
      body: req.body ? JSON.stringify(req.body).substring(0, 500) : 'no body'
    });
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Categorize trigger type
 */
function categorizeTrigger(event) {
  if (event.includes('assignee')) return TRIGGER_CATEGORIES.ASSIGNMENTS;
  if (event.includes('date') || event.includes('Date') || event.includes('time') || event.includes('Time')) {
    return TRIGGER_CATEGORIES.DATES_TIME;
  }
  if (event.includes('checklist') || event.includes('Checklist')) return TRIGGER_CATEGORIES.CHECKLIST;
  if (event.includes('subtask') || event.includes('Subtask')) return TRIGGER_CATEGORIES.SUBTASKS;
  if (event.includes('comment') || event.includes('Comment')) return TRIGGER_CATEGORIES.COMMENTS;
  return TRIGGER_CATEGORIES.TASK_MANAGEMENT;
}

/**
 * Route webhook to specific handler based on event type
 */
async function routeToHandler(event, body, task) {
  const historyItem = body.history_items?.[0];
  const changedBy = historyItem?.user?.username || 'Unknown';

  switch (event) {
    // ==================== TASK MANAGEMENT ====================
    case TRIGGER_TYPES.TASK_CREATED:
      return await handleTaskCreated(task, body);

    case TRIGGER_TYPES.ASSIGNEE_ADDED:
      return await handleAssigneeAdded(task, historyItem, changedBy);

    case TRIGGER_TYPES.ASSIGNEE_REMOVED:
      return await handleAssigneeRemoved(task, historyItem, changedBy);

    case TRIGGER_TYPES.STATUS_CHANGED:
      return await handleStatusChanged(task, historyItem, changedBy);

    case TRIGGER_TYPES.PRIORITY_CHANGED:
      return await handlePriorityChanged(task, historyItem, changedBy);

    case TRIGGER_TYPES.NAME_CHANGED:
      return await handleNameChanged(task, historyItem, changedBy);

    case TRIGGER_TYPES.TAG_ADDED:
      return await handleTagAdded(task, historyItem, changedBy);

    case TRIGGER_TYPES.TAG_REMOVED:
      return await handleTagRemoved(task, historyItem, changedBy);

    case TRIGGER_TYPES.CUSTOM_FIELD_CHANGED:
      return await handleCustomFieldChanged(task, historyItem, changedBy);

    case TRIGGER_TYPES.TASK_TYPE_CHANGED:
      return await handleTaskTypeChanged(task, historyItem, changedBy);

    case TRIGGER_TYPES.TASK_LINKED:
      return await handleTaskLinked(task, historyItem, changedBy);

    case TRIGGER_TYPES.TASK_UNLINKED:
      return await handleTaskUnlinked(task, historyItem, changedBy);

    // ==================== DATES & TIME ====================
    case TRIGGER_TYPES.DUE_DATE_CHANGED:
      return await handleDueDateChanged(task, historyItem, changedBy);

    case TRIGGER_TYPES.START_DATE_CHANGED:
      return await handleStartDateChanged(task, historyItem, changedBy);

    case TRIGGER_TYPES.DUE_DATE_ARRIVES:
      return await handleDueDateArrives(task);

    case TRIGGER_TYPES.START_DATE_ARRIVES:
      return await handleStartDateArrives(task);

    case TRIGGER_TYPES.TIME_TRACKED:
      return await handleTimeTracked(task, historyItem, changedBy);

    // ==================== CHECKLISTS ====================
    case TRIGGER_TYPES.CHECKLIST_ITEM_RESOLVED:
      return await handleChecklistItemResolved(task, historyItem, changedBy);

    case TRIGGER_TYPES.ALL_CHECKLISTS_RESOLVED:
      return await handleAllChecklistsResolved(task, changedBy);

    // ==================== SUBTASKS ====================
    case TRIGGER_TYPES.SUBTASK_CREATED:
      return await handleSubtaskCreated(task, body, changedBy);

    case TRIGGER_TYPES.ALL_SUBTASKS_RESOLVED:
      return await handleAllSubtasksResolved(task, changedBy);

    // ==================== COMMENTS ====================
    case TRIGGER_TYPES.COMMENT_POSTED:
      return await handleCommentPosted(task, body, changedBy);

    default:
      logger.debug('Unhandled webhook event', { event });
      return;
  }
}

// ==================== HANDLER FUNCTIONS ====================

/**
 * Handle task created
 */
async function handleTaskCreated(task, body) {
  const assignees = getAssigneesWithInfo(task);

  // Emit event for notification service to handle
  eventBus.emitEvent(EVENTS.TASK_CREATED, { task, assignees });

  logger.success('Task created event emitted', {
    taskId: task.id,
    aiWeight: task.ai_weight || 10,
    assignees: assignees.length
  });
}

/**
 * Handle assignee added
 */
async function handleAssigneeAdded(task, historyItem, changedBy) {
  const newAssignee = historyItem?.after?.assignee;
  if (!newAssignee) return;

  const member = findMemberById(newAssignee.id) || findMemberByEmail(newAssignee.email);
  const assigneeInfo = member ? {
    id: member.id,
    name: member.name,
    phone: member.phone,
    email: member.email
  } : {
    id: newAssignee.id,
    name: newAssignee.username,
    email: newAssignee.email
  };

  // Emit event for notification service
  eventBus.emitEvent(EVENTS.TASK_ASSIGNED, {
    task,
    assignees: [assigneeInfo],
    assignedBy: changedBy
  });

  logger.success('Assignee added event emitted', {
    taskId: task.id,
    assignee: assigneeInfo.name
  });
}

/**
 * Handle assignee removed
 */
async function handleAssigneeRemoved(task, historyItem, changedBy) {
  const removedAssignee = historyItem?.before?.assignee;
  if (!removedAssignee) return;

  const member = findMemberById(removedAssignee.id) || findMemberByEmail(removedAssignee.email);
  const assigneeName = member?.name || removedAssignee.username;

  // Emit event for notification service
  eventBus.emitEvent(EVENTS.TASK_UNASSIGNED, {
    task,
    assigneeName,
    unassignedBy: changedBy
  });

  logger.success('Assignee removed event emitted', {
    taskId: task.id,
    assignee: assigneeName
  });
}

/**
 * Handle status changed (including completion)
 */
async function handleStatusChanged(task, historyItem, changedBy) {
  const beforeStatus = historyItem?.before?.status || 'Unknown';
  const afterStatus = task.status_name || historyItem?.after?.status || 'Unknown';
  const isComplete = TASK_STATUS.NON_OPEN.includes(afterStatus.toLowerCase().trim());

  if (isComplete) {
    // Task completed - process gamification
    let userId = null;
    if (task.assignee_ids && task.assignee_ids.length > 0) {
      userId = typeof task.assignee_ids === 'string' ?
        JSON.parse(task.assignee_ids)[0] :
        task.assignee_ids[0];
    }

    let gamificationResult = null;
    if (userId) {
      try {
        gamificationResult = await gamificationService.processCompletedTask(task, userId);
      } catch (error) {
        logger.error('Gamification failed', { error: error.message });
      }
    }

    // Emit event for notification service with gamification data
    eventBus.emitEvent(EVENTS.TASK_COMPLETED, {
      task,
      userName: changedBy,
      gamificationResult
    });

    logger.success('Task completed event emitted', {
      taskId: task.id,
      aiWeight: task.ai_weight || 10,
      points: gamificationResult?.pointsEarned
    });
  } else {
    // Just status changed
    eventBus.emitEvent(EVENTS.TASK_STATUS_CHANGED, {
      task,
      beforeStatus,
      afterStatus,
      userName: changedBy
    });

    logger.success('Task status changed event emitted', {
      taskId: task.id,
      from: beforeStatus,
      to: afterStatus
    });
  }
}

/**
 * Handle priority changed
 */
async function handlePriorityChanged(task, historyItem, changedBy) {
  const beforePriority = historyItem?.before?.priority?.priority || 'عادية';
  const afterPriority = task.priority_label || historyItem?.after?.priority?.priority || 'عادية';

  // Emit event for notification service
  eventBus.emitEvent(EVENTS.TASK_PRIORITY_CHANGED, {
    task,
    beforePriority,
    afterPriority,
    userName: changedBy
  });

  logger.success('Priority changed event emitted', {
    taskId: task.id,
    from: beforePriority,
    to: afterPriority
  });
}

/**
 * Handle task name changed
 */
async function handleNameChanged(task, historyItem, changedBy) {
  const beforeName = historyItem?.before?.name || 'Unknown';

  eventBus.emitEvent(EVENTS.TASK_NAME_CHANGED, {
    task,
    beforeName,
    afterName: task.name,
    userName: changedBy
  });

  logger.success('Name changed event emitted', { taskId: task.id });
}

/**
 * Handle tag added
 */
async function handleTagAdded(task, historyItem, changedBy) {
  const newTag = historyItem?.after?.tag?.name || historyItem?.after?.tag;

  eventBus.emitEvent(EVENTS.TASK_TAG_ADDED, {
    task,
    tag: newTag,
    userName: changedBy
  });

  logger.success('Tag added event emitted', { taskId: task.id, tag: newTag });
}

/**
 * Handle tag removed
 */
async function handleTagRemoved(task, historyItem, changedBy) {
  const removedTag = historyItem?.before?.tag?.name || historyItem?.before?.tag;

  eventBus.emitEvent(EVENTS.TASK_TAG_REMOVED, {
    task,
    tag: removedTag,
    userName: changedBy
  });

  logger.success('Tag removed event emitted', { taskId: task.id, tag: removedTag });
}

/**
 * Handle custom field changed
 */
async function handleCustomFieldChanged(task, historyItem, changedBy) {
  const fieldName = historyItem?.after?.custom_field?.name || 'Unknown field';
  const newValue = historyItem?.after?.custom_field?.value || 'N/A';

  eventBus.emitEvent(EVENTS.TASK_CUSTOM_FIELD_CHANGED, {
    task,
    fieldName,
    newValue,
    userName: changedBy
  });

  logger.success('Custom field changed event emitted', { taskId: task.id });
}

/**
 * Handle task type changed
 */
async function handleTaskTypeChanged(task, historyItem, changedBy) {
  eventBus.emitEvent(EVENTS.TASK_TYPE_CHANGED, {
    task,
    userName: changedBy
  });

  logger.success('Task type changed event emitted', { taskId: task.id });
}

/**
 * Handle task linked
 */
async function handleTaskLinked(task, historyItem, changedBy) {
  eventBus.emitEvent(EVENTS.TASK_LINKED, {
    task,
    userName: changedBy
  });

  logger.success('Task linked event emitted', { taskId: task.id });
}

/**
 * Handle task unlinked
 */
async function handleTaskUnlinked(task, historyItem, changedBy) {
  eventBus.emitEvent(EVENTS.TASK_UNLINKED, {
    task,
    userName: changedBy
  });

  logger.success('Task unlinked event emitted', { taskId: task.id });
}

/**
 * Handle due date changed
 */
async function handleDueDateChanged(task, historyItem, changedBy) {
  const beforeDate = historyItem?.before?.due_date;
  const afterDate = task.due_date || historyItem?.after?.due_date;

  eventBus.emitEvent(EVENTS.TASK_DUE_DATE_CHANGED, {
    task,
    beforeDate,
    afterDate,
    userName: changedBy
  });

  logger.success('Due date changed event emitted', { taskId: task.id });
}

/**
 * Handle start date changed
 */
async function handleStartDateChanged(task, historyItem, changedBy) {
  const afterDate = task.start_date || historyItem?.after?.start_date;

  eventBus.emitEvent(EVENTS.TASK_START_DATE_CHANGED, {
    task,
    startDate: afterDate,
    userName: changedBy
  });

  logger.success('Start date changed event emitted', { taskId: task.id });
}

/**
 * Handle due date arrives (reminder)
 */
async function handleDueDateArrives(task) {
  const assignees = getAssigneesWithInfo(task);

  eventBus.emitEvent(EVENTS.TASK_DUE_DATE_REMINDER, {
    task,
    assignees
  });

  logger.success('Due date reminder event emitted', { taskId: task.id });
}

/**
 * Handle start date arrives
 */
async function handleStartDateArrives(task) {
  eventBus.emitEvent(EVENTS.TASK_START_DATE_REMINDER, {
    task
  });

  logger.success('Start date reminder event emitted', { taskId: task.id });
}

/**
 * Handle time tracked
 */
async function handleTimeTracked(task, historyItem, changedBy) {
  const timeMs = historyItem?.after?.time || historyItem?.after?.time_estimate;

  eventBus.emitEvent(EVENTS.TASK_TIME_TRACKED, {
    task,
    timeMs,
    userName: changedBy
  });

  logger.success('Time tracked event emitted', { taskId: task.id });
}

/**
 * Handle checklist item resolved
 */
async function handleChecklistItemResolved(task, historyItem, changedBy) {
  eventBus.emitEvent(EVENTS.TASK_CHECKLIST_ITEM_RESOLVED, {
    task,
    resolved: task.checklist_resolved,
    total: task.checklist_total,
    userName: changedBy
  });

  logger.success('Checklist item resolved event emitted', { taskId: task.id });
}

/**
 * Handle all checklists resolved
 */
async function handleAllChecklistsResolved(task, changedBy) {
  eventBus.emitEvent(EVENTS.TASK_ALL_CHECKLISTS_RESOLVED, {
    task,
    userName: changedBy
  });

  logger.success('All checklists resolved event emitted', { taskId: task.id });
}

/**
 * Handle subtask created
 */
async function handleSubtaskCreated(task, body, changedBy) {
  eventBus.emitEvent(EVENTS.TASK_SUBTASK_CREATED, {
    task,
    subtasksTotal: task.subtasks_total,
    userName: changedBy
  });

  logger.success('Subtask created event emitted', { taskId: task.id });
}

/**
 * Handle all subtasks resolved
 */
async function handleAllSubtasksResolved(task, changedBy) {
  eventBus.emitEvent(EVENTS.TASK_ALL_SUBTASKS_RESOLVED, {
    task,
    userName: changedBy
  });

  logger.success('All subtasks resolved event emitted', { taskId: task.id });
}

/**
 * Handle comment posted
 */
async function handleCommentPosted(task, body, changedBy) {
  const commentText = body.comment?.text || body.history_items?.[0]?.comment?.text || '';

  eventBus.emitEvent(EVENTS.TASK_COMMENT_POSTED, {
    task,
    commentText,
    userName: changedBy
  });

  logger.success('Comment posted event emitted', { taskId: task.id });
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Get assignees with full team member info
 */
function getAssigneesWithInfo(task) {
  let assigneeIds = task.assignee_ids;

  if (typeof assigneeIds === 'string') {
    try {
      assigneeIds = JSON.parse(assigneeIds);
    } catch (e) {
      assigneeIds = [];
    }
  }

  if (!Array.isArray(assigneeIds)) {
    assigneeIds = [];
  }

  return assigneeIds.map(id => {
    const member = findMemberById(parseInt(id));
    return member ? {
      id: member.id,
      name: member.name,
      phone: member.phone,
      email: member.email
    } : null;
  }).filter(Boolean);
}

/**
 * Translate complexity to Arabic
 */
function translateComplexity(complexity) {
  const translations = {
    'simple': 'بسيطة',
    'medium': 'متوسطة',
    'complex': 'معقدة',
    'very_complex': 'معقدة جداً'
  };
  return translations[complexity] || 'متوسطة';
}

export default {
  handleWebhook,
  TRIGGER_TYPES,
  TRIGGER_CATEGORIES
};
