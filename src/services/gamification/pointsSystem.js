/**
 * Points System
 * نظام النقاط مع المضاعفات
 *
 * Calculates points for completed tasks with various multipliers
 */

import logger from '../../core/logger.js';
import { getShieldBonus } from '../../config/shields.js';

/**
 * Base Points Configuration
 */
export const BASE_POINTS = {
  // Task type points
  TASK_NORMAL: 10,
  TASK_HIGH_PRIORITY: 20,
  TASK_COMPLEX: 30,      // Tasks with many subtasks
  TASK_COLLABORATIVE: 25, // Tasks with multiple assignees
  TASK_URGENT: 15,       // Tasks marked urgent

  // Streak bonuses
  STREAK_3_DAYS: 50,
  STREAK_7_DAYS: 100,
  STREAK_14_DAYS: 250,
  STREAK_30_DAYS: 600,
  STREAK_DAILY_BONUS: 20  // After 30 days, +20 per additional day
};

/**
 * Multipliers Configuration
 */
export const MULTIPLIERS = {
  // Time-based multipliers
  WEEKEND: 1.5,          // Saturday & Friday
  LATE_NIGHT: 1.5,       // After 10 PM
  EARLY_MORNING: 1.2,    // Before 7 AM
  WORKING_HOURS: 1.0,    // 9 AM - 6 PM (normal)

  // Priority-based
  HIGH_PRIORITY: 2.0,
  URGENT: 1.5,

  // Category-based
  OVERDUE_CLEARED: 1.8,  // Completing overdue tasks
  QUICK_COMPLETION: 1.4, // Completed within 1 hour of creation

  // Streak multipliers
  STREAK_ACTIVE: 1.1,    // Currently on a streak (3+ days)
  STREAK_LONG: 1.2       // Long streak (14+ days)
};

/**
 * Calculate base points for a task
 */
export function calculateBasePoints(task) {
  const aiWeight = Number(task?.ai_weight);
  if (Number.isFinite(aiWeight) && aiWeight > 0) {
    return aiWeight;
  }

  let points = BASE_POINTS.TASK_NORMAL;

  // Check priority
  if (task.priority) {
    if (task.priority.id >= 2) { // High or Urgent priority
      points = BASE_POINTS.TASK_HIGH_PRIORITY;
    }
    if (task.priority.priority === 'urgent') {
      points = BASE_POINTS.TASK_URGENT;
    }
  }

  // Check complexity (tasks with subtasks)
  if (task.subtasks && task.subtasks.length > 3) {
    points = BASE_POINTS.TASK_COMPLEX;
  }

  // Check if collaborative
  if (task.assignees && task.assignees.length > 1) {
    points = BASE_POINTS.TASK_COLLABORATIVE;
  }

  return points;
}

/**
 * Calculate time-based multiplier
 */
export function calculateTimeMultiplier(completionDate = new Date()) {
  const date = new Date(completionDate);
  const hour = date.getHours();
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday

  let multiplier = MULTIPLIERS.WORKING_HOURS;

  // Weekend bonus (Friday = 5, Saturday = 6)
  if (day === 5 || day === 6) {
    multiplier = MULTIPLIERS.WEEKEND;
  }

  // Late night bonus (10 PM - 6 AM)
  if (hour >= 22 || hour < 6) {
    multiplier = Math.max(multiplier, MULTIPLIERS.LATE_NIGHT);
  }

  // Early morning bonus (6 AM - 7 AM)
  if (hour >= 6 && hour < 7) {
    multiplier = Math.max(multiplier, MULTIPLIERS.EARLY_MORNING);
  }

  return multiplier;
}

/**
 * Calculate priority-based multiplier
 */
export function calculatePriorityMultiplier(task) {
  let multiplier = 1.0;

  if (task.priority) {
    if (task.priority.priority === 'urgent') {
      multiplier = MULTIPLIERS.URGENT;
    } else if (task.priority.id >= 2) {
      multiplier = MULTIPLIERS.HIGH_PRIORITY;
    }
  }

  return multiplier;
}

/**
 * Calculate situation-based multiplier
 */
export function calculateSituationMultiplier(context) {
  let multiplier = 1.0;

  // Overdue task cleared
  if (context.wasOverdue) {
    multiplier = MULTIPLIERS.OVERDUE_CLEARED;
  }

  // Quick completion (within 1 hour)
  if (context.completedQuickly) {
    multiplier = Math.max(multiplier, MULTIPLIERS.QUICK_COMPLETION);
  }

  return multiplier;
}

/**
 * Calculate streak-based multiplier
 */
export function calculateStreakMultiplier(currentStreak) {
  let multiplier = 1.0;

  if (currentStreak >= 3 && currentStreak < 14) {
    multiplier = MULTIPLIERS.STREAK_ACTIVE;
  } else if (currentStreak >= 14) {
    multiplier = MULTIPLIERS.STREAK_LONG;
  }

  return multiplier;
}

