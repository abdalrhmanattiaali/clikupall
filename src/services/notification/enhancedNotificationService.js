/**
 * Enhanced Notification Service
 * خدمة إدارة الإشعارات الشاملة مع batching ذكي + AI enhancement
 */

import logger from '../../core/logger.js';
import eventBus, { EVENTS } from '../../core/eventBus.js';
import whatsappService from '../whatsapp/whatsappService.js';
import aiService from '../ai/index.js';
import { env } from '../../config/env.js';
import { shortenUrl } from '../../utils/urlShortener.js';

class EnhancedNotificationService {
  constructor() {
    this.queue = [];
    this.pendingNotifications = []; // Queue for notifications when WhatsApp is not ready
    this.isPaused = false;
    this.pauseTimeout = null;
    this.batchTimeout = null;
    this.batchDelay = env.notifications.batchDelay;
    this.sentDirectNotifications = new Set();
    this.whatsappReady = false;

    // Deduplication: track recent notifications to prevent duplicates
    this.recentNotifications = new Map(); // key: taskId-eventType, value: timestamp
    this.deduplicationWindow = 10000; // 10 seconds

    this.setupEventListeners();
  }

  /**
   * Setup comprehensive event listeners
   */
  setupEventListeners() {
    logger.info('Setting up enhanced notification listeners');

    // System Events
    eventBus.onEvent(EVENTS.WHATSAPP_READY, () => this.handleWhatsAppReady());
    eventBus.onEvent(EVENTS.WHATSAPP_DISCONNECTED, () => this.handleWhatsAppDisconnected());

    // Task Management Events
    eventBus.onEvent(EVENTS.TASK_CREATED, (data) => this.handleTaskCreated(data));
    eventBus.onEvent(EVENTS.TASK_COMPLETED, (data) => this.handleTaskCompleted(data));
    eventBus.onEvent(EVENTS.TASK_ASSIGNED, (data) => this.handleTaskAssigned(data));
    eventBus.onEvent(EVENTS.TASK_UNASSIGNED, (data) => this.handleTaskUnassigned(data));
    eventBus.onEvent(EVENTS.TASK_STATUS_CHANGED, (data) => this.handleTaskStatusChanged(data));
    eventBus.onEvent(EVENTS.TASK_PRIORITY_CHANGED, (data) => this.handleTaskPriorityChanged(data));
    eventBus.onEvent(EVENTS.TASK_NAME_CHANGED, (data) => this.handleTaskNameChanged(data));

    // Tag Events
    eventBus.onEvent(EVENTS.TASK_TAG_ADDED, (data) => this.handleTaskTagAdded(data));
    eventBus.onEvent(EVENTS.TASK_TAG_REMOVED, (data) => this.handleTaskTagRemoved(data));

    // Date & Time Events
    eventBus.onEvent(EVENTS.TASK_DUE_DATE_CHANGED, (data) => this.handleTaskDueDateChanged(data));
    eventBus.onEvent(EVENTS.TASK_START_DATE_CHANGED, (data) => this.handleTaskStartDateChanged(data));
    eventBus.onEvent(EVENTS.TASK_DUE_DATE_REMINDER, (data) => this.handleTaskDueDateReminder(data));
    eventBus.onEvent(EVENTS.TASK_START_DATE_REMINDER, (data) => this.handleTaskStartDateReminder(data));
    eventBus.onEvent(EVENTS.TASK_TIME_TRACKED, (data) => this.handleTaskTimeTracked(data));

    // Checklist Events
    eventBus.onEvent(EVENTS.TASK_CHECKLIST_ITEM_RESOLVED, (data) => this.handleChecklistItemResolved(data));
    eventBus.onEvent(EVENTS.TASK_ALL_CHECKLISTS_RESOLVED, (data) => this.handleAllChecklistsResolved(data));

    // Subtask Events
    eventBus.onEvent(EVENTS.TASK_SUBTASK_CREATED, (data) => this.handleSubtaskCreated(data));
    eventBus.onEvent(EVENTS.TASK_ALL_SUBTASKS_RESOLVED, (data) => this.handleAllSubtasksResolved(data));

    // Comment Events
    eventBus.onEvent(EVENTS.TASK_COMMENT_POSTED, (data) => this.handleCommentPosted(data));

    // Custom Fields & Links
    eventBus.onEvent(EVENTS.TASK_CUSTOM_FIELD_CHANGED, (data) => this.handleCustomFieldChanged(data));
    eventBus.onEvent(EVENTS.TASK_LINKED, (data) => this.handleTaskLinked(data));
    eventBus.onEvent(EVENTS.TASK_UNLINKED, (data) => this.handleTaskUnlinked(data));

    logger.success('Enhanced notification listeners setup complete');
  }

  // ==================== EVENT HANDLERS ====================

  /**
   * Handle WhatsApp ready event
   */
  async handleWhatsAppReady() {
    this.whatsappReady = true;
    logger.success('WhatsApp ready - notification service activated');

    // Process any pending notifications
    if (this.pendingNotifications.length > 0) {
      logger.info(`Processing ${this.pendingNotifications.length} pending notifications`);

      for (const pending of this.pendingNotifications) {
        try {
          await this.sendImmediateNotification(pending.message, pending.target, pending.phone);
        } catch (error) {
          logger.error('Failed to send pending notification', {
            error: error.message,
            target: pending.target
          });
        }
      }

      this.pendingNotifications = [];
      logger.success('All pending notifications processed');
    }
  }

  /**
   * Handle WhatsApp disconnected event
   */
  handleWhatsAppDisconnected() {
    this.whatsappReady = false;
    logger.warn('WhatsApp disconnected - notifications will be queued');
  }

  /**
   * Handle task created
   */
  async handleTaskCreated(data) {
    const { task } = data;
    const assignees = Array.isArray(data.assignees) ? data.assignees : [];
    const createdBy = data.createdBy || 'غير معروف';

    // Check for duplicate
    if (this.isDuplicateNotification(task.id, 'created')) {
      return; // Skip duplicate
    }

    logger.info('📝 Processing TASK_CREATED event', {
      taskId: task.id,
      taskName: task.name,
      assignees: assignees?.length || 0,
      createdBy
    });

    const groupMessage = await this.buildTaskCreatedMessage(task, assignees, createdBy);

    // Add to batch queue for group (not immediate)
    this.addToQueue({
      type: 'task_created',
      task,
      message: groupMessage,
      data: { assignees, createdBy }
    });

    // Send DM to assignees immediately with personalized message
    if (assignees && assignees.length > 0) {
      for (const assignee of assignees) {
        if (assignee.phone) {
          const dmMessage = await this.buildTaskAssignedDM(task, assignee, createdBy);
          await this.sendImmediateNotification(dmMessage, 'user', assignee.phone);
        }
      }
    }

    logger.success('Task created notifications queued', {
      taskId: task.id,
      queuedForGroup: true,
      sentDMs: assignees?.length || 0
    });
  }

  /**
   * Handle task completed
   */
  async handleTaskCompleted(data) {
    const { task, creator, beforeStatus, afterStatus } = data;
    const actionedBy = data.actionedBy || data.userName || 'غير معروف';
    const assignees = Array.isArray(data.assignees) && data.assignees.length > 0
      ? data.assignees
      : this.getAssigneesFromTask(task);
    const creatorInfo = creator || null;
    const completionBreakdown = Array.isArray(data.completionOutcomes)
      ? data.completionOutcomes
      : [];
    const breakdownIndex = this.indexCompletionOutcomes(completionBreakdown);
    const gamificationResult = this.aggregateGamificationFromBreakdown(
      completionBreakdown,
      data.gamificationResult || null
    );

    // Check for duplicate
    if (this.isDuplicateNotification(task.id, 'completed')) {
      return; // Skip duplicate
    }

    logger.info('✅ Processing TASK_COMPLETED event', {
      taskId: task.id,
      taskName: task.name,
      actionedBy,
      assignees: assignees.map(a => a.name).join(', ') || 'غير محدد',
      points: gamificationResult?.pointsEarned || 0
    });

    const groupMessage = await this.buildTaskCompletedMessage(
      task,
      assignees,
      actionedBy,
      gamificationResult,
      completionBreakdown
    );

    // Add to batch queue for group
    this.addToQueue({
      type: 'task_completed',
      task,
      message: groupMessage,
      data: { actionedBy, assignees, gamificationResult, userName: actionedBy, completionBreakdown }
    });

    // Send DM to task completer with achievements and tips
    if (assignees.length > 0) {
      for (const assignee of assignees) {
        if (assignee.phone) {
          const outcome = this.resolveCompletionOutcomeForAssignee(assignee, breakdownIndex);
          const completionMeta = outcome?.gamificationResult
            || gamificationResult
            || { pointsEarned: 0, newBadges: [], shieldUpgrade: null };
          const dmMessage = await this.buildCompletionDM(task, assignee, completionMeta, actionedBy, outcome);
          await this.sendImmediateNotification(dmMessage, 'user', assignee.phone);
        }
      }
    }

    if (creatorInfo && this.shouldNotifyCreator(creatorInfo, assignees)) {
      if (creatorInfo.phone) {
        const creatorMessage = await this.buildCreatorCompletionDM(
          task,
          creatorInfo,
          assignees,
          actionedBy,
          gamificationResult,
          beforeStatus,
          afterStatus,
          completionBreakdown
        );

        await this.sendImmediateNotification(creatorMessage, 'user', creatorInfo.phone);

        logger.info('Sent creator completion follow-up DM', {
          taskId: task.id,
          creator: creatorInfo.name,
          assignees: assignees.map(a => a.name)
        });
      } else {
        logger.debug('Creator eligible for completion follow-up but no phone available', {
          taskId: task.id,
          creator: creatorInfo.name
        });
      }
    }

    logger.success('Task completed notification queued', {
      taskId: task.id,
      points: gamificationResult?.pointsEarned,
      queuedForGroup: true,
      sentDMs: assignees.length
    });
  }

  /**
   * Handle task assigned
   */
  async handleTaskAssigned(data) {
    const { task, assignees } = data;
    const assignedBy = data.assignedBy || 'غير معروف';

    if (!assignees || assignees.length === 0) {
      logger.debug('TASK_ASSIGNED event received but no assignees found');
      return;
    }

    // Check for duplicate
    const dedupeKey = assignees
      .map(a => a.id || a.externalId || a.email || a.name)
      .filter(Boolean)
      .sort()
      .join('|');

    const dedupeOptions = dedupeKey ? { uniqueKey: dedupeKey } : undefined;

    if (this.isDuplicateNotification(task.id, 'assigned', dedupeOptions)) {
      return; // Skip duplicate
    }

    logger.info('👤 Processing TASK_ASSIGNED event', {
      taskId: task.id,
      taskName: task.name,
      assignees: assignees.map(a => a.name).join(', '),
      assignedBy
    });

    // Add to batch queue for group (not immediate to avoid duplicates)
    this.addToQueue({
      type: 'task_assigned',
      task,
      message: null, // Will build in batch
      data: { assignees, assignedBy }
    });

    // Send DM to newly assigned users
    for (const assignee of assignees) {
      if (assignee.phone) {
        const dmMessage = await this.buildTaskAssignedDM(task, assignee, assignedBy);
        await this.sendImmediateNotification(dmMessage, 'user', assignee.phone);
      }
    }

    logger.success('Task assignment notifications queued', {
      taskId: task.id,
      assigneeCount: assignees.length,
      queuedForGroup: true,
      sentDMs: assignees.filter(a => a.phone).length
    });
  }

