/**
 * Achievement Repository
 * إدارة الإنجازات والشارات
 */

import BaseRepository from './baseRepository.js';
import logger from '../core/logger.js';

class AchievementRepository extends BaseRepository {
  constructor() {
    super('achievements.json');
  }

  /**
   * Get default data structure
   * @returns {Object} Empty object
   */
  getDefaultData() {
    return {};
  }

  /**
   * Get user achievements
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User achievements
   */
  async getUserAchievements(userId) {
    const data = await this.read();

    if (!data[userId]) {
      return {
        milestones: [],
        weeklyRecords: [],
        totalTasks: 0,
        lastUpdated: Date.now()
      };
    }

    return data[userId];
  }

  /**
   * Add achievement to user
   * @param {string} userId - User ID
   * @param {Object} achievement - Achievement object
   * @returns {Promise<Object>} Updated achievements
   */
  async addAchievement(userId, achievement) {
    return await this.update((data) => {
      if (!data[userId]) {
        data[userId] = {
          milestones: [],
          weeklyRecords: [],
          totalTasks: 0,
          lastUpdated: Date.now()
        };
      }

      const userAchievements = data[userId];

      // Add to appropriate category
      if (achievement.type === 'milestone') {
        if (!userAchievements.milestones.includes(achievement.name)) {
          userAchievements.milestones.push(achievement.name);
          logger.debug('Milestone added', { userId, achievement: achievement.name });
        }
      } else if (achievement.type === 'weekly') {
        const weekKey = `weekly_${achievement.name}_${achievement.week || Date.now()}`;
        if (!userAchievements.weeklyRecords.includes(weekKey)) {
          userAchievements.weeklyRecords.push(weekKey);
          logger.debug('Weekly achievement added', { userId, achievement: achievement.name });
        }
      }

      userAchievements.lastUpdated = Date.now();

      return data;
    });
  }

  /**
   * Update user task count
   * @param {string} userId - User ID
   * @param {number} totalTasks - Total completed tasks
   * @returns {Promise<Object>} Updated achievements
   */
  async updateTaskCount(userId, totalTasks) {
    return await this.update((data) => {
      if (!data[userId]) {
        data[userId] = {
          milestones: [],
          weeklyRecords: [],
          totalTasks: 0,
          lastUpdated: Date.now()
        };
      }

      data[userId].totalTasks = totalTasks;
      data[userId].lastUpdated = Date.now();

      return data;
    });
  }

  /**
   * Check if user has achievement
   * @param {string} userId - User ID
   * @param {string} achievementName - Achievement name
   * @param {string} type - Achievement type ('milestone' or 'weekly')
   * @returns {Promise<boolean>} True if user has achievement
   */
  async hasAchievement(userId, achievementName, type = 'milestone') {
    const achievements = await this.getUserAchievements(userId);

    if (type === 'milestone') {
      return achievements.milestones.includes(achievementName);
    } else if (type === 'weekly') {
      return achievements.weeklyRecords.some(record => record.includes(achievementName));
    }

    return false;
  }
}

export default new AchievementRepository();