/**
 * Calculate streak bonus points (not multiplier)
 */
export function calculateStreakBonus(currentStreak) {
  let bonus = 0;

  if (currentStreak === 3) {
    bonus = BASE_POINTS.STREAK_3_DAYS;
  } else if (currentStreak === 7) {
    bonus = BASE_POINTS.STREAK_7_DAYS;
  } else if (currentStreak === 14) {
    bonus = BASE_POINTS.STREAK_14_DAYS;
  } else if (currentStreak === 30) {
    bonus = BASE_POINTS.STREAK_30_DAYS;
  } else if (currentStreak > 30) {
    // After 30 days, +20 points per day
    bonus = BASE_POINTS.STREAK_DAILY_BONUS;
  }

  return bonus;
}

/**
 * Main function: Calculate total points for completing a task
 */
export function calculateTaskPoints(task, userStats, context = {}) {
  try {
    // 1. Base points
    const basePoints = calculateBasePoints(task);

    // 2. Time multiplier
    const timeMultiplier = calculateTimeMultiplier(context.completionDate);

    // 3. Priority multiplier
    const priorityMultiplier = calculatePriorityMultiplier(task);

    // 4. Situation multiplier
    const situationMultiplier = calculateSituationMultiplier(context);

    // 5. Streak multiplier
    const streakMultiplier = calculateStreakMultiplier(userStats.currentStreak || 0);

    // 6. Shield bonus (from user's shield level)
    const shieldLevel = userStats.shieldLevel || 1;
    const shieldBonus = getShieldBonus(shieldLevel);
    const shieldMultiplier = 1.0 + shieldBonus;

    // Calculate task points (base * all multipliers)
    const allMultipliers =
      timeMultiplier *
      priorityMultiplier *
      situationMultiplier *
      streakMultiplier *
      shieldMultiplier;

    const taskPoints = Math.round(basePoints * allMultipliers);

    // 7. Streak bonus (flat addition, not multiplier)
    const streakBonus = calculateStreakBonus(userStats.currentStreak || 0);

    // Total points
    const totalPoints = taskPoints + streakBonus;

    logger.debug('Points calculated', {
      basePoints,
      multipliers: {
        time: timeMultiplier,
        priority: priorityMultiplier,
        situation: situationMultiplier,
        streak: streakMultiplier,
        shield: shieldMultiplier,
        total: allMultipliers
      },
      taskPoints,
      streakBonus,
      totalPoints
    });

    return {
      totalPoints,
      breakdown: {
        basePoints,
        multipliers: {
          time: timeMultiplier,
          priority: priorityMultiplier,
          situation: situationMultiplier,
          streak: streakMultiplier,
          shield: shieldMultiplier,
          combined: allMultipliers
        },
        taskPoints,
        streakBonus
      }
    };
  } catch (error) {
    logger.error('Failed to calculate points', { error: error.message });
    return {
      totalPoints: BASE_POINTS.TASK_NORMAL,
      breakdown: { error: error.message }
    };
  }
}

/**
 * Format points breakdown for display
 */
export function formatPointsBreakdown(breakdown) {
  const { basePoints, multipliers, taskPoints, streakBonus } = breakdown;

  let message = `📊 تفصيل النقاط:\n\n`;
  message += `النقاط الأساسية: ${basePoints}\n\n`;

  message += `المضاعفات:\n`;
  if (multipliers.time > 1.0) {
    message += `• وقت الإنجاز: ×${multipliers.time}\n`;
  }
  if (multipliers.priority > 1.0) {
    message += `• الأولوية: ×${multipliers.priority}\n`;
  }
  if (multipliers.situation > 1.0) {
    message += `• الموقف: ×${multipliers.situation}\n`;
  }
  if (multipliers.streak > 1.0) {
    message += `• السلسلة النشطة: ×${multipliers.streak}\n`;
  }
  if (multipliers.shield > 1.0) {
    message += `• بونص الدرع: ×${multipliers.shield}\n`;
  }

  message += `\nنقاط المهمة: ${taskPoints}\n`;

  if (streakBonus > 0) {
    message += `بونص السلسلة: +${streakBonus}\n`;
  }

  return message;
}

/**
 * Calculate points for a batch of tasks
 */
export function calculateBatchPoints(tasks, userStats) {
  let totalPoints = 0;
  const breakdowns = [];

  for (const task of tasks) {
    const result = calculateTaskPoints(task, userStats);
    totalPoints += result.totalPoints;
    breakdowns.push({
      taskId: task.id,
      taskName: task.name,
      points: result.totalPoints
    });
  }

  return {
    totalPoints,
    taskCount: tasks.length,
    averagePoints: Math.round(totalPoints / tasks.length),
    breakdowns
  };
}

export default {
  calculateTaskPoints,
  calculateBatchPoints,
  formatPointsBreakdown,
  BASE_POINTS,
  MULTIPLIERS
};
