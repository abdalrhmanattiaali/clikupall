/**
 * Enhanced ClickUp Service
 * Fetches complete task data from ClickUp API and stores in database
 */

import axios from 'axios';
import { env } from '../../config/env.js';
import logger from '../../core/logger.js';
import databaseService from '../../database/index.js';

class EnhancedClickUpService {
  constructor() {
    this.baseURL = 'https://api.clickup.com/api/v2';
    this.headers = {
      'Authorization': env.clickup.apiToken,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Fetch complete task data from ClickUp API
   */
  async fetchCompleteTaskData(taskId) {
    try {
      logger.info('Fetching complete task data from ClickUp API', { taskId });

      const response = await axios.get(
        `${this.baseURL}/task/${taskId}`,
        {
          headers: this.headers,
          params: {
            include_subtasks: true,
            custom_task_ids: true
          }
        }
      );

      const task = response.data;

      // Transform to our database format
      const taskData = this.transformTaskData(task);

      // Store in database
      databaseService.upsertTask(taskData);

      logger.success('Task data fetched and stored', {
        taskId,
        name: taskData.name
      });

      return taskData;
    } catch (error) {
      logger.error('Failed to fetch task data', {
        taskId,
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Transform ClickUp API response to database format
   */
  transformTaskData(task) {
    const now = Date.now();

    return {
      // Basic info
      id: task.id,
      name: task.name || '',
      description: task.description || task.text_content || null,
      url: task.url || null,
      parent: task.parent || null,
      parent_id: task.parent || null,
      parent_name: task.parent?.name || task.parent_name || null,
      parent_url: task.parent ? `https://app.clickup.com/t/${task.parent}` : null,

      // Status
      status_name: task.status?.status || task.status?.type || null,
      status_type: task.status?.type || null,
      status_color: task.status?.color || null,

      // Priority
      priority_label: task.priority?.priority || null,
      priority_order: task.priority?.orderindex || task.priority?.order || null,

      // Relationships
      list_id: task.list?.id || null,
      list_name: task.list?.name || null,
      folder_id: task.folder?.id || null,
      folder_name: task.folder?.name || null,
      space_id: task.space?.id || null,
      space_name: task.space?.name || null,

      // Creator
      creator_id: task.creator?.id?.toString() || null,
      creator_username: task.creator?.username || task.creator?.email || null,

      // Assignees
      assignee_ids: JSON.stringify(
        (task.assignees || []).map(a => a.id?.toString() || a.id)
      ),
      assignee_names: JSON.stringify(
        (task.assignees || []).map(a => a.username || a.email || 'Unknown')
      ),

      // Dates
      created_at: task.date_created ? parseInt(task.date_created) : null,
      updated_at: task.date_updated ? parseInt(task.date_updated) : now,
      start_date: task.start_date ? parseInt(task.start_date) : null,
      due_date: task.due_date ? parseInt(task.due_date) : null,
      date_closed: task.date_closed ? parseInt(task.date_closed) : null,

      // Checklists
      checklist_total: this.countChecklistItems(task.checklists),
      checklist_resolved: this.countResolvedChecklistItems(task.checklists),

      // Subtasks
      subtasks_total: task.subtasks?.length || 0,
      subtasks_resolved: this.countResolvedSubtasks(task.subtasks),
      subtasks_immediate_resolved: this.countImmediateResolvedSubtasks(task.subtasks),

      // Tags
      tags: JSON.stringify(
        (task.tags || []).map(t => typeof t === 'string' ? t : t.name)
      ),

      // Custom fields
      custom_fields: JSON.stringify(this.transformCustomFields(task.custom_fields || [])),

      // Tracking
      first_seen_at: now,
      last_synced_at: now
    };
  }

  /**
   * Transform custom fields
   */
  transformCustomFields(fields) {
    const transformed = {};
    for (const field of fields) {
      transformed[field.name || field.id] = {
        type: field.type,
        value: field.value,
        type_config: field.type_config
      };
    }
    return transformed;
  }

  /**
   * Count checklist items
   */
  countChecklistItems(checklists) {
    if (!checklists || !Array.isArray(checklists)) return 0;
    return checklists.reduce((sum, checklist) => {
      return sum + (checklist.items?.length || 0);
    }, 0);
  }

  /**
   * Count resolved checklist items
   */
  countResolvedChecklistItems(checklists) {
    if (!checklists || !Array.isArray(checklists)) return 0;
    return checklists.reduce((sum, checklist) => {
      const resolved = (checklist.items || []).filter(item => item.resolved).length;
      return sum + resolved;
    }, 0);
  }

  /**
   * Count resolved subtasks
   */
  countResolvedSubtasks(subtasks) {
    if (!subtasks || !Array.isArray(subtasks)) return 0;
    return subtasks.filter(st => st.status?.type === 'closed').length;
  }

  /**
   * Count immediate resolved subtasks (direct children only)
   */
  countImmediateResolvedSubtasks(subtasks) {
    if (!subtasks || !Array.isArray(subtasks)) return 0;
    const immediate = subtasks.filter(st => !st.parent);
    return immediate.filter(st => st.status?.type === 'closed').length;
  }

  /**
   * Fetch all tasks for a list
   */
  async fetchListTasks(listId) {
    try {
      logger.info('Fetching all tasks for list', { listId });

      const response = await axios.get(
        `${this.baseURL}/list/${listId}/task`,
        {
          headers: this.headers,
          params: {
            include_closed: true,
            subtasks: true
          }
        }
      );

      const tasks = response.data.tasks || [];

      logger.info('Fetched tasks', { listId, count: tasks.length });

      // Store all tasks
      for (const task of tasks) {
        const taskData = this.transformTaskData(task);
        databaseService.upsertTask(taskData);
      }

      return tasks.map(t => this.transformTaskData(t));
    } catch (error) {
      logger.error('Failed to fetch list tasks', {
        listId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Fetch all tasks for the team (initial sync)
   */
  async syncAllTasks() {
    try {
      logger.info('Starting full task sync');

      // Get all spaces
      const spacesResponse = await axios.get(
        `${this.baseURL}/team/${env.clickup.teamId}/space`,
        { headers: this.headers, params: { archived: false } }
      );

      const spaces = spacesResponse.data.spaces || [];
      let totalTasks = 0;

      for (const space of spaces) {
        logger.info(`Syncing space: ${space.name}`);

        // Get folders
        const foldersResponse = await axios.get(
          `${this.baseURL}/space/${space.id}/folder`,
          { headers: this.headers, params: { archived: false } }
        );

        const folders = foldersResponse.data.folders || [];

        // Get lists from folders
        for (const folder of folders) {
          const listsResponse = await axios.get(
            `${this.baseURL}/folder/${folder.id}/list`,
            { headers: this.headers, params: { archived: false } }
          );

          const lists = listsResponse.data.lists || [];

          for (const list of lists) {
            const tasks = await this.fetchListTasks(list.id);
            totalTasks += tasks.length;
          }
        }

        // Get folderless lists
        const folderlessResponse = await axios.get(
          `${this.baseURL}/space/${space.id}/list`,
          { headers: this.headers, params: { archived: false } }
        );

        const folderlessLists = folderlessResponse.data.lists || [];

        for (const list of folderlessLists) {
          const tasks = await this.fetchListTasks(list.id);
          totalTasks += tasks.length;
        }
      }

      logger.success('Full sync completed', { totalTasks });

      return { totalTasks };
    } catch (error) {
      logger.error('Full sync failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get task from database (with fallback to API)
   */
  async getTask(taskId, forceRefresh = false) {
    if (!forceRefresh) {
      const cached = databaseService.getTask(taskId);
      if (cached) {
        logger.info('Task retrieved from database', { taskId });
        return cached;
      }
    }

    // Fetch from API
    return await this.fetchCompleteTaskData(taskId);
  }

  /**
   * Update custom field value
   */
  async updateCustomField(taskId, fieldId, value) {
    try {
      const response = await axios.post(
        `${this.baseURL}/task/${taskId}/field/${fieldId}`,
        { value },
        { headers: this.headers }
      );

      logger.success('Custom field updated', { taskId, fieldId, value });

      // Refresh task data
      await this.fetchCompleteTaskData(taskId);

      return response.data;
    } catch (error) {
      logger.error('Failed to update custom field', {
        taskId,
        fieldId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Add comment to task
   */
  async addComment(taskId, comment) {
    try {
      const response = await axios.post(
        `${this.baseURL}/task/${taskId}/comment`,
        { comment_text: comment },
        { headers: this.headers }
      );

      logger.success('Comment added', { taskId });

      return response.data;
    } catch (error) {
      logger.error('Failed to add comment', {
        taskId,
        error: error.message
      });
      throw error;
    }
  }
}

// Singleton instance
const enhancedClickUpService = new EnhancedClickUpService();

export default enhancedClickUpService;
