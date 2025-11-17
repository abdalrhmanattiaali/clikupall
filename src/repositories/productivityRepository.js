/**
 * Productivity Data Repository
 * إدارة بيانات الإنتاجية والمهام المكتملة
 */

import BaseRepository from './baseRepository.js';
import logger from '../core/logger.js';
import { isToday, isThisWeek } from '../utils/helpers.js';

class ProductivityRepository extends BaseRepository {
  constructor() {
    super('productivity_data.json');
  }

  /**
   * Get default data structure
   * @returns {Array} Empty array
   */
  getDefaultData() {
    return [];
  }

  /**
   * Add productivity entry
   * @param {Object} entry - Productivity entry
   * @returns {Promise<Object>} Added entry
   */
  async addEntry(entry) {
    try {
      const data = await this.read(false);

      const aliasMap = new Map();
      const addAlias = (value) => {
        if (value === undefined || value === null) {
          return;
        }

        const normalized = String(value).trim();
        if (!normalized) {
          return;
        }

        if (!aliasMap.has(normalized)) {
          aliasMap.set(normalized, normalized);
        }
      };

      if (Array.isArray(entry.userAliases)) {
        entry.userAliases.forEach(addAlias);
      }

      if (entry.userId) {
        addAlias(entry.userId);
      }

      const newEntry = {
        ...entry,
        userAliases: Array.from(aliasMap.values()),
        timestamp: entry.timestamp || Date.now()
      };

      data.push(newEntry);
      await this.write(data);

      logger.debug('Productivity entry added', {
        userId: entry.userId,
        taskId: entry.taskId
      });

      return newEntry;
    } catch (error) {
      logger.error('Failed to add productivity entry', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get all entries for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} User entries
   */
  async getUserEntries(userIdentifier) {
    const identifiers = this.buildIdentifierSet(userIdentifier);

    if (!identifiers || identifiers.size === 0) {
      return [];
    }

    const data = await this.read();
    return data.filter(entry => this.entryMatchesIdentifiers(entry, identifiers));
  }

  /**
   * Get today's entries for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Today's entries
   */
  async getUserTodayEntries(userIdentifier) {
    const entries = await this.getUserEntries(userIdentifier);
    return entries.filter(entry => isToday(entry.timestamp));
  }

  /**
   * Get this week's entries for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Week's entries
   */
  async getUserWeekEntries(userIdentifier) {
    const entries = await this.getUserEntries(userIdentifier);
    return entries.filter(entry => isThisWeek(entry.timestamp));
  }

  /**
   * Get entries by date range
   * @param {string} userId - User ID
   * @param {number} startDate - Start timestamp
   * @param {number} endDate - End timestamp
   * @returns {Promise<Array>} Filtered entries
   */
  async getUserEntriesByDateRange(userIdentifier, startDate, endDate) {
    const entries = await this.getUserEntries(userIdentifier);
    return entries.filter(entry => {
      return entry.timestamp >= startDate && entry.timestamp <= endDate;
    });
  }

  /**
   * Get total completed tasks count for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Total count
   */
  async getUserTotalCount(userIdentifier) {
    const entries = await this.getUserEntries(userIdentifier);
    return entries.length;
  }

  /**
   * Get user statistics
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User statistics
   */
  async getUserStats(userIdentifier) {
    const allEntries = await this.getUserEntries(userIdentifier);
    const todayEntries = allEntries.filter(e => isToday(e.timestamp));
    const weekEntries = allEntries.filter(e => isThisWeek(e.timestamp));

    // Category analysis
    const categories = {};
    allEntries.forEach(entry => {
      if (entry.categories) {
        entry.categories.forEach(cat => {
          categories[cat] = (categories[cat] || 0) + 1;
        });
      }
    });

    // Day analysis
    const dayStats = {};
    allEntries.forEach(entry => {
      const date = new Date(entry.timestamp);
      const dayName = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][date.getDay()];
      dayStats[dayName] = (dayStats[dayName] || 0) + 1;
    });

    // Find most productive day
    let mostProductiveDay = null;
    let maxCount = 0;
    Object.entries(dayStats).forEach(([day, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostProductiveDay = day;
      }
    });

    // Find top category
    const topCategory = Object.entries(categories)
      .sort((a, b) => b[1] - a[1])[0];

    return {
      total: allEntries.length,
      today: todayEntries.length,
      week: weekEntries.length,
      categories,
      dayStats,
      mostProductiveDay,
      mostProductiveDayCount: maxCount,
      topCategory: topCategory ? topCategory[0] : null,
      topCategoryCount: topCategory ? topCategory[1] : 0
    };
  }

  /**
   * Get all users statistics
   * @returns {Promise<Object>} All users stats
   */
  async getAllUsersStats() {
    const data = await this.read();
    const users = {};

    data.forEach(entry => {
      if (!users[entry.userId]) {
        users[entry.userId] = {
          total: 0,
          today: 0,
          week: 0
        };
      }

      users[entry.userId].total++;

      if (isToday(entry.timestamp)) {
        users[entry.userId].today++;
      }

      if (isThisWeek(entry.timestamp)) {
        users[entry.userId].week++;
      }
    });

    return users;
  }

  normalizeIdentifier(value) {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = String(value).trim();
    if (!normalized) {
      return null;
    }

    return normalized.toLowerCase();
  }

  buildIdentifierSet(identifier) {
    const identifiers = new Set();

    const addIdentifier = (value) => {
      const normalized = this.normalizeIdentifier(value);
      if (normalized) {
        identifiers.add(normalized);
      }
    };

    if (Array.isArray(identifier)) {
      identifier.forEach(addIdentifier);
    } else if (identifier && typeof identifier === 'object') {
      addIdentifier(identifier.id);
      addIdentifier(identifier.userId);
      addIdentifier(identifier.name);
      addIdentifier(identifier.email);
      addIdentifier(identifier.username);
      addIdentifier(identifier.phone);

      if (Array.isArray(identifier.aliases)) {
        identifier.aliases.forEach(addIdentifier);
      }

      if (Array.isArray(identifier.userAliases)) {
        identifier.userAliases.forEach(addIdentifier);
      }

      if (identifier.statsKey) {
        addIdentifier(identifier.statsKey);
      }
    } else {
      addIdentifier(identifier);
    }

    return identifiers;
  }

  entryMatchesIdentifiers(entry, identifierSet) {
    if (!identifierSet || identifierSet.size === 0) {
      return false;
    }

    const values = [];

    if (entry.userId) {
      values.push(entry.userId);
    }

    if (Array.isArray(entry.userAliases)) {
      values.push(...entry.userAliases);
    }

    return values
      .map(value => this.normalizeIdentifier(value))
      .filter(Boolean)
      .some(value => identifierSet.has(value));
  }

  /**
   * Clean old entries (older than specified days)
   * @param {number} daysToKeep - Number of days to keep (0 = keep all)
   * @returns {Promise<number>} Number of entries removed
   */
  async cleanOldEntries(daysToKeep = 0) {
    if (daysToKeep === 0) {
      logger.info('Keeping all productivity data (no cleanup)');
      return 0;
    }

    const data = await this.read(false);
    const cutoffDate = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    const filtered = data.filter(entry => entry.timestamp >= cutoffDate);
    const removed = data.length - filtered.length;

    if (removed > 0) {
      await this.write(filtered);
      logger.info(`Cleaned ${removed} old productivity entries`, {
        daysToKeep,
        remaining: filtered.length
      });
    }

    return removed;
  }
}

export default new ProductivityRepository();