  /**
   * Handle task unassigned
   */
  async handleTaskUnassigned(data) {
    const { task, assigneeName, unassignedBy } = data;

    const message = `🔄 تم إلغاء تكليف *${assigneeName}* من مهمة "${task.name}"`;

    this.addToQueue({
      type: 'task_unassigned',
      task,
      message,
      userName: unassignedBy
    });
  }

  /**
   * Handle task status changed
   */
  async handleTaskStatusChanged(data) {
    const { task, beforeStatus, afterStatus, creator } = data;
    const actionedBy = data.actionedBy || data.userName || 'غير معروف';
    const assignees = Array.isArray(data.assignees) ? data.assignees : [];
    const transitionType = data.transitionType || 'progress';
    const creatorInfo = creator || null;

    const normalizedBefore = (beforeStatus || '').toString().trim().toLowerCase();
    const normalizedAfter = (afterStatus || '').toString().trim().toLowerCase();

    if (normalizedBefore && normalizedAfter && normalizedBefore === normalizedAfter) {
      logger.debug('Ignoring TASK_STATUS_CHANGED because status value did not change', {
        taskId: task.id,
        status: afterStatus
      });
      return;
    }

    logger.info('🔄 Processing TASK_STATUS_CHANGED event', {
      taskId: task.id,
      taskName: task.name,
      beforeStatus,
      afterStatus,
      actionedBy,
      assignees: assignees.map(a => a.name).join(', ') || 'غير محدد',
      transitionType
    });

    const message = await this.buildTaskStatusChangedMessage(task, beforeStatus, afterStatus, actionedBy, assignees, transitionType);

    // Always queue for batch (not immediate)
    this.addToQueue({
      type: 'status_changed',
      task,
      message,
      data: { beforeStatus, afterStatus, userName: actionedBy, actionedBy, assignees, transitionType }
    });

    logger.debug('Status change queued for batch', {
      taskId: task.id,
      from: beforeStatus,
      to: afterStatus
    });

    if (creatorInfo && this.shouldNotifyCreator(creatorInfo, assignees)) {
      if (creatorInfo.phone) {
        const creatorMessage = await this.buildCreatorStatusDM(
          task,
          creatorInfo,
          beforeStatus,
          afterStatus,
          actionedBy,
          assignees,
          transitionType
        );

        await this.sendImmediateNotification(creatorMessage, 'user', creatorInfo.phone);

        logger.info('Sent creator status follow-up DM', {
          taskId: task.id,
          creator: creatorInfo.name,
          beforeStatus,
          afterStatus
        });
      } else {
        logger.debug('Creator eligible for status follow-up but no phone available', {
          taskId: task.id,
          creator: creatorInfo.name
        });
      }
    }
  }

  /**
   * Handle task priority changed
   */
  async handleTaskPriorityChanged(data) {
    const { task, beforePriority, afterPriority, userName } = data;

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
      `*بواسطة:* ${userName}`;

    this.addToQueue({
      type: 'priority_changed',
      task,
      message,
      userName
    });
  }

  /**
   * Handle task name changed
   */
  async handleTaskNameChanged(data) {
    const { task, beforeName, afterName, userName } = data;

    const message = `✏️ *تم تغيير اسم المهمة*\n\n` +
      `*من:* ${beforeName}\n` +
      `*إلى:* ${afterName}\n` +
      `*بواسطة:* ${userName}`;

    this.addToQueue({
      type: 'name_changed',
      task,
      message,
      userName
    });
  }

  /**
   * Handle tag added
   */
  async handleTaskTagAdded(data) {
    const { task, tag, userName } = data;

    const message = `🏷️ *تم إضافة وسم*\n\n` +
      `*المهمة:* ${task.name}\n` +
      `*الوسم:* ${tag}\n` +
      `*بواسطة:* ${userName}`;

    this.addToQueue({
      type: 'tag_added',
      task,
      message,
      userName
    });
  }

  /**
   * Handle tag removed
   */
  async handleTaskTagRemoved(data) {
    const { task, tag, userName } = data;

    const message = `🏷️ *تم إزالة وسم*\n\n` +
      `*المهمة:* ${task.name}\n` +
      `*الوسم:* ${tag}\n` +
      `*بواسطة:* ${userName}`;

    this.addToQueue({
      type: 'tag_removed',
      task,
      message,
      userName
    });
  }

  /**
   * Handle due date changed
   */
  async handleTaskDueDateChanged(data) {
    const { task, beforeDate, afterDate, userName } = data;

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

    message += `*بواسطة:* ${userName}`;

    this.addToQueue({
      type: 'due_date_changed',
      task,
      message,
      userName
    });
  }

  /**
   * Handle start date changed
   */
  async handleTaskStartDateChanged(data) {
    const { task, startDate, userName } = data;

    const dateStr = startDate ? new Date(parseInt(startDate)).toLocaleDateString('ar-EG') : 'بدون تاريخ';

    const message = `📅 *تم تغيير تاريخ البدء*\n\n` +
      `*المهمة:* ${task.name}\n` +
      `*تاريخ البدء:* ${dateStr}\n` +
      `*بواسطة:* ${userName}`;

    this.addToQueue({
      type: 'start_date_changed',
      task,
      message,
      userName
    });
  }

  /**
   * Handle due date reminder
   */
  async handleTaskDueDateReminder(data) {
    const { task, assignees } = data;

    let message = `⏰ *تذكير: الموعد النهائي اليوم!*\n\n`;
    message += `*المهمة:* ${task.name}\n`;
    message += `*الوزن:* ${task.ai_weight || 10} نقطة 💎\n`;
    message += `*الحالة:* ${task.status_name}\n`;

    if (assignees && assignees.length > 0) {
      message += `*المكلفون:* ${assignees.map(a => a.name).join(', ')}\n`;
    }

    message += `\n🔗 ${task.url}\n`;
    message += `\n⚡ أنجزها اليوم!`;

    // Send immediately - important reminder!
    await this.sendImmediateNotification(message, 'group');

    // Send to assignees
    if (assignees) {
      for (const assignee of assignees) {
        if (assignee.phone) {
          await this.sendImmediateNotification(message, 'user', assignee.phone);
        }
      }
    }

    logger.success('Due date reminder sent', { taskId: task.id });
  }

  /**
   * Handle start date reminder
   */
  async handleTaskStartDateReminder(data) {
    const { task } = data;

    const message = `🚀 *حان وقت البدء!*\n\n` +
      `*المهمة:* ${task.name}\n` +
      `*الوزن:* ${task.ai_weight || 10} نقطة 💎\n` +
      `\n🔗 ${task.url}\n` +
      `\nابدأ الآن! 💪`;

    await this.sendImmediateNotification(message, 'group');

    logger.success('Start date reminder sent', { taskId: task.id });
  }

  /**
   * Handle time tracked
   */
  async handleTaskTimeTracked(data) {
    const { task, timeMs, userName } = data;

    const timeHours = timeMs ? (timeMs / (1000 * 60 * 60)).toFixed(1) : '0';

    const message = `⏱️ *تم تسجيل وقت*\n\n` +
      `*المهمة:* ${task.name}\n` +
      `*الوقت:* ${timeHours} ساعة\n` +
      `*بواسطة:* ${userName}`;

    this.addToQueue({
      type: 'time_tracked',
      task,
      message,
      userName
    });
  }

  /**
   * Handle checklist item resolved
   */
  async handleChecklistItemResolved(data) {
    const { task, resolved, total, userName } = data;

    const progress = total > 0 ? Math.round((resolved / total) * 100) : 0;

    const message = `☑️ *تم إتمام عنصر في القائمة*\n\n` +
      `*المهمة:* ${task.name}\n` +
      `*التقدم:* ${resolved}/${total} (${progress}%)\n` +
      `*بواسطة:* ${userName}`;

    this.addToQueue({
      type: 'checklist_item_resolved',
      task,
      message,
      userName
    });
  }

  /**
   * Handle all checklists resolved
   */
  async handleAllChecklistsResolved(data) {
    const { task, userName } = data;

    const message = `🎉 *تم إكمال جميع عناصر القائمة!*\n\n` +
      `*المهمة:* ${task.name}\n` +
      `*العناصر:* ${task.checklist_resolved}/${task.checklist_total}\n` +
      `*بواسطة:* ${userName}\n\n` +
      `رائع! الآن يمكنك إغلاق المهمة! ✨`;

    // Send immediately - important milestone!
    await this.sendImmediateNotification(message, 'group');

    logger.success('All checklists resolved notification sent', { taskId: task.id });
  }

  /**
   * Handle subtask created
   */
  async handleSubtaskCreated(data) {
    const { task, subtasksTotal, userName } = data;

    const message = `📌 *تم إضافة مهمة فرعية*\n\n` +
      `*المهمة الرئيسية:* ${task.name}\n` +
      `*عدد المهام الفرعية:* ${subtasksTotal}\n` +
      `*بواسطة:* ${userName}`;

    this.addToQueue({
      type: 'subtask_created',
      task,
      message,
      userName
    });
  }

  /**
   * Handle all subtasks resolved
   */
  async handleAllSubtasksResolved(data) {
    const { task, userName } = data;

    const message = `🎊 *تم إكمال جميع المهام الفرعية!*\n\n` +
      `*المهمة:* ${task.name}\n` +
      `*المهام الفرعية:* ${task.subtasks_resolved}/${task.subtasks_total}\n` +
      `*بواسطة:* ${userName}\n\n` +
      `إنجاز ممتاز! 🏆`;

    // Send immediately - important milestone!
    await this.sendImmediateNotification(message, 'group');

    logger.success('All subtasks resolved notification sent', { taskId: task.id });
  }

  /**
   * Handle comment posted
   */
  async handleCommentPosted(data) {
    const {
      task,
      commentText = '',
      userName = 'غير معروف',
      attachments = [],
      participants = [],
      actor = null
    } = data;

    logger.info('💬 Processing TASK_COMMENT_POSTED event', {
      taskId: task.id,
      taskName: task.name,
      actor: userName,
      participantCount: Array.isArray(participants) ? participants.length : 0,
      attachmentCount: Array.isArray(attachments) ? attachments.length : 0
    });

    const preparedAttachments = await this.prepareAttachmentPreviews(attachments);
    const groupMessage = await this.buildCommentGroupMessage(task, userName, commentText, preparedAttachments, participants);

    this.addToQueue({
      type: 'comment_posted',
      task,
      message: groupMessage,
      data: {
        userName,
        commentText,
        attachments: preparedAttachments,
        participants
      }
    });

    const directRecipients = Array.isArray(participants) ? participants.filter(member => member.phone) : [];
    const notifiedPhones = new Set();

    for (const recipient of directRecipients) {
      if (!recipient.phone || notifiedPhones.has(recipient.phone)) {
        continue;
      }

      const dmMessage = await this.buildCommentDirectMessage(
        task,
        recipient,
        userName,
        commentText,
        preparedAttachments,
        actor
      );

      await this.sendImmediateNotification(dmMessage, 'user', recipient.phone);
      notifiedPhones.add(recipient.phone);
    }
  }

