/**
 * Validation Utilities
 * دوال التحقق من صحة البيانات
 */

import { ValidationError } from '../core/errors.js';

/**
 * Validate task object
 * @param {Object} task - Task object to validate
 * @throws {ValidationError} If validation fails
 */
export function validateTask(task) {
  if (!task) {
    throw new ValidationError('Task object is required');
  }

  if (!task.id) {
    throw new ValidationError('Task ID is required', { field: 'id' });
  }

  if (!task.name) {
    throw new ValidationError('Task name is required', { field: 'name' });
  }
}

/**
 * Validate user ID
 * @param {number|string} userId - User ID to validate
 * @throws {ValidationError} If validation fails
 */
export function validateUserId(userId) {
  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  const numericId = parseInt(userId, 10);

  if (isNaN(numericId) || numericId <= 0) {
    throw new ValidationError('User ID must be a positive number', { userId });
  }
}

/**
 * Validate email address
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
export function validateEmail(email) {
  if (!email) return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid
 */
export function validatePhone(phone) {
  if (!phone) return false;

  // Simple validation for international format
  const phoneRegex = /^\d{10,15}$/;
  return phoneRegex.test(phone.replace(/\D/g, ''));
}

/**
 * Validate date timestamp
 * @param {number|string} timestamp - Timestamp to validate
 * @returns {boolean} True if valid
 */
export function validateTimestamp(timestamp) {
  if (!timestamp) return false;

  const num = parseInt(timestamp, 10);
  if (isNaN(num)) return false;

  const date = new Date(num);
  return date instanceof Date && !isNaN(date);
}

/**
 * Validate required fields in object
 * @param {Object} obj - Object to validate
 * @param {string[]} requiredFields - Array of required field names
 * @throws {ValidationError} If validation fails
 */
export function validateRequiredFields(obj, requiredFields) {
  if (!obj) {
    throw new ValidationError('Object is required for validation');
  }

  const missing = requiredFields.filter(field => {
    return obj[field] === undefined || obj[field] === null || obj[field] === '';
  });

  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required fields: ${missing.join(', ')}`,
      { missing }
    );
  }
}

/**
 * Sanitize text input
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitizeText(text) {
  if (!text) return '';

  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Validate priority level
 * @param {number} priority - Priority level
 * @returns {boolean} True if valid
 */
export function validatePriority(priority) {
  return priority >= 1 && priority <= 4;
}

/**
 * Validate status
 * @param {string} status - Status to validate
 * @returns {boolean} True if valid
 */
export function validateStatus(status) {
  if (!status) return false;

  const validStatuses = [
    'to do',
    'in progress',
    'review',
    'complete',
    'closed',
    'canceled'
  ];

  return validStatuses.includes(status.toLowerCase());
}

export default {
  validateTask,
  validateUserId,
  validateEmail,
  validatePhone,
  validateTimestamp,
  validateRequiredFields,
  sanitizeText,
  validatePriority,
  validateStatus
};
