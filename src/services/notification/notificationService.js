/**
 * Notification Service
 * خدمة إدارة الإشعارات مع batching و queue
 */

import logger from '../../core/logger.js';
import eventBus, { EVENTS } from '../../core/eventBus.js';
import whatsappService from '../whatsapp/whatsappService.js';
import aiService from '../ai/index.js';
import { env } from '../../config/env.js';
import { shortenUrl } from '../../utils/urlShortener.js';
import { formatTask } from '../../utils/formatters.js';
import { groupBy } from '../../utils/helpers.js';

class NotificationService {
  constructor() {
    this.queue = [];
    this.isPaused = false;
    this.pauseTimeout = null;
    this.batchTimeout = null;
    this.batchDelay = env.notifications.batchDelay;
    this.sentDirectNotifications = new Set();

    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Listen to task events
    eventBus.onEvent(EVENTS.TASK_COMPLETED, async (data) => {
      await this.handleTaskCompleted(data);
    });

    eventBus.onEvent(EVENTS.TASK_CREATED, async (data) => {
      await this.handleTaskCreated(data);
    });

    eventBus.onEvent(EVENTS.TASK_ASSIGNED, async (data) => {
      await this.handleTaskAssigned(data);
    });
  }

  /**
   * Add notification to queue
   * @param {Object} notification - Notification object
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
   * Send batch notifications
   * @param {Array} batch - Batch of notifications
   */
  async sendBatchNotifications(batch) {
    // Group by user
    const userActivity = {};

    batch.forEach(item => {
      const userName = item.data.userName || item.data.updaterName || 'General';

      if (!userActivity[userName]) {
        userActivity[userName] = {
          task_completed: [],
          task_assigned: [],
          status_changed: [],
          comment_added: []
        };
      }

      const type = item.type || 'general';
      if (userActivity[userName][type]) {
        userActivity[userName][type].push(item);
      }
    });

    // Build summary message
    let summaryMessage = '📢 *ملخص التحديثات الأخيرة:*\n';
    let hasContent = false;

    for (const [userName, activity] of Object.entries(userActivity)) {
      let userBlock = '';

      // Completed tasks
      if (activity.task_completed.length > 0) {
        hasContent = true;
        userBlock += `\n🏆 *${userName} أنجز ${activity.task_completed.length} ${activity.task_completed.length > 1 ? 'مهام' : 'مهمة'}:*\n`;

        for (const item of activity.task_completed.slice(0, 5)) {
          const taskUrl = `https://app.clickup.com/t/${item.task.id}`;
          const shortUrl = await shortenUrl(taskUrl);
          userBlock += `  • ${item.task.name}\n    🔗 ${shortUrl}\n`;
        }
      }

      // Assigned tasks
      if (activity.task_assigned.length > 0) {
        hasContent = true;
        userBlock += `\n✅ *تم إسناد ${activity.task_assigned.length} ${activity.task_assigned.length > 1 ? 'مهام' : 'مهمة'} إلى ${userName}:*\n`;

        for (const item of activity.task_assigned.slice(0, 5)) {
          const taskUrl = `https://app.clickup.com/t/${item.task.id}`;
          const shortUrl = await shortenUrl(taskUrl);
          userBlock += `  • ${item.task.name}\n    🔗 ${shortUrl}\n`;
        }
      }

      if (userBlock) {
        summaryMessage += `\n${userBlock}`;
      }
    }

    // Send to group if has content
    if (hasContent && whatsappService.isClientReady()) {
      try {
        await whatsappService.sendToGroup(summaryMessage);
        logger.success('Batch notification sent to group');
        eventBus.emitEvent(EVENTS.NOTIFICATION_SENT, { type: 'batch' });
      } catch (error) {
        logger.error('Failed to send batch notification', {
          error: error.message
        });
        eventBus.emitEvent(EVENTS.NOTIFICATION_FAILED, { error });
      }
    }
  }

  /**
   * Pause notifications
   * @param {number} duration - Duration in milliseconds
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

      // Process any queued notifications
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
   * Handle task completed event
   * @param {Object} data - Event data
   */
  async handleTaskCompleted(data) {
    const { task, userName } = data;

    logger.debug('Handling task completed notification', {
      taskId: task.id,
      userName
    });

    this.addToQueue({
      type: 'task_completed',
      task,
      data: { userName }
    });
  }

  /**
   * Handle task created event
   * @param {Object} data - Event data
   */
  async handleTaskCreated(data) {
    const { task, assignees } = data;

    logger.debug('Handling task created notification', {
      taskId: task.id,
      assignees: assignees?.length || 0
    });

    // Send direct notifications to assignees
    if (assignees && assignees.length > 0 && env.features.aiNotifications) {
      await this.sendDirectAssignmentNotifications(task, assignees);
    }

    // Add to queue for batch
    this.addToQueue({
      type: 'task_assigned',
      task,
      data: { assignees }
    });
  }

  /**
   * Handle task assigned event
   * @param {Object} data - Event data
   */
  async handleTaskAssigned(data) {
    const { task, assignees } = data;

    logger.debug('Handling task assigned notification', {
      taskId: task.id,
      assignees: assignees?.length || 0
    });

    // Send direct notifications
    if (assignees && assignees.length > 0) {
      await this.sendDirectAssignmentNotifications(task, assignees);
    }

    this.addToQueue({
      type: 'task_assigned',
      task,
      data: { assignees }
    });
  }

  /**
   * Send direct assignment notifications
   * @param {Object} task - Task object
   * @param {Array} assignees - Array of assignees
   */
  async sendDirectAssignmentNotifications(task, assignees) {
    if (!whatsappService.isClientReady()) {
      logger.warn('WhatsApp not ready, skipping direct notifications');
      return;
    }

    for (const assignee of assignees) {
      const notifKey = `assign-${task.id}-${assignee.id}`;

      // Prevent duplicate notifications
      if (this.sentDirectNotifications.has(notifKey)) {
        continue;
      }

      this.sentDirectNotifications.add(notifKey);

      // Expire key after 1 minute
      setTimeout(() => {
        this.sentDirectNotifications.delete(notifKey);
      }, 60000);

      try {
        const taskUrl = `https://app.clickup.com/t/${task.id}`;
        const shortUrl = await shortenUrl(taskUrl);

        let message = `👋 *مهمة جديدة تم إسنادها لك*\n\n`;
        message += `📝 *${task.name}*\n`;

        if (task.parent) {
          message += `(مهمة فرعية)\n`;
        }

        message += `\n🔗 ${shortUrl}`;

        await whatsappService.sendToUser(assignee.phone, message);

        logger.debug('Direct assignment notification sent', {
          taskId: task.id,
          assignee: assignee.name
        });
      } catch (error) {
        logger.error('Failed to send direct notification', {
          taskId: task.id,
          assignee: assignee.name,
          error: error.message
        });
      }
    }
  }

  /**
   * Get queue status
   * @returns {Object} Queue status
   */
  getStatus() {
    return {
      queueSize: this.queue.length,
      isPaused: this.isPaused,
      hasBatchTimer: !!this.batchTimeout
    };
  }
}

// Create singleton instance
const notificationService = new NotificationService();

export default notificationService;
