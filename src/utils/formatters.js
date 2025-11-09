/**
 * Formatters Utilities
 * دوال تنسيق النصوص والرسائل
 */

import { getPriorityText, ARABIC_MONTHS } from '../config/constants.js';
import { TEAM, findMemberById, findMemberByEmail } from '../config/team.js';
import { formatDateArabic, calculatePercentage, generateProgressBar } from './helpers.js';
import { shortenUrl } from './urlShortener.js';

/**
 * Get assignee tags for a task
 * @param {Object} task - Task object
 * @returns {string} Formatted assignee tags
 */
export function getAssigneeTags(task) {
  if (!task.assignees || task.assignees.length === 0) {
    return 'غير محدد';
  }

  return task.assignees
    .map(user => {
      const member = findMemberByEmail(user.email) || findMemberById(user.id);
      return member ? `@${member.name}` : (user.username ? `@${user.username}` : 'غير معروف');
    })
    .join('، ');
}

/**
 * Format task for display
 * @param {Object} task - Task object
 * @param {boolean} includeUrl - Include task URL
 * @returns {Promise<string>} Formatted task
 */
export async function formatTask(task, includeUrl = true) {
  let formatted = `📝 *${task.name}*`;

  if (task.parent) {
    formatted += ' (مهمة فرعية)';
  }

  if (task.status?.status) {
    formatted += `\n   الحالة: ${task.status.status}`;
  }

  if (task.priority) {
    formatted += `\n   الأولوية: ${getPriorityText(task.priority)}`;
  }

  if (task.due_date) {
    formatted += `\n   الموعد: ${formatDateArabic(task.due_date)}`;
  }

  const assignees = getAssigneeTags(task);
  if (assignees !== 'غير محدد') {
    formatted += `\n   المسؤول: ${assignees}`;
  }

  if (includeUrl && task.id) {
    const url = `https://app.clickup.com/t/${task.id}`;
    const shortUrl = await shortenUrl(url);
    formatted += `\n   🔗 ${shortUrl}`;
  }

  return formatted;
}

/**
 * Format task list
 * @param {Array} tasks - Array of tasks
 * @param {string} title - List title
 * @returns {Promise<string>} Formatted task list
 */
export async function formatTaskList(tasks, title = 'المهام') {
  if (!tasks || tasks.length === 0) {
    return `📋 *${title}*\n\nلا توجد مهام.`;
  }

  let message = `📋 *${title}* (${tasks.length})\n\n`;

  for (const task of tasks) {
    const url = `https://app.clickup.com/t/${task.id}`;
    const shortUrl = await shortenUrl(url);
    const subtaskIndicator = task.parent ? ' (فرعية)' : '';

    message += `• ${task.name}${subtaskIndicator}\n  🔗 ${shortUrl}\n\n`;
  }

  return message.trim();
}

/**
 * Format daily report for user
 * @param {Object} stats - User statistics
 * @param {string} userName - User name
 * @returns {string} Formatted report
 */
export function formatDailyUserReport(stats, userName) {
  const { completedToday, openTasks, overdueТаsks, todayDue } = stats;

  const total = openTasks.length + completedToday.length;
  const completionRate = calculatePercentage(completedToday.length, total);
  const progressBar = generateProgressBar(completionRate);

  let message = `🌅 *ملخص مهامك لليوم*\n@${userName}\n\n`;
  message += `🎯 المهام المفتوحة: ${openTasks.length}\n`;
  message += `✅ مكتملة اليوم: ${completedToday.length}\n`;
  message += `⚠️ متأخرة: ${overdueТаsks?.length || 0}\n\n`;
  message += `📈 نسبة الإنجاز: ${completionRate}%\n`;
  message += `[${progressBar}]\n`;

  return message;
}

/**
 * Format achievement notification
 * @param {Array} achievements - Array of achievements
 * @param {string} userName - User name
 * @returns {string} Formatted message
 */
export function formatAchievementMessage(achievements, userName) {
  if (!achievements || achievements.length === 0) return null;

  let message = `🎊 *تهانينا ${userName}!* 🎊\n\n`;
  message += `لقد حققت إنجازات جديدة:\n\n`;

  for (const achievement of achievements) {
    message += `${achievement.emoji} *${achievement.name}*\n`;
    message += `   ${achievement.message}\n\n`;
  }

  message += `✨ استمر في هذا الإبداع! كل خطوة تقربك من النجاح الأكبر.`;

  return message;
}

