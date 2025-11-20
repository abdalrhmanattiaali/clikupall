/**
 * Badge Definitions
 * تعريف جميع الأوسمة والإنجازات في النظام
 *
 * 6 Categories with 40+ Badges Total
 */

export const BADGE_CATEGORIES = {
  STREAKS: 'سلاسل_متتالية',
  QUANTITY: 'الكمية',
  WEEKLY: 'أداء_أسبوعي',
  CONSISTENCY: 'المواظبة',
  CHALLENGES: 'التحديات',
  SEASONAL: 'موسمية'
};

/**
 * 1. Streak Badges (سلاسل متتالية) 🔥
 * Based on consecutive days of completing tasks
 */
export const STREAK_BADGES = [
  {
    id: 'streak_3',
    name: '🔥 شرارة الانطلاق',
    nameEn: 'Spark of Momentum',
    description: '3 أيام متتالية من الإنجاز',
    category: BADGE_CATEGORIES.STREAKS,
    requirement: { type: 'streak', value: 3 },
    points: 50,
    rarity: 'common'
  },
  {
    id: 'streak_7',
    name: '⚡ أسبوع الانضباط',
    nameEn: 'Discipline Week',
    description: '7 أيام متتالية بإيقاع ثابت',
    category: BADGE_CATEGORIES.STREAKS,
    requirement: { type: 'streak', value: 7 },
    points: 100,
    rarity: 'common'
  },
  {
    id: 'streak_14',
    name: '💪 أسبوعان من الثبات',
    nameEn: 'Fortnight of Focus',
    description: '14 يوماً بنفس الوتيرة',
    category: BADGE_CATEGORIES.STREAKS,
    requirement: { type: 'streak', value: 14 },
    points: 250,
    rarity: 'uncommon'
  },
  {
    id: 'streak_21',
    name: '🌟 ثلاثة أسابيع ذهبية',
    nameEn: 'Three Golden Weeks',
    description: '21 يوماً متواصلاً بلا انقطاع',
    category: BADGE_CATEGORIES.STREAKS,
    requirement: { type: 'streak', value: 21 },
    points: 400,
    rarity: 'uncommon'
  },
  {
    id: 'streak_30',
    name: '👑 شهر الالتزام',
    nameEn: 'Commitment Month',
    description: '30 يوماً كاملة من الإنجاز',
    category: BADGE_CATEGORIES.STREAKS,
    requirement: { type: 'streak', value: 30 },
    points: 600,
    rarity: 'rare'
  },
  {
    id: 'streak_50',
    name: '💎 خمسون يوماً من الزخم',
    nameEn: 'Fifty-Day Momentum',
    description: '50 يوماً متصلة تعني نظاماً ثابتاً',
    category: BADGE_CATEGORIES.STREAKS,
    requirement: { type: 'streak', value: 50 },
    points: 1000,
    rarity: 'rare'
  },
  {
    id: 'streak_100',
    name: '🏆 المئة الماسية',
    nameEn: 'Diamond Hundred',
    description: '100 يوم متتالي تصنع نمط حياة',
    category: BADGE_CATEGORIES.STREAKS,
    requirement: { type: 'streak', value: 100 },
    points: 2000,
    rarity: 'epic'
  },
  {
    id: 'streak_365',
    name: '🌟👑 أسطورة السنة الكاملة',
    nameEn: 'Full-Year Legend',
    description: '365 يوماً متتالياً من الالتزام',
    category: BADGE_CATEGORIES.STREAKS,
    requirement: { type: 'streak', value: 365 },
    points: 5000,
    rarity: 'legendary'
  }
];

/**
 * 2. Quantity Badges (أوسمة الكمية) 📈
 * Based on total completed tasks
 */
