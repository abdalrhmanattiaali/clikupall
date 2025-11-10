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

    const message = `🔄 *تغيير حالة المهمة*\n\n` +
      `*المهمة:* ${task.name}\n` +
      `*من:* ${beforeStatus}\n` +
      `*إلى:* ${afterStatus}\n` +
      `*بواسطة:* ${userName}`;

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

    message += `\n🔗 ${task.url}`;

    return message;
  }

  /**
   * Build task completed message
   */
  async buildTaskCompletedMessage(task, userName, gamificationResult) {
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

    message += `\n🎉 رائع! استمر في الإنجاز!`;

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
   * Build DM for task assignment (more personal + optional AI tip)
   */
  async buildTaskAssignedDM(task, assignee) {
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

    message += `\n🔗 ${task.url}`;

    // Try to get AI-generated contextual tip
    const aiTip = await this.enhanceAssignmentMessage(task, assignee);

    if (aiTip) {
      message += `\n\n💡 *نصيحة AI:*\n${aiTip}`;
    }

    message += `\n\n💪 *بالتوفيق!*`;

    return message;
  }

  /**
   * Build DM for task completion (with achievements + optional AI enhancement)
   */
  async buildCompletionDM(task, assignee, gamificationResult) {
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

    // Try to get AI-enhanced personalized message
    const aiMessage = await this.enhanceCompletionMessage(task, assignee, gamificationResult);

    if (aiMessage) {
      // Use AI-generated personalized message
      message += `\n\n✨ *رسالة شخصية:*\n${aiMessage}\n\n`;
      message += `🔥 استمر في الإنجاز!`;
    } else {
      // Fallback to random tip
      const tips = [
        '💡 *نصيحة:* حاول إكمال المهام الأصعب في بداية اليوم عندما يكون تركيزك أعلى!',
        '💡 *نصيحة:* قسّم المهام الكبيرة إلى مهام فرعية أصغر لتحقيق تقدم مستمر!',
        '💡 *نصيحة:* خصص 25 دقيقة من التركيز الكامل (Pomodoro) ثم استرح 5 دقائق!',
        '💡 *نصيحة:* راجع مهامك المكتملة أسبوعياً لتقييم تقدمك!',
        '💡 *نصيحة:* تواصل مع الفريق عند مواجهة عقبات - التعاون يسرّع الإنجاز!',
        '💡 *نصيحة:* ضع أهدافاً يومية صغيرة وقابلة للتحقيق!'
      ];
      const randomTip = tips[Math.floor(Math.random() * tips.length)];

      message += `\n${randomTip}\n\n`;
      message += `🔥 استمر في الإنجاز!`;
    }

    return message;
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

  // ==================== AI ENHANCEMENT ====================

  /**
   * Enhance completion message with AI-generated personalized congratulations
   * Only if env.features.aiNotifications is enabled
   */
  async enhanceCompletionMessage(task, assignee, gamificationResult) {
    if (!env.features.aiNotifications) {
      return null; // Skip AI, use default message
    }

    try {
      const systemPrompt = `أنت مساعد تحفيزي. اكتب رسالة تهنئة شخصية قصيرة (2-3 جمل) بالعربية لشخص أكمل مهمة.`;

      const userMessage = `المستخدم: ${assignee.name}
المهمة المكتملة: ${task.name}
النقاط المكتسبة: ${gamificationResult.pointsEarned}
الأوسمة الجديدة: ${gamificationResult.newBadges?.length || 0}
الوزن: ${task.ai_weight || 10} نقطة
التعقيد: ${task.ai_complexity || 'medium'}

اكتب رسالة تهنئة شخصية قصيرة ومحفزة.`;

      const aiMessage = await aiService.generateCompletion(
        systemPrompt,
        userMessage,
        { temperature: 0.8, max_tokens: 150 }
      );

      logger.debug('AI completion message generated', {
        taskId: task.id,
        assignee: assignee.name
      });

      return aiMessage;
    } catch (error) {
      logger.error('AI message generation failed, using default', {
        error: error.message
      });
      return null; // Fallback to default message
    }
  }

  /**
   * Enhance task assignment message with AI-generated contextual tip
   * Only if env.features.aiNotifications is enabled
   */
  async enhanceAssignmentMessage(task, assignee) {
    if (!env.features.aiNotifications) {
      return null; // Skip AI, use default message
    }

    try {
      const systemPrompt = `أنت مساعد إنتاجية. اقترح نصيحة عملية قصيرة (جملة واحدة) بالعربية لشخص تم تكليفه بمهمة.`;

      const userMessage = `المستخدم: ${assignee.name}
المهمة: ${task.name}
الأولوية: ${task.priority_label || 'عادية'}
الوزن: ${task.ai_weight || 10} نقطة
التعقيد: ${task.ai_complexity || 'medium'}
الوقت المتوقع: ${task.ai_estimated_time || 30} دقيقة

اقترح نصيحة عملية واحدة للبدء بهذه المهمة.`;

      const aiTip = await aiService.generateCompletion(
        systemPrompt,
        userMessage,
        { temperature: 0.7, max_tokens: 100 }
      );

      logger.debug('AI assignment tip generated', {
        taskId: task.id,
        assignee: assignee.name
      });

      return aiTip;
    } catch (error) {
      logger.error('AI tip generation failed, using default', {
        error: error.message
      });
      return null; // Fallback to default message
    }
  }
}

// Create singleton instance
const enhancedNotificationService = new EnhancedNotificationService();

export default enhancedNotificationService;
