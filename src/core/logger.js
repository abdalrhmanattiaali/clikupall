/**
 * Professional Logging System
 * نظام logging احترافي مع دعم الملفات والألوان
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// ANSI color codes
const COLORS = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  GREEN: '\x1b[32m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  GRAY: '\x1b[90m'
};

// Emoji for different log levels
const EMOJI = {
  ERROR: '❌',
  WARN: '⚠️',
  INFO: 'ℹ️',
  DEBUG: '🔍',
  SUCCESS: '✅',
  START: '🚀',
  STOP: '🛑'
};

class Logger {
  constructor() {
    this.level = LOG_LEVELS[env.logging.level?.toUpperCase()] || LOG_LEVELS.INFO;
    this.logToFile = env.logging.toFile;
    this.logDir = path.join(__dirname, '../../logs');
    this.initializeLogDirectory();
  }

  /**
   * Initialize log directory
   */
  async initializeLogDirectory() {
    if (this.logToFile) {
      try {
        await fs.mkdir(this.logDir, { recursive: true });
      } catch (error) {
        console.error('Failed to create log directory:', error);
      }
    }
  }

  /**
   * Format timestamp
   * @returns {string} Formatted timestamp
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Get log file path
   * @returns {string} Log file path
   */
  getLogFilePath() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `app-${date}.log`);
  }

  /**
   * Write to log file
   * @param {string} message - Log message
   */
  async writeToFile(message) {
    if (!this.logToFile) return;

    try {
      const logFile = this.getLogFilePath();
      await fs.appendFile(logFile, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Format log message
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   * @returns {string} Formatted message
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = this.getTimestamp();
    const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] ${message}${metaStr}`;
  }

  /**
   * Colorize console output
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @returns {string} Colorized message
   */
  colorize(level, message) {
    const color = {
      ERROR: COLORS.RED,
      WARN: COLORS.YELLOW,
      INFO: COLORS.CYAN,
      DEBUG: COLORS.GRAY,
      SUCCESS: COLORS.GREEN
    }[level] || COLORS.RESET;

    const emoji = EMOJI[level] || '';
    return `${color}${emoji} ${message}${COLORS.RESET}`;
  }

  /**
   * Log error
   * @param {string} message - Error message
   * @param {Object} meta - Additional metadata
   */
  error(message, meta = {}) {
    if (this.level < LOG_LEVELS.ERROR) return;

    const formatted = this.formatMessage('ERROR', message, meta);
    console.error(this.colorize('ERROR', message), meta);
    this.writeToFile(formatted);
  }

  /**
   * Log warning
   * @param {string} message - Warning message
   * @param {Object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    if (this.level < LOG_LEVELS.WARN) return;

    const formatted = this.formatMessage('WARN', message, meta);
    console.warn(this.colorize('WARN', message), meta);
    this.writeToFile(formatted);
  }

  /**
   * Log info
   * @param {string} message - Info message
   * @param {Object} meta - Additional metadata
   */
  info(message, meta = {}) {
    if (this.level < LOG_LEVELS.INFO) return;

    const formatted = this.formatMessage('INFO', message, meta);
    console.log(this.colorize('INFO', message), meta);
    this.writeToFile(formatted);
  }

  /**
   * Log debug
   * @param {string} message - Debug message
   * @param {Object} meta - Additional metadata
   */
  debug(message, meta = {}) {
    if (this.level < LOG_LEVELS.DEBUG) return;

    const formatted = this.formatMessage('DEBUG', message, meta);
    console.log(this.colorize('DEBUG', message), meta);
    this.writeToFile(formatted);
  }

  /**
   * Log success
   * @param {string} message - Success message
   * @param {Object} meta - Additional metadata
   */
  success(message, meta = {}) {
    const formatted = this.formatMessage('SUCCESS', message, meta);
    console.log(this.colorize('SUCCESS', message), meta);
    this.writeToFile(formatted);
  }

  /**
   * Log application start
   * @param {string} message - Start message
   */
  start(message) {
    console.log(`\n${COLORS.GREEN}${EMOJI.START} ${message}${COLORS.RESET}\n`);
    this.writeToFile(this.formatMessage('START', message));
  }

  /**
   * Log application stop
   * @param {string} message - Stop message
   */
  stop(message) {
    console.log(`\n${COLORS.RED}${EMOJI.STOP} ${message}${COLORS.RESET}\n`);
    this.writeToFile(this.formatMessage('STOP', message));
  }

  /**
   * Log separator
   */
  separator() {
    console.log(COLORS.GRAY + '─'.repeat(80) + COLORS.RESET);
  }
}

// Create singleton instance
const logger = new Logger();

export default logger;
