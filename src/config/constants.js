/**
 * Application Constants
 * جميع الثوابت المستخدمة في التطبيق
 */

/**
 * ClickUp Task Statuses
 */
export const TASK_STATUS = {
  NON_OPEN: [
    'complete',
    'complete & not invoiced',
    'completed',
    'done',
    'finished',
    'closed',
    'canceled',
    'cancelled',
    'archived',
    'مكتمل',
    'مكتملة',
    'مكتمله',
    'منجز',
    'منجزة',
    'منجزه',
    'منتهي',
    'منتهية',
    'منتهيه',
    'تم الانجاز',
    'تم الإنجاز',
    'انتهى',
    'انتهت',
    'تمت',
    'مغلق',
    'مغلقة'
  ],
  NON_OPEN_TYPES: [
    'done',
    'closed',
    'completed',
    'complete',
    'archived',
    'cancelled',
    'canceled'
  ],
  NON_OPEN_KEYWORDS: [
    'done',
    'complete',
    'completed',
    'finish',
    'finished',
    'close',
    'closed',
    'cancel',
    'archive',
    'archived',
    'مكت',
    'منجز',
    'منته',
    'تم الانجاز',
    'تم الإنجاز',
    'انته',
    'اغلق',
    'مغلق'
  ]
};

export function normalizeStatusName(status) {
  if (!status) {
    return '';
  }

  return status
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[إأآ]/g, 'ا')
    .replace(/\s+/g, ' ');
}

export function isNonOpenStatus(statusName = '', statusType = '') {
  const normalizedType = statusType
    ? statusType.toString().trim().toLowerCase()
    : '';

  if (normalizedType && TASK_STATUS.NON_OPEN_TYPES.some(type => normalizedType.includes(type))) {
    return true;
  }

  const normalizedStatus = normalizeStatusName(statusName);

  if (!normalizedStatus) {
    return false;
  }

  if (TASK_STATUS.NON_OPEN.includes(normalizedStatus)) {
    return true;
  }

  return TASK_STATUS.NON_OPEN_KEYWORDS.some(keyword => normalizedStatus.includes(keyword));
}

/**
 * Task Priority Levels
 */
export const PRIORITY = {
  URGENT: { id: 1, name: 'عاجل جداً', emoji: '🔴' },
  HIGH: { id: 2, name: 'عاجل', emoji: '🟠' },
  NORMAL: { id: 3, name: 'عادي', emoji: '🟡' },
  LOW: { id: 4, name: 'منخفض', emoji: '🟢' }
};

/**
 * Priority mapping function
 */
export const getPriorityText = (priority) => {
  if (!priority) return 'عادية';

  const priorityId = priority?.priority || priority;
  const match = Object.values(PRIORITY).find(p => p.id === priorityId);

  return match ? `${match.name} ${match.emoji}` : 'عادية';
};

/**
 * Achievement Milestones
 */
export const ACHIEVEMENT_MILESTONES = {
  'المبتدئ': { tasks: 5, emoji: '🌱', message: 'بداية رائعة! أول 5 مهام مكتملة' },
  'الطموح': { tasks: 10, emoji: '🔥', message: 'قوة لا تُصدق! 10 مهام منجزة' },
  'المحترف': { tasks: 25, emoji: '⚡', message: 'أنت محترف حقيقي! 25 مهمة' },
  'الخبير': { tasks: 50, emoji: '🏆', message: 'خبير ماهر! نصف المئة' },
  'الأسطورة': { tasks: 100, emoji: '👑', message: 'أسطورة حية! 100 مهمة مكتملة' },
  'المايسترو': { tasks: 200, emoji: '🌟', message: 'مايسترو الإنتاجية! 200 مهمة' },
  'البطل الخارق': { tasks: 500, emoji: '🦸', message: 'بطل خارق! 500 مهمة منجزة' }
};

/**
 * Weekly Achievements
 */
export const WEEKLY_ACHIEVEMENTS = {
  'المنجز': { tasks: 10, emoji: '💪', message: 'أسبوع مثمر! 10 مهام في أسبوع واحد' },
  'النجم': { tasks: 20, emoji: '⭐', message: 'نجم الأسبوع! 20 مهمة' },
  'الآلة': { tasks: 30, emoji: '🚀', message: 'آلة إنتاجية! 30 مهمة في أسبوع' },
  'الإعجوبة': { tasks: 50, emoji: '🎯', message: 'إعجوبة الإنتاجية! 50 مهمة أسبوعياً' }
};

/**
 * Badge System
 */
export const BADGE_SYSTEM = {
  completion: {
    name: 'شارة الإنجاز',
    levels: {
      bronze: { threshold: 10, emoji: '🥉', color: '#CD7F32' },
      silver: { threshold: 50, emoji: '🥈', color: '#C0C0C0' },
      gold: { threshold: 100, emoji: '🥇', color: '#FFD700' },
      platinum: { threshold: 500, emoji: '💎', color: '#E5E4E2' }
    }
  },
  streak: {
    name: 'شارة الاستمرارية',
    levels: {
      week: { threshold: 7, emoji: '🔥', color: '#FF6B6B' },
      month: { threshold: 30, emoji: '⚡', color: '#4ECDC4' },
      quarter: { threshold: 90, emoji: '💫', color: '#95E1D3' }
    }
  },
  quality: {
    name: 'شارة الجودة',
    levels: {
      bronze: { threshold: 5, emoji: '⭐', color: '#CD7F32' },
      silver: { threshold: 15, emoji: '🌟', color: '#C0C0C0' },
      gold: { threshold: 30, emoji: '✨', color: '#FFD700' }
    }
  }
};

/**
 * Challenge Templates
 */