/**
 * Format badge notification
 * @param {Object} badge - Badge object
 * @param {string} userName - User name
 * @returns {string} Formatted message
 */
export function formatBadgeMessage(badge, userName) {
  return `🏅 *شارة جديدة!*\n\n@${userName} حصل على:\n${badge.emoji} *${badge.name}*\n\n${badge.description || 'شارة مميزة!'}`;
}

/**
 * Format challenge notification
 * @param {Object} challenge - Challenge object
 * @returns {string} Formatted message
 */
export function formatChallenge(challenge) {
  const difficultyEmoji = {
    easy: '🟢',
    medium: '🟡',
    hard: '🔴'
  }[challenge.difficulty] || '⚪';

  let message = `${difficultyEmoji} *${challenge.name}*\n`;
  message += `${challenge.description}\n`;
  message += `المكافأة: ${challenge.reward.points} نقطة + ${challenge.reward.badge}\n`;

  return message;
}

/**
 * Format weekly challenges
 * @param {Object} challenges - Challenges data
 * @returns {string} Formatted message
 */
export function formatWeeklyChallenges(challenges) {
  if (!challenges) return null;

  let message = '🎯 *تحديات هذا الأسبوع*\n\n';
  message += `📅 الأسبوع رقم: ${challenges.week}\n\n`;

  challenges.challenges.forEach((challenge, index) => {
    message += `${index + 1}. ${formatChallenge(challenge)}\n`;
  });

  message += '\n💪 هل أنت مستعد للتحدي؟ ابدأ الآن!';

  return message;
}

/**
 * Format monthly report
 * @param {Object} report - Report object
 * @returns {string} Formatted message
 */
export function formatMonthlyReport(report) {
  if (!report) return null;

  let message = `📊 *التقرير الشهري - ${ARABIC_MONTHS[report.month - 1]} ${report.year}*\n\n`;
  message += `📈 إجمالي المهام: ${report.totalTasks}\n`;
  message += `👥 الأعضاء النشطون: ${Object.keys(report.users).length}\n\n`;

  if (report.topPerformer) {
    const topStats = report.users[report.topPerformer];
    message += `🏆 *نجم الشهر: ${report.topPerformer}*\n`;
    message += `   المهام: ${topStats.total}\n`;
    message += `   أيام العمل: ${topStats.days?.size || 0}\n\n`;
  }

  message += `📋 *ملخص الفريق:*\n`;

  for (const [user, stats] of Object.entries(report.users)) {
    const avgPerDay = (stats.total / (stats.days?.size || 1)).toFixed(1);
    message += `\n@${user}:\n`;
    message += `  • المهام: ${stats.total}\n`;
    message += `  • المعدل: ${avgPerDay} مهمة/يوم\n`;

    if (stats.categories) {
      const topCategory = Object.entries(stats.categories)
        .sort((a, b) => b[1] - a[1])[0];

      if (topCategory) {
        message += `  • التخصص: ${topCategory[0]} (${topCategory[1]} مهمة)\n`;
      }
    }
  }

  message += `\n✨ شكراً لجميع الأعضاء على هذا الإنجاز!`;

  return message;
}

/**
 * Format course recommendations
 * @param {Array} recommendations - Course recommendations
 * @returns {string} Formatted message
 */
export function formatCourseRecommendations(recommendations) {
  if (!recommendations || recommendations.length === 0) return null;

  let message = '📚 *كورسات مُرشّحة لك*\n\n';

  for (const rec of recommendations) {
    message += `🎯 *${rec.skill}* (${rec.taskCount} مهمة)\n\n`;

    for (const course of rec.courses) {
      message += `📖 *${course.arabicTitle}*\n`;
      message += `   المنصة: ${course.platform}\n`;
      message += `   المستوى: ${course.level}\n`;
      message += `   المدة: ${course.duration}\n`;
      message += `   التقييم: ${course.rating}/5 ⭐\n`;
      message += `   🔗 ${course.url}\n\n`;
    }
  }

  message += '💡 الاستثمار في تطوير مهاراتك اليوم يضاعف إنتاجيتك غداً!';

  return message;
}

export default {
  getAssigneeTags,
  formatTask,
  formatTaskList,
  formatDailyUserReport,
  formatAchievementMessage,
  formatBadgeMessage,
  formatChallenge,
  formatWeeklyChallenges,
  formatMonthlyReport,
  formatCourseRecommendations
};
