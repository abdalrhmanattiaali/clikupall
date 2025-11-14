/**
 * Gamification Service
 * خدمة التلعيب الرئيسية - الأوسمة والدروع والنقاط
 *
 * Features:
 * - Badge tracking (40+ badges)
 * - Shield system (10 levels)
 * - Points with multipliers
 * - Streak tracking
 * - Leaderboards
 * - Smart notifications
 */

import logger from '../../core/logger.js';
import whatsappService from '../whatsapp/whatsappService.js';
import achievementRepo from '../../repositories/achievementRepository.js';
import productivityRepo from '../../repositories/productivityRepository.js';
import { TEAM, findMemberById } from '../../config/team.js';
import { ALL_BADGES, getBadgeById, formatBadge, BADGE_RARITY } from '../../config/badges.js';
import {
  SHIELD_LEVELS,
  calculateShieldLevel,
  getNextShieldLevel,
  getShieldProgress,
  formatShield
} from '../../config/shields.js';
import { calculateTaskPoints, formatPointsBreakdown } from './pointsSystem.js';
import { isToday, getWeekNumber, formatDateArabic } from '../../utils/helpers.js';

class GamificationService {
  constructor() {
    this.badgeCheckCache = new Map(); // Cache to avoid duplicate checks
  }

  /**
   * Main entry point: Process completed task
   * Called from webhook controller when task is completed
   */
  async processCompletedTask(task, userId) {
    try {
      logger.info(`Processing gamification for task completion`, {
        taskId: task.id,
        userId
      });

      // Get user stats
      const userStats = await this.getUserStats(userId);

      // Calculate points
      const context = {
        completionDate: new Date(),
        wasOverdue: task.due_date && new Date(parseInt(task.due_date)) < Date.now(),
        completedQuickly: this.isQuickCompletion(task)
      };

      const pointsResult = calculateTaskPoints(task, userStats, context);

      // Update user stats
      await this.updateUserStats(userId, {
        pointsEarned: pointsResult.totalPoints,
        taskCompleted: true
      });

      // Check for new achievements
      const newAchievements = await this.checkAchievements(userId, task);

      // Send notifications
      await this.sendAchievementNotifications(userId, newAchievements, pointsResult);

      return {
        pointsEarned: pointsResult.totalPoints,
        newBadges: newAchievements.newBadges,
        shieldUpgrade: newAchievements.shieldUpgrade
      };
    } catch (error) {
      logger.error('Failed to process gamification', {
        error: error.message,
        taskId: task.id,
        userId
      });
      return null;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId) {
    try {
      const data = await achievementRepo.read();
      const userData = data[userId] || this.createDefaultUserData();

      // Calculate current streak
      const currentStreak = this.calculateStreak(userData.streakHistory || []);

      // Get shield level
      const shieldLevel = calculateShieldLevel({
        totalTasks: userData.totalTasks || 0,
        currentStreak,
        totalPoints: userData.totalPoints || 0
      }).level;

      return {
        ...userData,
        currentStreak,
        shieldLevel
      };
    } catch (error) {
      logger.error('Failed to get user stats', { error: error.message });
      return this.createDefaultUserData();
    }
  }

  /**
   * Create default user data structure
   */
  createDefaultUserData() {
    return {
      totalTasks: 0,
      totalPoints: 0,
      earnedBadges: [],
      shieldLevel: 1,
      streakHistory: [],
      currentStreak: 0,
      longestStreak: 0,
      weeklyTasks: {},
      monthlyTasks: {},
      lastTaskDate: null,
      stats: {
        earlyMorningTasks: 0,
        lateNightTasks: 0,
        weekendTasks: 0,
        highPriorityTasks: 0,
        overdueCleared: 0,
        quickCompletions: 0
      }
    };
  }

  /**
   * Update user statistics
   */
  async updateUserStats(userId, updates) {
    try {
      await achievementRepo.update(async (data) => {
        if (!data[userId]) {
          data[userId] = this.createDefaultUserData();
        }

        const user = data[userId];

        // Update points
        if (updates.pointsEarned) {
          user.totalPoints = (user.totalPoints || 0) + updates.pointsEarned;
        }

        // Update tasks count
        if (updates.taskCompleted) {
          user.totalTasks = (user.totalTasks || 0) + 1;
          user.lastTaskDate = new Date().toISOString();

          // Update streak
          this.updateStreak(user);

          // Update weekly/monthly counters
          this.updatePeriodCounters(user);

          // Update time-based stats
          this.updateTimeBasedStats(user);
        }

        return data;
      });
    } catch (error) {
      logger.error('Failed to update user stats', { error: error.message });
    }
  }

  /**
   * Calculate current streak
   */
  calculateStreak(streakHistory) {
    if (!streakHistory || streakHistory.length === 0) {
      return 0;
    }

    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    let streak = 0;
    const sortedDates = streakHistory
      .map(d => new Date(d).toDateString())
      .sort((a, b) => new Date(b) - new Date(a));

    // Check if task completed today or yesterday
    if (sortedDates[0] !== today && sortedDates[0] !== yesterday) {
      return 0; // Streak broken
    }

    // Count consecutive days
    let expectedDate = new Date();
    for (const dateStr of sortedDates) {
      const date = new Date(dateStr);
      const expected = new Date(expectedDate).toDateString();

      if (date.toDateString() === expected) {
        streak++;
        expectedDate = new Date(expectedDate.getTime() - 86400000); // Go back 1 day
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Update user streak
   */
  updateStreak(userData) {
    if (!userData.streakHistory) {
      userData.streakHistory = [];
    }

    const today = new Date().toDateString();

    // Add today if not already added
    if (!userData.streakHistory.some(d => new Date(d).toDateString() === today)) {
      userData.streakHistory.push(new Date().toISOString());
    }

    // Calculate new streak
    const newStreak = this.calculateStreak(userData.streakHistory);
    userData.currentStreak = newStreak;

    // Update longest streak
    if (newStreak > (userData.longestStreak || 0)) {
      userData.longestStreak = newStreak;
    }
  }

  /**
   * Update weekly/monthly counters
   */
  updatePeriodCounters(userData) {
    const now = new Date();
    const weekKey = `${now.getFullYear()}-W${getWeekNumber(now)}`;
    const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;

    if (!userData.weeklyTasks) userData.weeklyTasks = {};
    if (!userData.monthlyTasks) userData.monthlyTasks = {};

    userData.weeklyTasks[weekKey] = (userData.weeklyTasks[weekKey] || 0) + 1;
    userData.monthlyTasks[monthKey] = (userData.monthlyTasks[monthKey] || 0) + 1;
  }

  /**
   * Update time-based statistics
   */
  updateTimeBasedStats(userData) {
    if (!userData.stats) {
      userData.stats = {};
    }

    const hour = new Date().getHours();
    const day = new Date().getDay();

    // Early morning (before 7 AM)
    if (hour < 7) {
      userData.stats.earlyMorningTasks = (userData.stats.earlyMorningTasks || 0) + 1;
    }

    // Late night (after 10 PM)
    if (hour >= 22) {
      userData.stats.lateNightTasks = (userData.stats.lateNightTasks || 0) + 1;
    }

    // Weekend (Friday or Saturday)
    if (day === 5 || day === 6) {
      userData.stats.weekendTasks = (userData.stats.weekendTasks || 0) + 1;
    }
  }

  /**
   * Check if task was completed quickly
   */
  isQuickCompletion(task) {
    if (!task.date_created || !task.date_closed) {
      return false;
    }

    const created = new Date(parseInt(task.date_created));
    const closed = new Date(parseInt(task.date_closed));
    const hoursDiff = (closed - created) / (1000 * 60 * 60);

    return hoursDiff <= 1; // Completed within 1 hour
  }

  /**
   * Check for new achievements
   */
  async checkAchievements(userId, task) {
    try {
      const userStats = await this.getUserStats(userId);
      const newBadges = [];
      let shieldUpgrade = null;

      // Check all badges
      for (const badge of ALL_BADGES) {
        // Skip if already earned
        if (userStats.earnedBadges && userStats.earnedBadges.includes(badge.id)) {
          continue;
        }

        // Check if requirements met
        if (this.checkBadgeRequirement(badge, userStats, task)) {
          newBadges.push(badge);

          // Award badge
          await achievementRepo.update(async (data) => {
            if (!data[userId].earnedBadges) {
              data[userId].earnedBadges = [];
            }
            data[userId].earnedBadges.push(badge.id);
            return data;
          });

          logger.info(`Badge earned`, { userId, badgeId: badge.id });
        }
      }

      // Check for shield upgrade
      const oldShield = SHIELD_LEVELS.find(s => s.level === userStats.shieldLevel);
      const newShield = calculateShieldLevel({
        totalTasks: userStats.totalTasks,
        currentStreak: userStats.currentStreak,
        totalPoints: userStats.totalPoints
      });

      if (newShield.level > userStats.shieldLevel) {
        shieldUpgrade = {
          from: oldShield,
          to: newShield
        };

        // Update shield level
        await achievementRepo.update(async (data) => {
          data[userId].shieldLevel = newShield.level;
          return data;
        });

        logger.info(`Shield upgraded`, { userId, from: oldShield.level, to: newShield.level });
      }

      return { newBadges, shieldUpgrade };
    } catch (error) {
      logger.error('Failed to check achievements', { error: error.message });
      return { newBadges: [], shieldUpgrade: null };
    }
  }

  /**
   * Check if badge requirement is met
   */
  checkBadgeRequirement(badge, userStats, task) {
    const req = badge.requirement;

    switch (req.type) {
      case 'streak':
        return userStats.currentStreak >= req.value;

      case 'total_tasks':
        return userStats.totalTasks >= req.value;

      case 'week_tasks':
        const weekKey = `${new Date().getFullYear()}-W${getWeekNumber(new Date())}`;
        return (userStats.weeklyTasks?.[weekKey] || 0) >= req.value;

      case 'week_everyday':
        return this.checkWeekEveryday(userStats);

      case 'completion_rate':
        return this.checkCompletionRate(userStats, req.value, req.duration);

      case 'perfect_month':
        return this.checkPerfectMonth(userStats);

      case 'early_tasks':
        return (userStats.stats?.earlyMorningTasks || 0) >= req.value;

      case 'night_tasks':
        return (userStats.stats?.lateNightTasks || 0) >= req.value;

      case 'tasks_per_hour':
        return this.checkTasksPerHour(userStats, req.value);

      case 'daily_tasks':
        return this.checkDailyTasks(userStats, req.value);

      case 'overdue_cleared':
        return (userStats.stats?.overdueCleared || 0) >= req.value;

      case 'weekend_tasks':
        return (userStats.stats?.weekendTasks || 0) >= req.value;

      case 'high_priority_tasks':
        return (userStats.stats?.highPriorityTasks || 0) >= req.value;

      case 'diverse_categories':
        return this.checkDiverseCategories(userStats, req.value);

      // Seasonal badges (check month/season)
      case 'ramadan_tasks':
      case 'january_tasks':
      case 'summer_tasks':
      case 'winter_tasks':
        return this.checkSeasonalTasks(userStats, req.type, req.value);

      default:
        return false;
    }
  }

  /**
   * Check if completed tasks every day of the week
   */
  checkWeekEveryday(userStats) {
    if (!userStats.streakHistory || userStats.streakHistory.length < 7) {
      return false;
    }

    const last7Days = userStats.streakHistory.slice(-7);
    const uniqueDays = new Set(
      last7Days.map(d => new Date(d).toDateString())
    );

    return uniqueDays.size === 7;
  }

  /**
   * Check completion rate
   */
  checkCompletionRate(userStats, targetRate, days) {
    // Simplified: Check if maintained high task count
    // In real implementation, would compare assigned vs completed
    return userStats.currentStreak >= days;
  }

  /**
   * Check perfect month (task every day)
   */
  checkPerfectMonth(userStats) {
    return userStats.currentStreak >= 30;
  }

  /**
   * Check tasks per hour
   */
  async checkTasksPerHour(userStats, required) {
    // Would need to track hourly completion data
    // Simplified for now
    return false;
  }

  /**
   * Check daily tasks count
   */
  async checkDailyTasks(userStats, required) {
    try {
      const todayStats = await productivityRepo.getUserStats(userStats.userId);
      return (todayStats.today || 0) >= required;
    } catch {
      return false;
    }
  }

  /**
   * Check diverse categories
   */
  checkDiverseCategories(userStats, required) {
    // Would need category tracking
    // Simplified for now
    return false;
  }

  /**
   * Check seasonal tasks
   */
  checkSeasonalTasks(userStats, type, required) {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12

    let seasonKey;
    switch (type) {
      case 'ramadan_tasks':
        // Ramadan varies by year - simplified check
        return false; // Would need Islamic calendar integration

      case 'january_tasks':
        seasonKey = `${now.getFullYear()}-1`;
        break;

      case 'summer_tasks':
        // June, July, August
        if (month < 6 || month > 8) return false;
        seasonKey = `summer-${now.getFullYear()}`;
        break;

      case 'winter_tasks':
        // December, January, February
        if (month < 12 && month > 2) return false;
        seasonKey = `winter-${now.getFullYear()}`;
        break;

      default:
        return false;
    }

    return (userStats.monthlyTasks?.[seasonKey] || 0) >= required;
  }

  /**
   * Send achievement notifications
   */
  async sendAchievementNotifications(userId, achievements, pointsResult) {
    try {
      if (!whatsappService.isClientReady()) {
        logger.warn('WhatsApp not ready, skipping notifications');
        return;
      }

      const member = findMemberById(userId);
      if (!member) {
        logger.warn('Member not found', { userId });
        return;
      }

      // Send badge notifications
      for (const badge of achievements.newBadges) {
        await this.sendBadgeNotification(member, badge);
      }

      // Send shield upgrade notification
      if (achievements.shieldUpgrade) {
        await this.sendShieldUpgradeNotification(member, achievements.shieldUpgrade);
      }

      // Send points notification (if significant)
      if (pointsResult.totalPoints >= 50) {
        await this.sendPointsNotification(member, pointsResult);
      }
    } catch (error) {
      logger.error('Failed to send achievement notifications', {
        error: error.message
      });
    }
  }

  /**
   * Send badge earned notification
   */
  async sendBadgeNotification(member, badge) {
    try {
      const rarity = BADGE_RARITY[badge.rarity];

      // Personal message
      const personalMsg = `🎉 تهانينا ${member.name}!

لقد حصلت على وسام جديد:
${formatBadge(badge)}

${rarity.name} ${rarity.emoji}

استمر في التميز! 🚀`;

      await whatsappService.sendToUser(member.phone, personalMsg);

      // Group announcement (for rare+ badges)
      if (badge.rarity === 'rare' || badge.rarity === 'epic' || badge.rarity === 'legendary') {
        const groupMsg = `🏆 إنجاز جديد!

تهانينا لـ *${member.name}*
حصل على وسام:
${badge.name} ${rarity.emoji}

${badge.description}

مبروك! 🎉`;

        await whatsappService.sendToGroup(groupMsg);
      }

      logger.info('Badge notification sent', {
        userId: member.id,
        badgeId: badge.id
      });
    } catch (error) {
      logger.error('Failed to send badge notification', { error: error.message });
    }
  }

  /**
   * Send shield upgrade notification
   */
  async sendShieldUpgradeNotification(member, upgrade) {
    try {
      const { from, to } = upgrade;

      // Personal message
      const personalMsg = `🛡️ *ترقية الدرع!*

مبروك ${member.name}!
لقد وصلت إلى:
${formatShield(to)}

المستوى السابق: ${from.name}
المستوى الجديد: ${to.name}

إنجازات رائعة! 🎊`;

      await whatsappService.sendToUser(member.phone, personalMsg);

      // Group announcement
      const groupMsg = `🛡️ ترقية درع!

تهانينا لـ *${member.name}*
${from.name} → ${to.name}

المستوى: ${to.level}
${to.description}

أحسنت! 👏`;

      await whatsappService.sendToGroup(groupMsg);

      logger.info('Shield upgrade notification sent', {
        userId: member.id,
        from: from.level,
        to: to.level
      });
    } catch (error) {
      logger.error('Failed to send shield notification', { error: error.message });
    }
  }

  /**
   * Send points notification
   */
  async sendPointsNotification(member, pointsResult) {
    try {
      const msg = `⭐ *نقاط جديدة!*

${member.name}, لقد ربحت:
*${pointsResult.totalPoints} نقطة*

${formatPointsBreakdown(pointsResult.breakdown)}

إجمالي نقاطك الآن في ازدياد! 📈`;

      await whatsappService.sendToUser(member.phone, msg);
    } catch (error) {
      logger.error('Failed to send points notification', { error: error.message });
    }
  }

  /**
   * Get leaderboard data
   */
  async getLeaderboard(type = 'points') {
    try {
      const data = await achievementRepo.read();
      const leaderboard = [];

      for (const [userId, userData] of Object.entries(data)) {
        const member = findMemberById(parseInt(userId));
        if (!member) continue;

        leaderboard.push({
          userId: parseInt(userId),
          name: member.name,
          totalPoints: userData.totalPoints || 0,
          totalTasks: userData.totalTasks || 0,
          shieldLevel: userData.shieldLevel || 1,
          currentStreak: this.calculateStreak(userData.streakHistory || []),
          badgeCount: userData.earnedBadges?.length || 0
        });
      }

      // Sort by type
      if (type === 'points') {
        leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
      } else if (type === 'tasks') {
        leaderboard.sort((a, b) => b.totalTasks - a.totalTasks);
      } else if (type === 'streak') {
        leaderboard.sort((a, b) => b.currentStreak - a.currentStreak);
      }

      return leaderboard;
    } catch (error) {
      logger.error('Failed to get leaderboard', { error: error.message });
      return [];
    }
  }

  /**
   * Generate weekly achievement report for user
   */
  async generateWeeklyReport(userId) {
    try {
      const userStats = await this.getUserStats(userId);
      const member = findMemberById(userId);

      if (!member) {
        return null;
      }

      const weekKey = `${new Date().getFullYear()}-W${getWeekNumber(new Date())}`;
      const weekTasks = userStats.weeklyTasks?.[weekKey] || 0;

      const shield = SHIELD_LEVELS.find(s => s.level === userStats.shieldLevel);
      const nextShield = getNextShieldLevel(userStats.shieldLevel);
      const progress = getShieldProgress(userStats, userStats.shieldLevel);

      let report = `📊 *تقرير الأسبوع - ${member.name}*\n\n`;

      report += `📈 الإحصائيات:\n`;
      report += `• المهام هذا الأسبوع: ${weekTasks}\n`;
      report += `• إجمالي المهام: ${userStats.totalTasks}\n`;
      report += `• النقاط الكلية: ${userStats.totalPoints}\n`;
      report += `• السلسلة الحالية: ${userStats.currentStreak} يوم 🔥\n\n`;

      report += `🛡️ الدرع:\n`;
      report += `${shield.name} - المستوى ${shield.level}\n\n`;

      if (nextShield && !progress.isMax) {
        report += `📍 التقدم للمستوى التالي (${nextShield.name}):\n`;
        report += `• المهام: ${userStats.totalTasks}/${nextShield.requiredTasks} (${progress.taskProgress}%)\n`;
        report += `• السلسلة: ${userStats.currentStreak}/${nextShield.requiredStreak} (${progress.streakProgress}%)\n`;
        report += `• النقاط: ${userStats.totalPoints}/${nextShield.requiredPoints} (${progress.pointsProgress}%)\n\n`;
      }

      report += `🏆 الأوسمة:\n`;
      report += `حصلت على ${userStats.earnedBadges?.length || 0} وسام\n\n`;

      // Show recent badges (last 3)
      if (userStats.earnedBadges && userStats.earnedBadges.length > 0) {
        const recentBadges = userStats.earnedBadges.slice(-3);
        report += `آخر الأوسمة:\n`;
        for (const badgeId of recentBadges) {
          const badge = getBadgeById(badgeId);
          if (badge) {
            report += `• ${badge.name}\n`;
          }
        }
        report += `\n`;
      }

      report += `استمر في التميز! 💪`;

      return report;
    } catch (error) {
      logger.error('Failed to generate weekly report', { error: error.message });
      return null;
    }
  }
}

// Create singleton instance
const gamificationService = new GamificationService();

export default gamificationService;
