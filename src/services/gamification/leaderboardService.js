/**
 * Leaderboard Service
 * خدمة جداول المتصدرين
 *
 * Generates and formats leaderboards for:
 * - Points
 * - Tasks completed
 * - Current streak
 * - Weekly performance
 */

import logger from '../../core/logger.js';
import gamificationService from './gamificationService.js';
import whatsappService from '../whatsapp/whatsappService.js';
import { SHIELD_LEVELS } from '../../config/shields.js';
import { generateProgressBar } from '../../utils/helpers.js';

class LeaderboardService {
  /**
   * Generate leaderboard message
   */
  async generateLeaderboard(type = 'points', limit = 10) {
    try {
      const leaderboard = await gamificationService.getLeaderboard(type);
      const topPlayers = leaderboard.slice(0, limit);

      if (topPlayers.length === 0) {
        return 'لا توجد بيانات متاحة حالياً';
      }

      let message = this.getLeaderboardHeader(type);

      topPlayers.forEach((player, index) => {
        const medal = this.getMedal(index + 1);
        const shield = SHIELD_LEVELS.find(s => s.level === player.shieldLevel);

        message += `\n${medal} *${player.name}*`;

        if (type === 'points') {
          message += `\n   💰 ${player.totalPoints.toLocaleString()} نقطة`;
          message += `\n   🛡️ ${shield.name}`;
        } else if (type === 'tasks') {
          message += `\n   ✅ ${player.totalTasks} مهمة`;
          message += `\n   🔥 ${player.currentStreak} يوم متتالي`;
        } else if (type === 'streak') {
          message += `\n   🔥 ${player.currentStreak} يوم`;
          message += `\n   ✅ ${player.totalTasks} مهمة`;
        }

        message += `\n   🏆 ${player.badgeCount} وسام\n`;
      });

      message += `\n───────────────`;
      message += `\nآخر تحديث: ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`;

      return message;
    } catch (error) {
      logger.error('Failed to generate leaderboard', { error: error.message });
      return 'حدث خطأ في إنشاء جدول المتصدرين';
    }
  }

  /**
   * Get leaderboard header
   */
  getLeaderboardHeader(type) {
    const headers = {
      points: '💎 *جدول المتصدرين - النقاط*\n🏆 أعلى 10 لاعبين\n\n───────────────',
      tasks: '📊 *جدول المتصدرين - المهام*\n🏆 أعلى 10 منتجين\n\n───────────────',
      streak: '🔥 *جدول المتصدرين - السلاسل*\n🏆 أطول السلاسل المتتالية\n\n───────────────'
    };

    return headers[type] || headers.points;
  }

  /**
   * Get medal emoji for position
   */
  getMedal(position) {
    const medals = {
      1: '🥇',
      2: '🥈',
      3: '🥉'
    };

    return medals[position] || `${position}.`;
  }

  /**
   * Send leaderboard to WhatsApp group
   */
  async sendLeaderboardToGroup(type = 'points') {
    try {
      if (!whatsappService.isClientReady()) {
        logger.warn('WhatsApp not ready, cannot send leaderboard');
        return false;
      }

      const message = await this.generateLeaderboard(type);
      await whatsappService.sendToGroup(message, { linkPreview: false });

      logger.info(`Leaderboard sent to group`, { type });
      return true;
    } catch (error) {
      logger.error('Failed to send leaderboard', { error: error.message });
      return false;
    }
  }

