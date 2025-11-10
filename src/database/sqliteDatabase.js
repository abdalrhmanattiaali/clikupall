/**
 * SQLite Database Service
 * Manages all database operations for task tracking and AI analysis
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SCHEMA, INDEXES } from './schema.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DatabaseService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  /**
   * Initialize database and create tables
   */
  initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      const dbPath = join(__dirname, '../../data/clickup.db');
      logger.info('Initializing database', { path: dbPath });

      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL'); // Better performance
      this.db.pragma('foreign_keys = ON'); // Enable foreign keys

      // Create tables
      for (const [tableName, createSQL] of Object.entries(SCHEMA)) {
        this.db.exec(createSQL);
        logger.info(`Table created/verified: ${tableName}`);
      }

      // Create indexes
      for (const indexSQL of INDEXES) {
        this.db.exec(indexSQL);
      }

      this.isInitialized = true;
      logger.success('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database', { error: error.message });
      throw error;
    }
  }

  // ==================== TASKS ====================

  /**
   * Insert or update a task with complete data
   */
  upsertTask(taskData) {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        id, name, description,
        status_name, status_type, status_color,
        priority_label, priority_order,
        list_id, list_name, folder_id, folder_name, space_id, space_name,
        creator_id, creator_username,
        assignee_ids, assignee_names,
        created_at, updated_at, start_date, due_date, date_closed,
        checklist_total, checklist_resolved,
        subtasks_total, subtasks_resolved, subtasks_immediate_resolved,
        tags, url, custom_fields,
        first_seen_at, last_synced_at
      ) VALUES (
        @id, @name, @description,
        @status_name, @status_type, @status_color,
        @priority_label, @priority_order,
        @list_id, @list_name, @folder_id, @folder_name, @space_id, @space_name,
        @creator_id, @creator_username,
        @assignee_ids, @assignee_names,
        @created_at, @updated_at, @start_date, @due_date, @date_closed,
        @checklist_total, @checklist_resolved,
        @subtasks_total, @subtasks_resolved, @subtasks_immediate_resolved,
        @tags, @url, @custom_fields,
        @first_seen_at, @last_synced_at
      )
      ON CONFLICT(id) DO UPDATE SET
        name = @name,
        description = @description,
        status_name = @status_name,
        status_type = @status_type,
        status_color = @status_color,
        priority_label = @priority_label,
        priority_order = @priority_order,
        list_id = @list_id,
        list_name = @list_name,
        folder_id = @folder_id,
        folder_name = @folder_name,
        space_id = @space_id,
        space_name = @space_name,
        assignee_ids = @assignee_ids,
        assignee_names = @assignee_names,
        updated_at = @updated_at,
        start_date = @start_date,
        due_date = @due_date,
        date_closed = @date_closed,
        checklist_total = @checklist_total,
        checklist_resolved = @checklist_resolved,
        subtasks_total = @subtasks_total,
        subtasks_resolved = @subtasks_resolved,
        subtasks_immediate_resolved = @subtasks_immediate_resolved,
        tags = @tags,
        url = @url,
        custom_fields = @custom_fields,
        last_synced_at = @last_synced_at
    `);

    return stmt.run(taskData);
  }

  /**
   * Update AI analysis for a task
   */
  updateTaskAIAnalysis(taskId, aiData) {
    const stmt = this.db.prepare(`
      UPDATE tasks SET
        ai_weight = @ai_weight,
        ai_complexity = @ai_complexity,
        ai_estimated_time = @ai_estimated_time,
        ai_skills_required = @ai_skills_required,
        ai_dependencies = @ai_dependencies,
        ai_analyzed_at = @ai_analyzed_at
      WHERE id = @id
    `);

    return stmt.run({
      id: taskId,
      ...aiData,
      ai_analyzed_at: Date.now()
    });
  }

  /**
   * Get task by ID
   */
  getTask(taskId) {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const task = stmt.get(taskId);

    if (task) {
      // Parse JSON fields
      task.assignee_ids = task.assignee_ids ? JSON.parse(task.assignee_ids) : [];
      task.assignee_names = task.assignee_names ? JSON.parse(task.assignee_names) : [];
      task.tags = task.tags ? JSON.parse(task.tags) : [];
      task.custom_fields = task.custom_fields ? JSON.parse(task.custom_fields) : {};
      task.ai_skills_required = task.ai_skills_required ? JSON.parse(task.ai_skills_required) : [];
      task.ai_dependencies = task.ai_dependencies ? JSON.parse(task.ai_dependencies) : [];
    }

    return task;
  }

  /**
   * Get all tasks for a user
   */
  getUserTasks(userId, filters = {}) {
    let query = 'SELECT * FROM tasks WHERE assignee_ids LIKE ?';
    const params = [`%"${userId}"%`];

    if (filters.status) {
      query += ' AND status_name = ?';
      params.push(filters.status);
    }

    if (filters.priority) {
      query += ' AND priority_label = ?';
      params.push(filters.priority);
    }

    query += ' ORDER BY priority_order ASC, due_date ASC';

    const stmt = this.db.prepare(query);
    const tasks = stmt.all(...params);

    return tasks.map(task => {
      task.assignee_ids = task.assignee_ids ? JSON.parse(task.assignee_ids) : [];
      task.assignee_names = task.assignee_names ? JSON.parse(task.assignee_names) : [];
      task.tags = task.tags ? JSON.parse(task.tags) : [];
      return task;
    });
  }

  // ==================== EVENTS ====================

  /**
   * Insert a new event
   */
  insertEvent(eventData) {
    const stmt = this.db.prepare(`
      INSERT INTO task_events (
        event_id, task_id, trigger_type, trigger_category,
        changed_by_id, changed_by_username, changed_at,
        field_name, prev_value, next_value, raw_payload
      ) VALUES (
        @event_id, @task_id, @trigger_type, @trigger_category,
        @changed_by_id, @changed_by_username, @changed_at,
        @field_name, @prev_value, @next_value, @raw_payload
      )
      ON CONFLICT(event_id) DO NOTHING
    `);

    return stmt.run(eventData);
  }

  /**
   * Mark event notification as sent
   */
  markEventNotified(eventId) {
    const stmt = this.db.prepare(`
      UPDATE task_events SET
        notification_sent = 1,
        notification_sent_at = ?
      WHERE event_id = ?
    `);

    return stmt.run(Date.now(), eventId);
  }

  /**
   * Get events for a task
   */
  getTaskEvents(taskId, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM task_events
      WHERE task_id = ?
      ORDER BY changed_at DESC
      LIMIT ?
    `);

    return stmt.all(taskId, limit);
  }

  // ==================== USER BEHAVIOR ====================

  /**
   * Upsert user behavior data
   */
  upsertUserBehavior(userId, behaviorData) {
    const stmt = this.db.prepare(`
      INSERT INTO user_behavior (
        user_id, username,
        most_productive_hour, avg_tasks_per_day, preferred_task_types,
        avg_completion_time_minutes, on_time_completion_rate, overdue_rate,
        ai_work_style, ai_strengths, ai_improvement_areas, ai_recommended_schedule,
        last_analyzed_at, total_tasks_analyzed, updated_at
      ) VALUES (
        @user_id, @username,
        @most_productive_hour, @avg_tasks_per_day, @preferred_task_types,
        @avg_completion_time_minutes, @on_time_completion_rate, @overdue_rate,
        @ai_work_style, @ai_strengths, @ai_improvement_areas, @ai_recommended_schedule,
        @last_analyzed_at, @total_tasks_analyzed, @updated_at
      )
      ON CONFLICT(user_id) DO UPDATE SET
        username = @username,
        most_productive_hour = @most_productive_hour,
        avg_tasks_per_day = @avg_tasks_per_day,
        preferred_task_types = @preferred_task_types,
        avg_completion_time_minutes = @avg_completion_time_minutes,
        on_time_completion_rate = @on_time_completion_rate,
        overdue_rate = @overdue_rate,
        ai_work_style = @ai_work_style,
        ai_strengths = @ai_strengths,
        ai_improvement_areas = @ai_improvement_areas,
        ai_recommended_schedule = @ai_recommended_schedule,
        last_analyzed_at = @last_analyzed_at,
        total_tasks_analyzed = @total_tasks_analyzed,
        updated_at = @updated_at
    `);

    return stmt.run({
      user_id: userId,
      ...behaviorData,
      updated_at: Date.now()
    });
  }

  /**
   * Get user behavior
   */
  getUserBehavior(userId) {
    const stmt = this.db.prepare('SELECT * FROM user_behavior WHERE user_id = ?');
    const behavior = stmt.get(userId);

    if (behavior) {
      behavior.preferred_task_types = behavior.preferred_task_types ? JSON.parse(behavior.preferred_task_types) : [];
      behavior.ai_strengths = behavior.ai_strengths ? JSON.parse(behavior.ai_strengths) : [];
      behavior.ai_improvement_areas = behavior.ai_improvement_areas ? JSON.parse(behavior.ai_improvement_areas) : [];
      behavior.ai_recommended_schedule = behavior.ai_recommended_schedule ? JSON.parse(behavior.ai_recommended_schedule) : {};
    }

    return behavior;
  }

  // ==================== RECOMMENDATIONS ====================

  /**
   * Insert recommendations
   */
  insertRecommendations(recommendations) {
    const stmt = this.db.prepare(`
      INSERT INTO task_recommendations (
        user_id, task_id, recommendation_type, score, reason,
        recommended_for_date, recommended_for_time_slot
      ) VALUES (
        @user_id, @task_id, @recommendation_type, @score, @reason,
        @recommended_for_date, @recommended_for_time_slot
      )
    `);

    const insertMany = this.db.transaction((recs) => {
      for (const rec of recs) {
        stmt.run(rec);
      }
    });

    return insertMany(recommendations);
  }

  /**
   * Get recommendations for user
   */
  getUserRecommendations(userId, date, status = 'pending') {
    const stmt = this.db.prepare(`
      SELECT r.*, t.name as task_name, t.priority_label, t.due_date
      FROM task_recommendations r
      JOIN tasks t ON r.task_id = t.id
      WHERE r.user_id = ? AND r.recommended_for_date = ? AND r.status = ?
      ORDER BY r.score DESC
    `);

    return stmt.all(userId, date, status);
  }

  // ==================== AI CACHE ====================

  /**
   * Get cached AI result
   */
  getCache(cacheKey) {
    const stmt = this.db.prepare(`
      SELECT * FROM ai_analysis_cache
      WHERE cache_key = ? AND (expires_at IS NULL OR expires_at > ?)
    `);

    const cache = stmt.get(cacheKey, Date.now());
    if (cache) {
      cache.result = JSON.parse(cache.result);
    }
    return cache;
  }

  /**
   * Set cache
   */
  setCache(cacheKey, cacheType, result, inputHash, expiresInMs = null, metadata = {}) {
    const stmt = this.db.prepare(`
      INSERT INTO ai_analysis_cache (
        cache_key, cache_type, input_hash, result,
        model_used, tokens_used, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        result = ?,
        input_hash = ?,
        model_used = ?,
        tokens_used = ?,
        expires_at = ?,
        created_at = strftime('%s', 'now') * 1000
    `);

    const expiresAt = expiresInMs ? Date.now() + expiresInMs : null;
    const resultJSON = JSON.stringify(result);

    return stmt.run(
      cacheKey, cacheType, inputHash, resultJSON,
      metadata.model_used || null,
      metadata.tokens_used || null,
      expiresAt,
      resultJSON, inputHash,
      metadata.model_used || null,
      metadata.tokens_used || null,
      expiresAt
    );
  }

  // ==================== UTILITIES ====================

  /**
   * Get database statistics
   */
  getStats() {
    const stats = {};

    stats.tasks = this.db.prepare('SELECT COUNT(*) as count FROM tasks').get().count;
    stats.events = this.db.prepare('SELECT COUNT(*) as count FROM task_events').get().count;
    stats.users = this.db.prepare('SELECT COUNT(*) as count FROM user_behavior').get().count;
    stats.recommendations = this.db.prepare('SELECT COUNT(*) as count FROM task_recommendations').get().count;
    stats.cacheEntries = this.db.prepare('SELECT COUNT(*) as count FROM ai_analysis_cache').get().count;

    return stats;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.isInitialized = false;
      logger.info('Database connection closed');
    }
  }
}

// Singleton instance
const databaseService = new DatabaseService();

export default databaseService;
