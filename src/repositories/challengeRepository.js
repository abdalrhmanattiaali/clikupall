/**
 * Challenge Repository
 * إدارة التحديات الأسبوعية
 */

import BaseRepository from './baseRepository.js';
import logger from '../core/logger.js';
import { CHALLENGE_TEMPLATES } from '../config/constants.js';
import { getWeekNumber } from '../utils/helpers.js';

class ChallengeRepository extends BaseRepository {
  constructor() {
    super('challenges.json');
  }

  /**
   * Get default data structure
   * @returns {Object} Empty object
   */
  getDefaultData() {
    return {};
  }

  /**
   * Get current week challenges
   * @returns {Promise<Object|null>} Week challenges or null
   */
  async getCurrentWeekChallenges() {
    const weekNumber = getWeekNumber();
    const data = await this.read();

    return data[weekNumber] || null;
  }

  /**
   * Create challenges for current week
   * @param {number} count - Number of challenges to create (default: 3)
   * @returns {Promise<Object>} Created challenges
   */
  async createWeeklyChallenges(count = 3) {
    const weekNumber = getWeekNumber();

    return await this.update((data) => {
      // Check if already exists
      if (data[weekNumber]) {
        logger.debug('Challenges for this week already exist', { weekNumber });
        return data;
      }

      // Shuffle and select challenges
      const shuffled = [...CHALLENGE_TEMPLATES].sort(() => Math.random() - 0.5);
      const selectedChallenges = shuffled.slice(0, count);

      // Create week challenges
      const weekChallenges = {
        week: weekNumber,
        startDate: Date.now(),
        endDate: Date.now() + (7 * 24 * 60 * 60 * 1000),
        challenges: selectedChallenges,
        participants: {}
      };

      data[weekNumber] = weekChallenges;

      logger.success('Weekly challenges created', {
        weekNumber,
        count: selectedChallenges.length
      });

      return data;
    });
  }

  /**
   * Add participant to challenge
   * @param {string} userId - User ID
   * @param {string} challengeName - Challenge name
   * @returns {Promise<Object>} Updated challenges
   */
  async addParticipant(userId, challengeName) {
    const weekNumber = getWeekNumber();

    return await this.update((data) => {
      if (!data[weekNumber]) {
        logger.warn('No challenges for current week');
        return data;
      }

      if (!data[weekNumber].participants[userId]) {
        data[weekNumber].participants[userId] = {};
      }

      if (!data[weekNumber].participants[userId][challengeName]) {
        data[weekNumber].participants[userId][challengeName] = {
          progress: 0,
          completed: false,
          startedAt: Date.now()
        };

        logger.debug('Participant added to challenge', {
          userId,
          challengeName,
          weekNumber
        });
      }

      return data;
    });
  }

  /**
   * Update participant progress
   * @param {string} userId - User ID
   * @param {string} challengeName - Challenge name
   * @param {number} progress - Current progress
   * @returns {Promise<Object>} Updated challenges
   */
  async updateProgress(userId, challengeName, progress) {
    const weekNumber = getWeekNumber();

    return await this.update((data) => {
      if (!data[weekNumber]) {
        return data;
      }

      if (!data[weekNumber].participants[userId]) {
        data[weekNumber].participants[userId] = {};
      }

      if (!data[weekNumber].participants[userId][challengeName]) {
        data[weekNumber].participants[userId][challengeName] = {
          progress: 0,
          completed: false,
          startedAt: Date.now()
        };
      }

      const participant = data[weekNumber].participants[userId][challengeName];
      participant.progress = progress;

      // Check if completed
      const challenge = data[weekNumber].challenges.find(c => c.name === challengeName);
      if (challenge && progress >= challenge.target) {
        participant.completed = true;
        participant.completedAt = Date.now();

        logger.success('Challenge completed!', {
          userId,
          challengeName,
          progress
        });
      }

      return data;
    });
  }

  /**
   * Get user progress in current week
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User progress
   */
  async getUserProgress(userId) {
    const weekNumber = getWeekNumber();
    const data = await this.read();

    if (!data[weekNumber]) {
      return {};
    }

    return data[weekNumber].participants[userId] || {};
  }

  /**
   * Clean old challenges (older than specified weeks)
   * @param {number} weeksToKeep - Number of weeks to keep (default: 4)
   * @returns {Promise<number>} Number of weeks removed
   */
  async cleanOldChallenges(weeksToKeep = 4) {
    const currentWeek = getWeekNumber();

    return await this.update((data) => {
      const weeks = Object.keys(data).map(Number);
      const oldWeeks = weeks.filter(week => week < currentWeek - weeksToKeep);

      oldWeeks.forEach(week => {
        delete data[week];
      });

      if (oldWeeks.length > 0) {
        logger.info(`Cleaned ${oldWeeks.length} old challenge weeks`, {
          weeksToKeep,
          removed: oldWeeks
        });
      }

      return data;
    });
  }
}

export default new ChallengeRepository();
