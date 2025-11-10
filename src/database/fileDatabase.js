/**
 * File-based Database Service (Alternative to SQLite)
 * Simple JSON-based storage as temporary solution
 */

import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import logger from '../core/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class FileDatabaseService {
  constructor() {
    this.dbPath = join(__dirname, '../../data');
    this.files = {
      tasks: join(this.dbPath, 'tasks.json'),
      events: join(this.dbPath, 'events.json'),
      behavior: join(this.dbPath, 'user_behavior.json'),
      recommendations: join(this.dbPath, 'recommendations.json'),
      cache: join(this.dbPath, 'ai_cache.json')
    };
    this.isInitialized = false;
  }

  /**
   * Initialize database files
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Create data directory
      await fs.mkdir(this.dbPath, { recursive: true });

      // Initialize JSON files
      for (const [name, path] of Object.entries(this.files)) {
        try {
          await fs.access(path);
        } catch {
          await fs.writeFile(path, JSON.stringify({}));
          logger.info(`Created ${name}.json`);
        }
      }

      this.isInitialized = true;
      logger.success('File database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize file database', { error: error.message });
      throw error;
    }
  }

  async readFile(file) {
    const data = await fs.readFile(this.files[file], 'utf8');
    return JSON.parse(data);
  }

  async writeFile(file, data) {
    await fs.writeFile(this.files[file], JSON.stringify(data, null, 2));
  }

  // ==================== TASKS ====================

  async upsertTask(taskData) {
    const tasks = await this.readFile('tasks');
    tasks[taskData.id] = taskData;
    await this.writeFile('tasks', tasks);
    return { changes: 1 };
  }

  async updateTaskAIAnalysis(taskId, aiData) {
    const tasks = await this.readFile('tasks');
    if (tasks[taskId]) {
      Object.assign(tasks[taskId], aiData, { ai_analyzed_at: Date.now() });
      await this.writeFile('tasks', tasks);
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  getTask(taskId) {
    // Sync version for compatibility
    return null; // Will be loaded async
  }

  async getTaskAsync(taskId) {
    const tasks = await this.readFile('tasks');
    const task = tasks[taskId];
    if (task && task.assignee_ids && typeof task.assignee_ids === 'string') {
      task.assignee_ids = JSON.parse(task.assignee_ids);
      task.assignee_names = task.assignee_names ? JSON.parse(task.assignee_names) : [];
      task.tags = task.tags ? JSON.parse(task.tags) : [];
    }
    return task;
  }

  async getUserTasks(userId, filters = {}) {
    const tasks = await this.readFile('tasks');
    return Object.values(tasks).filter(task => {
      if (!task.assignee_ids) return false;
      const assignees = typeof task.assignee_ids === 'string' ?
        JSON.parse(task.assignee_ids) : task.assignee_ids;
      return assignees.includes(userId.toString());
    });
  }

  // ==================== EVENTS ====================

  async insertEvent(eventData) {
    const events = await this.readFile('events');
    if (!events.list) events.list = [];
    events.list.push({ ...eventData, created_at: Date.now() });
    await this.writeFile('events', events);
    return { lastInsertRowid: events.list.length };
  }

  async getTaskEvents(taskId, limit = 50) {
    const events = await this.readFile('events');
    return (events.list || [])
      .filter(e => e.task_id === taskId)
      .slice(-limit);
  }

  // ==================== USER BEHAVIOR ====================

  async upsertUserBehavior(userId, behaviorData) {
    const behavior = await this.readFile('behavior');
    behavior[userId] = {
      ...behaviorData,
      user_id: userId,
      updated_at: Date.now()
    };
    await this.writeFile('behavior', behavior);
    return { changes: 1 };
  }

  async getUserBehavior(userId) {
    const behavior = await this.readFile('behavior');
    const data = behavior[userId];
    if (data) {
      data.preferred_task_types = data.preferred_task_types ?
        JSON.parse(data.preferred_task_types) : [];
      data.ai_strengths = data.ai_strengths ? JSON.parse(data.ai_strengths) : [];
      data.ai_improvement_areas = data.ai_improvement_areas ?
        JSON.parse(data.ai_improvement_areas) : [];
      data.ai_recommended_schedule = data.ai_recommended_schedule ?
        JSON.parse(data.ai_recommended_schedule) : {};
    }
    return data;
  }

  // ==================== CACHE ====================

  async getCache(cacheKey) {
    const cache = await this.readFile('cache');
    const entry = cache[cacheKey];
    if (entry && (entry.expires_at === null || entry.expires_at > Date.now())) {
      entry.result = JSON.parse(entry.result);
      return entry;
    }
    return null;
  }

  async setCache(cacheKey, cacheType, result, inputHash, expiresInMs = null, metadata = {}) {
    const cache = await this.readFile('cache');
    cache[cacheKey] = {
      cache_key: cacheKey,
      cache_type: cacheType,
      input_hash: inputHash,
      result: JSON.stringify(result),
      model_used: metadata.model_used || null,
      tokens_used: metadata.tokens_used || null,
      created_at: Date.now(),
      expires_at: expiresInMs ? Date.now() + expiresInMs : null
    };
    await this.writeFile('cache', cache);
    return { changes: 1 };
  }

  // ==================== UTILITIES ====================

  async getStats() {
    const [tasks, events, behavior] = await Promise.all([
      this.readFile('tasks'),
      this.readFile('events'),
      this.readFile('behavior')
    ]);

    return {
      tasks: Object.keys(tasks).length,
      events: (events.list || []).length,
      users: Object.keys(behavior).length,
      recommendations: 0,
      cacheEntries: 0
    };
  }

  close() {
    this.isInitialized = false;
    logger.info('File database connection closed');
  }
}

// Singleton instance
const databaseService = new FileDatabaseService();

export default databaseService;