  /**
   * Handle custom field changed
   */
  async handleCustomFieldChanged(data) {
    const { task, fieldName, newValue, userName } = data;

    const message = `📊 *تم تحديث حقل مخصص*\n\n` +
      `*المهمة:* ${task.name}\n` +
      `*الحقل:* ${fieldName}\n` +
      `*القيمة الجديدة:* ${newValue}\n` +
      `*بواسطة:* ${userName}`;

    this.addToQueue({
      type: 'custom_field_changed',
      task,
      message,
      userName
    });
  }

  /**
   * Handle task linked
   */
  async handleTaskLinked(data) {
    const { task, userName } = data;

    const message = `🔗 *تم ربط المهمة*\n\n` +
      `*المهمة:* ${task.name}\n` +
      `*بواسطة:* ${userName}`;

    this.addToQueue({
      type: 'task_linked',
      task,
      message,
      userName
    });
  }

  /**
   * Handle task unlinked
   */
  async handleTaskUnlinked(data) {
    const { task, userName } = data;

    const message = `🔓 *تم إلغاء ربط المهمة*\n\n` +
      `*المهمة:* ${task.name}\n` +
      `*بواسطة:* ${userName}`;

    this.addToQueue({
      type: 'task_unlinked',
      task,
      message,
      userName
    });
  }

  // ==================== MESSAGE BUILDERS ====================

  /**
   * Build task created message
   */
  async buildTaskCreatedMessage(task, assignees, createdBy = 'غير معروف') {
    const aiMessage = await this.generateNotificationWithTemplate('task_created_group', {
      task,
      assignees,
      createdBy
    });

    if (aiMessage) {
      return aiMessage;
    }

    const aiWeight = task.ai_weight || 10;
    const complexity = task.ai_complexity || 'medium';

    let message = `📝 *مهمة جديدة*\n\n`;
    message += `*الاسم:* ${task.name}\n`;
    message += `*أنشأها:* ${createdBy}\n`;
    message += `*الأولوية:* ${task.priority_label || 'عادية'}\n`;
    message += `*الوزن AI:* ${aiWeight} نقطة (${this.translateComplexity(complexity)})\n`;

    if (task.ai_estimated_time) {
      message += `*الوقت المتوقع:* ${task.ai_estimated_time} دقيقة\n`;
    }

    if (assignees && assignees.length > 0) {
      message += `*المكلفون:* ${assignees.map(a => a.name).join(', ')}\n`;
    }

    if (task.due_date) {
      const dueDate = new Date(parseInt(task.due_date));
      message += `*الموعد النهائي:* ${dueDate.toLocaleDateString('ar-EG')}\n`;
    }

    message += `\n💡 ${this.buildTaskCreationInsight(task, assignees)}\n`;
    message += `\n🔗 ${task.url}`;

    return message;
  }

  /**
   * Build task completed message
   */
  async buildTaskCompletedMessage(task, assignees, actionedBy, gamificationResult, completionBreakdown = []) {
    const aiMessage = await this.generateNotificationWithTemplate('task_completed_group', {
      task,
      assignees,
      actionedBy,
      gamificationResult,
      completionBreakdown
    });

    if (aiMessage) {
      return aiMessage;
    }

    const aiWeight = task.ai_weight || 10;
    const complexity = task.ai_complexity || 'medium';

    let message = `✅ *مهمة مكتملة!*\n\n`;
    const assigneeNames = assignees && assignees.length > 0
      ? assignees.map(a => a.name).join(', ')
      : 'غير محدد';

    message += `*المهمة:* ${task.name}\n`;
    message += `*المكلفون:* ${assigneeNames}\n`;
    message += `*تم الإغلاق بواسطة:* ${actionedBy}\n`;
    message += `*الوزن:* ${aiWeight} نقطة 💎 (${this.translateComplexity(complexity)})\n`;

    if (gamificationResult) {
      message += `*النقاط المكتسبة:* ${gamificationResult.pointsEarned || 0} نقطة 🎯\n`;

      if (Array.isArray(gamificationResult.newBadges) && gamificationResult.newBadges.length > 0) {
        message += `*أوسمة جديدة:* ${gamificationResult.newBadges.length} 🏆\n`;
      }

      if (gamificationResult.shieldUpgrade?.to?.name) {
        message += `*ترقية درع:* ${gamificationResult.shieldUpgrade.to.name} 🛡️\n`;
      }
    }

    if (Array.isArray(completionBreakdown) && completionBreakdown.length > 0) {
      message += `\n🏅 *توزيع النقاط:*\n`;
      message += `${this.formatCompletionBreakdown(completionBreakdown)}\n`;
    }

    message += `\n🎯 ${this.buildCompletionHighlight(task, gamificationResult)}\n`;
    message += `\n🔗 ${task.url}`;

    return message;
  }

  async buildTaskStatusChangedMessage(task, beforeStatus, afterStatus, userName, assignees = [], transitionType = 'progress') {
    const aiMessage = await this.generateNotificationWithTemplate('task_status_changed_group', {
      task,
      beforeStatus,
      afterStatus,
      userName,
      assignees,
      transitionType
    });

    if (aiMessage) {
      return aiMessage;
    }

    const prettyBefore = this.formatStatusLabel(beforeStatus);
    const prettyAfter = this.formatStatusLabel(afterStatus);
    const assigneeNames = assignees && assignees.length > 0
      ? assignees.map(a => a.name).join(', ')
      : 'غير محدد';

    let message = `🔄 *تغيير حالة المهمة*\n\n`;
    message += `*المهمة:* ${task.name}\n`;
    message += `*من:* ${prettyBefore}\n`;
    message += `*إلى:* ${prettyAfter}\n`;
    message += `*المكلفون:* ${assigneeNames}\n`;
    message += `*بواسطة:* ${userName}\n`;

    if (transitionType === 'cancelled') {
      message += `*نوع الإجراء:* إلغاء المهمة 🚫\n`;
    }

    message += `\n💡 ${this.buildStatusChangeInsight(task, beforeStatus, afterStatus, userName)}\n`;
    message += `\n🔗 ${task.url}`;

    return message;
  }

  async buildCommentGroupMessage(task, userName, commentText, attachments, participants = []) {
    const aiMessage = await this.generateNotificationWithTemplate('comment_group', {
      task,
      userName,
      commentText,
      attachments,
      participants
    });

    if (aiMessage) {
      return aiMessage;
    }

    const participantNames = Array.isArray(participants) && participants.length > 0
      ? participants.map(p => p.name).join('، ')
      : 'غير محدد';

    let message = `💬 *تعليق جديد على مهمة*\n\n`;
    message += `*المهمة:* ${task.name}\n`;
    message += `*بواسطة:* ${userName}\n`;
    message += `*المعنيون:* ${participantNames}\n`;

    if (commentText) {
      message += `\n"${this.truncateText(commentText, 220)}"\n`;
    }

    if (attachments && attachments.length > 0) {
      message += `\n📎 مرفقات (${attachments.length}):\n`;
      message += `${this.formatAttachmentLines(attachments)}\n`;
    }

    message += `\n🔗 ${task.url}`;

    return message;
  }

  async buildCommentDirectMessage(task, recipient, userName, commentText, attachments, actor = null) {
    const aiMessage = await this.generateNotificationWithTemplate('comment_dm', {
      task,
      recipient,
      userName,
      commentText,
      attachments,
      actor
    });

    if (aiMessage) {
      return aiMessage;
    }

    const recipientKey = this.buildParticipantKey(recipient);
    const actorKey = this.buildParticipantKey(actor);
    const isActor = recipientKey && actorKey && recipientKey === actorKey;

    let message = isActor
      ? `📝 *تم تسجيل تعليقك على المهمة*\n\n`
      : `💬 *أضيف تعليق جديد لك*\n\n`;

    message += `*المهمة:* ${task.name}\n`;
    message += `*من:* ${isActor ? 'أنت' : userName}\n`;
    message += `*إلى:* ${recipient.name}\n`;

    if (commentText) {
      message += `\n${this.truncateText(commentText, 220)}\n`;
    }

    if (attachments && attachments.length > 0) {
      message += `\n📎 مرفقات (${attachments.length}):\n`;
      message += `${this.formatAttachmentLines(attachments)}\n`;
    }

    message += `\n📣 تم إشعارك لأنك مرتبط بهذه المهمة كمكلف أو منشئ.`;
    message += `\n🔗 ${task.url}`;

    return message;
  }

  /**
   * Build task assigned message
   */
  async buildTaskAssignedMessage(task, assignee, assignedBy) {
    const aiWeight = task.ai_weight || 10;

    let message = `👤 *تم تكليفك بمهمة جديدة*\n\n`;
    message += `*المهمة:* ${task.name}\n`;
    message += `*الأولوية:* ${task.priority_label || 'عادية'}\n`;
    message += `*الوزن:* ${aiWeight} نقطة 💎\n`;

    if (assignedBy) {
      message += `*كلّف بواسطة:* ${assignedBy}\n`;
    }

    if (task.due_date) {
      const dueDate = new Date(parseInt(task.due_date));
      const daysUntil = Math.ceil((dueDate - Date.now()) / (1000 * 60 * 60 * 24));
      message += `*الموعد النهائي:* بعد ${daysUntil} يوم\n`;
    }

    message += `\n🔗 ${task.url}`;

    return message;
  }

