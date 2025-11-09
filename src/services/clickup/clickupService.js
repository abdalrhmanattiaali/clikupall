/**
 * ClickUp Service
 * خدمة التعامل مع ClickUp API
 */

import axios from 'axios';
import { env } from '../../config/env.js';
import logger from '../../core/logger.js';
import { ClickUpError, NotFoundError } from '../../core/errors.js';
import { retry } from '../../utils/helpers.js';

class ClickUpService {
  constructor() {
    this.apiToken = env.clickup.apiToken;
    this.teamId = env.clickup.teamId;
    this.baseUrl = env.clickup.apiBaseUrl;

    this.api = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': this.apiToken,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    logger.debug('ClickUp Service initialized', {
      baseUrl: this.baseUrl,
      teamId: this.teamId
    });
  }

  /**
   * Get task details
   * @param {string} taskId - Task ID
   * @param {boolean} includeSubtasks - Include subtasks info
   * @returns {Promise<Object>} Task object
   */
  async getTask(taskId, includeSubtasks = true) {
    try {
      const response = await retry(async () => {
        return await this.api.get(`/task/${taskId}`, {
          params: {
            custom_task_ids: true,
            team_id: this.teamId,
            include_subtasks: includeSubtasks
          }
        });
      });

      logger.debug('Task fetched', { taskId, name: response.data.name });
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new NotFoundError('Task', taskId);
      }

      logger.error('Failed to get task', {
        taskId,
        error: error.message,
        status: error.response?.status
      });

      throw new ClickUpError(
        `Failed to get task ${taskId}: ${error.message}`,
        { taskId, originalError: error }
      );
    }
  }

  /**
   * Get tasks for a team member
   * @param {number} assigneeId - Assignee ClickUp ID
   * @param {Object} options - Additional options
   * @returns {Promise<Array>} Array of tasks
   */
  async getTasksForMember(assigneeId, options = {}) {
    try {
      const {
        includeClosed = false,
        includeSubtasks = true,
        page = 0
      } = options;

      const response = await retry(async () => {
        return await this.api.get(`/team/${this.teamId}/task`, {
          params: {
            assignees: [assigneeId],
            include_closed: includeClosed,
            subtasks: includeSubtasks,
            page
          }
        });
      });

      logger.debug('Member tasks fetched', {
        assigneeId,
        count: response.data.tasks?.length || 0
      });

      return response.data.tasks || [];
    } catch (error) {
      logger.error('Failed to get member tasks', {
        assigneeId,
        error: error.message
      });

      throw new ClickUpError(
        `Failed to get tasks for member ${assigneeId}: ${error.message}`,
        { assigneeId, originalError: error }
      );
    }
  }

  /**
   * Get all tasks for a team member (with pagination)
   * @param {number} assigneeId - Assignee ID
   * @param {Object} options - Additional options
   * @returns {Promise<Array>} All tasks
   */
  async getAllTasksForMember(assigneeId, options = {}) {
    try {
      let allTasks = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const tasks = await this.getTasksForMember(assigneeId, {
          ...options,
          page
        });

        if (tasks.length > 0) {
          allTasks = allTasks.concat(tasks);
          page++;
        } else {
          hasMore = false;
        }
      }

      logger.debug('All member tasks fetched', {
        assigneeId,
        totalCount: allTasks.length
      });

      return allTasks;
    } catch (error) {
      throw new ClickUpError(
        `Failed to get all tasks for member: ${error.message}`,
        { assigneeId, originalError: error }
      );
    }
  }

  /**
   * Get all team tasks
   * @param {Object} options - Additional options
   * @returns {Promise<Array>} Array of tasks
   */
  async getAllTeamTasks(options = {}) {
    try {
      const {
        includeClosed = false,
        includeSubtasks = true
      } = options;

      const response = await retry(async () => {
        return await this.api.get(`/team/${this.teamId}/task`, {
          params: {
            subtasks: includeSubtasks,
            include_closed: includeClosed
          }
        });
      });

      logger.debug('Team tasks fetched', {
        count: response.data.tasks?.length || 0
      });

      return response.data.tasks || [];
    } catch (error) {
      logger.error('Failed to get team tasks', {
        error: error.message
      });

      throw new ClickUpError(
        `Failed to get team tasks: ${error.message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Get task comments
   * @param {string} taskId - Task ID
   * @returns {Promise<Array>} Array of comments
   */
  async getTaskComments(taskId) {
    try {
      const response = await retry(async () => {
        return await this.api.get(`/task/${taskId}/comment`);
      });

      logger.debug('Task comments fetched', {
        taskId,
        count: response.data.comments?.length || 0
      });

      return response.data.comments || [];
    } catch (error) {
      logger.error('Failed to get task comments', {
        taskId,
        error: error.message
      });

      throw new ClickUpError(
        `Failed to get comments for task ${taskId}: ${error.message}`,
        { taskId, originalError: error }
      );
    }
  }

  /**
   * Create a new task
   * @param {string} listId - List ID
   * @param {Object} taskData - Task data
   * @returns {Promise<Object>} Created task
   */
  async createTask(listId, taskData) {
    try {
      const response = await retry(async () => {
        return await this.api.post(`/list/${listId}/task`, taskData);
      });

      logger.success('Task created', {
        taskId: response.data.id,
        name: response.data.name
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to create task', {
        listId,
        error: error.message
      });

      throw new ClickUpError(
        `Failed to create task: ${error.message}`,
        { listId, taskData, originalError: error }
      );
    }
  }

  /**
   * Update task
   * @param {string} taskId - Task ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated task
   */
  async updateTask(taskId, updates) {
    try {
      const response = await retry(async () => {
        return await this.api.put(`/task/${taskId}`, updates);
      });

      logger.debug('Task updated', {
        taskId,
        updates: Object.keys(updates)
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to update task', {
        taskId,
        error: error.message
      });

      throw new ClickUpError(
        `Failed to update task ${taskId}: ${error.message}`,
        { taskId, updates, originalError: error }
      );
    }
  }

  /**
   * Add attachment to task
   * @param {string} taskId - Task ID
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} filename - File name
   * @returns {Promise<Object>} Upload response
   */
  async addAttachment(taskId, fileBuffer, filename) {
    try {
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('attachment', fileBuffer, { filename });

      const response = await retry(async () => {
        return await this.api.post(`/task/${taskId}/attachment`, form, {
          headers: {
            ...form.getHeaders(),
            'Authorization': this.apiToken
          }
        });
      });

      logger.success('Attachment added to task', {
        taskId,
        filename
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to add attachment', {
        taskId,
        filename,
        error: error.message
      });

      throw new ClickUpError(
        `Failed to add attachment to task ${taskId}: ${error.message}`,
        { taskId, filename, originalError: error }
      );
    }
  }

  /**
   * Create subtask
   * @param {string} parentTaskId - Parent task ID
   * @param {string} listId - List ID
   * @param {Object} taskData - Task data
   * @returns {Promise<Object>} Created subtask
   */
  async createSubtask(parentTaskId, listId, taskData) {
    try {
      const subtaskData = {
        ...taskData,
        parent: parentTaskId
      };

      return await this.createTask(listId, subtaskData);
    } catch (error) {
      throw new ClickUpError(
        `Failed to create subtask: ${error.message}`,
        { parentTaskId, listId, originalError: error }
      );
    }
  }
}

// Create singleton instance
const clickupService = new ClickUpService();

export default clickupService;
