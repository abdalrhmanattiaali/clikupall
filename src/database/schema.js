/**
 * SQLite Database Schema for ClickUp Task Management
 * Stores complete task data, events, and AI analysis
 */

export const SCHEMA = {
  // Main tasks table - stores complete task information
  tasks: `
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status_name TEXT,
      status_type TEXT,
      status_color TEXT,
      priority_label TEXT,
      priority_order INTEGER,

      -- Relationships
      list_id TEXT,
      list_name TEXT,
      folder_id TEXT,
      folder_name TEXT,
      space_id TEXT,
      space_name TEXT,

      -- Creator and assignments
      creator_id TEXT,
      creator_username TEXT,
      assignee_ids TEXT, -- JSON array
      assignee_names TEXT, -- JSON array

      -- Dates (timestamps in milliseconds)
      created_at INTEGER,
      updated_at INTEGER,
      start_date INTEGER,
      due_date INTEGER,
      date_closed INTEGER,

      -- Counts and progress
      checklist_total INTEGER DEFAULT 0,
      checklist_resolved INTEGER DEFAULT 0,
      subtasks_total INTEGER DEFAULT 0,
      subtasks_resolved INTEGER DEFAULT 0,
      subtasks_immediate_resolved INTEGER DEFAULT 0,

      -- Tags (JSON array)
      tags TEXT,

      -- AI Analysis
      ai_weight INTEGER DEFAULT 0, -- AI-calculated task weight (0-100)
      ai_complexity TEXT, -- simple, medium, complex, very_complex
      ai_estimated_time INTEGER, -- estimated minutes
      ai_skills_required TEXT, -- JSON array
      ai_dependencies TEXT, -- JSON array
      ai_analyzed_at INTEGER,

      -- URLs and metadata
      url TEXT,
      custom_fields TEXT, -- JSON

      -- Tracking
      first_seen_at INTEGER,
      last_synced_at INTEGER,

      UNIQUE(id)
    )
  `,

  // Task events table - stores all webhook events
  task_events: `
    CREATE TABLE IF NOT EXISTS task_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE,
      task_id TEXT NOT NULL,

      -- Event details
      trigger_type TEXT NOT NULL,
      trigger_category TEXT, -- task_management, dates_time, etc.

      -- Who and when
      changed_by_id TEXT,
      changed_by_username TEXT,
      changed_at INTEGER NOT NULL,

      -- What changed
      field_name TEXT,
      prev_value TEXT, -- JSON
      next_value TEXT, -- JSON

      -- Full event payload
      raw_payload TEXT, -- JSON

      -- Notification status
      notification_sent BOOLEAN DEFAULT 0,
      notification_sent_at INTEGER,

      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),

      FOREIGN KEY (task_id) REFERENCES tasks(id)
    )
  `,

  // User behavior analytics
  user_behavior: `
    CREATE TABLE IF NOT EXISTS user_behavior (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      username TEXT,

      -- Daily patterns
      most_productive_hour INTEGER, -- 0-23
      avg_tasks_per_day REAL,
      preferred_task_types TEXT, -- JSON array

      -- Performance metrics
      avg_completion_time_minutes REAL,
      on_time_completion_rate REAL, -- 0-1
      overdue_rate REAL, -- 0-1

      -- AI insights
      ai_work_style TEXT, -- fast_starter, steady_worker, night_owl, etc.
      ai_strengths TEXT, -- JSON array
      ai_improvement_areas TEXT, -- JSON array
      ai_recommended_schedule TEXT, -- JSON

      -- Last analysis
      last_analyzed_at INTEGER,
      total_tasks_analyzed INTEGER DEFAULT 0,

      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),

      UNIQUE(user_id)
    )
  `,

  // Task recommendations for users
  task_recommendations: `
    CREATE TABLE IF NOT EXISTS task_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      task_id TEXT NOT NULL,

      -- Recommendation details
      recommendation_type TEXT, -- morning_priority, quick_win, focus_time, etc.
      score REAL, -- 0-1 relevance score
      reason TEXT, -- AI-generated reason

      -- Timing
      recommended_for_date INTEGER, -- timestamp
      recommended_for_time_slot TEXT, -- morning, midday, afternoon, evening

      -- Status
      status TEXT DEFAULT 'pending', -- pending, accepted, rejected, completed
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),

      FOREIGN KEY (task_id) REFERENCES tasks(id),
      FOREIGN KEY (user_id) REFERENCES user_behavior(user_id)
    )
  `,

  // AI analysis cache
  ai_analysis_cache: `
    CREATE TABLE IF NOT EXISTS ai_analysis_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key TEXT UNIQUE NOT NULL,
      cache_type TEXT NOT NULL, -- task_weight, behavior_analysis, recommendations, etc.

      input_hash TEXT, -- hash of input to detect changes
      result TEXT, -- JSON result

      model_used TEXT,
      tokens_used INTEGER,

      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      expires_at INTEGER,

      UNIQUE(cache_key)
    )
  `
};

// Indexes for performance
export const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status_name)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_ids)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority_order)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at)',

  'CREATE INDEX IF NOT EXISTS idx_events_task_id ON task_events(task_id)',
  'CREATE INDEX IF NOT EXISTS idx_events_trigger ON task_events(trigger_type)',
  'CREATE INDEX IF NOT EXISTS idx_events_changed_at ON task_events(changed_at)',
  'CREATE INDEX IF NOT EXISTS idx_events_changed_by ON task_events(changed_by_id)',

  'CREATE INDEX IF NOT EXISTS idx_recommendations_user ON task_recommendations(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_recommendations_status ON task_recommendations(status)',
  'CREATE INDEX IF NOT EXISTS idx_recommendations_date ON task_recommendations(recommended_for_date)',

  'CREATE INDEX IF NOT EXISTS idx_cache_type ON ai_analysis_cache(cache_type)',
  'CREATE INDEX IF NOT EXISTS idx_cache_expires ON ai_analysis_cache(expires_at)'
];

export default { SCHEMA, INDEXES };
