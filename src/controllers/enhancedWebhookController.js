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
import { isNonOpenStatus, isCancellationStatus, TASK_CATEGORIES } from '../config/constants.js';
import productivityRepo from '../repositories/productivityRepository.js';

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

async function loadPreviousTaskState(taskId) {
  if (!taskId) {
    return null;
  }

  try {
    if (typeof databaseService.getTaskAsync === 'function') {
      return await databaseService.getTaskAsync(taskId);
    }

    if (typeof databaseService.getTask === 'function') {
      return databaseService.getTask(taskId);
    }
  } catch (error) {
    logger.warn('Failed to load previous task state', {
      taskId,
      error: error.message
    });
  }

  return null;
}

async function enrichTaskWithParentDetails(task) {
  if (!task) {
    return task;
  }

  const parentId = task.parent || task.parent_id || task.parentId || null;

  if (!parentId) {
    task.parent = null;
    return task;
  }

  task.parent = parentId;

  const hasName = Boolean(task.parent_name || task.parentName);
  const hasUrl = Boolean(task.parent_url || task.parentUrl);

  if (hasName && hasUrl) {
    return task;
  }

  let parentTask = await loadPreviousTaskState(parentId);

  if (!parentTask) {
    try {
      parentTask = await enhancedClickUpService.fetchCompleteTaskData(parentId);
    } catch (error) {
      logger.warn('Failed to fetch parent task details', {
        parentId,
        error: error.message
      });
    }
  }

  if (parentTask) {
    task.parent_name = parentTask.name
      || parentTask.title
      || parentTask.text_content
      || parentTask.description
      || task.parent_name
      || null;
    task.parent_url = parentTask.url
      || task.parent_url
      || (parentId ? `https://app.clickup.com/t/${parentId}` : null);
    task.parent_status_name = parentTask.status_name
      || parentTask.status?.status
      || task.parent_status_name
      || null;
    task.parent_priority_label = parentTask.priority_label
      || parentTask.priority?.priority
      || task.parent_priority_label
      || null;
  } else {
    task.parent_name = task.parent_name || `المهمة الرئيسية (${parentId})`;
    task.parent_url = task.parent_url || (parentId ? `https://app.clickup.com/t/${parentId}` : null);
  }

  return task;
}

function tryParseJson(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function parseStatusSnapshot(snapshot) {
  if (!snapshot) {
    return null;
  }

  if (typeof snapshot === 'string') {
    return { name: snapshot, type: null };
  }

  if (typeof snapshot === 'object') {
    if (snapshot.status || snapshot.status_name || snapshot.name || snapshot.value || snapshot.text) {
      const name = snapshot.status || snapshot.status_name || snapshot.name || snapshot.value || snapshot.text;
      const type = snapshot.status_type || snapshot.type || snapshot.category || snapshot.state || null;

      return { name, type };
    }

    if (snapshot.after || snapshot.before) {
      return parseStatusSnapshot(snapshot.after || snapshot.before);
    }
  }

  return null;
}

function extractStatusInfo(...sources) {
  for (const source of sources) {
    const parsed = parseStatusSnapshot(source);
    if (parsed && parsed.name) {
      return parsed;
    }
  }

  return null;
}

function analyzeTaskCategory(task) {
  const text = `${task?.name || ''} ${task?.description || ''}`.toLowerCase();
  const detected = [];

  Object.entries(TASK_CATEGORIES || {}).forEach(([category, keywords]) => {
    if (Array.isArray(keywords) && keywords.some(keyword => text.includes(keyword))) {
      detected.push(category);
    }
  });

  return detected.length > 0 ? detected : ['عام'];
}

function buildAssigneeStatKey(assignee) {
  if (!assignee) {
    return 'عضو غير معروف';
  }

  return assignee.name
    || assignee.username
    || assignee.email
    || (assignee.id ? `عضو ${assignee.id}` : 'عضو غير معروف');
}

function getSafeAiWeight(task) {
  const raw = Number(task?.ai_weight);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }

  return 10;
}

function buildAiWeightSharePlan(task, participantCount = 1) {
  const totalWeight = getSafeAiWeight(task);
  const count = Math.max(1, participantCount || 1);
  const normalizedShare = Number((totalWeight / count).toFixed(2));
  const shares = [];
  let allocated = 0;

  for (let index = 0; index < count; index += 1) {
    let share = normalizedShare;

    if (index === count - 1) {
      const remaining = Number((totalWeight - allocated).toFixed(2));
      share = remaining > 0 ? remaining : normalizedShare;
    } else {
      allocated = Number((allocated + share).toFixed(2));
    }

    shares.push(share);
  }

  return {
    totalWeight,
    participantCount: count,
    defaultShare: normalizedShare,
    shares
  };
}

async function recordCompletionForAssignee(task, assignee, actionedBy, options = {}) {
  const statKey = buildAssigneeStatKey(assignee);
  const categories = analyzeTaskCategory(task);
  const aliasSet = new Set();

  const addAlias = (value) => {
    if (value === undefined || value === null) {
      return;
    }

    const normalized = String(value).trim();
    if (normalized) {
      aliasSet.add(normalized);
    }
  };

  addAlias(statKey);
  addAlias(assignee?.name);
  addAlias(assignee?.username);
  addAlias(assignee?.email);
  if (assignee?.id !== undefined && assignee?.id !== null) {
    addAlias(String(assignee.id));
  }

  const userAliases = Array.from(aliasSet.values());
  const aiWeightTotal = Number.isFinite(Number(options.aiWeightTotal)) && Number(options.aiWeightTotal) > 0
    ? Number(options.aiWeightTotal)
    : getSafeAiWeight(task);
  const aiWeightShare = Number.isFinite(Number(options.aiWeightShare)) && Number(options.aiWeightShare) > 0
    ? Number(options.aiWeightShare)
    : aiWeightTotal;
  let productivityEntry = null;
  let gamificationResult = null;

  try {
    productivityEntry = await productivityRepo.addEntry({
      type: 'task_completed',
      taskId: task.id,
      userId: statKey,
      userAliases,
      timestamp: Date.now(),
      isSubtask: !!task.parent,
      parentId: task.parent || null,
      categories,
      taskName: task.name,
      taskDescription: task.description || '',
      completedBy: actionedBy
    });
  } catch (error) {
    logger.error('Failed to record productivity entry for completion', {
      taskId: task?.id,
      assignee: statKey,
      error: error.message
    });
  }

  const numericId = assignee?.id !== null && assignee?.id !== undefined
    ? Number(assignee.id)
    : NaN;

  if (Number.isFinite(numericId)) {
    try {
      const scoringTask = {
        ...task,
        ai_weight: aiWeightShare,
        ai_weight_share: aiWeightShare,
        ai_weight_total: aiWeightTotal
      };

      gamificationResult = await gamificationService.processCompletedTask(scoringTask, numericId);
    } catch (error) {
      logger.error('Gamification processing failed for assignee', {
        taskId: task?.id,
        assigneeId: numericId,
        error: error.message
      });
    }
  } else {
    logger.warn('Unable to credit gamification - missing numeric assignee id', {
      taskId: task?.id,
      assignee: statKey
    });
  }

  return {
    assignee,
    assigneeKey: statKey,
    gamificationResult,
    productivityEntry,
    aiWeightShare,
    aiWeightTotal
  };
}

