/**
 * Helper Utilities
 * دوال مساعدة عامة الاستخدام
 */

import { MESSAGE_LIMITS, ARABIC_DAYS } from '../config/constants.js';

/**
 * Sleep/Delay function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Chunk text into smaller pieces
 * @param {string} text - Text to chunk
 * @param {number} maxLen - Maximum length per chunk
 * @returns {string[]} Array of chunks
 */
export function chunkMessage(text, maxLen = MESSAGE_LIMITS.CHUNK_SIZE) {
  const chunks = [];
  let i = 0;

  while (i < text.length) {
    chunks.push(text.slice(i, i + maxLen));
    i += maxLen;
  }

  return chunks;
}

/**
 * Check if timestamp is today
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {boolean}
 */
export function isToday(timestamp) {
  const date = new Date(Number(timestamp));
  const today = new Date();

  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * Check if timestamp is this week
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {boolean}
 */
export function isThisWeek(timestamp) {
  const date = new Date(Number(timestamp));
  const today = new Date();

  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  return date >= weekAgo && date <= today;
}

/**
 * Get week number of year
 * @param {Date} date - Date object (defaults to now)
 * @returns {number} Week number
 */
export function getWeekNumber(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date - start;
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.floor(diff / oneWeek);
}

/**
 * Format date to Arabic
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted date in Arabic
 */
export function formatDateArabic(timestamp) {
  if (!timestamp) return '';

  const date = new Date(parseInt(timestamp));
  const now = new Date();
  const diffDays = Math.floor((date - now) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'اليوم';
  if (diffDays === 1) return 'غداً';
  if (diffDays === -1) return 'أمس';
  if (diffDays > 0) return `خلال ${diffDays} يوم`;
  if (diffDays < 0) return `قبل ${Math.abs(diffDays)} يوم`;

  return date.toLocaleDateString('ar-EG');
}

/**
 * Get Arabic day name
 * @param {Date} date - Date object
 * @returns {string} Arabic day name
 */
export function getArabicDayName(date = new Date()) {
  return ARABIC_DAYS[date.getDay()];
}

/**
 * Safe JSON parse
 * @param {string} str - JSON string
 * @param {*} defaultValue - Default value if parsing fails
 * @returns {*} Parsed object or default value
 */
export function safeJsonParse(str, defaultValue = null) {
  try {
    return JSON.parse(str);
  } catch (error) {
    return defaultValue;
  }
}

/**
 * Retry async function
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Delay between retries in ms
 * @returns {Promise<*>} Function result
 */
export async function retry(fn, maxRetries = 3, delay = 1000) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (i < maxRetries - 1) {
        await sleep(delay * Math.pow(2, i)); // Exponential backoff
      }
    }
  }

  throw lastError;
}

/**
 * Truncate text
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add (default: '...')
 * @returns {string} Truncated text
 */
export function truncate(text, maxLength, suffix = '...') {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Deep clone object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Remove duplicates from array
 * @param {Array} arr - Array with duplicates
 * @param {string} key - Key to check for uniqueness (for objects)
 * @returns {Array} Array without duplicates
 */
export function removeDuplicates(arr, key = null) {
  if (!key) {
    return [...new Set(arr)];
  }

  const seen = new Set();
  return arr.filter(item => {
    const value = item[key];
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

/**
 * Group array by key
 * @param {Array} arr - Array to group
 * @param {string} key - Key to group by
 * @returns {Object} Grouped object
 */
export function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const group = item[key];
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(item);
    return acc;
  }, {});
}

/**
 * Calculate percentage
 * @param {number} value - Value
 * @param {number} total - Total
 * @returns {number} Percentage (0-100)
 */
export function calculatePercentage(value, total) {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

/**
 * Generate progress bar
 * @param {number} percentage - Percentage (0-100)
 * @param {number} length - Bar length (default: 10)
 * @returns {string} Progress bar
 */
export function generateProgressBar(percentage, length = 10) {
  const filledLength = Math.round((percentage / 100) * length);
  return '█'.repeat(filledLength) + '░'.repeat(length - filledLength);
}

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;

  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in ms
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
  let inThrottle;

  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

export default {
  sleep,
  chunkMessage,
  isToday,
  isThisWeek,
  getWeekNumber,
  formatDateArabic,
  getArabicDayName,
  safeJsonParse,
  retry,
  truncate,
  deepClone,
  removeDuplicates,
  groupBy,
  calculatePercentage,
  generateProgressBar,
  debounce,
  throttle
};
