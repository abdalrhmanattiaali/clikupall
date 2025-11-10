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
import whatsappService from '../services/whatsapp/whatsappService.js';
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
      logger.info('Received ClickUp webhook test ping');
      return res.status(200).json({ success: true, message: 'Webhook endpoint is working!' });
    }

    // Handle ClickUp webhook challenge (initial setup)
    if (body.challenge) {
      logger.info('Received ClickUp webhook challenge');
      return res.status(200).json({ challenge: body.challenge });
    }

    const event = body.event;
    const taskId = body.task_id;

    if (!event || !taskId) {
      logger.warn('Webhook missing event or task_id', {
        hasEvent: !!event,
        hasTaskId: !!taskId,
        bodyKeys: Object.keys(body),
        bodyPreview: JSON.stringify(body).substring(0, 200)
      });
      return res.status(400).json({ error: 'Missing event or task_id' });
    }

    logger.info('Webhook received', { event, taskId });

    // Fetch complete task data from ClickUp API and store in database
    const task = await enhancedClickUpService.fetchCompleteTaskData(taskId);

    // Calculate AI weight if not already done
    if (!task.ai_weight) {
      await taskWeightingService.calculateTaskWeight(task);
    }

    // Store event in database
    const eventData = {
      event_id: body.webhook_id || `${taskId}_${Date.now()}`,
      task_id: taskId,
      trigger_type: event,
      trigger_category: categorizeTrigger(event),
      changed_by_id: body.history_items?.[0]?.user?.id?.toString() || null,
      changed_by_username: body.history_items?.[0]?.user?.username || null,
      changed_at: body.history_items?.[0]?.date ? parseInt(body.history_items[0].date) : Date.now(),
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

    res.status(200).json({ success: true, event, taskId });
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

  const aiWeight = task.ai_weight || 10;
  const complexity = task.ai_complexity || 'medium';

  let message = `📝 *مهمة جديدة*\n\n`;
  message += `*الاسم:* ${task.name}\n`;
  message += `*الأولوية:* ${task.priority_label || 'عادية'}\n`;
  message += `*الوزن AI:* ${aiWeight} نقطة (${translateComplexity(complexity)})\n`;

  if (task.ai_estimated_time) {
    message += `*الوقت المتوقع:* ${task.ai_estimated_time} دقيقة\n`;
  }

  if (assignees.length > 0) {
    message += `*المكلفون:* ${assignees.map(a => a.name).join(', ')}\n`;
  }

  if (task.due_date) {
    const dueDate = new Date(parseInt(task.due_date));
    message += `*الموعد النهائي:* ${dueDate.toLocaleDateString('ar-EG')}\n`;
  }

  message += `\n🔗 ${task.url}`;

  await whatsappService.sendToGroup(message);

  // Send to assignees privately
  for (const assignee of assignees) {
    if (assignee.phone) {
      await whatsappService.sendToUser(assignee.phone, message);
    }
  }

  eventBus.emitEvent(EVENTS.TASK_CREATED, { task, assignees });

  logger.success('Task created notification sent', {
    taskId: task.id,
    aiWeight,
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
  const assigneeName = member?.name || newAssignee.username;

  const aiWeight = task.ai_weight || 10;

  let message = `👤 *تم تكليفك بمهمة جديدة*\n\n`;
  message += `*المهمة:* ${task.name}\n`;
  message += `*الأولوية:* ${task.priority_label || 'عادية'}\n`;
  message += `*الوزن:* ${aiWeight} نقطة 💎\n`;
  message += `*كلّف بواسطة:* ${changedBy}\n`;

  if (task.due_date) {
    const dueDate = new Date(parseInt(task.due_date));
    const daysUntil = Math.ceil((dueDate - Date.now()) / (1000 * 60 * 60 * 24));
    message += `*الموعد النهائي:* بعد ${daysUntil} يوم\n`;
  }

  message += `\n🔗 ${task.url}`;

  // Send to group
  await whatsappService.sendToGroup(`📢 تم تكليف *${assigneeName}* بمهمة "${task.name}" (${aiWeight} نقطة)`);

  // Send to assignee
  if (member?.phone) {
    await whatsappService.sendToUser(member.phone, message);
  }

  logger.success('Assignee added notification sent', {
    taskId: task.id,
    assignee: assigneeName
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

  const message = `🔄 تم إلغاء تكليف *${assigneeName}* من مهمة "${task.name}"`;

  await whatsappService.sendToGroup(message);

  logger.success('Assignee removed notification sent', {
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
    const aiWeight = task.ai_weight || 10;
    const complexity = task.ai_complexity || 'medium';

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

    let message = `✅ *مهمة مكتملة!*\n\n`;
    message += `*المهمة:* ${task.name}\n`;
    message += `*أكملها:* ${changedBy}\n`;
    message += `*الوزن:* ${aiWeight} نقطة 💎 (${translateComplexity(complexity)})\n`;

    if (gamificationResult) {
      message += `*النقاط المكتسبة:* ${gamificationResult.pointsEarned} نقطة 🎯\n`;

      if (gamificationResult.newBadges && gamificationResult.newBadges.length > 0) {
        message += `*أوسمة جديدة:* ${gamificationResult.newBadges.length} 🏆\n`;
      }

      if (gamificationResult.shieldUpgrade) {
        message += `*ترقية درع:* ${gamificationResult.shieldUpgrade.to.name} 🛡️\n`;
      }
    }

    message += `\n🎉 رائع! استمر في الإنجاز!`;

    await whatsappService.sendToGroup(message);

    eventBus.emitEvent(EVENTS.TASK_COMPLETED, { task, userName: changedBy });

    logger.success('Task completed notification sent', {
      taskId: task.id,
      aiWeight,
      points: gamificationResult?.pointsEarned
    });
  } else {
    // Just status changed
    const message = `🔄 *تغيير حالة المهمة*\n\n` +
      `*المهمة:* ${task.name}\n` +
      `*من:* ${beforeStatus}\n` +
      `*إلى:* ${afterStatus}\n` +
      `*بواسطة:* ${changedBy}`;

    await whatsappService.sendToGroup(message);

    eventBus.emitEvent(EVENTS.TASK_STATUS_CHANGED, {
      task,
      beforeStatus,
      afterStatus,
      userName: changedBy
    });
  }
}

/**
 * Handle priority changed
 */
async function handlePriorityChanged(task, historyItem, changedBy) {
  const beforePriority = historyItem?.before?.priority?.priority || 'عادية';
  const afterPriority = task.priority_label || historyItem?.after?.priority?.priority || 'عادية';

  const priorityEmoji = {
    'urgent': '🔴',
    'high': '🟠',
    'normal': '🟡',
    'low': '🟢'
  };

  const emoji = priorityEmoji[afterPriority.toLowerCase()] || '⚪';

  const message = `${emoji} *تغيير أولوية المهمة*\n\n` +
    `*المهمة:* ${task.name}\n` +
    `*من:* ${beforePriority}\n` +
    `*إلى:* ${afterPriority}\n` +
    `*بواسطة:* ${changedBy}`;

  await whatsappService.sendToGroup(message);

  logger.success('Priority changed notification sent', {
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
  const afterName = task.name;

  const message = `✏️ *تم تغيير اسم المهمة*\n\n` +
    `*من:* ${beforeName}\n` +
    `*إلى:* ${afterName}\n` +
    `*بواسطة:* ${changedBy}`;

  await whatsappService.sendToGroup(message);

  logger.success('Name changed notification sent', { taskId: task.id });
}

/**
 * Handle tag added
 */
async function handleTagAdded(task, historyItem, changedBy) {
  const newTag = historyItem?.after?.tag?.name || historyItem?.after?.tag;

  const message = `🏷️ *تم إضافة وسم*\n\n` +
    `*المهمة:* ${task.name}\n` +
    `*الوسم:* ${newTag}\n` +
    `*بواسطة:* ${changedBy}`;

  await whatsappService.sendToGroup(message);

  logger.success('Tag added notification sent', { taskId: task.id, tag: newTag });
}

/**
 * Handle tag removed
 */
async function handleTagRemoved(task, historyItem, changedBy) {
  const removedTag = historyItem?.before?.tag?.name || historyItem?.before?.tag;

  const message = `🏷️ *تم إزالة وسم*\n\n` +
    `*المهمة:* ${task.name}\n` +
    `*الوسم:* ${removedTag}\n` +
    `*بواسطة:* ${changedBy}`;

  await whatsappService.sendToGroup(message);

  logger.success('Tag removed notification sent', { taskId: task.id, tag: removedTag });
}

/**
 * Handle custom field changed
 */
async function handleCustomFieldChanged(task, historyItem, changedBy) {
  const fieldName = historyItem?.after?.custom_field?.name || 'Unknown field';
  const newValue = historyItem?.after?.custom_field?.value || 'N/A';

  const message = `📊 *تم تحديث حقل مخصص*\n\n` +
    `*المهمة:* ${task.name}\n` +
    `*الحقل:* ${fieldName}\n` +
    `*القيمة الجديدة:* ${newValue}\n` +
    `*بواسطة:* ${changedBy}`;

  await whatsappService.sendToGroup(message);

  logger.success('Custom field changed notification sent', { taskId: task.id });
}

/**
 * Handle task type changed
 */
async function handleTaskTypeChanged(task, historyItem, changedBy) {
  const message = `🔄 *تم تغيير نوع المهمة*\n\n` +
    `*المهمة:* ${task.name}\n` +
    `*بواسطة:* ${changedBy}`;

  await whatsappService.sendToGroup(message);

  logger.success('Task type changed notification sent', { taskId: task.id });
}

/**
 * Handle task linked
 */
async function handleTaskLinked(task, historyItem, changedBy) {
  const message = `🔗 *تم ربط المهمة*\n\n` +
    `*المهمة:* ${task.name}\n` +
    `*بواسطة:* ${changedBy}`;

  await whatsappService.sendToGroup(message);

  logger.success('Task linked notification sent', { taskId: task.id });
}

/**
 * Handle task unlinked
 */
async function handleTaskUnlinked(task, historyItem, changedBy) {
  const message = `🔓 *تم إلغاء ربط المهمة*\n\n` +
    `*المهمة:* ${task.name}\n` +
    `*بواسطة:* ${changedBy}`;

  await whatsappService.sendToGroup(message);

  logger.success('Task unlinked notification sent', { taskId: task.id });
}

/**
 * Handle due date changed
 */
async function handleDueDateChanged(task, historyItem, changedBy) {
  const beforeDate = historyItem?.before?.due_date;
  const afterDate = task.due_date || historyItem?.after?.due_date;

  const beforeStr = beforeDate ? new Date(parseInt(beforeDate)).toLocaleDateString('ar-EG') : 'بدون موعد';
  const afterStr = afterDate ? new Date(parseInt(afterDate)).toLocaleDateString('ar-EG') : 'بدون موعد';

  const daysUntil = afterDate ? Math.ceil((parseInt(afterDate) - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  let message = `📅 *تم تغيير الموعد النهائي*\n\n`;
  message += `*المهمة:* ${task.name}\n`;
  message += `*من:* ${beforeStr}\n`;
  message += `*إلى:* ${afterStr}\n`;

  if (daysUntil !== null) {
    if (daysUntil < 0) {
      message += `⚠️ *متأخر بـ ${Math.abs(daysUntil)} يوم!*\n`;
    } else if (daysUntil === 0) {
      message += `🔥 *اليوم هو الموعد النهائي!*\n`;
    } else if (daysUntil <= 3) {
      message += `⏰ *باقي ${daysUntil} أيام فقط!*\n`;
    } else {
      message += `*باقي ${daysUntil} يوم*\n`;
    }
  }

  message += `*بواسطة:* ${changedBy}`;

  await whatsappService.sendToGroup(message);

  logger.success('Due date changed notification sent', { taskId: task.id });
}

/**
 * Handle start date changed
 */
async function handleStartDateChanged(task, historyItem, changedBy) {
  const afterDate = task.start_date || historyItem?.after?.start_date;
  const afterStr = afterDate ? new Date(parseInt(afterDate)).toLocaleDateString('ar-EG') : 'بدون تاريخ';

  const message = `📅 *تم تغيير تاريخ البدء*\n\n` +
    `*المهمة:* ${task.name}\n` +
    `*تاريخ البدء:* ${afterStr}\n` +
    `*بواسطة:* ${changedBy}`;

  await whatsappService.sendToGroup(message);

  logger.success('Start date changed notification sent', { taskId: task.id });
}

/**
 * Handle due date arrives (reminder)
 */
async function handleDueDateArrives(task) {
  const aiWeight = task.ai_weight || 10;

  let message = `⏰ *تذكير: الموعد النهائي اليوم!*\n\n`;
  message += `*المهمة:* ${task.name}\n`;
  message += `*الوزن:* ${aiWeight} نقطة 💎\n`;
  message += `*الحالة:* ${task.status_name}\n`;

  const assignees = getAssigneesWithInfo(task);
  if (assignees.length > 0) {
    message += `*المكلفون:* ${assignees.map(a => a.name).join(', ')}\n`;
  }

  message += `\n🔗 ${task.url}\n`;
  message += `\n⚡ أنجزها اليوم!`;

  await whatsappService.sendToGroup(message);

  // Send to assignees
  for (const assignee of assignees) {
    if (assignee.phone) {
      await whatsappService.sendToUser(assignee.phone, message);
    }
  }

  logger.success('Due date arrives notification sent', { taskId: task.id });
}

/**
 * Handle start date arrives
 */
async function handleStartDateArrives(task) {
  const message = `🚀 *حان وقت البدء!*\n\n` +
    `*المهمة:* ${task.name}\n` +
    `*الوزن:* ${task.ai_weight || 10} نقطة 💎\n` +
    `\n🔗 ${task.url}\n` +
    `\nابدأ الآن! 💪`;

  await whatsappService.sendToGroup(message);

  logger.success('Start date arrives notification sent', { taskId: task.id });
}

/**
 * Handle time tracked
 */
async function handleTimeTracked(task, historyItem, changedBy) {
  const timeMs = historyItem?.after?.time || historyItem?.after?.time_estimate;
  const timeHours = timeMs ? (timeMs / (1000 * 60 * 60)).toFixed(1) : '0';

  const message = `⏱️ *تم تسجيل وقت*\n\n` +
    `*المهمة:* ${task.name}\n` +
    `*الوقت:* ${timeHours} ساعة\n` +
    `*بواسطة:* ${changedBy}`;

  await whatsappService.sendToGroup(message);

  logger.success('Time tracked notification sent', { taskId: task.id, hours: timeHours });
}

/**
 * Handle checklist item resolved
 */
async function handleChecklistItemResolved(task, historyItem, changedBy) {
  const progress = task.checklist_total > 0 ?
    Math.round((task.checklist_resolved / task.checklist_total) * 100) : 0;

  const message = `☑️ *تم إتمام عنصر في القائمة*\n\n` +
    `*المهمة:* ${task.name}\n` +
    `*التقدم:* ${task.checklist_resolved}/${task.checklist_total} (${progress}%)\n` +
    `*بواسطة:* ${changedBy}`;

  await whatsappService.sendToGroup(message);

  logger.success('Checklist item resolved notification sent', { taskId: task.id, progress });
}

/**
 * Handle all checklists resolved
 */
async function handleAllChecklistsResolved(task, changedBy) {
  const message = `🎉 *تم إكمال جميع عناصر القائمة!*\n\n` +
    `*المهمة:* ${task.name}\n` +
    `*العناصر:* ${task.checklist_resolved}/${task.checklist_total}\n` +
    `*بواسطة:* ${changedBy}\n\n` +
    `رائع! الآن يمكنك إغلاق المهمة! ✨`;

  await whatsappService.sendToGroup(message);

  logger.success('All checklists resolved notification sent', { taskId: task.id });
}

/**
 * Handle subtask created
 */
async function handleSubtaskCreated(task, body, changedBy) {
  const message = `📌 *تم إضافة مهمة فرعية*\n\n` +
    `*المهمة الرئيسية:* ${task.name}\n` +
    `*عدد المهام الفرعية:* ${task.subtasks_total}\n` +
    `*بواسطة:* ${changedBy}`;

  await whatsappService.sendToGroup(message);

  logger.success('Subtask created notification sent', { taskId: task.id });
}

/**
 * Handle all subtasks resolved
 */
async function handleAllSubtasksResolved(task, changedBy) {
  const message = `🎊 *تم إكمال جميع المهام الفرعية!*\n\n` +
    `*المهمة:* ${task.name}\n` +
    `*المهام الفرعية:* ${task.subtasks_resolved}/${task.subtasks_total}\n` +
    `*بواسطة:* ${changedBy}\n\n` +
    `إنجاز ممتاز! 🏆`;

  await whatsappService.sendToGroup(message);

  logger.success('All subtasks resolved notification sent', { taskId: task.id });
}

/**
 * Handle comment posted
 */
async function handleCommentPosted(task, body, changedBy) {
  const commentText = body.comment?.text || body.history_items?.[0]?.comment?.text || '';
  const preview = commentText.length > 100 ? commentText.substring(0, 100) + '...' : commentText;

  const message = `💬 *تعليق جديد*\n\n` +
    `*المهمة:* ${task.name}\n` +
    `*من:* ${changedBy}\n` +
    `*التعليق:* ${preview}`;

  await whatsappService.sendToGroup(message);

  logger.success('Comment posted notification sent', { taskId: task.id });
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