function aggregateCompletionGamification(outcomes = []) {
  if (!Array.isArray(outcomes) || outcomes.length === 0) {
    return { summary: null };
  }

  let totalPoints = 0;
  let totalAiWeightAwarded = 0;
  let aiWeightTotal = null;
  const combinedBadges = [];
  let firstUpgrade = null;

  const breakdown = outcomes.map(outcome => {
    const points = outcome?.gamificationResult?.pointsEarned || 0;
    totalPoints += points;
    const totalForOutcome = Number(outcome?.aiWeightTotal);
    const aiShare = Number(outcome?.aiWeightShare) || 0;
    totalAiWeightAwarded += aiShare;
    if (aiWeightTotal === null && Number.isFinite(totalForOutcome)) {
      aiWeightTotal = totalForOutcome;
    }

    const badges = Array.isArray(outcome?.gamificationResult?.newBadges)
      ? outcome.gamificationResult.newBadges.map(badge => ({
        ...badge,
        awardedTo: outcome.assignee?.name || outcome.assigneeKey
      }))
      : [];

    combinedBadges.push(...badges);

    if (!firstUpgrade && outcome?.gamificationResult?.shieldUpgrade) {
      firstUpgrade = {
        ...outcome.gamificationResult.shieldUpgrade,
        awardedTo: outcome.assignee?.name || outcome.assigneeKey
      };
    }

    return {
      assignee: outcome.assignee,
      assigneeKey: outcome.assigneeKey,
      points,
      badges,
      shieldUpgrade: outcome?.gamificationResult?.shieldUpgrade || null,
      aiWeightShare: aiShare,
      aiWeightTotal: Number.isFinite(totalForOutcome) ? totalForOutcome : null
    };
  });

  const summary = {
    pointsEarned: totalPoints,
    totalPoints,
    newBadges: combinedBadges,
    shieldUpgrade: firstUpgrade,
    breakdown,
    aiWeightTotal,
    aiWeightAwarded: totalAiWeightAwarded
  };

  return { summary };
}

async function lookupPreviousStatusFromEvents(taskId) {
  if (!taskId || typeof databaseService.getTaskEvents !== 'function') {
    return null;
  }

  try {
    const events = await databaseService.getTaskEvents(taskId, 10);

    if (!Array.isArray(events) || events.length === 0) {
      return null;
    }

    const orderedEvents = events
      .map(event => ({
        ...event,
        __timestamp: event.changed_at || event.created_at || 0
      }))
      .sort((a, b) => a.__timestamp - b.__timestamp);

    for (let index = orderedEvents.length - 1; index >= 0; index -= 1) {
      if (index === orderedEvents.length - 1) {
        continue; // Skip current event (most recent)
      }

      const event = orderedEvents[index];
      const nextValue = tryParseJson(event.next_value);
      const prevValue = tryParseJson(event.prev_value);
      const info = extractStatusInfo(nextValue, prevValue);

      if (info && info.name) {
        return info;
      }
    }
  } catch (error) {
    logger.warn('Failed to inspect previous task events for status context', {
      taskId,
      error: error.message
    });
  }

  return null;
}

/**
 * Main webhook handler - routes to specific handlers
 */