export const QUANTITY_BADGES = [
  {
    id: 'tasks_10',
    name: '📌 أول عشرة منجزة',
    nameEn: 'First Ten Done',
    description: '10 مهام مكتملة تفتح الطريق',
    category: BADGE_CATEGORIES.QUANTITY,
    requirement: { type: 'total_tasks', value: 10 },
    points: 50,
    rarity: 'common'
  },
  {
    id: 'tasks_25',
    name: '🎯 خمسة وعشرون رشيقة',
    nameEn: 'Agile Twenty-Five',
    description: '25 مهمة مكتملة تثبت الجدية',
    category: BADGE_CATEGORIES.QUANTITY,
    requirement: { type: 'total_tasks', value: 25 },
    points: 100,
    rarity: 'common'
  },
  {
    id: 'tasks_50',
    name: '⭐ خمسون بثبات',
    nameEn: 'Steady Fifty',
    description: '50 مهمة مكتملة بإيقاع واضح',
    category: BADGE_CATEGORIES.QUANTITY,
    requirement: { type: 'total_tasks', value: 50 },
    points: 200,
    rarity: 'uncommon'
  },
  {
    id: 'tasks_100',
    name: '💯 مئة إنجاز',
    nameEn: 'Century of Tasks',
    description: '100 مهمة مكتملة ترسّخ الاعتمادية',
    category: BADGE_CATEGORIES.QUANTITY,
    requirement: { type: 'total_tasks', value: 100 },
    points: 400,
    rarity: 'uncommon'
  },
  {
    id: 'tasks_250',
    name: '🌟 ربع ألف محترف',
    nameEn: 'Quarter-Thousand Pro',
    description: '250 مهمة مكتملة تعكس نضجاً مهنياً',
    category: BADGE_CATEGORIES.QUANTITY,
    requirement: { type: 'total_tasks', value: 250 },
    points: 800,
    rarity: 'rare'
  },
  {
    id: 'tasks_500',
    name: '💎 نصف ألف متقن',
    nameEn: 'Half-Thousand Achiever',
    description: '500 مهمة مكتملة تثبت احترافية عالية',
    category: BADGE_CATEGORIES.QUANTITY,
    requirement: { type: 'total_tasks', value: 500 },
    points: 1500,
    rarity: 'rare'
  },
  {
    id: 'tasks_1000',
    name: '👑 الألف المتوهجة',
    nameEn: 'Glowing Thousand',
    description: '1000 مهمة مكتملة تضعك في فئة النخبة',
    category: BADGE_CATEGORIES.QUANTITY,
    requirement: { type: 'total_tasks', value: 1000 },
    points: 3000,
    rarity: 'epic'
  },
  {
    id: 'tasks_2500',
    name: '🏆 سيد الإنتاجية',
    nameEn: 'Productivity Master',
    description: '2500 مهمة مكتملة تعني قيادة الفريق',
    category: BADGE_CATEGORIES.QUANTITY,
    requirement: { type: 'total_tasks', value: 2500 },
    points: 6000,
    rarity: 'epic'
  },
  {
    id: 'tasks_5000',
    name: '🌟👑 إمبراطور الإنتاجية',
    nameEn: 'Productivity Emperor',
    description: '5000 مهمة مكتملة تضعك في قمة الإنجاز',
    category: BADGE_CATEGORIES.QUANTITY,
    requirement: { type: 'total_tasks', value: 5000 },
    points: 10000,
    rarity: 'legendary'
  }
];

/**
 * 3. Weekly Performance Badges (أداء أسبوعي) 📅
 */
export const WEEKLY_BADGES = [
  {
    id: 'week_5',
    name: '📅 دفعة أسبوعية',
    nameEn: 'Weekly Kickoff',
    description: '5 مهام في أسبوع واحد تبني الزخم',
    category: BADGE_CATEGORIES.WEEKLY,
    requirement: { type: 'week_tasks', value: 5 },
    points: 30,
    rarity: 'common'
  },
  {
    id: 'week_10',
    name: '⚡ أسبوع متسارع',
    nameEn: 'Accelerated Week',
    description: '10 مهام في أسبوع واحد بإيقاع ثابت',
    category: BADGE_CATEGORIES.WEEKLY,
    requirement: { type: 'week_tasks', value: 10 },
    points: 60,
    rarity: 'common'
  },
  {
    id: 'week_15',
    name: '🔥 أسبوع ناري',
    nameEn: 'Hot Week',
    description: '15 مهمة في أسبوع واحد تثبت جاهزية عالية',
    category: BADGE_CATEGORIES.WEEKLY,
    requirement: { type: 'week_tasks', value: 15 },
    points: 100,
    rarity: 'uncommon'
  },
  {
    id: 'week_20',
    name: '💪 أسبوع العزم',
    nameEn: 'Power Week',
    description: '20 مهمة في أسبوع واحد مع انضباط عالٍ',
    category: BADGE_CATEGORIES.WEEKLY,
    requirement: { type: 'week_tasks', value: 20 },
    points: 150,
    rarity: 'rare'
  },
  {
    id: 'week_30',
    name: '👑 أسبوع ملكي',
    nameEn: 'Royal Week',
    description: '30 مهمة في أسبوع واحد تجعل الأسبوع أسطورياً',
    category: BADGE_CATEGORIES.WEEKLY,
    requirement: { type: 'week_tasks', value: 30 },
    points: 250,
    rarity: 'epic'
  },
  {
    id: 'week_everyday',
    name: '🌟 أسبوع مكتمل',
    nameEn: 'Seven-for-Seven',
    description: 'مهمة واحدة على الأقل كل يوم (7/7)',
    category: BADGE_CATEGORIES.WEEKLY,
    requirement: { type: 'week_everyday', value: 7 },
    points: 200,
    rarity: 'rare'
  }
];