  /**
   * Generate comprehensive leaderboard (all categories)
   */
  async generateComprehensiveLeaderboard() {
    try {
      let message = `🏆 *جداول المتصدرين الأسبوعية*\n`;
      message += `${new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n\n`;
      message += `═══════════════════\n\n`;

      // Points leaderboard
      const pointsLeaderboard = await gamificationService.getLeaderboard('points');
      message += `💎 *أعلى النقاط*\n`;
      pointsLeaderboard.slice(0, 3).forEach((player, idx) => {
        const medal = this.getMedal(idx + 1);
        message += `${medal} ${player.name}: ${player.totalPoints.toLocaleString()}\n`;
      });
      message += `\n`;

      // Tasks leaderboard
      const tasksLeaderboard = await gamificationService.getLeaderboard('tasks');
      message += `✅ *أكثر إنتاجية*\n`;
      tasksLeaderboard.slice(0, 3).forEach((player, idx) => {
        const medal = this.getMedal(idx + 1);
        message += `${medal} ${player.name}: ${player.totalTasks} مهمة\n`;
      });
      message += `\n`;

      // Streak leaderboard
      const streakLeaderboard = await gamificationService.getLeaderboard('streak');
      message += `🔥 *أطول السلاسل*\n`;
      streakLeaderboard.slice(0, 3).forEach((player, idx) => {
        const medal = this.getMedal(idx + 1);
        message += `${medal} ${player.name}: ${player.currentStreak} يوم\n`;
      });
      message += `\n`;

      message += `═══════════════════\n`;
      message += `استمروا في التميز! 💪`;

      return message;
    } catch (error) {
      logger.error('Failed to generate comprehensive leaderboard', { error: error.message });
      return 'حدث خطأ في إنشاء التقرير';
    }
  }

  /**
   * Send comprehensive leaderboard
   */
  async sendComprehensiveLeaderboard() {
    try {
      if (!whatsappService.isClientReady()) {
        logger.warn('WhatsApp not ready');
        return false;
      }

      const message = await this.generateComprehensiveLeaderboard();
      await whatsappService.sendToGroup(message, { linkPreview: false });

      logger.info('Comprehensive leaderboard sent');
      return true;
    } catch (error) {
      logger.error('Failed to send comprehensive leaderboard', { error: error.message });
      return false;
    }
  }

  /**
   * Get user rank in leaderboard
   */
  async getUserRank(userId, type = 'points') {
    try {
      const leaderboard = await gamificationService.getLeaderboard(type);
      const index = leaderboard.findIndex(p => p.userId === userId);

      if (index === -1) {
        return null;
      }

      return {
        rank: index + 1,
        total: leaderboard.length,
        data: leaderboard[index]
      };
    } catch (error) {
      logger.error('Failed to get user rank', { error: error.message });
      return null;
    }
  }

  /**
   * Format user rank message
   */
  async formatUserRankMessage(userId, userName) {
    try {
      const pointsRank = await this.getUserRank(userId, 'points');
      const tasksRank = await this.getUserRank(userId, 'tasks');
      const streakRank = await this.getUserRank(userId, 'streak');

      let message = `🎯 *ترتيبك - ${userName}*\n\n`;

      if (pointsRank) {
        message += `💎 النقاط: #${pointsRank.rank} من ${pointsRank.total}\n`;
        message += `   ${pointsRank.data.totalPoints.toLocaleString()} نقطة\n\n`;
      }

      if (tasksRank) {
        message += `✅ المهام: #${tasksRank.rank} من ${tasksRank.total}\n`;
        message += `   ${tasksRank.data.totalTasks} مهمة\n\n`;
      }

      if (streakRank) {
        message += `🔥 السلسلة: #${streakRank.rank} من ${streakRank.total}\n`;
        message += `   ${streakRank.data.currentStreak} يوم\n\n`;
      }

      const shield = SHIELD_LEVELS.find(s => s.level === pointsRank?.data.shieldLevel);
      if (shield) {
        message += `🛡️ ${shield.name} - المستوى ${shield.level}\n`;
        message += `🏆 ${pointsRank.data.badgeCount} وسام\n`;
      }

      return message;
    } catch (error) {
      logger.error('Failed to format user rank', { error: error.message });
      return 'حدث خطأ في عرض ترتيبك';
    }
  }
}

// Create singleton instance
const leaderboardService = new LeaderboardService();

export default leaderboardService;