  /**
   * Build DM for task assignment (AI-powered with strict template)
   */
  async buildTaskAssignedDM(task, assignee, assignedBy = 'غير معروف') {
    // Try AI template-based generation first
    const aiMessage = await this.generateNotificationWithTemplate('assignment_dm', {
      task,
      assignee,
      assignedBy
    });

    if (aiMessage) {
      return aiMessage;
    }

    // Fallback: default message
    const aiWeight = task.ai_weight || 10;
    const complexity = task.ai_complexity || 'medium';

    let message = `👋 *مرحباً ${assignee.name}!*\n\n`;
    message += `🎯 *تم إسناد مهمة جديدة لك:*\n`;
    message += `📝 ${task.name}\n\n`;
    message += `*التفاصيل:*\n`;
    message += `• الأولوية: ${task.priority_label || 'عادية'}\n`;
    message += `• الوزن: ${aiWeight} نقطة 💎\n`;
    message += `• التعقيد: ${this.translateComplexity(complexity)}\n`;
    message += `• التكليف بواسطة: ${assignedBy}\n`;

    if (task.ai_estimated_time) {
      message += `• الوقت المتوقع: ${task.ai_estimated_time} دقيقة ⏱️\n`;
    }

    if (task.due_date) {
      const dueDate = new Date(parseInt(task.due_date));
      const daysUntil = Math.ceil((dueDate - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntil <= 3) {
        message += `• الموعد النهائي: ⚠️ بعد ${daysUntil} ${daysUntil === 1 ? 'يوم' : 'أيام'} فقط!\n`;
      } else {
        message += `• الموعد النهائي: بعد ${daysUntil} ${daysUntil === 1 ? 'يوم' : 'أيام'}\n`;
      }
    }

    message += `\n🔗 ${task.url}\n\n`;
    message += `💪 *بالتوفيق!*`;

    return message;
  }

  /**
   * Build DM for task completion (AI-powered with strict template)
   */
  async buildCompletionDM(task, assignee, gamificationResult, actionedBy = 'غير معروف', completionOutcome = null) {
    // Try AI template-based generation first
    const aiMessage = await this.generateNotificationWithTemplate('completion_dm', {
      task,
      assignee,
      gamificationResult,
      actionedBy,
      completionOutcome
    });

    if (aiMessage) {
      return aiMessage;
    }

    const safeGamification = gamificationResult || { pointsEarned: 0, newBadges: [], shieldUpgrade: null };

    // Fallback: default message
    let message = `🎉 *أحسنت ${assignee.name}!*\n\n`;
    message += `✅ لقد أكملت: *${task.name}*\n`;
    message += `👤 تم تعليم المهمة كمكتملة بواسطة: ${actionedBy}\n\n`;

    message += `*المكافآت:*\n`;
    message += `• ${safeGamification.pointsEarned || 0} نقطة 🎯\n`;

    if (safeGamification.newBadges && safeGamification.newBadges.length > 0) {
      message += `• ${safeGamification.newBadges.length} وسام جديد! 🏆\n`;
      safeGamification.newBadges.forEach(badge => {
        message += `  - ${badge.name} ${badge.emoji || '⭐'}\n`;
      });
    }

    if (safeGamification.shieldUpgrade?.to?.name) {
      message += `• ترقية درع: ${safeGamification.shieldUpgrade.to.name} 🛡️\n`;
    }

    // Fallback random tip
    const tips = [
      '💡 *نصيحة:* حاول إكمال المهام الأصعب في بداية اليوم عندما يكون تركيزك أعلى!',
      '💡 *نصيحة:* قسّم المهام الكبيرة إلى مهام فرعية أصغر لتحقيق تقدم مستمر!',
      '💡 *نصيحة:* خصص 25 دقيقة من التركيز الكامل (Pomodoro) ثم استرح 5 دقائق!'
    ];
    const randomTip = tips[Math.floor(Math.random() * tips.length)];

    message += `\n${randomTip}\n\n`;
    message += `🔥 استمر في الإنجاز!`;

    return message;
  }

  async buildCreatorCompletionDM(task, creator, assignees, actionedBy, gamificationResult, beforeStatus, afterStatus, completionBreakdown = []) {
    const aiMessage = await this.generateNotificationWithTemplate('creator_completion_dm', {
      task,
      creator,
      assignees,
      actionedBy,
      gamificationResult,
      beforeStatus,
      afterStatus,
      transitionType: 'closed',
      completionBreakdown
    });

    if (aiMessage) {
      return aiMessage;
    }

    const assigneeNames = Array.isArray(assignees) && assignees.length > 0
      ? assignees.map(a => a.name).join(', ')
      : 'غير محدد';
    const prettyBefore = beforeStatus ? this.formatStatusLabel(beforeStatus) : null;
    const prettyAfter = this.formatStatusLabel(afterStatus || 'مكتمل');
    const rewards = this.buildCreatorRewardsSummary(gamificationResult);
    const highlight = this.buildCompletionHighlight(task, gamificationResult);
    const nextStep = this.buildCreatorNextStep(task, 'closed', assignees, actionedBy, creator);

    let message = `👋 *${creator.name || 'قائد المهمة'}*، تحديث حول المهمة التي أنشأتها.\n\n`;
    message += `📝 ${task.name}\n`;

    if (prettyBefore && prettyBefore !== prettyAfter) {
      message += `🔄 الحالة: ${prettyBefore} → ${prettyAfter}\n`;
    } else {
      message += `🔄 الحالة: ${prettyAfter}\n`;
    }

    message += `👤 الإجراء بواسطة: ${actionedBy}\n`;

    if (assigneeNames) {
      message += `👥 المكلفون: ${assigneeNames}\n`;
    }

    if (rewards) {
      message += `🎯 المكافآت: ${rewards}\n`;
    }

    if (highlight) {
      message += `\n💡 ${highlight}\n`;
    }

    if (Array.isArray(completionBreakdown) && completionBreakdown.length > 0) {
      message += `\n🏅 *تفاصيل الإنجاز:*\n`;
      message += `${this.formatCompletionBreakdown(completionBreakdown)}\n`;
    }

    if (nextStep) {
      message += `\n📌 ${nextStep}\n`;
    }

    message += `\n🔗 ${task.url}`;

    return message;
  }

  async buildCreatorStatusDM(task, creator, beforeStatus, afterStatus, actionedBy, assignees, transitionType = 'progress') {
    const aiMessage = await this.generateNotificationWithTemplate('creator_status_dm', {
      task,
      creator,
      assignees,
      beforeStatus,
      afterStatus,
      actionedBy,
      transitionType
    });

    if (aiMessage) {
      return aiMessage;
    }

    const assigneeNames = Array.isArray(assignees) && assignees.length > 0
      ? assignees.map(a => a.name).join(', ')
      : 'غير محدد';
    const prettyBefore = this.formatStatusLabel(beforeStatus);
    const prettyAfter = this.formatStatusLabel(afterStatus);
    const dueInDays = this.calculateDueInDays(task);
    const insight = this.buildStatusChangeInsight(task, beforeStatus, afterStatus, actionedBy);
    const nextStep = this.buildCreatorNextStep(task, transitionType, assignees, actionedBy, creator);

    let message = `👋 *${creator.name || 'قائد المهمة'}*، تحديث حول المهمة التي كلفت بها الفريق.\n\n`;
    message += `📝 ${task.name}\n`;
    message += `🔄 من: ${prettyBefore} → ${prettyAfter}\n`;
    message += `👤 الإجراء بواسطة: ${actionedBy}\n`;

    if (assigneeNames) {
      message += `👥 المكلفون: ${assigneeNames}\n`;
    }

    if (typeof dueInDays === 'number') {
      if (dueInDays <= 0) {
        message += '⏱️ الموعد النهائي: اليوم\n';
      } else {
        message += `⏱️ الموعد النهائي: بعد ${dueInDays} ${dueInDays === 1 ? 'يوم' : 'أيام'}\n`;
      }
    } else {
      message += '⏱️ الموعد النهائي: غير محدد\n';
    }

    if (insight) {
      message += `\n💡 ${insight}\n`;
    }

    if (nextStep) {
      message += `\n📌 ${nextStep}\n`;
    }

    message += `\n🔗 ${task.url}`;

    return message;
  }

  shouldNotifyCreator(creator, assignees = []) {
    if (!creator) {
      return false;
    }

    if (!Array.isArray(assignees) || assignees.length === 0) {
      return false;
    }

    return assignees.some(assignee => !this.isSamePerson(assignee, creator));
  }

  isSamePerson(candidateA, candidateB) {
    if (!candidateA || !candidateB) {
      return false;
    }

    const idA = candidateA.id ?? candidateA.externalId ?? null;
    const idB = candidateB.id ?? candidateB.externalId ?? null;

    if (idA !== null && idB !== null && String(idA) === String(idB)) {
      return true;
    }

    if (candidateA.email && candidateB.email && candidateA.email.toLowerCase() === candidateB.email.toLowerCase()) {
      return true;
    }

    if (candidateA.phone && candidateB.phone && candidateA.phone === candidateB.phone) {
      return true;
    }

    if (candidateA.name && candidateB.name && candidateA.name.trim().toLowerCase() === candidateB.name.trim().toLowerCase()) {
      return true;
    }

    return false;
  }

  buildCreatorNextStep(task, transitionType = 'progress', assignees = [], actionedBy = 'غير معروف', creator = null) {
    const dueInDays = this.calculateDueInDays(task);
    const followTarget = this.pickFollowUpTarget(assignees, creator);

    if (transitionType === 'cancelled') {
      return `تأكد من أن ${followTarget} وثّق سبب الإلغاء وشارك أي التزامات متبقية مع الفريق.`;
    }

    if (transitionType === 'closed') {
      return `راجع مخرجات المهمة مع ${followTarget} وشارك ملاحظاتك خلال 24 ساعة لضمان جودة التسليم.`;
    }

    if (typeof dueInDays === 'number' && dueInDays <= 0) {
      return `اطلب من ${followTarget} تحديثك بنتيجة اليوم لضمان تسليم المهمة في الموعد.`;
    }

    if (typeof dueInDays === 'number' && dueInDays <= 2) {
      return `تابع مع ${followTarget} لضبط الأولويات قبل الموعد النهائي المتبقي (${dueInDays === 1 ? 'يوم واحد' : `${dueInDays} أيام`}).`;
    }

    if (transitionType === 'progress') {
      return `تأكد من أن ${followTarget} يمتلك كل الموارد اللازمة وحدد نقطة مراجعة قادمة مع ${actionedBy}.`;
    }

    return `راجع خطة التنفيذ مع ${followTarget} واطلب توثيق التقدم القادم.`;
  }

  pickFollowUpTarget(assignees = [], creator = null) {
    if (!Array.isArray(assignees) || assignees.length === 0) {
      return 'الفريق';
    }

    const other = creator
      ? assignees.find(assignee => !this.isSamePerson(assignee, creator))
      : null;

    if (other && other.name) {
      return other.name;
    }

    return assignees[0].name || 'الفريق';
  }

  buildCreatorRewardsSummary(gamificationResult) {
    if (!gamificationResult) {
      return 'الإنجاز مسجل دون مكافآت إضافية بعد.';
    }

    const rewards = [];

    if (typeof gamificationResult.pointsEarned === 'number') {
      rewards.push(`${gamificationResult.pointsEarned} نقطة للفريق`);
    }

    if (Array.isArray(gamificationResult.newBadges) && gamificationResult.newBadges.length > 0) {
      rewards.push(`${gamificationResult.newBadges.length} ${gamificationResult.newBadges.length === 1 ? 'وسام' : 'أوسمة'} جديدة`);
    }

    if (gamificationResult.shieldUpgrade?.to?.name) {
      rewards.push(`ترقية الدرع إلى ${gamificationResult.shieldUpgrade.to.name}`);
    }

    if (rewards.length === 0) {
      return 'الإنجاز مسجل دون مكافآت إضافية بعد.';
    }

    return rewards.join(' • ');
  }

  calculateDueInDays(task) {
    if (!task?.due_date) {
      return null;
    }

    const dueDate = new Date(parseInt(task.due_date));
    if (Number.isNaN(dueDate.getTime())) {
      return null;
    }

    return Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  buildTaskCreationInsight(task, assignees = []) {
    const dueInDays = this.calculateDueInDays(task);
    const priority = (task?.priority_label || 'عادية').toLowerCase();

    if (typeof dueInDays === 'number' && dueInDays <= 0) {
      return 'الموعد النهائي اليوم؛ قسّم المهام سريعاً وحدد تحديثاً في نهاية اليوم.';
    }

    if (typeof dueInDays === 'number' && dueInDays <= 2) {
      const dayText = dueInDays === 1 ? 'يوم واحد' : `${dueInDays} أيام`;
      return `بقي ${dayText} فقط؛ ابدأ بأكثر جزء حرج يفتح الطريق لبقية الفريق.`;
    }

    if (priority === 'urgent' || priority === 'high') {
      return 'الأولوية مرتفعة؛ ضع نتيجة واضحة وشارك خطة التنفيذ مع الفريق خلال الساعتين القادمتين.';
    }

    if (task?.ai_estimated_time && task.ai_estimated_time >= 180) {
      const hours = Math.round((task.ai_estimated_time / 60) * 10) / 10;
      return `الوقت المتوقع يقارب ${hours} ساعة؛ خطّط لفترات تركيز عميق وحدد نقاط فحص للمراجعة.`;
    }

    if (assignees && assignees.length > 1) {
      return `هناك ${assignees.length} أشخاص مشاركون؛ وزّعوا المسؤوليات وحددوا قناة تواصل سريعة.`;
    }

    return 'ابدأ بخطوة صغيرة تقود لنتيجة ملموسة اليوم وشارك تقدمك مع الفريق.';
  }

  formatStatusLabel(status) {
    if (!status) {
      return 'غير معروف';
    }

    const raw = status.toString().trim();
    if (!raw) {
      return 'غير معروف';
    }

    const key = raw.toLowerCase();

    const dictionary = {
      'to do': 'بانتظار البدء',
      'todo': 'بانتظار البدء',
      'to-do': 'بانتظار البدء',
      'planning': 'قيد التخطيط',
      'in progress': 'قيد التنفيذ',
      'update required': 'بحاجة إلى تحديث',
      'on hold': 'قيد التعليق',
      'complete & not invoiced': 'مكتمل (بانتظار الفوترة)',
      'complete and not invoiced': 'مكتمل (بانتظار الفوترة)',
      'filling done': 'تمت التعبئة',
      'complete': 'مكتمل',
      'completed': 'مكتمل',
      'cancelled': 'ملغاة',
      'canceled': 'ملغاة'
    };

    if (dictionary[key]) {
      return dictionary[key];
    }

    if (key.includes('complete') && key.includes('invoice')) {
      return 'مكتمل (بانتظار الفوترة)';
    }

    if (key.includes('complete') || key.includes('done')) {
      return 'مكتمل';
    }

    if (key.includes('progress')) {
      return 'قيد التنفيذ';
    }

    if (key.includes('plan')) {
      return 'قيد التخطيط';
    }

    if (key.includes('hold')) {
      return 'قيد التعليق';
    }

    if (key.includes('update')) {
      return 'بحاجة إلى تحديث';
    }

    if (key.includes('review')) {
      return 'بانتظار المراجعة';
    }

    if (key.includes('fill')) {
      return 'تمت التعبئة';
    }

    if (key.includes('cancel')) {
      return 'ملغاة';
    }

    return raw;
  }

  buildStatusChangeInsight(task, beforeStatus, afterStatus, userName) {
    const normalizedAfter = (afterStatus || '').toLowerCase();
    const dueInDays = this.calculateDueInDays(task);

    if (normalizedAfter.includes('review') || normalizedAfter.includes('مراج')) {
      return 'المهمة بانتظار مراجعة؛ تأكد من وجود كل المرفقات وحدد لمن يتم توجيه التعليق.';
    }

    if (normalizedAfter.includes('progress') || normalizedAfter.includes('عمل') || normalizedAfter.includes('جاري')) {
      if (typeof dueInDays === 'number' && dueInDays <= 2) {
        return `المهمة الآن قيد التنفيذ، تبقى ${dueInDays <= 0 ? 'ساعات قليلة' : `${dueInDays} يوم`}؛ شارك تحديثاً سريعاً حول ما تم.`;
      }
      return 'انطلق في التنفيذ وحدد أول نتيجة ملموسة لمشاركتها مع الفريق خلال اليوم.';
    }

    if (normalizedAfter.includes('update required')) {
      return 'المهمة بحاجة إلى تحديث؛ راجع آخر التغييرات وسجل ما ينقص فوراً.';
    }

    if (normalizedAfter.includes('hold') || normalizedAfter.includes('تعليق')) {
      return 'المهمة معلقة؛ وثّق سبب الإيقاف وحدد موعداً لمراجعة القرار.';
    }

    if (normalizedAfter.includes('plan') || normalizedAfter.includes('تخط')) {
      return 'وقت التخطيط؛ ضع قائمة بالخطوات القادمة وحدد أصحاب المسؤوليات قبل البدء.';
    }

    if (normalizedAfter.includes('fill') || normalizedAfter.includes('تعب')) {
      return 'تم إنهاء مرحلة التعبئة؛ تحقق من اكتمال النماذج وشارك أي بيانات ناقصة مع الفريق المالي.';
    }

    if (normalizedAfter.includes('cancel')) {
      return 'المهمة ألغيت؛ وثّق السبب وشارك أي التزامات أو متابعات لازمة مع أصحاب المصلحة.';
    }

    if (normalizedAfter.includes('blocked') || normalizedAfter.includes('موقوف')) {
      return 'تم تعليم المهمة كموقوفة؛ وضّح العائق الرئيسي واطلب الدعم المطلوب فوراً.';
    }

    if (normalizedAfter.includes('waiting') || normalizedAfter.includes('انتظار')) {
      return 'المهمة بانتظار طرف آخر؛ دوّن ما تنتظره وحدد موعد متابعة واضح.';
    }

    return `تحديث بواسطة ${userName}; حافظ على توثيق أي متطلبات جديدة لتسريع التقدم.`;
  }

  buildCompletionHighlight(task, gamificationResult) {
    const points = gamificationResult?.pointsEarned || 0;
    const dueInDays = this.calculateDueInDays(task);

    if (points >= 50) {
      return `إنجاز ضخم (${points} نقطة)؛ شارك أفضل درس مستفاد مع الفريق اليوم.`;
    }

    if (gamificationResult?.newBadges && gamificationResult.newBadges.length > 0) {
      return `حصلنا على ${gamificationResult.newBadges.length} وسام جديد؛ احتفل بالإنجاز وعرّف الجميع بكيفية تحقيقه.`;
    }

    if (typeof dueInDays === 'number' && dueInDays < 0) {
      const lateDays = Math.abs(dueInDays);
      const dayText = lateDays === 1 ? 'يوم' : `${lateDays} أيام`;
      return `تم الإغلاق بعد الموعد بـ ${dayText}; سجّل سبب التأخير وخطة التحسين.`;
    }

    return 'إغلاق مميز؛ حدّد الخطوة التالية أو أي متابعة مطلوبة للحفاظ على الزخم.';
  }

  aggregateGamificationFromBreakdown(outcomes = [], fallback = null) {
    if (!Array.isArray(outcomes) || outcomes.length === 0) {
      return fallback || null;
    }

    const summary = {
      pointsEarned: 0,
      totalPoints: 0,
      newBadges: [],
      shieldUpgrade: null,
      breakdown: []
    };

    outcomes.forEach(outcome => {
      const assigneeName = outcome?.assignee?.name || outcome?.assigneeKey || 'عضو';
      const points = outcome?.gamificationResult?.pointsEarned || 0;
      summary.pointsEarned += points;
      summary.totalPoints += points;

      const decoratedBadges = Array.isArray(outcome?.gamificationResult?.newBadges)
        ? outcome.gamificationResult.newBadges.map(badge => ({
          ...badge,
          awardedTo: assigneeName
        }))
        : [];

      summary.newBadges.push(...decoratedBadges);

      if (!summary.shieldUpgrade && outcome?.gamificationResult?.shieldUpgrade) {
        summary.shieldUpgrade = {
          ...outcome.gamificationResult.shieldUpgrade,
          awardedTo: assigneeName
        };
      }

      summary.breakdown.push({
        assignee: outcome?.assignee || null,
        assigneeKey: outcome?.assigneeKey || assigneeName,
        points,
        badges: decoratedBadges,
        shieldUpgrade: outcome?.gamificationResult?.shieldUpgrade || null
      });
    });

    if (fallback) {
      return {
        ...fallback,
        ...summary,
        newBadges: summary.newBadges.length > 0
          ? summary.newBadges
          : (fallback.newBadges || []),
        shieldUpgrade: summary.shieldUpgrade || fallback.shieldUpgrade || null,
        breakdown: summary.breakdown
      };
    }

    return summary;
  }

  indexCompletionOutcomes(outcomes = []) {
    const index = new Map();

    if (!Array.isArray(outcomes)) {
      return index;
    }

    outcomes.forEach((outcome) => {
      if (!outcome) {
        return;
      }

      const keys = new Set();

      if (outcome.assignee) {
        const participantKey = this.buildParticipantKey(outcome.assignee);
        if (participantKey) {
          keys.add(participantKey);
        }

        if (outcome.assignee.name) {
          keys.add(`name:${outcome.assignee.name.trim().toLowerCase()}`);
        }

        if (outcome.assignee.username) {
          keys.add(`name:${outcome.assignee.username.trim().toLowerCase()}`);
        }

        if (outcome.assignee.email) {
          keys.add(`email:${outcome.assignee.email.toLowerCase()}`);
        }

        if (outcome.assignee.externalId) {
          keys.add(`id:${outcome.assignee.externalId}`);
        }
      }

      if (outcome.assigneeKey) {
        const normalizedKey = String(outcome.assigneeKey).trim().toLowerCase();
        keys.add(`name:${normalizedKey}`);
        keys.add(outcome.assigneeKey);
      }

      if (keys.size === 0) {
        keys.add(`idx:${index.size}`);
      }

      keys.forEach(key => {
        index.set(key, outcome);
      });
    });

    return index;
  }

  resolveCompletionOutcomeForAssignee(assignee, index) {
    if (!assignee || !(index instanceof Map)) {
      return null;
    }

    const candidates = [];
    const participantKey = this.buildParticipantKey(assignee);

    if (participantKey) {
      candidates.push(participantKey);
    }

    if (assignee.id) {
      candidates.push(`id:${assignee.id}`);
    }

    if (assignee.externalId) {
      candidates.push(`id:${assignee.externalId}`);
    }

    if (assignee.email) {
      candidates.push(`email:${assignee.email.toLowerCase()}`);
    }

    if (assignee.name) {
      candidates.push(`name:${assignee.name.trim().toLowerCase()}`);
    }

    if (assignee.username) {
      candidates.push(`name:${assignee.username.trim().toLowerCase()}`);
    }

    for (const key of candidates) {
      if (index.has(key)) {
        return index.get(key);
      }
    }

    return null;
  }

  formatCompletionBreakdown(completionBreakdown = []) {
    if (!Array.isArray(completionBreakdown) || completionBreakdown.length === 0) {
      return '';
    }

    const lines = completionBreakdown.map(outcome => {
      const assigneeName = outcome?.assignee?.name || outcome?.assigneeKey || 'عضو';
      const points = outcome?.gamificationResult?.pointsEarned || 0;
      const badgeCount = Array.isArray(outcome?.gamificationResult?.newBadges)
        ? outcome.gamificationResult.newBadges.length
        : 0;

      let line = `• ${assigneeName}: ${points} نقطة`;

      if (badgeCount > 0) {
        line += ` + ${badgeCount} وسام`;
      }

      return line;
    });

    return lines.join('\n');
  }

  async prepareAttachmentPreviews(attachments = []) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return [];
    }

    const prepared = [];

    for (const attachment of attachments) {
      if (!attachment || !attachment.url) {
        continue;
      }

      const displayName = attachment.name || `ملف ${prepared.length + 1}`;
      const shortUrl = await shortenUrl(attachment.url);

      prepared.push({
        ...attachment,
        name: displayName,
        shortUrl: shortUrl || attachment.url
      });
    }

    return prepared;
  }