/**
 * 4. Consistency Badges (المواظبة) 💯
 */
export const CONSISTENCY_BADGES = [
  {
    id: 'rate_80',
    name: '📊 اتساق قوي',
    nameEn: 'Solid Consistency',
    description: 'معدل إنجاز 80%+ لمدة شهر كامل',
    category: BADGE_CATEGORIES.CONSISTENCY,
    requirement: { type: 'completion_rate', value: 80, duration: 30 },
    points: 200,
    rarity: 'uncommon'
  },
  {
    id: 'rate_90',
    name: '⭐ اتساق ممتاز',
    nameEn: 'Prime Consistency',
    description: 'معدل إنجاز 90%+ لمدة شهر كامل',
    category: BADGE_CATEGORIES.CONSISTENCY,
    requirement: { type: 'completion_rate', value: 90, duration: 30 },
    points: 400,
    rarity: 'rare'
  },
  {
    id: 'rate_100',
    name: '💎 اتساق كامل',
    nameEn: 'Perfect Consistency',
    description: 'معدل إنجاز 100% لمدة شهر',
    category: BADGE_CATEGORIES.CONSISTENCY,
    requirement: { type: 'completion_rate', value: 100, duration: 30 },
    points: 800,
    rarity: 'epic'
  },
  {
    id: 'perfect_month',
    name: '🏆 شهر بلا انقطاع',
    nameEn: 'Unbroken Month',
    description: 'مهمة كل يوم لمدة شهر كامل',
    category: BADGE_CATEGORIES.CONSISTENCY,
    requirement: { type: 'perfect_month', value: 30 },
    points: 600,
    rarity: 'epic'
  },
  {
    id: 'early_bird',
    name: '🌅 منجز الصباح',
    nameEn: 'Morning Finisher',
    description: '20 مهمة مكتملة قبل 9 صباحاً',
    category: BADGE_CATEGORIES.CONSISTENCY,
    requirement: { type: 'early_tasks', value: 20 },
    points: 150,
    rarity: 'uncommon'
  },
  {
    id: 'night_owl',
    name: '🦉 منجز الليل',
    nameEn: 'Night Finisher',
    description: '20 مهمة مكتملة بعد 10 مساءً',
    category: BADGE_CATEGORIES.CONSISTENCY,
    requirement: { type: 'night_tasks', value: 20 },
    points: 150,
    rarity: 'uncommon'
  }
];

/**
 * 5. Challenge Badges (التحديات) ⚡
 */
export const CHALLENGE_BADGES = [
  {
    id: 'lightning_fast',
    name: '⚡ إنجاز خاطف',
    nameEn: 'Lightning Finish',
    description: '5 مهام في ساعة واحدة',
    category: BADGE_CATEGORIES.CHALLENGES,
    requirement: { type: 'tasks_per_hour', value: 5 },
    points: 100,
    rarity: 'rare'
  },
  {
    id: 'marathon',
    name: '🏃 سباق اليوم',
    nameEn: 'Day Marathon',
    description: '10 مهام في يوم واحد',
    category: BADGE_CATEGORIES.CHALLENGES,
    requirement: { type: 'daily_tasks', value: 10 },
    points: 150,
    rarity: 'rare'
  },
  {
    id: 'ultra_marathon',
    name: '🏃‍♂️💨 سباق مضاعف',
    nameEn: 'Ultra Day Marathon',
    description: '20 مهمة في يوم واحد',
    category: BADGE_CATEGORIES.CHALLENGES,
    requirement: { type: 'daily_tasks', value: 20 },
    points: 300,
    rarity: 'epic'
  },
  {
    id: 'comeback_king',
    name: '👑 عودة قوية',
    nameEn: 'Comeback Leader',
    description: 'إكمال 10 مهام متأخرة في أسبوع',
    category: BADGE_CATEGORIES.CHALLENGES,
    requirement: { type: 'overdue_cleared', value: 10 },
    points: 250,
    rarity: 'rare'
  },
  {
    id: 'weekend_warrior',
    name: '⚔️ محارب الويكند',
    nameEn: 'Weekend Warrior',
    description: '15 مهمة في عطلة نهاية الأسبوع',
    category: BADGE_CATEGORIES.CHALLENGES,
    requirement: { type: 'weekend_tasks', value: 15 },
    points: 200,
    rarity: 'uncommon'
  },
  {
    id: 'priority_master',
    name: '🎯 حارس الأولويات',
    nameEn: 'Priority Guardian',
    description: '25 مهمة عالية الأولوية مكتملة',
    category: BADGE_CATEGORIES.CHALLENGES,
    requirement: { type: 'high_priority_tasks', value: 25 },
    points: 200,
    rarity: 'rare'
  },
  {
    id: 'multitasker',
    name: '🎭 طاقة متعددة',
    nameEn: 'Versatile Multitasker',
    description: '5 مهام من فئات مختلفة في يوم واحد',
    category: BADGE_CATEGORIES.CHALLENGES,
    requirement: { type: 'diverse_categories', value: 5 },
    points: 150,
    rarity: 'uncommon'
  },
  {
    id: 'daily_champion',
    name: '🏅 وسام بطل اليوم',
    nameEn: 'Daily Champion',
    description: 'أعلى عضو إنجازاً في اليوم (يُمنح آلياً)',
    category: BADGE_CATEGORIES.CHALLENGES,
    requirement: { type: 'manual_award', value: 'daily_champion' },
    points: 120,
    rarity: 'rare'
  }
];

