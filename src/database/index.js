/**
 * Database Service
 * Uses file-based storage as fallback when SQLite is unavailable
 */

import logger from '../core/logger.js';

// Try to use SQLite, fallback to file-based storage
let databaseService;

try {
  // Try importing better-sqlite3
  const Database = await import('better-sqlite3');
  logger.info('Using SQLite database');

  // Use SQLite implementation (original code)
  const { default: sqliteService } = await import('./sqliteDatabase.js');
  databaseService = sqliteService;
} catch (error) {
  // Fallback to file-based storage
  logger.warn('SQLite not available, using file-based storage', {
    error: error.message
  });

  const { default: fileService } = await import('./fileDatabase.js');
  databaseService = fileService;
}

export default databaseService;
