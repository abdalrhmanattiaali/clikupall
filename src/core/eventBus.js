/**
 * Event Bus - Event-Driven Architecture
 * نظام الأحداث للتواصل بين المكونات المختلفة
 */

import { EventEmitter } from 'events';
import logger from './logger.js';

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Increase max listeners for complex workflows
  }

  /**
   * Emit event with logging
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emitEvent(event, data) {
    logger.debug(`Event emitted: ${event}`, { event, hasData: !!data });
    this.emit(event, data);
  }

  /**
   * Listen to event with error handling
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  onEvent(event, handler) {
    this.on(event, async (...args) => {
      try {
        await handler(...args);
      } catch (error) {
        logger.error(`Error in event handler for "${event}":`, { error: error.message });
      }
    });
  }

  /**
   * Listen to event once
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  onceEvent(event, handler) {
    this.once(event, async (...args) => {
      try {
        await handler(...args);
      } catch (error) {
        logger.error(`Error in one-time event handler for "${event}":`, { error: error.message });
      }
    });
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  offEvent(event, handler) {
    this.off(event, handler);
  }

  /**
   * Remove all listeners for an event
   * @param {string} event - Event name
   */
  removeAllListenersForEvent(event) {
    this.removeAllListeners(event);
  }
}

// Event names constants
export const EVENTS = {
  // Task Management Events
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  TASK_COMPLETED: 'task:completed',
  TASK_ASSIGNED: 'task:assigned',
  TASK_UNASSIGNED: 'task:unassigned',
  TASK_STATUS_CHANGED: 'task:status_changed',
  TASK_PRIORITY_CHANGED: 'task:priority_changed',
  TASK_NAME_CHANGED: 'task:name_changed',
  TASK_TAG_ADDED: 'task:tag_added',
  TASK_TAG_REMOVED: 'task:tag_removed',
  TASK_CUSTOM_FIELD_CHANGED: 'task:custom_field_changed',
  TASK_TYPE_CHANGED: 'task:type_changed',
  TASK_LINKED: 'task:linked',
  TASK_UNLINKED: 'task:unlinked',

  // Date & Time Events
  TASK_DUE_DATE_CHANGED: 'task:due_date_changed',
  TASK_START_DATE_CHANGED: 'task:start_date_changed',
  TASK_DUE_DATE_REMINDER: 'task:due_date_reminder',
  TASK_START_DATE_REMINDER: 'task:start_date_reminder',
  TASK_TIME_TRACKED: 'task:time_tracked',

  // Checklist Events
  TASK_CHECKLIST_ITEM_RESOLVED: 'task:checklist_item_resolved',
  TASK_ALL_CHECKLISTS_RESOLVED: 'task:all_checklists_resolved',

  // Subtask Events
  TASK_SUBTASK_CREATED: 'task:subtask_created',
  TASK_ALL_SUBTASKS_RESOLVED: 'task:all_subtasks_resolved',

  // Comment Events
  TASK_COMMENT_POSTED: 'task:comment_posted',
  TASK_COMMENT_ADDED: 'task:comment_added', // Legacy alias

  // Notification Events
  NOTIFICATION_QUEUED: 'notification:queued',
  NOTIFICATION_SENT: 'notification:sent',
  NOTIFICATION_FAILED: 'notification:failed',
  NOTIFICATION_BATCH_READY: 'notification:batch_ready',

  // Achievement Events
  ACHIEVEMENT_UNLOCKED: 'achievement:unlocked',
  BADGE_EARNED: 'badge:earned',
  CHALLENGE_COMPLETED: 'challenge:completed',

  // Report Events
  DAILY_REPORT_GENERATED: 'report:daily_generated',
  WEEKLY_REPORT_GENERATED: 'report:weekly_generated',
  MONTHLY_REPORT_GENERATED: 'report:monthly_generated',

  // System Events
  APP_READY: 'app:ready',
  APP_ERROR: 'app:error',
  WHATSAPP_READY: 'whatsapp:ready',
  WHATSAPP_DISCONNECTED: 'whatsapp:disconnected'
};

// Create singleton instance
const eventBus = new EventBus();

export default eventBus;