  formatAttachmentLines(attachments = []) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return '';
    }

    const lines = [];

    attachments.forEach((attachment, index) => {
      if (!attachment || !attachment.url) {
        return;
      }

      const link = attachment.shortUrl || attachment.url;
      const label = attachment.name || `ملف ${index + 1}`;
      lines.push(`• ${label}: ${link}`);
    });

    return lines.join('\n');
  }

  truncateText(text, limit = 200) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    if (text.length <= limit) {
      return text;
    }

    return `${text.substring(0, limit - 3)}...`;
  }

  buildParticipantKey(participant) {
    if (!participant || typeof participant !== 'object') {
      return null;
    }

    if (participant.id) {
      return `id:${participant.id}`;
    }

    if (participant.email) {
      return `email:${participant.email.toLowerCase()}`;
    }

    if (participant.phone) {
      return `phone:${participant.phone}`;
    }

    if (participant.name) {
      return `name:${participant.name.trim().toLowerCase()}`;
    }

    if (participant.username) {
      return `name:${participant.username.trim().toLowerCase()}`;
    }

    return null;
  }

  /**
   * Get assignees from task data
   */
  getAssigneesFromTask(task) {
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

    // Dynamically import team config
    const { findMemberById, findMemberByEmail } = require('../../config/team.js');

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

      resolved.set(key, {
        id: member ? Number(member.id) : null,
        externalId: typeof fallback.id !== 'undefined' ? fallback.id : null,
        name: member?.name || fallbackName,
        phone: member?.phone || null,
        email: member?.email || fallback.email || null
      });
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

  // ==================== QUEUE MANAGEMENT ====================

  /**
   * Add notification to queue
   */
  addToQueue(notification) {
    this.queue.push({
      ...notification,
      timestamp: Date.now()
    });

    logger.debug('Notification added to queue', {
      type: notification.type,
      queueSize: this.queue.length
    });

    // Start batch timer if not already running
    if (!this.batchTimeout && !this.isPaused) {
      this.startBatchTimer();
    }
  }

  /**
   * Start batch timer
   */
  startBatchTimer() {
    logger.debug('Starting notification batch timer', {
      delay: this.batchDelay / 1000 + 's'
    });

    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.batchDelay);
  }

  /**
   * Process notification batch
   */
  async processBatch() {
    if (this.isPaused) {
      logger.debug('Batch processing deferred: notifications are paused');
      this.batchTimeout = null;
      return;
    }

    if (this.queue.length === 0) {
      this.batchTimeout = null;
      return;
    }

    logger.info(`Processing ${this.queue.length} notifications from queue`);

    const batch = [...this.queue];
    this.queue = [];
    this.batchTimeout = null;

    try {
      await this.sendBatchNotifications(batch);
    } catch (error) {
      logger.error('Failed to process notification batch', {
        error: error.message
      });
    }
  }

  /**
   * Send batch notifications (organized and formatted)
   */
  async sendBatchNotifications(batch) {
    if (!whatsappService.isClientReady()) {
      logger.warn('WhatsApp not ready, skipping batch notifications');
      return;
    }

    if (batch.length === 0) return;

    // Group by type for better organization
    const byType = {
      task_created: [],
      task_completed: [],
      status_changed: [],
      task_assigned: [],
      priority_changed: [],
      other: []
    };

    batch.forEach(item => {
      const type = item.type || 'other';
      if (byType[type]) {
        byType[type].push(item);
      } else {
        byType.other.push(item);
      }
    });

    // Build beautiful organized message
    let finalMessage = `✨ *ملخص التحديثات الأخيرة*\n`;
    finalMessage += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Completed tasks (most important - show first)
    if (byType.task_completed.length > 0) {
      finalMessage += `🎉 *مهام مكتملة (${byType.task_completed.length}):*\n\n`;
      byType.task_completed.forEach((item, i) => {
        if (i < 5) { // Limit to 5
          const actionedBy = item.data?.actionedBy || item.data?.userName || 'غير معروف';
          const assignees = Array.isArray(item.data?.assignees) ? item.data.assignees : [];
          const ownerNames = assignees.length > 0 ? assignees.map(a => a.name).join('، ') : 'غير محدد';
          const points = item.data?.gamificationResult?.pointsEarned || 0;
          const badges = item.data?.gamificationResult?.newBadges?.length || 0;
          const weight = item.task.ai_weight || 10;

          finalMessage += `  ${i + 1}️⃣ *${item.task.name}*\n`;
          finalMessage += `     👥 المكلفون: ${ownerNames}\n`;
          finalMessage += `     👤 الإجراء بواسطة: ${actionedBy}\n`;
          finalMessage += `     💎 ${weight} نقطة • 🎯 كسب ${points} نقطة`;
          if (badges > 0) {
            finalMessage += ` • 🏆 ${badges} وسام`;
          }
          finalMessage += `\n\n`;
        }
      });
      if (byType.task_completed.length > 5) {
        finalMessage += `     ✨ ... و ${byType.task_completed.length - 5} مهمة أخرى\n\n`;
      }
    }

    // New tasks
    if (byType.task_created.length > 0) {
      finalMessage += `📝 *مهام جديدة (${byType.task_created.length}):*\n\n`;
      byType.task_created.forEach((item, i) => {
        if (i < 5) {
          const assignees = item.data?.assignees || [];
          const weight = item.task.ai_weight || 10;
          const priority = item.task.priority_label || 'عادية';
          const complexity = item.task.ai_complexity || 'medium';
          const complexityAr = this.translateComplexity(complexity);
          const createdBy = item.data?.createdBy || 'غير معروف';

          finalMessage += `  ${i + 1}️⃣ *${item.task.name}*\n`;

          if (assignees.length > 0) {
            const names = assignees.map(a => a.name).join('، ');
            finalMessage += `     👥 المكلفون: ${names}\n`;
          } else {
            finalMessage += `     👥 غير مسندة\n`;
          }

          finalMessage += `     🧑‍💼 أنشأها: ${createdBy}\n`;

          finalMessage += `     🔸 ${priority} • 💎 ${weight} نقطة • ${complexityAr}\n\n`;
        }
      });
      if (byType.task_created.length > 5) {
        finalMessage += `     ✨ ... و ${byType.task_created.length - 5} مهمة أخرى\n\n`;
      }
    }

    // Assigned tasks (when someone is assigned to existing task)
    if (byType.task_assigned.length > 0) {
      finalMessage += `👤 *تكليفات جديدة (${byType.task_assigned.length}):*\n\n`;
      byType.task_assigned.forEach((item, i) => {
        if (i < 5) {
          const assignees = item.data?.assignees || [];
          const weight = item.task.ai_weight || 10;
          const assignedBy = item.data?.assignedBy || 'Unknown';

          finalMessage += `  ${i + 1}️⃣ *${item.task.name}*\n`;

          if (assignees.length > 0) {
            const names = assignees.map(a => a.name).join('، ');
            finalMessage += `     👥 تم تكليف: ${names}\n`;
          }

          finalMessage += `     📌 بواسطة: ${assignedBy} • 💎 ${weight} نقطة\n\n`;
        }
      });
      if (byType.task_assigned.length > 5) {
        finalMessage += `     ✨ ... و ${byType.task_assigned.length - 5} تكليف آخر\n\n`;
      }
    }

    // Status changes
    if (byType.status_changed.length > 0) {
      finalMessage += `🔄 *تغييرات الحالة (${byType.status_changed.length}):*\n\n`;
      byType.status_changed.forEach((item, i) => {
        if (i < 5) {
          const data = item.data || {};
          const actionedBy = data.actionedBy || data.userName || 'غير معروف';
          const assignees = Array.isArray(data.assignees) ? data.assignees : [];
          const ownerNames = assignees.length > 0 ? assignees.map(a => a.name).join('، ') : 'غير محدد';
          const transitionType = data.transitionType || 'progress';

          finalMessage += `  ${i + 1}️⃣ *${item.task.name}*\n`;
          finalMessage += `     ${data.beforeStatus} ➜ ${data.afterStatus}\n`;
          finalMessage += `     👥 المكلفون: ${ownerNames}\n`;
          finalMessage += `     👤 بواسطة: ${actionedBy}`;
          if (transitionType === 'cancelled') {
            finalMessage += ` • 🚫 إلغاء`;
          }
          finalMessage += `\n\n`;
        }
      });
      if (byType.status_changed.length > 5) {
        finalMessage += `     ✨ ... و ${byType.status_changed.length - 5} تغيير آخر\n\n`;
      }
    }

    // Priority changes
    if (byType.priority_changed.length > 0) {
      finalMessage += `🔴 *تغييرات الأولوية (${byType.priority_changed.length}):*\n\n`;
      byType.priority_changed.forEach((item, i) => {
        if (i < 3) {
          const data = item.data || {};
          const userName = data.userName || 'Unknown';

          finalMessage += `  ${i + 1}️⃣ *${item.task.name}*\n`;
          finalMessage += `     ${data.beforePriority} ➜ ${data.afterPriority}\n`;
          finalMessage += `     👤 ${userName}\n\n`;
        }
      });
      if (byType.priority_changed.length > 3) {
        finalMessage += `     ✨ ... و ${byType.priority_changed.length - 3} تغيير آخر\n\n`;
      }
    }

    // Other updates
    if (byType.other.length > 0) {
      finalMessage += `📌 *تحديثات أخرى (${byType.other.length}):*\n\n`;
      byType.other.forEach((item, i) => {
        if (i < 3) {
          finalMessage += `  ${i + 1}️⃣ ${item.task.name}\n`;
          if (item.message) {
            // Show first line of message only
            const firstLine = item.message.split('\n')[0];
            finalMessage += `     ${firstLine}\n\n`;
          } else {
            finalMessage += `\n`;
          }
        }
      });
      if (byType.other.length > 3) {
        finalMessage += `     ✨ ... و ${byType.other.length - 3} تحديث آخر\n\n`;
      }
    }

    finalMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
    finalMessage += `⏱️ آخر ${Math.round(this.batchDelay / 1000)} ثانية`;

    // Add summary count at the end
    const totalUpdates = Object.values(byType).reduce((sum, arr) => sum + arr.length, 0);
    if (totalUpdates > 10) {
      finalMessage += `\n💡 إجمالي ${totalUpdates} تحديث`;
    }

    // Send to group
    try {
      await whatsappService.sendToGroup(finalMessage);
      logger.success('Organized batch notification sent to group', {
        total: batch.length,
        completed: byType.task_completed.length,
        created: byType.task_created.length
      });
      eventBus.emitEvent(EVENTS.NOTIFICATION_SENT, { type: 'batch', count: batch.length });
    } catch (error) {
      logger.error('Failed to send batch notification', {
        error: error.message
      });
      eventBus.emitEvent(EVENTS.NOTIFICATION_FAILED, { error });
    }
  }

  /**
   * Send immediate notification
   */
  async sendImmediateNotification(message, target, phone = null) {
    // Check if WhatsApp is ready
    if (!whatsappService.isClientReady()) {
      // Add to pending queue
      this.pendingNotifications.push({ message, target, phone, timestamp: Date.now() });

      logger.warn('WhatsApp not ready - notification queued for later', {
        target,
        pendingCount: this.pendingNotifications.length,
        messagePreview: message.substring(0, 50) + '...'
      });
      return;
    }

    try {
      if (target === 'group') {
        await whatsappService.sendToGroup(message);
        logger.success('✅ Notification sent to group', {
          messagePreview: message.substring(0, 50) + '...'
        });
      } else if (target === 'user' && phone) {
        await whatsappService.sendToUser(phone, message);
        logger.success('✅ Notification sent to user', {
          phone: phone.substring(0, 8) + '...',
          messagePreview: message.substring(0, 50) + '...'
        });
      }
    } catch (error) {
      logger.error('❌ Failed to send immediate notification', {
        error: error.message,
        target,
        phone: phone ? phone.substring(0, 8) + '...' : null
      });

      // Retry: add to pending queue
      this.pendingNotifications.push({ message, target, phone, timestamp: Date.now() });
    }
  }

  // ==================== UTILITY FUNCTIONS ====================

  /**
   * Translate complexity to Arabic
   */
  translateComplexity(complexity) {
    const translations = {
      'simple': 'بسيطة',
      'medium': 'متوسطة',
      'complex': 'معقدة',
      'very_complex': 'معقدة جداً'
    };
    return translations[complexity] || 'متوسطة';
  }

  /**
   * Get type label in Arabic
   */
  getTypeLabel(type) {
    const labels = {
      'task_completed': 'مهمة مكتملة',
      'task_assigned': 'مهمة مسندة',
      'task_unassigned': 'إلغاء تكليف',
      'status_changed': 'تغيير حالة',
      'priority_changed': 'تغيير أولوية',
      'name_changed': 'تغيير اسم',
      'tag_added': 'إضافة وسم',
      'tag_removed': 'إزالة وسم',
      'due_date_changed': 'تغيير موعد نهائي',
      'start_date_changed': 'تغيير تاريخ بدء',
      'time_tracked': 'تسجيل وقت',
      'checklist_item_resolved': 'إتمام عنصر قائمة',
      'subtask_created': 'إضافة مهمة فرعية',
      'comment_posted': 'تعليق جديد',
      'custom_field_changed': 'تحديث حقل مخصص',
      'task_linked': 'ربط مهمة',
      'task_unlinked': 'إلغاء ربط مهمة'
    };
    return labels[type] || type;
  }

  /**
   * Pause notifications
   */
  pause(duration = env.notifications.pauseDuration) {
    logger.info(`Pausing notifications for ${duration / 60000} minutes`);
    this.isPaused = true;

    if (this.pauseTimeout) {
      clearTimeout(this.pauseTimeout);
    }

    this.pauseTimeout = setTimeout(() => {
      this.isPaused = false;
      logger.info('Notifications resumed');

      if (this.queue.length > 0) {
        this.startBatchTimer();
      }
    }, duration);
  }

  /**
   * Resume notifications
   */
  resume() {
    if (this.pauseTimeout) {
      clearTimeout(this.pauseTimeout);
      this.pauseTimeout = null;
    }

    this.isPaused = false;
    logger.info('Notifications resumed manually');

    if (this.queue.length > 0) {
      this.startBatchTimer();
    }
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueSize: this.queue.length,
      isPaused: this.isPaused,
      hasBatchTimer: !!this.batchTimeout
    };
  }

  // ==================== DEDUPLICATION ====================

  /**
   * Check if notification is duplicate (sent recently)
   * Prevents both same-event duplicates AND cross-event duplicates for completed tasks
   * @param {string} taskId - Task ID
   * @param {string} eventType - Event type (e.g., 'completed', 'assigned', 'created')
   * @returns {boolean} - True if duplicate, false if should send
   */
  isDuplicateNotification(taskId, eventType, options = {}) {
    const now = Date.now();
    const uniqueKey = options?.uniqueKey;

    // Check 1: Same event type duplicate (10 seconds window)
    const eventKey = uniqueKey
      ? `${taskId}-${eventType}-${uniqueKey}`
      : `${taskId}-${eventType}`;
    const lastSent = this.recentNotifications.get(eventKey);

    if (lastSent && (now - lastSent) < this.deduplicationWindow) {
      logger.warn('Duplicate notification blocked (same event)', {
        taskId,
        eventType,
        timeSinceLastSent: `${Math.round((now - lastSent) / 1000)}s`
      });
      return true; // Duplicate - don't send
    }

    // Check 2: Cross-event duplicate prevention (completed tasks)
    // If task was recently completed, block any other events for 5 seconds
    const completedKey = `${taskId}-completed`;
    const lastCompleted = this.recentNotifications.get(completedKey);

    if (eventType !== 'completed' && lastCompleted && (now - lastCompleted) < 5000) {
      logger.warn('Notification blocked (task recently completed)', {
        taskId,
        eventType,
        timeSinceCompleted: `${Math.round((now - lastCompleted) / 1000)}s`
      });
      return true; // Block - task was just completed
    }

    // Not duplicate - mark as sent and allow
    this.recentNotifications.set(eventKey, now);

    // Clean up old entries (older than 2x deduplication window)
    const cleanupThreshold = now - (this.deduplicationWindow * 2);
    for (const [k, timestamp] of this.recentNotifications.entries()) {
      if (timestamp < cleanupThreshold) {
        this.recentNotifications.delete(k);
      }
    }

    return false; // Not duplicate - send
  }

  // ==================== AI TEMPLATE-BASED GENERATION ====================

  /**
   * Generate notification using AI with strict template
   * AI fills the template with smart content while maintaining consistent structure
   */
  async generateNotificationWithTemplate(templateType, data) {
    if (!env.features.aiNotifications) {
      return null; // Skip AI, use default
    }

    try {
      // Build system prompt with strict template instructions
      const systemPrompt = this.buildTemplateSystemPrompt(templateType);

      // Build user message with all data
      const userMessage = this.buildTemplateDataMessage(templateType, data);

      const aiResponse = await aiService.generateCompletion(
        systemPrompt,
        userMessage,
        { temperature: 0.7, max_tokens: 500 }
      );

      logger.debug('AI template notification generated', {
        templateType,
        taskId: data.task?.id
      });

      return aiResponse;
    } catch (error) {
      logger.error('AI template generation failed', {
        error: error.message,
        templateType
      });
      return null; // Fallback to default
    }
  }

  /**
   * Build system prompt for AI with strict template
   */
  buildTemplateSystemPrompt(templateType) {
    const templates = {
      assignment_dm: `أنت مساعد إشعارات. املأ القالب التالي بالعربية بدقة.

**القالب (التزم به تماماً):**
👋 مرحباً {name}!

🎯 تم إسناد مهمة جديدة لك:
📝 {task_name}

التفاصيل:
• الأولوية: {priority}
• الوزن: {weight} نقطة 💎
• التعقيد: {complexity}
• التكليف بواسطة: {assigned_by}
{estimated_time}
{due_date}

🔗 {url}

💡 نصيحة AI:
{tip}

💪 بالتوفيق!

**التعليمات:**
- احتفظ بكل emoji والهيكل
- املأ {placeholders} بالبيانات المعطاة
- النصيحة: جملة عملية واحدة خاصة بهذه المهمة`,

      completion_dm: `أنت مساعد إشعارات. املأ القالب التالي بالعربية بدقة.

**القالب (التزم به تماماً):**
🎉 أحسنت {name}!

✅ لقد أكملت: {task_name}
👤 تم تعليم المهمة بواسطة: {actioned_by}

المكافآت:
• {points} نقطة 🎯
{badges}
{shield}

✨ رسالة شخصية:
{message}

🔥 استمر في الإنجاز!

**التعليمات:**
- احتفظ بكل emoji والهيكل
- املأ {placeholders} بالبيانات
- الرسالة: 2-3 جمل تحفيزية شخصية`,

      task_created_group: `أنت مساعد إشعارات. اكتب رسالة للفريق عن مهمة جديدة بالعربية مع الالتزام بالقالب.

**القالب (التزم به تماماً):**
📝 مهمة جديدة

• الاسم: {task_name}
• أنشأها: {creator_name}
• الأولوية: {priority}
• الوزن: {weight} نقطة ({complexity})
• المكلفون: {assignee_names}
{due_date}
{estimated_time}

💡 تركيز اليوم:
{focus}

🔗 {url}

**التعليمات:**
- استخدم بيانات المهمة لملء الفراغات
- إذا لم تتوفر قيمة فاستبدلها بعبارة مثل "غير محدد"
- اجعل جملة {focus} نصيحة عملية قصيرة تعتمد على الأولوية والمواعيد`,

      task_status_changed_group: `أنت مساعد إشعارات. اكتب تحديث حالة بالعربية مستخدماً القالب.

**القالب (التزم به تماماً):**
🔄 تحديث حالة

• المهمة: {task_name}
• من: {before_status}
• إلى: {after_status}
• بواسطة: {user_name}
• المكلفون: {assignee_names}
{transition_note}

💡 التأثير:
{impact}

📌 الخطوة التالية:
{next_step}

🔗 {url}

**التعليمات:**
- اعتمد على البيانات المتاحة لتوضيح التأثير والخطوة التالية
- اجعل {impact} جملة أو جملتين بحد أقصى
- اجعل {next_step} خطوة عملية محددة للفريق`,

      task_completed_group: `أنت مساعد إشعارات. احتفل بإكمال المهمة بالعربية مستخدماً القالب.

**القالب (التزم به تماماً):**
✅ مهمة مكتملة

• المهمة: {task_name}
• المكلفون: {assignee_names}
• أغلقها: {actioned_by}
• الوزن: {weight} نقطة ({complexity})
{points}
{badges}
{shield}

🎯 الأثر:
{highlight}

🔗 {url}

**التعليمات:**
- استخدم بيانات التحفيز لملء عناصر المكافآت (أكتب "لا يوجد" إذا غابت)
- اجعل {highlight} يوضح قيمة الإنجاز أو الخطوة التالية للفريق`
      ,
      creator_completion_dm: `أنت مساعد إشعارات. أرسل رسالة خاصة لمنشئ المهمة لإعلامه بإكمالها.

**القالب (التزم به تماماً):**
👋 متابعة لمهمتك يا {creator_name}!

📝 المهمة: {task_name}
🔄 الحالة النهائية: {after_status} (بعد {before_status})
👤 نفّذها: {actioned_by}
👥 المكلفون: {assignee_names}

🎯 ملخص المكافآت:
{rewards}

💡 أبرز ما تحقق:
{impact}

📌 الخطوة التالية لك:
{next_step}

🔗 {url}

**التعليمات:**
- التزم بالكامل بالهيكل والرموز التعبيرية
- {rewards}: سطر واحد يصف النقاط/الأوسمة (اكتب "لا توجد مكافآت" إذا لم يوجد)
- {impact}: جملة قصيرة تربط الإنجاز بالنتيجة النهائية
- {next_step}: جملة عملية توضّح ما يجب على المنشئ متابعته`
      ,
      creator_status_dm: `أنت مساعد إشعارات. أرسل تحديث حالة لصاحب المهمة مع الحفاظ على القالب.

**القالب (التزم به تماماً):**
👋 تحديث لمهمتك يا {creator_name}!

📝 المهمة: {task_name}
🔄 من: {before_status} → إلى: {after_status}
👤 الإجراء بواسطة: {actioned_by}
👥 المكلفون: {assignee_names}
⏱️ الموعد النهائي: {due_hint}

💡 ماذا يعني هذا؟
{impact}

📌 ماذا تتابع بعد ذلك؟
{next_step}

🔗 {url}

**التعليمات:**
- استخدم البيانات لتوليد {impact} و{next_step} في جملة أو جملتين
- إذا لم تتوفر قيمة ما فاستخدم عبارة "غير محدد"
- تأكد من إبراز اسم الفاعل والمكلفين`
    };

    return templates[templateType] || templates.assignment_dm;
  }

  /**
   * Build data message for AI
   */
  buildTemplateDataMessage(templateType, data) {
    const {
      task,
      assignee,
      assignees = [],
      userName,
      gamificationResult,
      beforeStatus,
      afterStatus,
      createdBy,
      actionedBy,
      assignedBy,
      transitionType,
      creator
    } = data;
    let msg = '**البيانات:**\n\n';

    switch (templateType) {
      case 'assignment_dm': {
        if (task) {
          const dueInDays = this.calculateDueInDays(task);
          msg += `name: ${assignee?.name || userName || 'عضو الفريق'}\n`;
          msg += `task_name: ${task.name}\n`;
          msg += `priority: ${task.priority_label || 'عادية'}\n`;
          msg += `weight: ${task.ai_weight || 10}\n`;
          msg += `complexity: ${this.translateComplexity(task.ai_complexity || 'medium')}\n`;
          msg += `assigned_by: ${assignedBy || userName || 'غير معروف'}\n`;
          msg += `estimated_time: ${task.ai_estimated_time ? `• الوقت المتوقع: ${task.ai_estimated_time} دقيقة ⏱️` : '• الوقت المتوقع: غير محدد'}\n`;

          if (typeof dueInDays === 'number') {
            if (dueInDays <= 0) {
              msg += 'due_date: • الموعد النهائي: اليوم\n';
            } else {
              msg += `due_date: • الموعد النهائي: بعد ${dueInDays} ${dueInDays === 1 ? 'يوم' : 'أيام'}\n`;
            }
          } else {
            msg += 'due_date: • الموعد النهائي: غير محدد\n';
          }

          msg += `url: ${task.url}\n`;
        }

        break;
      }

      case 'completion_dm': {
        if (task) {
          msg += `name: ${assignee?.name || userName || 'عضو الفريق'}\n`;
          msg += `task_name: ${task.name}\n`;
        }

        msg += `actioned_by: ${actionedBy || userName || 'غير معروف'}\n`;

        if (gamificationResult) {
          msg += `points: ${gamificationResult.pointsEarned} نقطة\n`;

          if (gamificationResult.newBadges?.length > 0) {
            msg += `badges: ${gamificationResult.newBadges.length} أوسمة (${gamificationResult.newBadges.map(b => `${b.name} ${b.emoji || '⭐'}`).join(', ')})\n`;
          } else {
            msg += 'badges: لا يوجد\n';
          }

          if (gamificationResult.shieldUpgrade) {
            msg += `shield: ترقية إلى ${gamificationResult.shieldUpgrade.to.name}\n`;
          } else {
            msg += 'shield: لا يوجد\n';
          }
        }

        break;
      }

      case 'task_created_group': {
        if (task) {
          const dueInDays = this.calculateDueInDays(task);
          const assigneeNames = assignees.length ? assignees.map(a => a.name).join(', ') : 'غير محدد';

          msg += `task_name: ${task.name}\n`;
          msg += `creator_name: ${createdBy || userName || 'غير معروف'}\n`;
          msg += `priority: ${task.priority_label || 'عادية'}\n`;
          msg += `weight: ${task.ai_weight || 10}\n`;
          msg += `complexity: ${this.translateComplexity(task.ai_complexity || 'medium')}\n`;
          msg += `assignee_names: ${assigneeNames}\n`;

          if (typeof dueInDays === 'number') {
            if (dueInDays <= 0) {
              msg += 'due_date: • الموعد النهائي: اليوم\n';
            } else {
              msg += `due_date: • الموعد النهائي: بعد ${dueInDays} ${dueInDays === 1 ? 'يوم' : 'أيام'}\n`;
            }
          } else {
            msg += 'due_date: • الموعد النهائي: غير محدد\n';
          }

          msg += `estimated_time: ${task.ai_estimated_time ? `• الوقت المتوقع: ${task.ai_estimated_time} دقيقة` : '• الوقت المتوقع: غير محدد'}\n`;
          msg += `focus_context: priority=${task.priority_label || 'عادية'}, due_in_days=${typeof dueInDays === 'number' ? dueInDays : 'غير معروف'}, assignees=${assignees.length}, estimated_time=${task.ai_estimated_time || 0}\n`;
          msg += `url: ${task.url}\n`;
        }

        break;
      }

      case 'task_status_changed_group': {
        if (task) {
          const dueInDays = this.calculateDueInDays(task);
          const assigneeNames = assignees.length ? assignees.map(a => a.name).join(', ') : 'غير محدد';
          let transitionNote = 'تحديث تقدم';
          if (transitionType === 'cancelled') {
            transitionNote = '🚫 إلغاء المهمة';
          } else if (transitionType === 'closed') {
            transitionNote = '✅ انتقال إلى حالة منجزة';
          }

          msg += `task_name: ${task.name}\n`;
          msg += `before_status: ${beforeStatus}\n`;
          msg += `after_status: ${afterStatus}\n`;
          msg += `user_name: ${userName}\n`;
          msg += `priority: ${task.priority_label || 'عادية'}\n`;
          msg += `assignee_names: ${assigneeNames}\n`;
          msg += `transition_note: ${transitionNote}\n`;
          msg += `assignees_count: ${Array.isArray(task.assignees) ? task.assignees.length : (task.assignee_ids ? (Array.isArray(task.assignee_ids) ? task.assignee_ids.length : 1) : 0)}\n`;

          if (typeof dueInDays === 'number') {
            msg += `due_in_days: ${dueInDays}\n`;
          } else {
            msg += 'due_in_days: غير محدد\n';
          }

          msg += `insight_hint: ${this.buildStatusChangeInsight(task, beforeStatus, afterStatus, userName)}\n`;
          msg += `url: ${task.url}\n`;
        }

        break;
      }

      case 'task_completed_group': {
        if (task) {
          const assigneeNames = assignees.length ? assignees.map(a => a.name).join(', ') : 'غير محدد';
          msg += `task_name: ${task.name}\n`;
          msg += `assignee_names: ${assigneeNames}\n`;
          msg += `actioned_by: ${actionedBy || userName || 'غير معروف'}\n`;
          msg += `weight: ${task.ai_weight || 10}\n`;
          msg += `complexity: ${this.translateComplexity(task.ai_complexity || 'medium')}\n`;
          msg += `points: ${gamificationResult?.pointsEarned ? `• النقاط: ${gamificationResult.pointsEarned} 🎯` : '• النقاط: لا يوجد'}\n`;

          if (gamificationResult?.newBadges?.length > 0) {
            msg += `badges: • الأوسمة: ${gamificationResult.newBadges.map(b => `${b.name} ${b.emoji || '⭐'}`).join(', ')}\n`;
          } else {
            msg += 'badges: • الأوسمة: لا يوجد\n';
          }

          if (gamificationResult?.shieldUpgrade) {
            msg += `shield: • الدرع: ${gamificationResult.shieldUpgrade.to.name}\n`;
          } else {
            msg += 'shield: • الدرع: لا يوجد\n';
          }

          msg += `highlight_hint: ${this.buildCompletionHighlight(task, gamificationResult)}\n`;
          msg += `url: ${task.url}\n`;
        }

        break;
      }

      case 'creator_completion_dm': {
        if (task) {
          const assigneeNames = assignees.length ? assignees.map(a => a.name).join(', ') : 'غير محدد';
          msg += `creator_name: ${creator?.name || 'قائد المهمة'}\n`;
          msg += `task_name: ${task.name}\n`;
          msg += `before_status: ${beforeStatus || 'غير معروف'}\n`;
          msg += `after_status: ${afterStatus || 'غير معروف'}\n`;
          msg += `actioned_by: ${actionedBy || userName || 'غير معروف'}\n`;
          msg += `assignee_names: ${assigneeNames}\n`;
          msg += `rewards: ${this.buildCreatorRewardsSummary(gamificationResult)}\n`;
          msg += `impact: ${this.buildCompletionHighlight(task, gamificationResult)}\n`;
          msg += `next_step: ${this.buildCreatorNextStep(task, 'closed', assignees, actionedBy, creator)}\n`;
          msg += `url: ${task.url}\n`;
        }

        break;
      }

      case 'creator_status_dm': {
        if (task) {
          const assigneeNames = assignees.length ? assignees.map(a => a.name).join(', ') : 'غير محدد';
          const dueInDays = this.calculateDueInDays(task);

          msg += `creator_name: ${creator?.name || 'قائد المهمة'}\n`;
          msg += `task_name: ${task.name}\n`;
          msg += `before_status: ${beforeStatus || 'غير معروف'}\n`;
          msg += `after_status: ${afterStatus || 'غير معروف'}\n`;
          msg += `actioned_by: ${actionedBy || userName || 'غير معروف'}\n`;
          msg += `assignee_names: ${assigneeNames}\n`;

          if (typeof dueInDays === 'number') {
            if (dueInDays <= 0) {
              msg += 'due_hint: الموعد النهائي: اليوم\n';
            } else {
              msg += `due_hint: الموعد النهائي بعد ${dueInDays} ${dueInDays === 1 ? 'يوم' : 'أيام'}\n`;
            }
          } else {
            msg += 'due_hint: الموعد النهائي غير محدد\n';
          }

          msg += `impact: ${this.buildStatusChangeInsight(task, beforeStatus, afterStatus, actionedBy || userName || 'غير معروف')}\n`;
          msg += `next_step: ${this.buildCreatorNextStep(task, transitionType || 'progress', assignees, actionedBy, creator)}\n`;
          msg += `url: ${task.url}\n`;
        }

        break;
      }

      default: {
        if (task) {
          msg += `task_name: ${task.name}\n`;
          msg += `priority: ${task.priority_label || 'عادية'}\n`;
          msg += `weight: ${task.ai_weight || 10}\n`;
        }

        break;
      }
    }

    msg += '\n**املأ القالب الآن:**';
    return msg;
  }
}

// Create singleton instance
const enhancedNotificationService = new EnhancedNotificationService();

export default enhancedNotificationService;