async function processWebhook(req, res, options = {}) {
  const {
    forcedTrigger = null,
    expectedTriggers = null,
    requireCompletion = false,
    requireAssigneeChange = false,
    endpoint = 'universal'
  } = options;

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
      logger.info('Received ClickUp webhook test ping', { webhookId, endpoint });
      return res.status(200).json({ success: true, message: 'Webhook endpoint is working!', webhookId, endpoint });
    }

    // Handle ClickUp webhook challenge (initial setup)
    if (body.challenge) {
      logger.info('Received ClickUp webhook challenge', { webhookId, endpoint });
      return res.status(200).json({ challenge: body.challenge });
    }

    // Handle automation webhook structure: {auto_id, trigger_id, date, payload}
    let event, taskId;
    let taskData = null;
    let previousTask = null;
    let originalEvent = null;
    let isCompletedAutomation = false;

    if (body.auto_id && body.trigger_id && body.payload) {
      // This is an automation webhook - extract task from payload
      taskData = body.payload;
      taskId = taskData.id;

      previousTask = await loadPreviousTaskState(taskId);

      // Determine event type with priority:
      // 1. Check if task is completed first (most important)
      // 2. Then check if it's a new task
      // 3. Otherwise it's a status change

      const taskStatusName = taskData.status?.status;
      const taskStatusType = taskData.status?.type;
      isCompletedAutomation = isNonOpenStatus(taskStatusName, taskStatusType);

      if (isCompletedAutomation) {
        // Task is completed - always handle as status change
        // (handleStatusChanged will emit TASK_COMPLETED event)
        event = TRIGGER_TYPES.STATUS_CHANGED;
        originalEvent = event;
        logger.debug('Completed task detected in automation webhook', { taskId, status: taskStatusName, endpoint });
      } else {
        // Not completed - check if it's new or existing task
        const dateCreated = taskData.date_created ? parseInt(taskData.date_created) : 0;
        const dateUpdated = taskData.date_updated ? parseInt(taskData.date_updated) : 0;
        const isNewTask = Math.abs(dateUpdated - dateCreated) < 5000; // 5 seconds

        if (isNewTask) {
          event = TRIGGER_TYPES.TASK_CREATED;
        } else {
          event = TRIGGER_TYPES.STATUS_CHANGED;
        }
        originalEvent = event;
      }

      logger.info('Automation webhook received', {
        webhookId,
        autoId: body.auto_id,
        triggerId: body.trigger_id,
        taskId,
        taskName: taskData.name,
        status: taskData.status?.status,
        detectedAs: event === TRIGGER_TYPES.TASK_CREATED ? 'NEW_TASK' :
                    (isCompletedAutomation ? 'COMPLETED' : 'STATUS_CHANGE'),
        endpoint
      });
    } else {
      // Standard webhook structure: {event, task_id, ...}
      event = body.event;
      originalEvent = event;
      taskId = body.task_id;

      previousTask = await loadPreviousTaskState(taskId);

      if (!event || !taskId) {
        logger.warn('Webhook missing event or task_id', {
          webhookId,
          hasEvent: !!event,
          hasTaskId: !!taskId,
          bodyKeys: Object.keys(body),
          bodyPreview: JSON.stringify(body).substring(0, 200),
          endpoint
        });
        return res.status(400).json({ error: 'Missing event or task_id' });
      }

      logger.info('Standard webhook received', { webhookId, event, taskId, endpoint });
    }

    if (forcedTrigger) {
      event = forcedTrigger;
    }

    if (expectedTriggers) {
      const matchesOriginal = originalEvent ? expectedTriggers.some(trigger => trigger.toLowerCase() === originalEvent.toLowerCase()) : false;
      const matchesForced = event ? expectedTriggers.some(trigger => trigger.toLowerCase() === event.toLowerCase()) : false;
      if (!matchesOriginal && !matchesForced) {
        logger.info('Ignoring webhook due to event mismatch for endpoint', {
          webhookId,
          receivedEvent: originalEvent || event,
          expectedTriggers,
          endpoint
        });
        return res.status(202).json({ success: true, ignored: true, reason: 'event_mismatch', event: originalEvent || event, endpoint });
      }
    }

    // Fetch complete task data from ClickUp API
    // Note: Always fetch from API for automation webhooks because payload is incomplete
    let task;
    const shouldFetchFromApi = !taskData || !taskData.status;

    if (shouldFetchFromApi) {
      // Fetch complete task data from ClickUp API and store in database
      logger.debug('Fetching complete task data from API', { taskId, reason: taskData ? 'incomplete payload' : 'no payload', endpoint });
      task = await enhancedClickUpService.fetchCompleteTaskData(taskId);
    } else {
      // Use task data from webhook payload - transform and store
      task = enhancedClickUpService.transformTaskData(taskData);
      await databaseService.upsertTask(task);
    }

    if (requireCompletion) {
      const currentStatusName = task.status_name || task.status?.status || '';
      const currentStatusType = task.status?.type;
      if (!isNonOpenStatus(currentStatusName, currentStatusType)) {
        logger.info('Completion endpoint received non-completed task', {
          taskId,
          status: currentStatusName,
          statusType: currentStatusType,
          endpoint
        });
        return res.status(202).json({ success: true, ignored: true, reason: 'task_not_completed', status: currentStatusName, endpoint });
      }
    }

    // Calculate AI weight if not already done and hydrate current snapshot
    if (!task.ai_weight) {
      const aiAnalysis = await taskWeightingService.calculateTaskWeight(task);

      if (aiAnalysis && typeof aiAnalysis === 'object') {
        if (typeof aiAnalysis.weight === 'number') {
          task.ai_weight = aiAnalysis.weight;
        }

        if (aiAnalysis.complexity) {
          task.ai_complexity = aiAnalysis.complexity;
        }

        if (typeof aiAnalysis.estimated_time !== 'undefined') {
          task.ai_estimated_time = aiAnalysis.estimated_time;
        }

        if (Array.isArray(aiAnalysis.skills_required)) {
          task.ai_skills_required = aiAnalysis.skills_required;
        }

        if (Array.isArray(aiAnalysis.dependencies)) {
          task.ai_dependencies = aiAnalysis.dependencies;
        }
      }
    }

    await enrichTaskWithParentDetails(task);

    const historyItem = body.history_items?.[0];
    let assigneeChange = extractAssigneeChanges(historyItem);

    if (!assigneeChange || (assigneeChange.added.length === 0 && assigneeChange.removed.length === 0)) {
      const snapshotChange = deriveAssigneeDiffFromTasks(previousTask, task);
      if (snapshotChange.added.length > 0 || snapshotChange.removed.length > 0) {
        assigneeChange = snapshotChange;
        logger.info('Assignee change inferred from task snapshots', {
          taskId,
          endpoint,
          added: snapshotChange.added.map(candidate => candidate.name || candidate.email || candidate.id),
          removed: snapshotChange.removed.map(candidate => candidate.name || candidate.email || candidate.id)
        });
      }
    }
    let effectiveEvent = event;

    if (!forcedTrigger) {
      const refinement = refineDetectedEvent(effectiveEvent, {
        task,
        historyItem,
        originalEvent,
        isAutomation: Boolean(body.auto_id && body.trigger_id),
        assigneeChange
      });

      if (refinement.event !== effectiveEvent) {
        const previousEvent = effectiveEvent;
        effectiveEvent = refinement.event;

        logger.info('Webhook event reclassified after inspection', {
          taskId,
          from: previousEvent,
          to: effectiveEvent,
          reasons: refinement.reasons,
          originalEvent,
          endpoint
        });
      }

      if (refinement.assigneeChange) {
        assigneeChange = refinement.assigneeChange;
      }
    }


    if (requireAssigneeChange) {
      if (!assigneeChange || assigneeChange.added.length === 0) {
        logger.info('Assignment endpoint received payload without assignee change', {
          taskId,
          endpoint
        });
        return res.status(202).json({ success: true, ignored: true, reason: 'no_assignee_change', endpoint });
      }
    }

    // Store event in database
    const eventData = {
      event_id: body.webhook_id || body.trigger_id || `${taskId}_${Date.now()}`,
      task_id: taskId,
      trigger_type: effectiveEvent,
      trigger_category: categorizeTrigger(effectiveEvent),
      changed_by_id: historyItem?.user?.id?.toString() || taskData?.creator?.id?.toString() || null,
      changed_by_username: historyItem?.user?.username || taskData?.creator?.username || null,
      changed_at: historyItem?.date ? parseInt(historyItem.date) : (body.date ? new Date(body.date).getTime() : Date.now()),
      field_name: historyItem?.field || null,
      prev_value: historyItem?.before ? JSON.stringify(historyItem.before) : null,
      next_value: historyItem?.after ? JSON.stringify(historyItem.after) : null,
      raw_payload: JSON.stringify(body),
      trigger_source: endpoint
    };

    // Store event in database (async for file database)
    if (databaseService.insertEvent) {
      try {
        await databaseService.insertEvent(eventData);
      } catch (dbError) {
        logger.warn('Failed to store event in database', {
          error: dbError.message,
          event_id: eventData.event_id,
          endpoint
        });
      }
    }

    // Route to specific handler
    try {
      await routeToHandler(effectiveEvent, body, task, {
        previousTask,
        originalEvent,
        endpoint,
        webhookId,
        assigneeChange
      });
    } catch (handlerError) {
      logger.error('Event handler failed', {
        event: effectiveEvent,
        error: handlerError.message,
        stack: handlerError.stack,
        endpoint
      });
      // Continue anyway - don't fail the webhook
    }

    res.status(200).json({ success: true, event: effectiveEvent, taskId, webhookId, endpoint });
  } catch (error) {
    logger.error('Webhook handling error', {
      error: error.message,
      stack: error.stack,
      body: req.body ? JSON.stringify(req.body).substring(0, 500) : 'no body',
      endpoint
    });
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

export async function handleWebhook(req, res) {
  return processWebhook(req, res, { endpoint: 'universal' });
}

export async function handleTaskCreatedWebhook(req, res) {
  return processWebhook(req, res, {
    endpoint: 'task_created',
    forcedTrigger: TRIGGER_TYPES.TASK_CREATED,
    expectedTriggers: [TRIGGER_TYPES.TASK_CREATED]
  });
}

export async function handleTaskAssignedWebhook(req, res) {
  return processWebhook(req, res, {
    endpoint: 'task_assigned',
    forcedTrigger: TRIGGER_TYPES.ASSIGNEE_ADDED,
    expectedTriggers: [TRIGGER_TYPES.ASSIGNEE_ADDED],
    requireAssigneeChange: true
  });
}

export async function handleStatusChangedWebhook(req, res) {
  return processWebhook(req, res, {
    endpoint: 'status_changed',
    forcedTrigger: TRIGGER_TYPES.STATUS_CHANGED,
    expectedTriggers: [TRIGGER_TYPES.STATUS_CHANGED]
  });
}

export async function handleTaskCompletedWebhook(req, res) {
  return processWebhook(req, res, {
    endpoint: 'task_completed',
    forcedTrigger: TRIGGER_TYPES.STATUS_CHANGED,
    expectedTriggers: [TRIGGER_TYPES.STATUS_CHANGED],
    requireCompletion: true
  });
}

export async function handleTaskCommentWebhook(req, res) {
  return processWebhook(req, res, {
    endpoint: 'task_comment',
    forcedTrigger: TRIGGER_TYPES.COMMENT_POSTED,
    expectedTriggers: [TRIGGER_TYPES.COMMENT_POSTED]
  });
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

function refineDetectedEvent(event, context = {}) {
  const result = {
    event,
    reasons: []
  };

  if (!context || !context.task) {
    return result;
  }

  let finalEvent = event;
  const { task, historyItem } = context;
  const assigneeChange = context.assigneeChange || extractAssigneeChanges(historyItem);

  const fieldHint = (historyItem?.field || historyItem?.type || '').toLowerCase();
  const hasAssigneeMutation = assigneeChange.added.length > 0 || assigneeChange.removed.length > 0 || fieldHint.includes('assignee');

  if (hasAssigneeMutation) {
    if (assigneeChange.added.length > 0 && assigneeChange.removed.length === 0) {
      finalEvent = TRIGGER_TYPES.ASSIGNEE_ADDED;
      result.reasons.push('assignee_added_detected');
    } else if (assigneeChange.removed.length > 0 && assigneeChange.added.length === 0) {
      finalEvent = TRIGGER_TYPES.ASSIGNEE_REMOVED;
      result.reasons.push('assignee_removed_detected');
    } else if (assigneeChange.added.length > 0 && assigneeChange.removed.length > 0) {
      finalEvent = TRIGGER_TYPES.ASSIGNEE_ADDED;
      result.reasons.push('assignee_reassignment_detected');
    }

    result.assigneeChange = assigneeChange;
  }

  const statusName = task.status_name || task.status?.status || historyItem?.after?.status || historyItem?.before?.status || '';
  const statusType = task.status?.type || historyItem?.after?.status_type || historyItem?.after?.type || historyItem?.before?.status_type || '';

  if (
    isNonOpenStatus(statusName, statusType)
    && finalEvent !== TRIGGER_TYPES.STATUS_CHANGED
    && finalEvent !== TRIGGER_TYPES.ASSIGNEE_ADDED
    && finalEvent !== TRIGGER_TYPES.ASSIGNEE_REMOVED
  ) {
    finalEvent = TRIGGER_TYPES.STATUS_CHANGED;
    result.reasons.push('task_in_closed_state');
  }

  if (finalEvent === TRIGGER_TYPES.TASK_CREATED) {
    const createdAt = Number.parseInt(task.date_created, 10);
    const updatedAt = Number.parseInt(task.date_updated, 10);
    const changedField = (historyItem?.field || historyItem?.type || '').toLowerCase();

    if (changedField.includes('status')) {
      finalEvent = TRIGGER_TYPES.STATUS_CHANGED;
      result.reasons.push('history_indicates_status_change');
    } else {
      const now = Date.now();
      const creationAge = Number.isFinite(createdAt) ? now - createdAt : null;
      const updateDelta = Number.isFinite(createdAt) && Number.isFinite(updatedAt)
        ? Math.abs(updatedAt - createdAt)
        : null;

      if (updateDelta !== null && updateDelta > 60000) {
        finalEvent = TRIGGER_TYPES.STATUS_CHANGED;
        result.reasons.push('update_far_after_creation');
      } else if (creationAge !== null && creationAge > 5 * 60 * 1000) {
        finalEvent = TRIGGER_TYPES.STATUS_CHANGED;
        result.reasons.push('task_age_not_recent');
      }
    }
  }

  result.event = finalEvent;
  return result;
}

/**
 * Route webhook to specific handler based on event type
 */
async function routeToHandler(event, body, task, context = {}) {
  const historyItem = body.history_items?.[0];
  const assigneeChange = context.assigneeChange || extractAssigneeChanges(historyItem);

  // Get user who made the change - try multiple sources
  let changedBy = 'غير معروف';
  if (historyItem?.user?.username) {
    changedBy = historyItem.user.username;
  } else if (task.creator_username) {
    changedBy = task.creator_username;
  } else if (body.payload?.creator?.username) {
    changedBy = body.payload.creator.username;
  }

  const creatorInfo = context.creator
    || getTaskCreatorInfo(task)
    || (context.previousTask ? getTaskCreatorInfo(context.previousTask) : null);

  const handlerContext = {
    ...context,
    historyItem,
    changedBy,
    body,
    assigneeChange,
    creator: creatorInfo
  };

  switch (event) {
    // ==================== TASK MANAGEMENT ====================
    case TRIGGER_TYPES.TASK_CREATED:
      return await handleTaskCreated(task, body, handlerContext);

    case TRIGGER_TYPES.ASSIGNEE_ADDED:
      return await handleAssigneeAdded(task, historyItem, changedBy, handlerContext);

    case TRIGGER_TYPES.ASSIGNEE_REMOVED:
      return await handleAssigneeRemoved(task, historyItem, changedBy, handlerContext);

    case TRIGGER_TYPES.STATUS_CHANGED:
      return await handleStatusChanged(task, historyItem, changedBy, handlerContext);

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
async function handleTaskCreated(task, body, context = {}) {
  const statusName = task.status_name || body?.payload?.status?.status || '';
  const statusType = task.status_type || body?.payload?.status?.type || '';

  if (isNonOpenStatus(statusName, statusType) && !context.reroutedFromCreation) {
    logger.warn('Task created event received for closed-state task - rerouting to status handler', {
      taskId: task.id,
      status: statusName,
      endpoint: context.endpoint || 'universal'
    });

    await handleStatusChanged(
      task,
      context.historyItem || null,
      context.changedBy || task.creator_username || 'Unknown',
      {
        ...context,
        reroutedFromCreation: true
      }
    );

    return;
  }

  const assignees = getAssigneesWithInfo(task);
  const creator = getTaskCreatorInfo(task);
  const createdBy = context.changedBy || task.creator_username || 'غير معروف';

  // Emit event for notification service to handle
  eventBus.emitEvent(EVENTS.TASK_CREATED, { task, assignees, createdBy });

  logger.success('Task created event emitted', {
    taskId: task.id,
    aiWeight: task.ai_weight || 10,
    assignees: assignees.length,
    createdBy
  });
}

/**
 * Handle assignee added
 */
async function handleAssigneeAdded(task, historyItem, changedBy, context = {}) {
  const changeDetails = context.assigneeChange || extractAssigneeChanges(historyItem);
  let newAssignees = changeDetails.added;

  if (newAssignees.length === 0 && changeDetails.after.length > 0 && changeDetails.before.length === 0) {
    newAssignees = changeDetails.after;
  }

  if (newAssignees.length === 0) {
    const fallback = gatherAssigneeCandidates(
      historyItem?.after?.assignee,
      historyItem?.value?.after?.assignee,
      historyItem?.after?.assignees,
      historyItem?.value?.after?.assignees
    );
    if (fallback.length > 0) {
      newAssignees = fallback;
    }
  }

  if (!newAssignees || newAssignees.length === 0) {
    logger.debug('No new assignees detected in assignment handler', {
      taskId: task.id
    });
    return;
  }

  const enrichedAssignees = newAssignees
    .map(candidate => resolveAssigneeInfo(candidate))
    .filter(Boolean);

  if (enrichedAssignees.length === 0) {
    logger.debug('No enrichable assignee info for assignment event', { taskId: task.id });
    return;
  }

  // Emit event for notification service
  eventBus.emitEvent(EVENTS.TASK_ASSIGNED, {
    task,
    assignees: enrichedAssignees,
    assignedBy: changedBy
  });

  logger.success('Assignee added event emitted', {
    taskId: task.id,
    assignees: enrichedAssignees.map(assignee => assignee.name).join(', '),
    count: enrichedAssignees.length
  });
}

/**
 * Handle assignee removed
 */
async function handleAssigneeRemoved(task, historyItem, changedBy, context = {}) {
  const changeDetails = context.assigneeChange || extractAssigneeChanges(historyItem);
  let removedAssignees = changeDetails.removed;

  if (removedAssignees.length === 0 && changeDetails.before.length > 0 && changeDetails.after.length === 0) {
    removedAssignees = changeDetails.before;
  }

  if (removedAssignees.length === 0) {
    const fallback = gatherAssigneeCandidates(
      historyItem?.before?.assignee,
      historyItem?.value?.before?.assignee,
      historyItem?.before?.assignees,
      historyItem?.value?.before?.assignees
    );
    if (fallback.length > 0) {
      removedAssignees = fallback;
    }
  }

  if (!removedAssignees || removedAssignees.length === 0) {
    logger.debug('No removed assignees detected in assignment removal handler', {
      taskId: task.id
    });
    return;
  }

  const removedNames = removedAssignees
    .map(candidate => resolveAssigneeInfo(candidate))
    .filter(Boolean)
    .map(resolved => resolved.name)
    .filter(Boolean);

  if (removedNames.length === 0) {
    logger.debug('Unable to resolve removed assignee names', { taskId: task.id });
    return;
  }

  const uniqueNames = Array.from(new Set(removedNames));

  // Emit event for notification service
  eventBus.emitEvent(EVENTS.TASK_UNASSIGNED, {
    task,
    assigneeName: uniqueNames.join('، '),
    unassignedBy: changedBy
  });

  logger.success('Assignee removed event emitted', {
    taskId: task.id,
    assignees: uniqueNames.join(', '),
    count: uniqueNames.length
  });
}

/**
 * Handle status changed (including completion)
 */
async function handleStatusChanged(task, historyItem, changedBy, context = {}) {
  const assignees = getAssigneesWithInfo(task);
  const creator = context.creator
    || getTaskCreatorInfo(task)
    || (context.previousTask ? getTaskCreatorInfo(context.previousTask) : null);
  const afterInfo = extractStatusInfo(
    historyItem?.after,
    historyItem?.after?.status,
    historyItem?.value?.after,
    historyItem?.value?.after?.status,
    task.status_name ? { status: task.status_name, status_type: task.status_type } : null
  ) || { name: task.status_name || 'غير معروف', type: task.status_type || null };

  let beforeInfo = extractStatusInfo(
    historyItem?.before,
    historyItem?.before?.status,
    historyItem?.value?.before,
    historyItem?.before?.value
  );

  if ((!beforeInfo || !beforeInfo.name) && context.previousTask) {
    const previousStatus = context.previousTask.status_name || context.previousTask.status?.status;
    const previousStatusType = context.previousTask.status_type || context.previousTask.status?.type;
    if (previousStatus) {
      beforeInfo = {
        name: previousStatus,
        type: previousStatusType || null
      };
    }
  }

  if ((!beforeInfo || !beforeInfo.name) && task.id) {
    const historicalInfo = await lookupPreviousStatusFromEvents(task.id);
    if (historicalInfo?.name) {
      beforeInfo = historicalInfo;
    }
  }

  const beforeStatus = beforeInfo?.name && beforeInfo.name !== 'unknown'
    ? beforeInfo.name.toString().trim()
    : 'غير معروف';
  const beforeStatusType = beforeInfo?.type || '';
  const afterStatus = afterInfo?.name && afterInfo.name !== 'unknown'
    ? afterInfo.name.toString().trim()
    : 'غير معروف';
  const afterStatusType = afterInfo?.type || '';

  logger.debug('Status change detected', {
    taskId: task.id,
    beforeStatus,
    afterStatus,
    beforeStatusType,
    afterStatusType,
    isAutomation: !historyItem,
    reroutedFromCreation: context.reroutedFromCreation || false
  });

  const actionedBy = changedBy || 'غير معروف';
  const isComplete = isNonOpenStatus(afterStatus, afterStatusType);
  const isCancelled = isCancellationStatus(afterStatus, afterStatusType);
  const completionTarget = assignees[0] || null;

  if (isComplete && !isCancelled) {
    const completionOutcomes = [];
    const shareRecipientCount = Math.max(1, assignees.length || 1);
    const weightPlan = buildAiWeightSharePlan(task, shareRecipientCount);

    if (assignees.length === 0 && completionTarget) {
      const syntheticOutcome = await recordCompletionForAssignee(task, completionTarget, actionedBy, {
        aiWeightShare: weightPlan.shares[0] || weightPlan.defaultShare,
        aiWeightTotal: weightPlan.totalWeight
      });
      if (syntheticOutcome) {
        completionOutcomes.push(syntheticOutcome);
      }
    } else {
      for (let index = 0; index < assignees.length; index += 1) {
        const assignee = assignees[index];
        const outcome = await recordCompletionForAssignee(task, assignee, actionedBy, {
          aiWeightShare: weightPlan.shares[index] || weightPlan.defaultShare,
          aiWeightTotal: weightPlan.totalWeight
        });
        if (outcome) {
          completionOutcomes.push(outcome);
        }
      }
    }

    const aggregated = aggregateCompletionGamification(completionOutcomes).summary;

    eventBus.emitEvent(EVENTS.TASK_COMPLETED, {
      task,
      actionedBy,
      userName: actionedBy,
      assignees,
      gamificationResult: aggregated,
      beforeStatus,
      afterStatus,
      completionTargetId: completionTarget?.id || null,
      completionTargetName: completionTarget?.name || null,
      completionOutcomes,
      creator,
      aiWeightSplit: {
        total: weightPlan.totalWeight,
        perAssignee: weightPlan.participantCount > 0
          ? Number((weightPlan.totalWeight / weightPlan.participantCount).toFixed(2))
          : weightPlan.totalWeight
      }
    });

    logger.success('Task completed event emitted', {
      taskId: task.id,
      from: beforeStatus,
      to: afterStatus,
      aiWeight: task.ai_weight || 10,
      points: aggregated?.pointsEarned,
      actionedBy,
      creditedTo: assignees.length > 0 ? assignees.map(a => a.name).join(', ') : (completionTarget?.name || 'غير محدد'),
      creator: creator?.name || creator?.username || null,
      aiWeightPerAssignee: weightPlan.participantCount > 0
        ? Number((weightPlan.totalWeight / weightPlan.participantCount).toFixed(2))
        : weightPlan.totalWeight
    });
  } else {
    eventBus.emitEvent(EVENTS.TASK_STATUS_CHANGED, {
      task,
      beforeStatus,
      afterStatus,
      userName: actionedBy,
      actionedBy,
      beforeStatusType,
      afterStatusType,
      assignees,
      transitionType: isCancelled ? 'cancelled' : (isComplete ? 'closed' : 'progress'),
      creator
    });

    logger.success('Task status changed event emitted', {
      taskId: task.id,
      from: beforeStatus,
      to: afterStatus,
      actionedBy,
      transition: isCancelled ? 'cancelled' : 'updated',
      assignees: assignees.map(a => a.name),
      creator: creator?.name || creator?.username || null
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
  let commentText = extractCommentText(body);
  let attachments = gatherCommentAttachments(
    body.comment,
    body.payload?.comment,
    body.history_items?.[0]?.comment,
    body.history_items?.[0]?.attachments,
    body.history_items?.[0]?.value,
    body.attachments
  );

  const commentId = extractCommentId(body);
  let commentDetailsSource = 'webhook_only';

  if (commentId) {
    try {
      logger.info('Fetching comment details from ClickUp API', { commentId, taskId: task.id });
      const commentDetails = await enhancedClickUpService.fetchCommentDetails(commentId);

      if (commentDetails) {
        commentDetailsSource = 'api_enriched';
        const fetchedText = extractCommentText({ comment: commentDetails, payload: { comment: commentDetails } });
        if (fetchedText) {
          commentText = fetchedText;
        }

        if (Array.isArray(commentDetails.attachments) && commentDetails.attachments.length > 0) {
          attachments = gatherCommentAttachments(
            attachments,
            commentDetails.attachments
          );
        }
      }
    } catch (error) {
      logger.warn('Failed to load comment details from API', {
        commentId,
        taskId: task.id,
        error: error.message
      });
    }
  }

  const assignees = getAssigneesWithInfo(task);
  const creator = getTaskCreatorInfo(task);
  const participants = getTaskParticipants(task, assignees, creator);
  const actor = resolveActorInfo(body, changedBy);

  eventBus.emitEvent(EVENTS.TASK_COMMENT_POSTED, {
    task,
    commentText,
    attachments,
    userName: changedBy,
    assignees,
    creator,
    participants,
    actor,
    contentSource: commentDetailsSource
  });

  logger.success('Comment posted event emitted', {
    taskId: task.id,
    commentId: commentId || 'unknown',
    textLength: commentText.length,
    attachmentCount: attachments.length,
    contentSource: commentDetailsSource
  });
}

// ==================== UTILITY FUNCTIONS ====================

function extractCommentText(body = {}) {
  const candidates = [
    body.comment,
    body.comment?.text,
    body.comment?.comment_text,
    body.comment?.body,
    body.payload?.comment,
    body.payload?.comment?.text,
    body.payload?.comment?.comment_text,
    body.payload?.comment?.body,
    body.history_items?.[0]?.comment,
    body.history_items?.[0]?.comment?.text,
    body.history_items?.[0]?.comment?.comment_text,
    body.history_items?.[0]?.comment?.body,
    body.history_items?.[0]?.value,
    body.history_items?.[0]?.value?.after,
    body.history_items?.[0]?.value?.after?.comment,
    body.history_items?.[0]?.value?.after?.comment?.text,
    body.history_items?.[0]?.value?.after?.comment?.comment_text,
    body.history_items?.[0]?.value?.comment,
    body.history_items?.[0]?.value?.comment_text,
    body.history_items?.[0]?.value?.text
  ];

  for (const candidate of candidates) {
    const raw = extractTextCandidate(candidate);
    if (raw) {
      const sanitized = sanitizeCommentText(raw);
      if (sanitized) {
        return sanitized;
      }
    }
  }

  return '';
}

function extractCommentId(body = {}) {
  const candidates = [
    body.comment?.id,
    body.comment?.comment_id,
    body.payload?.comment?.id,
    body.payload?.comment?.comment_id,
    body.payload?.comment_id,
    body.comment_id,
    body.id,
    body.history_items?.[0]?.comment_id,
    body.history_items?.[0]?.comment?.id,
    body.history_items?.[0]?.comment?.comment_id,
    body.history_items?.[0]?.value?.comment_id,
    body.history_items?.[0]?.value?.comment?.id,
    body.history_items?.[0]?.value?.after?.comment?.id,
    body.history_items?.[0]?.value?.after?.comment_id,
    body.history_items?.[0]?.value?.comment?.comment_id
  ];

  for (const candidate of candidates) {
    const normalized = normalizeIdCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function normalizeIdCandidate(candidate) {
  if (!candidate) {
    return null;
  }

  if (typeof candidate === 'string' || typeof candidate === 'number') {
    const value = candidate.toString().trim();
    return value || null;
  }

  if (typeof candidate === 'object') {
    return normalizeIdCandidate(candidate.id || candidate.comment_id || candidate.value);
  }

  return null;
}

function extractTextCandidate(candidate) {
  if (!candidate) {
    return null;
  }

  if (typeof candidate === 'string') {
    return candidate;
  }

  if (typeof candidate !== 'object') {
    return null;
  }

  const keys = ['text', 'comment_text', 'body', 'content', 'description', 'plain_text', 'value'];
  for (const key of keys) {
    if (typeof candidate[key] === 'string' && candidate[key].trim()) {
      return candidate[key];
    }
  }

  return null;
}

function sanitizeCommentText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let normalized = text;
  normalized = normalized.replace(/\r/g, '');
  normalized = normalized.replace(/<br\s*\/?\s*>/gi, '\n');
  normalized = normalized.replace(/<div>/gi, '\n');
  normalized = normalized.replace(/<\/(div|p)>/gi, '\n');
  normalized = normalized.replace(/<li>/gi, '\n• ');
  normalized = normalized.replace(/<\/(ul|ol|li)>/gi, '\n');
  normalized = normalized.replace(/<[^>]+>/g, '');
  normalized = decodeHtmlEntities(normalized);
  normalized = normalized.replace(/\n{3,}/g, '\n\n');

  return normalized.trim();
}

function decodeHtmlEntities(text) {
  if (!text) {
    return '';
  }

  const replacements = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#34;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&apos;': "'",
    '&bull;': '•'
  };

  return text.replace(/(&nbsp;|&amp;|&lt;|&gt;|&quot;|&#34;|&#39;|&#x27;|&apos;|&bull;)/g, (match) => replacements[match] || match);
}

function gatherCommentAttachments(...sources) {
  const results = [];
  const seen = new Set();
  const seenObjects = new Set();

  const pushAttachment = (candidate) => {
    if (!candidate) {
      return;
    }

    const url = candidate.url
      || candidate.link
      || candidate.download_url
      || candidate.preview_url
      || candidate.thumb_url
      || candidate.thumbnail
      || candidate.view_url;

    if (!url) {
      return;
    }

    const id = candidate.id || candidate.uuid || candidate.file_id || url;
    const key = `${id}::${url}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    const rawName = candidate.name
      || candidate.title
      || candidate.filename
      || candidate.file_name
      || candidate.display_name
      || candidate.id;

    results.push({
      id,
      name: (rawName && rawName.toString().trim()) ? rawName.toString().trim() : 'ملف مرفق',
      url,
      type: candidate.type || candidate.content_type || candidate.mime_type || candidate.mime || candidate.mimetype || null
    });
  };

  const inspect = (value) => {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(item => inspect(item));
      return;
    }

    if (typeof value !== 'object') {
      return;
    }

    if (seenObjects.has(value)) {
      return;
    }
    seenObjects.add(value);

    pushAttachment(value);

    const nestedKeys = ['attachments', 'attachment', 'files', 'file', 'value', 'after', 'before', 'new', 'old', 'children', 'items', 'data'];
    nestedKeys.forEach((key) => {
      if (value[key]) {
        inspect(value[key]);
      }
    });
  };

  sources.forEach(source => inspect(source));

  return results;
}

function resolveActorInfo(body = {}, fallbackName = null) {
  const candidates = [];
  const historyUser = body.history_items?.[0]?.user;
  const commentUser = body.comment?.user || body.payload?.comment?.user;
  const payloadUser = body.payload?.user;

  [historyUser, commentUser, payloadUser].forEach((user) => {
    if (!user) {
      return;
    }

    candidates.push({
      id: user.id || user.user_id || user.userid || null,
      email: user.email || user.user_email || null,
      name: user.username || user.name || user.full_name || null,
      phone: user.phone || user.mobile || null
    });
  });

  if (fallbackName) {
    candidates.push({ name: fallbackName });
  }

  for (const candidate of candidates) {
    const resolved = resolveAssigneeInfo(candidate);
    if (resolved) {
      if (!resolved.name && fallbackName) {
        resolved.name = fallbackName;
      }
      return resolved;
    }
  }

  return fallbackName ? { id: null, name: fallbackName } : null;
}

function getTaskCreatorInfo(task) {
  if (!task) {
    return null;
  }

  const candidates = [];

  if (task.creator) {
    candidates.push({
      id: task.creator.id || task.creator.user_id || null,
      email: task.creator.email || task.creator.user_email || null,
      name: task.creator.username || task.creator.name || null,
      phone: task.creator.phone || null
    });
  }

  candidates.push({
    id: task.creator_id || task.created_by || null,
    email: task.creator_email || null,
    name: task.creator_username || task.creator_name || null
  });

  candidates.push({
    id: task.creator_user_id || null,
    email: task.creator_user_email || null,
    name: task.creator_user_name || null
  });

  for (const candidate of candidates) {
    const resolved = resolveAssigneeInfo(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function getTaskParticipants(task, assignees = null, creator = null) {
  const participants = new Map();

  const addParticipant = (member) => {
    if (!member) {
      return;
    }

    const key = buildAssigneeKey(member)
      || (member.phone ? `phone:${member.phone}` : null)
      || (member.name ? `name:${member.name.toLowerCase()}` : null)
      || `member_${participants.size}`;

    if (participants.has(key)) {
      return;
    }

    participants.set(key, member);
  };

  const resolvedAssignees = Array.isArray(assignees) ? assignees : getAssigneesWithInfo(task);
  resolvedAssignees.forEach(addParticipant);

  if (creator) {
    addParticipant(creator);
  }

  const followerCandidates = gatherAssigneeCandidates(
    task.watchers,
    task.watchers?.members,
    task.followers,
    task.members,
    task.subscribers,
    task.assignees
  );

  followerCandidates
    .map(candidate => resolveAssigneeInfo(candidate))
    .filter(Boolean)
    .forEach(addParticipant);

  return Array.from(participants.values());
}

/**
 * Get assignees with full team member info
 */
function buildAssigneeKey(candidate) {
  if (!candidate) {
    return null;
  }

  if (candidate.id !== null && candidate.id !== undefined && candidate.id !== '') {
    return `id:${candidate.id}`;
  }

  if (candidate.email) {
    return `email:${candidate.email.toLowerCase()}`;
  }

  if (candidate.name) {
    return `name:${candidate.name.toLowerCase()}`;
  }

  return null;
}

function normalizeAssigneeCandidate(raw) {
  if (!raw) {
    return null;
  }

  if (typeof raw === 'string') {
    const parsed = tryParseJson(raw);
    if (parsed && typeof parsed === 'object') {
      return normalizeAssigneeCandidate(parsed);
    }
    return null;
  }

  if (Array.isArray(raw)) {
    return null;
  }

  if (typeof raw !== 'object') {
    return null;
  }

  const id = raw.id ?? raw.user_id ?? raw.userid ?? raw.userId ?? raw.member_id ?? raw.person_id ?? raw.assignee_id ?? null;
  const email = raw.email ?? raw.user_email ?? raw.mail ?? null;
  const username = raw.username ?? raw.name ?? raw.full_name ?? raw.display_name ?? raw.handle ?? null;
  const phone = raw.phone ?? null;

  if (id === null && !email && !username) {
    return null;
  }

  const candidate = {
    id,
    email: email || null,
    name: username || (email ? email.split('@')[0] : null)
  };

  if (phone) {
    candidate.phone = phone;
  }

  return candidate;
}

function collectAssigneeCandidates(source, results, seenKeys) {
  if (!source) {
    return;
  }

  if (typeof source === 'string') {
    const parsed = tryParseJson(source);
    if (parsed) {
      collectAssigneeCandidates(parsed, results, seenKeys);
    }
    return;
  }

  if (Array.isArray(source)) {
    source.forEach(item => collectAssigneeCandidates(item, results, seenKeys));
    return;
  }

  if (typeof source !== 'object') {
    return;
  }

  const candidate = normalizeAssigneeCandidate(source);
  if (candidate) {
    const key = buildAssigneeKey(candidate);
    if (key && !seenKeys.has(key)) {
      seenKeys.add(key);
      results.push(candidate);
    }
  }

  const nestedKeys = [
    'assignee',
    'assignees',
    'value',
    'values',
    'added',
    'removed',
    'new',
    'old',
    'current',
    'previous',
    'users',
    'members'
  ];

  for (const key of nestedKeys) {
    if (source[key]) {
      collectAssigneeCandidates(source[key], results, seenKeys);
    }
  }
}

function gatherAssigneeCandidates(...sources) {
  const results = [];
  const seenKeys = new Set();
  sources.forEach(source => collectAssigneeCandidates(source, results, seenKeys));
  return results;
}

function resolveAssigneeInfo(candidate) {
  if (!candidate) {
    return null;
  }

  const numericId = Number(candidate.id);
  const normalizedId = Number.isFinite(numericId) ? numericId : null;

  const member = (normalizedId !== null ? findMemberById(normalizedId) : null)
    || (candidate.email ? findMemberByEmail(candidate.email) : null);

  if (member) {
    return {
      id: member.id,
      name: member.name,
      phone: member.phone,
      email: member.email
    };
  }

  const fallbackName = candidate.name || candidate.email || (normalizedId !== null ? `عضو ${normalizedId}` : null);

  if (!fallbackName) {
    return null;
  }

  const resolved = {
    id: normalizedId ?? candidate.id ?? null,
    name: fallbackName,
    email: candidate.email || null
  };

  if (candidate.phone) {
    resolved.phone = candidate.phone;
  }

  return resolved;
}

function extractAssigneeChanges(historyItem) {
  if (!historyItem) {
    return {
      added: [],
      removed: [],
      before: [],
      after: []
    };
  }

  const afterCandidates = gatherAssigneeCandidates(
    historyItem.after,
    historyItem.after?.assignee,
    historyItem.after?.assignees,
    historyItem.value?.after,
    historyItem.value?.after?.assignee,
    historyItem.value?.after?.assignees,
    historyItem.assignee?.after,
    historyItem.assignee?.new
  );

  const beforeCandidates = gatherAssigneeCandidates(
    historyItem.before,
    historyItem.before?.assignee,
    historyItem.before?.assignees,
    historyItem.value?.before,
    historyItem.value?.before?.assignee,
    historyItem.value?.before?.assignees,
    historyItem.assignee?.before,
    historyItem.assignee?.old
  );

  const beforeMap = new Map();
  beforeCandidates.forEach(candidate => {
    const key = buildAssigneeKey(candidate);
    if (key) {
      beforeMap.set(key, candidate);
    }
  });

  const afterMap = new Map();
  afterCandidates.forEach(candidate => {
    const key = buildAssigneeKey(candidate);
    if (key) {
      afterMap.set(key, candidate);
    }
  });

  const added = [];
  afterMap.forEach((candidate, key) => {
    if (!beforeMap.has(key)) {
      added.push(candidate);
    }
  });

  const removed = [];
  beforeMap.forEach((candidate, key) => {
    if (!afterMap.has(key)) {
      removed.push(candidate);
    }
  });

  return {
    added,
    removed,
    before: beforeCandidates,
    after: afterCandidates
  };
}

function collectTaskAssigneeCandidates(task) {
  if (!task) {
    return [];
  }

  const parsedAssigneeIds = (() => {
    if (!task.assignee_ids) {
      return [];
    }

    if (Array.isArray(task.assignee_ids)) {
      return task.assignee_ids;
    }

    if (typeof task.assignee_ids === 'string') {
      const parsed = tryParseJson(task.assignee_ids);
      return Array.isArray(parsed) ? parsed : [];
    }

    if (typeof task.assignee_ids === 'object') {
      const values = Object.values(task.assignee_ids);
      return values.flatMap(value => (Array.isArray(value) ? value : [value]));
    }

    return [];
  })();

  const normalizedFromIds = parsedAssigneeIds
    .map(id => normalizeAssigneeCandidate({ id }))
    .filter(Boolean);

  const candidateSources = [
    task.assignees,
    task.assignee,
    task.assigned_to,
    task.members,
    task.assignees_list,
    task.assignment,
    task.assignments
  ];

  const combined = [
    ...gatherAssigneeCandidates(...candidateSources),
    ...normalizedFromIds
  ];

  const unique = [];
  const seen = new Set();

  combined.forEach(candidate => {
    const key = buildAssigneeKey(candidate);
    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push(candidate);
    }
  });

  return unique;
}

function deriveAssigneeDiffFromTasks(previousTask, currentTask) {
  const beforeCandidates = collectTaskAssigneeCandidates(previousTask);
  const afterCandidates = collectTaskAssigneeCandidates(currentTask);

  if (beforeCandidates.length === 0 && afterCandidates.length === 0) {
    return {
      added: [],
      removed: [],
      before: [],
      after: []
    };
  }

  const beforeMap = new Map();
  beforeCandidates.forEach(candidate => {
    const key = buildAssigneeKey(candidate);
    if (key) {
      beforeMap.set(key, candidate);
    }
  });

  const afterMap = new Map();
  afterCandidates.forEach(candidate => {
    const key = buildAssigneeKey(candidate);
    if (key) {
      afterMap.set(key, candidate);
    }
  });

  const added = [];
  afterMap.forEach((candidate, key) => {
    if (!beforeMap.has(key)) {
      added.push(candidate);
    }
  });

  const removed = [];
  beforeMap.forEach((candidate, key) => {
    if (!afterMap.has(key)) {
      removed.push(candidate);
    }
  });

  return {
    added,
    removed,
    before: beforeCandidates,
    after: afterCandidates
  };
}

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

  const resolved = new Map();

  const addAssignee = (member, fallback = {}) => {
    const key = member?.id
      ?? (typeof fallback.id !== 'undefined' ? fallback.id : null)
      ?? fallback.email
      ?? fallback.username
      ?? `external_${resolved.size}`;

    if (resolved.has(key)) {
      return;
    }

    const fallbackName = fallback.username
      || fallback.name
      || fallback.email
      || (fallback.id ? `المستخدم ${fallback.id}` : 'عضو غير معروف');

    const entry = {
      id: member ? Number(member.id) : null,
      externalId: typeof fallback.id !== 'undefined' ? fallback.id : null,
      name: member?.name || fallbackName,
      phone: member?.phone || null,
      email: member?.email || fallback.email || null
    };

    resolved.set(key, entry);
  };

  if (Array.isArray(task.assignees)) {
    task.assignees.forEach(rawAssignee => {
      const rawId = Number(rawAssignee?.id);
      const member = Number.isFinite(rawId) ? findMemberById(rawId) : null
        || (rawAssignee?.email ? findMemberByEmail(rawAssignee.email) : null);
      addAssignee(member, rawAssignee);
    });
  }

  assigneeIds.forEach(rawId => {
    const numericId = Number(rawId);
    if (!Number.isFinite(numericId)) {
      return;
    }

    const member = findMemberById(numericId);
    if (member) {
      addAssignee(member, { id: numericId });
    }
  });

  return Array.from(resolved.values());
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
  handleTaskCreatedWebhook,
  handleTaskAssignedWebhook,
  handleStatusChangedWebhook,
  handleTaskCompletedWebhook,
  handleTaskCommentWebhook,
  TRIGGER_TYPES,
  TRIGGER_CATEGORIES
};