/**
 * 6. Seasonal Badges (موسمية) 🌙
 */
export const SEASONAL_BADGES = [
  {
    id: 'ramadan_hero',
    name: '🌙 بطل رمضان',
    nameEn: 'Ramadan Hero',
    description: 'إنجاز 100 مهمة في رمضان',
    category: BADGE_CATEGORIES.SEASONAL,
    requirement: { type: 'ramadan_tasks', value: 100 },
    points: 500,
    rarity: 'epic',
    seasonal: true
  },
  {
    id: 'new_year_starter',
    name: '🎉 بداية العام القوية',
    nameEn: 'New Year Starter',
    description: '50 مهمة في يناير',
    category: BADGE_CATEGORIES.SEASONAL,
    requirement: { type: 'january_tasks', value: 50 },
    points: 300,
    rarity: 'rare',
    seasonal: true
  },
  {
    id: 'summer_surge',
    name: '☀️ طفرة الصيف',
    nameEn: 'Summer Surge',
    description: '150 مهمة في الصيف',
    category: BADGE_CATEGORIES.SEASONAL,
    requirement: { type: 'summer_tasks', value: 150 },
    points: 400,
    rarity: 'rare',
    seasonal: true
  },
  {
    id: 'winter_warrior',
    name: '❄️ محارب الشتاء',
    nameEn: 'Winter Warrior',
    description: '150 مهمة في الشتاء',
    category: BADGE_CATEGORIES.SEASONAL,
    requirement: { type: 'winter_tasks', value: 150 },
    points: 400,
    rarity: 'rare',
    seasonal: true
  }
];

/**
 * All Badges Combined
 */
export const ALL_BADGES = [
  ...STREAK_BADGES,
  ...QUANTITY_BADGES,
  ...WEEKLY_BADGES,
  ...CONSISTENCY_BADGES,
  ...CHALLENGE_BADGES,
  ...SEASONAL_BADGES
];

/**
 * Badge Rarity Configuration
 */
export const BADGE_RARITY = {
  common: { name: 'أساسي', color: '#95a5a6', emoji: '⚪' },
  uncommon: { name: 'متقدم', color: '#27ae60', emoji: '🟢' },
  rare: { name: 'نخبة', color: '#3498db', emoji: '🔵' },
  epic: { name: 'أسطوري', color: '#9b59b6', emoji: '🟣' },
  legendary: { name: 'أسطورة كبرى', color: '#f39c12', emoji: '🟡' }
};

/**
 * Get badge by ID
 */
export function getBadgeById(badgeId) {
  return ALL_BADGES.find(b => b.id === badgeId);
}

/**
 * Get badges by category
 */
export function getBadgesByCategory(category) {
  return ALL_BADGES.filter(b => b.category === category);
}

/**
 * Get badge display text
 */
export function formatBadge(badge) {
  const rarity = BADGE_RARITY[badge.rarity];
  return `${badge.name} ${rarity.emoji}\n${badge.description}\n⭐ ${badge.points} نقطة`;
}
