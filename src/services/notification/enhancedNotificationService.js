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
    const { task, assignees } = data;

    // Check for duplicate
    if (this.isDuplicateNotification(task.id, 'created')) {
      return; // Skip duplicate
    }

    logger.info('📝 Processing TASK_CREATED event', {
      taskId: task.id,
      taskName: task.name,
      assignees: assignees?.length || 0
    });

    const groupMessage = await this.buildTaskCreatedMessage(task, assignees);

    // Add to batch queue for group (not immediate)
    this.addToQueue({
      type: 'task_created',
      task,
      message: groupMessage,
      data: { assignees }
    });

    // Send DM to assignees immediately with personalized message
    if (assignees && assignees.length > 0) {
      for (const assignee of assignees) {
        if (assignee.phone) {
          const dmMessage = await this.buildTaskAssignedDM(task, assignee);
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
    const { task, userName, gamificationResult } = data;

    // Check for duplicate
    if (this.isDuplicateNotification(task.id, 'completed')) {
      return; // Skip duplicate
    }

    logger.info('✅ Processing TASK_COMPLETED event', {
      taskId: task.id,
      taskName: task.name,
      userName,
      points: gamificationResult?.pointsEarned || 0
    });

    const groupMessage = await this.buildTaskCompletedMessage(task, userName, gamificationResult);

    // Add to batch queue for group
    this.addToQueue({
      type: 'task_completed',
      task,
      message: groupMessage,
      data: { userName, gamificationResult }
    });

    // Send DM to task completer with achievements and tips
    const assignees = this.getAssigneesFromTask(task);
    if (assignees.length > 0 && gamificationResult) {
      for (const assignee of assignees) {
        if (assignee.phone) {
          const dmMessage = await this.buildCompletionDM(task, assignee, gamificationResult);
          await this.sendImmediateNotification(dmMessage, 'user', assignee.phone);
        }
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
    const { task, assignees, assignedBy } = data;

    if (!assignees || assignees.length === 0) {
      logger.debug('TASK_ASSIGNED event received but no assignees found');
      return;
    }

    // Check for duplicate
    if (this.isDuplicateNotification(task.id, 'assigned')) {
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
        const dmMessage = await this.buildTaskAssignedDM(task, assignee);
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
    const { task, beforeStatus, afterStatus, userName } = data;

    logger.info('🔄 Processing TASK_STATUS_CHANGED event', {
      taskId: task.id,
      taskName: task.name,
      beforeStatus,
      afterStatus,
      userName
    });

    const message = await this.buildTaskStatusChangedMessage(task, beforeStatus, afterStatus, userName);

    // Always queue for batch (not immediate)
    this.addToQueue({
      type: 'status_changed',
      task,
      message,
      data: { beforeStatus, afterStatus, userName }
    });

    logger.debug('Status change queued for batch', {
      taskId: task.id,
      from: beforeStatus,
      to: afterStatus
    });
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
    const { task, commentText, userName } = data;

    const preview = commentText.length > 100 ? commentText.substring(0, 100) + '...' : commentText;

    const message = `💬 *تعليق جديد*\n\n` +
      `*المهمة:* ${task.name}\n` +
      `*من:* ${userName}\n` +
      `*التعليق:* ${preview}`;

    this.addToQueue({
      type: 'comment_posted',
      task,
      message,
      userName
    });
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
  async buildTaskCreatedMessage(task, assignees) {
    const aiMessage = await this.generateNotificationWithTemplate('task_created_group', {
      task,
      assignees
    });

    if (aiMessage) {
      return aiMessage;
    }

    const aiWeight = task.ai_weight || 10;
    const complexity = task.ai_complexity || 'medium';

    let message = `📝 *مهمة جديدة*\n\n`;
    message += `*الاسم:* ${task.name}\n`;
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
  async buildTaskCompletedMessage(task, userName, gamificationResult) {
    const aiMessage = await this.generateNotificationWithTemplate('task_completed_group', {
      task,
      userName,
      gamificationResult
    });

    if (aiMessage) {
      return aiMessage;
    }

    const aiWeight = task.ai_weight || 10;
    const complexity = task.ai_complexity || 'medium';

    let message = `✅ *مهمة مكتملة!*\n\n`;
    message += `*المهمة:* ${task.name}\n`;
    message += `*أكملها:* ${userName}\n`;
    message += `*الوزن:* ${aiWeight} نقطة 💎 (${this.translateComplexity(complexity)})\n`;

    if (gamificationResult) {
      message += `*النقاط المكتسبة:* ${gamificationResult.pointsEarned} نقطة 🎯\n`;

      if (gamificationResult.newBadges && gamificationResult.newBadges.length > 0) {
        message += `*أوسمة جديدة:* ${gamificationResult.newBadges.length} 🏆\n`;
      }

      if (gamificationResult.shieldUpgrade) {
        message += `*ترقية درع:* ${gamificationResult.shieldUpgrade.to.name} 🛡️\n`;
      }
    }

    message += `\n🎯 ${this.buildCompletionHighlight(task, gamificationResult)}\n`;
    message += `\n🔗 ${task.url}`;

    return message;
  }

  async buildTaskStatusChangedMessage(task, beforeStatus, afterStatus, userName) {
    const aiMessage = await this.generateNotificationWithTemplate('task_status_changed_group', {
      task,
      beforeStatus,
      afterStatus,
      userName
    });

    if (aiMessage) {
      return aiMessage;
    }

    let message = `🔄 *تغيير حالة المهمة*\n\n`;
    message += `*المهمة:* ${task.name}\n`;
    message += `*من:* ${beforeStatus}\n`;
    message += `*إلى:* ${afterStatus}\n`;
    message += `*بواسطة:* ${userName}\n`;
    message += `\n💡 ${this.buildStatusChangeInsight(task, beforeStatus, afterStatus, userName)}\n`;
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
  async buildTaskAssignedDM(task, assignee) {
    // Try AI template-based generation first
    const aiMessage = await this.generateNotificationWithTemplate('assignment_dm', {
      task,
      assignee
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
  async buildCompletionDM(task, assignee, gamificationResult) {
    // Try AI template-based generation first
    const aiMessage = await this.generateNotificationWithTemplate('completion_dm', {
      task,
      assignee,
      gamificationResult
    });

    if (aiMessage) {
      return aiMessage;
    }

    // Fallback: default message
    let message = `🎉 *أحسنت ${assignee.name}!*\n\n`;
    message += `✅ لقد أكملت: *${task.name}*\n\n`;

    message += `*المكافآت:*\n`;
    message += `• ${gamificationResult.pointsEarned} نقطة 🎯\n`;

    if (gamificationResult.newBadges && gamificationResult.newBadges.length > 0) {
      message += `• ${gamificationResult.newBadges.length} وسام جديد! 🏆\n`;
      gamificationResult.newBadges.forEach(badge => {
        message += `  - ${badge.name} ${badge.emoji || '⭐'}\n`;
      });
    }

    if (gamificationResult.shieldUpgrade) {
      message += `• ترقية درع: ${gamificationResult.shieldUpgrade.to.name} 🛡️\n`;
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
    const { findMemberById } = require('../../config/team.js');

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
          const userName = item.data?.userName || 'Unknown';
          const points = item.data?.gamificationResult?.pointsEarned || 0;
          const badges = item.data?.gamificationResult?.newBadges?.length || 0;
          const weight = item.task.ai_weight || 10;

          finalMessage += `  ${i + 1}️⃣ *${item.task.name}*\n`;
          finalMessage += `     ✅ أكملها: ${userName}\n`;
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

          finalMessage += `  ${i + 1}️⃣ *${item.task.name}*\n`;

          if (assignees.length > 0) {
            const names = assignees.map(a => a.name).join('، ');
            finalMessage += `     👥 المكلفون: ${names}\n`;
          } else {
            finalMessage += `     👥 غير مسندة\n`;
          }

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
          const userName = data.userName || 'Unknown';

          finalMessage += `  ${i + 1}️⃣ *${item.task.name}*\n`;
          finalMessage += `     ${data.beforeStatus} ➜ ${data.afterStatus}\n`;
          finalMessage += `     👤 ${userName}\n\n`;
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
  isDuplicateNotification(taskId, eventType) {
    const now = Date.now();

    // Check 1: Same event type duplicate (10 seconds window)
    const eventKey = `${taskId}-${eventType}`;
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
• الأولوية: {priority}
• الوزن: {weight} نقطة ({complexity})
{assignees}
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
• أكملها: {user_name}
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
    };

    return templates[templateType] || templates.assignment_dm;
  }

  /**
   * Build data message for AI
   */
  buildTemplateDataMessage(templateType, data) {
    const { task, assignee, assignees = [], userName, gamificationResult, beforeStatus, afterStatus } = data;
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
          const assigneeNames = assignees.length ? assignees.map(a => a.name).join(', ') : null;

          msg += `task_name: ${task.name}\n`;
          msg += `priority: ${task.priority_label || 'عادية'}\n`;
          msg += `weight: ${task.ai_weight || 10}\n`;
          msg += `complexity: ${this.translateComplexity(task.ai_complexity || 'medium')}\n`;
          msg += `assignees: ${assigneeNames ? `• المكلفون: ${assigneeNames}` : '• المكلفون: لم يتم التعيين بعد'}\n`;

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

          msg += `task_name: ${task.name}\n`;
          msg += `before_status: ${beforeStatus}\n`;
          msg += `after_status: ${afterStatus}\n`;
          msg += `user_name: ${userName}\n`;
          msg += `priority: ${task.priority_label || 'عادية'}\n`;
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
          msg += `task_name: ${task.name}\n`;
          msg += `user_name: ${userName}\n`;
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
