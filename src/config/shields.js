/**
 * Shield System Configuration
 * نظام الدروع - 10 مستويات
 *
 * Based on: Total Tasks, Streak Days, and Total Points
 */

export const SHIELD_LEVELS = [
  {
    level: 1,
    name: '🥉 البرونز',
    nameEn: 'Bronze',
    description: 'بداية الرحلة',
    requiredTasks: 0,
    requiredStreak: 0,
    requiredPoints: 0,
    benefits: ['بداية النظام', 'أول خطوة في رحلة النجاح']
  },
  {
    level: 2,
    name: '🛡️ البرونز المتقدم',
    nameEn: 'Advanced Bronze',
    description: 'بداية واعدة',
    requiredTasks: 10,
    requiredStreak: 3,
    requiredPoints: 100,
    benefits: ['مكافأة: +10% نقاط إضافية', 'إشعارات مخصصة']
  },
  {
    level: 3,
    name: '🥈 الفضة',
    nameEn: 'Silver',
    description: 'التزام واضح',
    requiredTasks: 25,
    requiredStreak: 5,
    requiredPoints: 300,
    benefits: ['مكافأة: +15% نقاط إضافية', 'أولوية في التقارير']
  },
  {
    level: 4,
    name: '🥈✨ الفضة المتقدم',
    nameEn: 'Advanced Silver',
    description: 'إنتاجية ملحوظة',
    requiredTasks: 50,
    requiredStreak: 7,
    requiredPoints: 600,
    benefits: ['مكافأة: +20% نقاط إضافية', 'إشعارات تحفيزية خاصة']
  },
  {
    level: 5,
    name: '🥇 الذهب',
    nameEn: 'Gold',
    description: 'إنجازات بطولية',
    requiredTasks: 100,
    requiredStreak: 10,
    requiredPoints: 1200,
    benefits: ['مكافأة: +25% نقاط إضافية', 'ظهور في لوحة الشرف', 'أيقونة ذهبية']
  },
  {
    level: 6,
    name: '🥇⭐ الذهب المتقدم',
    nameEn: 'Advanced Gold',
    description: 'نخبة المنتجين',
    requiredTasks: 200,
    requiredStreak: 14,
    requiredPoints: 2500,
    benefits: ['مكافأة: +30% نقاط إضافية', 'رسائل تحفيزية VIP']
  },
  {
    level: 7,
    name: '💎 البلاتين',
    nameEn: 'Platinum',
    description: 'قمة الاحترافية',
    requiredTasks: 350,
    requiredStreak: 21,
    requiredPoints: 4000,
    benefits: ['مكافأة: +35% نقاط إضافية', 'شارة بلاتينية مميزة', 'تقارير مفصلة']
  },
  {
    level: 8,
    name: '💠 الألماس',
    nameEn: 'Diamond',
    description: 'إنجازات نادرة',
    requiredTasks: 500,
    requiredStreak: 30,
    requiredPoints: 6000,
    benefits: ['مكافأة: +40% نقاط إضافية', 'أيقونة ماسية فريدة', 'ذكر خاص في التقارير']
  },
  {
    level: 9,
    name: '💠👑 الألماس الملكي',
    nameEn: 'Royal Diamond',
    description: 'أساطير الإنتاجية',
    requiredTasks: 750,
    requiredStreak: 45,
    requiredPoints: 9000,
    benefits: ['مكافأة: +50% نقاط إضافية', 'تاج ملكي', 'قدوة للفريق']
  },
  {
    level: 10,
    name: '👑 التاج الإمبراطوري',
    nameEn: 'Imperial Crown',
    description: 'إمبراطور الإنتاجية',
    requiredTasks: 1000,
    requiredStreak: 60,
    requiredPoints: 12000,
    benefits: [
      'مكافأة: +60% نقاط إضافية',
      'التاج الإمبراطوري',
      'رمز النجاح الأعلى',
      'مكانة أسطورية في الفريق',
      'إشعارات وتقارير حصرية'
    ]
  }
];

/**
 * Get shield level by points/tasks/streak
 */
export function calculateShieldLevel(stats) {
  const { totalTasks = 0, currentStreak = 0, totalPoints = 0 } = stats;

  // Find highest eligible level
  let currentLevel = SHIELD_LEVELS[0];

  for (const level of SHIELD_LEVELS) {
    if (
      totalTasks >= level.requiredTasks &&
      currentStreak >= level.requiredStreak &&
      totalPoints >= level.requiredPoints
    ) {
      currentLevel = level;
    } else {
      break; // Stop when requirements not met
    }
  }

  return currentLevel;
}

/**
 * Get next shield level info
 */
export function getNextShieldLevel(currentLevel) {
  const nextLevel = SHIELD_LEVELS.find(s => s.level === currentLevel + 1);
  return nextLevel || null;
}

/**
 * Calculate progress to next level
 */
export function getShieldProgress(stats, currentLevel) {
  const next = getNextShieldLevel(currentLevel);
  if (!next) {
    return { isMax: true, progress: 100 };
  }

  const { totalTasks = 0, currentStreak = 0, totalPoints = 0 } = stats;

  // Calculate percentage for each requirement
  const taskProgress = Math.min(100, (totalTasks / next.requiredTasks) * 100);
  const streakProgress = Math.min(100, (currentStreak / next.requiredStreak) * 100);
  const pointsProgress = Math.min(100, (totalPoints / next.requiredPoints) * 100);

  // Average of all three
  const overallProgress = (taskProgress + streakProgress + pointsProgress) / 3;

  return {
    isMax: false,
    progress: Math.round(overallProgress),
    taskProgress: Math.round(taskProgress),
    streakProgress: Math.round(streakProgress),
    pointsProgress: Math.round(pointsProgress),
    remaining: {
      tasks: Math.max(0, next.requiredTasks - totalTasks),
      streak: Math.max(0, next.requiredStreak - currentStreak),
      points: Math.max(0, next.requiredPoints - totalPoints)
    }
  };
}

/**
 * Get shield bonus multiplier
 */
export function getShieldBonus(level) {
  const bonuses = {
    1: 0,     // 0% bonus
    2: 0.10,  // 10% bonus
    3: 0.15,  // 15%
    4: 0.20,  // 20%
    5: 0.25,  // 25%
    6: 0.30,  // 30%
    7: 0.35,  // 35%
    8: 0.40,  // 40%
    9: 0.50,  // 50%
    10: 0.60  // 60%
  };

  return bonuses[level] || 0;
}

/**
 * Format shield display
 */
export function formatShield(shield) {
  return `${shield.name} - المستوى ${shield.level}
📊 ${shield.description}

المتطلبات:
• ${shield.requiredTasks} مهمة
• ${shield.requiredStreak} يوم سلسلة
• ${shield.requiredPoints} نقطة

المميزات:
${shield.benefits.map(b => `✓ ${b}`).join('\n')}`;
}