export const CHALLENGE_TEMPLATES = [
  {
    name: 'تحدي المبتدئين',
    description: 'أنجز 10 مهام هذا الأسبوع',
    type: 'beginner',
    target: 10,
    reward: { points: 50, badge: 'البداية القوية 💪' },
    difficulty: 'easy'
  },
  {
    name: 'تحدي الجودة',
    description: 'أنجز 5 مهام معقدة (تحتوي على subtasks)',
    type: 'quality',
    target: 5,
    reward: { points: 120, badge: 'محب التحديات 🎯' },
    difficulty: 'medium'
  },
  {
    name: 'تحدي التنوع',
    description: 'أنجز مهام من 3 فئات مختلفة',
    type: 'diversity',
    target: 3,
    reward: { points: 150, badge: 'متعدد المواهب 🌈' },
    difficulty: 'hard'
  },
  {
    name: 'تحدي السرعة',
    description: 'أنجز 15 مهمة في 3 أيام',
    type: 'speed',
    target: 15,
    reward: { points: 100, badge: 'السرعة البرقية ⚡' },
    difficulty: 'medium'
  },
  {
    name: 'تحدي الإصرار',
    description: 'أنجز مهمة واحدة على الأقل يومياً لمدة 7 أيام',
    type: 'consistency',
    target: 7,
    reward: { points: 200, badge: 'المثابر 🔥' },
    difficulty: 'hard'
  }
];

/**
 * Task Categories for Analysis
 */
export const TASK_CATEGORIES = {
  'تصميم': ['design', 'ui', 'ux', 'تصميم', 'واجهة', 'جرافيك', 'graphic', 'mockup', 'prototype', 'figma', 'photoshop'],
  'برمجة': ['code', 'coding', 'برمجة', 'develop', 'programming', 'javascript', 'python', 'react', 'api', 'backend', 'frontend', 'bug', 'fix'],
  'تسويق': ['marketing', 'تسويق', 'إعلان', 'campaign', 'social media', 'seo', 'content', 'محتوى'],
  'مبيعات': ['sales', 'مبيعات', 'عميل', 'client', 'deal', 'proposal', 'عرض'],
  'إدارة مشاريع': ['project', 'مشروع', 'meeting', 'اجتماع', 'planning', 'تخطيط', 'coordination'],
  'كتابة محتوى': ['writing', 'كتابة', 'article', 'مقال', 'blog', 'copywriting', 'محتوى'],
  'تحليل بيانات': ['data', 'analytics', 'تحليل', 'report', 'تقرير', 'statistics', 'metrics'],
  'دعم فني': ['support', 'دعم', 'help', 'مساعدة', 'issue', 'ticket', 'customer service'],
  'محاسبة': ['accounting', 'محاسبة', 'invoice', 'فاتورة', 'finance', 'مالية', 'budget'],
  'موارد بشرية': ['hr', 'hiring', 'توظيف', 'recruitment', 'interview', 'مقابلة']
};

/**
 * Famous Quotes (Arabic and International)
 */
export const FAMOUS_QUOTES = [
  { quote: 'النجاح ليس نهائياً، والفشل ليس قاتلاً، الشجاعة للاستمرار هي ما يهم.', author: 'وينستون تشرشل', category: 'نجاح' },
  { quote: 'الطريقة الوحيدة للقيام بعمل عظيم هي أن تحب ما تفعله.', author: 'ستيف جوبز', category: 'شغف' },
  { quote: 'لا تشاهد الساعة، افعل ما تفعله. استمر في المضي قدماً.', author: 'سام ليفنسون', category: 'مثابرة' },
  { quote: 'من جد وجد، ومن سار على الدرب وصل.', author: 'مثل عربي', category: 'مثابرة' },
  { quote: 'العلم في الصغر كالنقش على الحجر.', author: 'مثل عربي', category: 'تعلم' },
  { quote: 'إن غداً لناظره قريب.', author: 'مثل عربي', category: 'أمل' },
  { quote: 'الطموح لا حدود له إلا السماء.', author: 'حكمة', category: 'طموح' },
  { quote: 'كل إنجاز عظيم بدأ بخطوة واحدة.', author: 'حكمة', category: 'نجاح' }
];

/**
 * Arabic Month Names
 */
export const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

/**
 * Arabic Day Names
 */
export const ARABIC_DAYS = [
  'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'
];

/**
 * Message Character Limits
 */
export const MESSAGE_LIMITS = {
  CHUNK_SIZE: 3000,
  MAX_LENGTH: 10000
};

/**
 * File Paths
 */
export const FILE_PATHS = {
  DATA_DIR: 'data',
  LOGS_DIR: 'logs',
  SESSIONS_DIR: 'sessions',
  PUBLIC_DIR: 'public'
};

/**
 * Notification Types
 */
export const NOTIFICATION_TYPES = {
  TASK_CREATED: 'task_created',
  TASK_COMPLETED: 'task_completed',
  TASK_ASSIGNED: 'task_assigned',
  STATUS_CHANGED: 'status_changed',
  COMMENT_ADDED: 'comment_added',
  ASSIGNEE_CHANGED: 'assignee_changed'
};

export default {
  TASK_STATUS,
  PRIORITY,
  getPriorityText,
  ACHIEVEMENT_MILESTONES,
  WEEKLY_ACHIEVEMENTS,
  BADGE_SYSTEM,
  CHALLENGE_TEMPLATES,
  TASK_CATEGORIES,
  FAMOUS_QUOTES,
  ARABIC_MONTHS,
  ARABIC_DAYS,
  MESSAGE_LIMITS,
  FILE_PATHS,
  NOTIFICATION_TYPES
};
