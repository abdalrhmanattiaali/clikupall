/**
 * Custom Error Classes
 * فئات أخطاء مخصصة لتحسين معالجة الأخطاء
 */

/**
 * Base Application Error
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * ClickUp API Error
 */
export class ClickUpError extends AppError {
  constructor(message, details = {}) {
    super(message, 502, details);
    this.service = 'ClickUp';
  }
}

/**
 * WhatsApp Error
 */
export class WhatsAppError extends AppError {
  constructor(message, details = {}) {
    super(message, 502, details);
    this.service = 'WhatsApp';
  }
}

/**
 * AI Service Error
 */
export class AIError extends AppError {
  constructor(message, provider, details = {}) {
    super(message, 502, { ...details, provider });
    this.service = 'AI';
    this.provider = provider;
  }
}

/**
 * Validation Error
 */
export class ValidationError extends AppError {
  constructor(message, fields = {}) {
    super(message, 400, { fields });
  }
}

/**
 * Not Found Error
 */
export class NotFoundError extends AppError {
  constructor(resource, identifier) {
    super(`${resource} not found: ${identifier}`, 404, { resource, identifier });
  }
}

/**
 * Configuration Error
 */
export class ConfigError extends AppError {
  constructor(message, details = {}) {
    super(message, 500, details);
    this.isOperational = false; // Config errors are not operational
  }
}

/**
 * Database Error (for JSON file operations)
 */
export class DatabaseError extends AppError {
  constructor(message, operation, details = {}) {
    super(message, 500, { ...details, operation });
  }
}

export default {
  AppError,
  ClickUpError,
  WhatsAppError,
  AIError,
  ValidationError,
  NotFoundError,
  ConfigError,
  DatabaseError
};
