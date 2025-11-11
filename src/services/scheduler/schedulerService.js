/**
 * Scheduler Service
 * خدمة الجدولة التلقائية للمهام الدورية
 */

import cron from 'node-cron';
import logger from '../../core/logger.js';
import { env } from '../../config/env.js';
import whatsappService from '../whatsapp/whatsappService.js';
import clickupService from '../clickup/clickupService.js';
import notificationService from '../notification/enhancedNotificationService.js';
import aiService from '../ai/index.js';
import motivationService from '../motivation/motivationService.js';
import gamificationService from '../gamification/gamificationService.js';
import leaderboardService from '../gamification/leaderboardService.js';
import behavioralService from '../ai/behavioralService.js';
import productivityRepo from '../../repositories/productivityRepository.js';
import { TEAM } from '../../config/team.js';
import { isNonOpenStatus } from '../../config/constants.js';
import { isToday, calculatePercentage, generateProgressBar } from '../../utils/helpers.js';
import { formatTaskList } from '../../utils/formatters.js';
import { shortenUrl } from '../../utils/urlShortener.js';

class SchedulerService {
  constructor() {
    this.jobs = [];
  }

  /**
   * Initialize all scheduled jobs
   */
  initialize() {
    logger.info('Initializing scheduler service...');

    if (!env.features.dailyReports) {
      logger.info('Daily reports are disabled');
      return;
    }

    // ============================================
    // 🌟 Intelligent Motivation System (4x Daily)
    // ============================================

    // 08:00 - Morning Motivation (طاقة وحماس للبداية)
    this.scheduleJob(
      '0 8 * * *',
      'Morning Motivation',
      () => motivationService.sendMotivationalMessage('morning')
    );

    // 12:00 - Midday Motivation (تركيز واستمرارية)
    this.scheduleJob(
      '0 12 * * *',
      'Midday Motivation',
      () => motivationService.sendMotivationalMessage('midday')
    );

    // 16:00 - Afternoon Motivation (دفعة للإنجاز)
    this.scheduleJob(
      '0 16 * * *',
      'Afternoon Motivation',
      () => motivationService.sendMotivationalMessage('afternoon')
    );

    // 20:00 - Evening Motivation (تأمل وإنجاز)
    this.scheduleJob(
      '0 20 * * *',
      'Evening Motivation',
      () => motivationService.sendMotivationalMessage('evening')
    );

    // ============================================
    // 🧠 AI Behavioral Recommendations
    // ============================================

    // 08:30 - Morning AI Task Recommendations
    this.scheduleJob(
      '30 7 * * *',
      'Morning Task Recommendations',
      () => this.sendMorningRecommendations()
    );

    // ============================================
    // Other Morning Jobs
    // ============================================

    this.scheduleJob(
      '5 8 * * *',
      'AI Morning Messages',
      () => this.sendAIMorningMessages()
    );

    this.scheduleJob(
      '30 8 * * *',
      'Daily User Tasks (Morning)',
      () => this.sendDailyUserTasks()
    );

    this.scheduleJob(
      '15 9 * * *',
      'Inspirational Content',
      () => this.sendInspirationalContent()
    );

    // Evening jobs
    this.scheduleJob(
      '35 23 * * *',
      'AI Daily Summary',
      () => this.sendAIDailySummary()
    );

    this.scheduleJob(
      '45 23 * * *',
      'Daily User Tasks (Evening)',
      () => this.sendDailyUserTasks()
    );

    this.scheduleJob(
      '50 23 * * *',
      'AI Group Highlights',
      () => this.sendAIGroupHighlights()
    );

    this.scheduleJob(
      '55 23 * * *',
      'Daily Group Stats',
      () => this.sendDailyGroupStats()
    );

    this.scheduleJob(
      '58 23 * * *',
      'AI Goodnight Message',
      () => this.sendAIGoodnight()
    );

    // Weekly jobs
    this.scheduleJob(
      '0 9 * * 5',
      'AI Weekly Report',
      () => this.sendAIWeeklyReport()
    );

    // ============================================
    // 🏆 Gamification Weekly Reports (Friday 6 PM)
    // ============================================
    this.scheduleJob(
      '0 18 * * 5',
      'Weekly Achievement Reports',
      () => this.sendWeeklyAchievementReports()
    );

    this.scheduleJob(
      '30 18 * * 5',
      'Weekly Leaderboard',
      () => leaderboardService.sendComprehensiveLeaderboard()
    );

    logger.success(`Scheduler initialized with ${this.jobs.length} jobs`);
  }

  /**
   * Schedule a job
   * @param {string} schedule - Cron schedule
   * @param {string} name - Job name
   * @param {Function} handler - Job handler
   */
  scheduleJob(schedule, name, handler) {
    const job = cron.schedule(schedule, async () => {
      logger.info(`Running scheduled job: ${name}`);
      try {
        await handler();
        logger.success(`Completed scheduled job: ${name}`);
      } catch (error) {
        logger.error(`Scheduled job failed: ${name}`, {
          error: error.message
        });
      }
    }, {
      scheduled: true,
      timezone: env.TZ
    });

    this.jobs.push({ name, schedule, job });
    logger.debug(`Job scheduled: ${name} (${schedule})`);
  }

  /**
   * Send AI morning messages to all users
   */
  async sendAIMorningMessages() {
    if (!whatsappService.isClientReady()) {
      logger.warn('WhatsApp not ready, skipping AI morning messages');
      return;
    }

    logger.info('Sending AI morning messages to all users');

    for (let i = 0; i < TEAM.length; i++) {
      const member = TEAM[i];

      try {
        const stats = await productivityRepo.getUserStats(member.name);

        const systemPrompt = `أنت مساعد تحفيزي صباحي. اكتب رسالة صباحية قصيرة (3-4 جمل) تحفيزية وإيجابية بالعربية.`;

        const userMessage = `المستخدم: ${member.name}
المهام المكتملة اليوم: ${stats.today}
المهام هذا الأسبوع: ${stats.week}
إجمالي المهام: ${stats.total}

اكتب رسالة صباحية تحفيزية قصيرة ومباشرة.`;

        const aiMessage = await aiService.generateCompletion(
          systemPrompt,
          userMessage,
          { temperature: 0.8 }
        );

        await whatsappService.sendToUser(
          member.phone,
          `🌅 *صباح النشاط*\n\n${aiMessage}`
        );

        logger.debug('AI morning message sent', { user: member.name });

        // Wait 1 minute between users
        if (i < TEAM.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
      } catch (error) {
        logger.error(`Failed to send AI morning to ${member.name}`, {
          error: error.message
        });
      }
    }
  }

  /**
   * Send daily user tasks report
   */
  async sendDailyUserTasks() {
    if (!whatsappService.isClientReady()) {
      logger.warn('WhatsApp not ready, skipping daily user tasks');
      return;
    }

    logger.info('Sending daily user tasks to all users');

    for (let i = 0; i < TEAM.length; i++) {
      const member = TEAM[i];

      try {
        const allTasks = await clickupService.getAllTasksForMember(member.id);
        const stats = await productivityRepo.getUserStats(member.name);

        const openTasks = allTasks.filter(t =>
          !isNonOpenStatus(t.status?.status, t.status?.type)
        );

        const overdueTasks = openTasks.filter(t =>
          t.due_date && Number(t.due_date) < Date.now()
        );

        const todayDue = openTasks.filter(t =>
          t.due_date && isToday(Number(t.due_date))
        );

        const total = openTasks.length + stats.today;
        const completionRate = calculatePercentage(stats.today, total);
        const progressBar = generateProgressBar(completionRate);

        let message = `🌅 *ملخص مهامك لليوم*\n@${member.name}\n\n`;
        message += `🎯 المهام المفتوحة: ${openTasks.length}\n`;
        message += `✅ مكتملة اليوم: ${stats.today}\n`;
        message += `⚠️ متأخرة: ${overdueTasks.length}\n\n`;
        message += `📈 نسبة الإنجاز: ${completionRate}%\n`;
        message += `[${progressBar}]\n`;

        if (openTasks.length > 0) {
          message += `\n📌 *المهام المفتوحة:*\n`;
          for (const task of openTasks.slice(0, 5)) {
            const url = await shortenUrl(`https://app.clickup.com/t/${task.id}`);
            message += `• ${task.name}\n  🔗 ${url}\n`;
          }
        }

        if (todayDue.length > 0) {
          message += `\n🗓️ *مهام تستحق اليوم:*\n`;
          for (const task of todayDue) {
            const url = await shortenUrl(`https://app.clickup.com/t/${task.id}`);
            message += `• ${task.name}\n  🔗 ${url}\n`;
          }
        }

        await whatsappService.sendToUser(member.phone, message);

        logger.debug('Daily tasks sent', { user: member.name });

        // Wait 1 minute between users
        if (i < TEAM.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
      } catch (error) {
        logger.error(`Failed to send daily tasks to ${member.name}`, {
          error: error.message
        });
      }
    }
  }

  /**
   * Send inspirational content
   */
  async sendInspirationalContent() {
    if (!whatsappService.isClientReady() || !env.features.inspirationalContent) {
      return;
    }

    logger.info('Sending inspirational content');

    try {
      const systemPrompt = `أنت منشئ محتوى تحفيزي. اكتب اقتباساً تحفيزياً قصيراً وقوياً بالعربية (2-3 جمل).`;

      const userMessage = `اكتب اقتباساً تحفيزياً جديداً ومميزاً للفريق.`;

      const content = await aiService.generateCompletion(
        systemPrompt,
        userMessage,
        { temperature: 0.9 }
      );

      await whatsappService.sendToGroup(
        `💡 *رسالة اليوم*\n\n${content}`,
        { pin: true }
      );

      // Pause notifications for 10 minutes
      notificationService.pause();

      logger.success('Inspirational content sent');
    } catch (error) {
      logger.error('Failed to send inspirational content', {
        error: error.message
      });
    }
  }

  /**
   * Send AI daily summary
   */
  async sendAIDailySummary() {
    if (!whatsappService.isClientReady()) {
      return;
    }

    logger.info('Sending AI daily summary to all users');

    for (let i = 0; i < TEAM.length; i++) {
      const member = TEAM[i];

      try {
        const stats = await productivityRepo.getUserStats(member.name);
        const allTasks = await clickupService.getAllTasksForMember(member.id);

        const openTasks = allTasks.filter(t =>
          !isNonOpenStatus(t.status?.status, t.status?.type)
        );

        const systemPrompt = `أنت مساعد تحليلي. اكتب ملخصاً قصيراً (3-4 جمل) عن أداء اليوم بطريقة تحفيزية.`;

        const userMessage = `المستخدم: ${member.name}
مهام اليوم المكتملة: ${stats.today}
المهام المفتوحة: ${openTasks.length}
إجمالي المهام: ${stats.total}

اكتب ملخصاً تحفيزياً قصيراً عن اليوم.`;

        const aiMessage = await aiService.generateCompletion(
          systemPrompt,
          userMessage
        );

        await whatsappService.sendToUser(
          member.phone,
          `📊 *ملخص يومك*\n\n${aiMessage}`
        );

        logger.debug('AI daily summary sent', { user: member.name });

        if (i < TEAM.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
      } catch (error) {
        logger.error(`Failed to send AI daily to ${member.name}`, {
          error: error.message
        });
      }
    }
  }

  /**
   * Send AI group highlights
   */
  async sendAIGroupHighlights() {
    if (!whatsappService.isClientReady()) {
      return;
    }

    logger.info('Sending AI group highlights');

    try {
      const allStats = await productivityRepo.getAllUsersStats();

      let lines = [];
      let bestPerformer = { name: null, count: -1 };

      for (const [userName, stats] of Object.entries(allStats)) {
        lines.push(`@${userName}: ${stats.today} مهمة اليوم`);

        if (stats.today > bestPerformer.count) {
          bestPerformer = { name: userName, count: stats.today };
        }
      }

      const systemPrompt = `أنت مساعد تحفيزي للفريق. اكتب ملخصاً قصيراً (3-4 جمل) عن إنجازات الفريق اليوم.`;

      const userMessage = `إحصائيات الفريق اليوم:\n${lines.join('\n')}\n\nأفضل أداء: @${bestPerformer.name} (${bestPerformer.count} مهمة)\n\nاكتب ملخصاً تحفيزياً للفريق.`;

      const aiMessage = await aiService.generateCompletion(
        systemPrompt,
        userMessage
      );

      await whatsappService.sendToGroup(
        `🔥 *ملخص الفريق (AI)*\n\n${aiMessage}`,
        { pin: true }
      );

      logger.success('AI group highlights sent');
    } catch (error) {
      logger.error('Failed to send AI group highlights', {
        error: error.message
      });
    }
  }

  /**
   * Send daily group stats
   */
  async sendDailyGroupStats() {
    if (!whatsappService.isClientReady()) {
      return;
    }

    logger.info('Sending daily group stats');

    try {
      const allStats = await productivityRepo.getAllUsersStats();

      let message = `📊 *إحصائيات الفريق اليومية*\n\n`;
      let topPerformer = { name: null, count: -1 };

      for (const [userName, stats] of Object.entries(allStats)) {
        message += `@${userName}\n`;
        message += `  ✅ اليوم: ${stats.today}\n`;
        message += `  📊 الأسبوع: ${stats.week}\n`;
        message += `  📦 الإجمالي: ${stats.total}\n\n`;

        if (stats.today > topPerformer.count) {
          topPerformer = { name: userName, count: stats.today };
        }
      }

      if (topPerformer.name) {
        message += `\n🎖️ *نجم اليوم*: @${topPerformer.name} (${topPerformer.count} مهام)`;
      }

      await whatsappService.sendToGroup(message, { pin: true });

      logger.success('Daily group stats sent');
    } catch (error) {
      logger.error('Failed to send daily group stats', {
        error: error.message
      });
    }
  }

  /**
   * Send AI goodnight message
   */
  async sendAIGoodnight() {
    if (!whatsappService.isClientReady()) {
      return;
    }

    logger.info('Sending AI goodnight message');

    try {
      const allStats = await productivityRepo.getAllUsersStats();

      let totalToday = 0;
      let bestPerformer = { name: null, count: -1 };

      for (const [userName, stats] of Object.entries(allStats)) {
        totalToday += stats.today;

        if (stats.today > bestPerformer.count) {
          bestPerformer = { name: userName, count: stats.today };
        }
      }

      const systemPrompt = `أنت مساعد تحفيزي. اكتب رسالة قصيرة (2-3 جمل) لنهاية اليوم بطريقة دافئة ومحفزة.`;

      const userMessage = `إجمالي المهام المنجزة اليوم: ${totalToday}\nأفضل أداء: @${bestPerformer.name} (${bestPerformer.count} مهام)\n\nاكتب رسالة تصبح على خير محفزة.`;

      const aiMessage = await aiService.generateCompletion(
        systemPrompt,
        userMessage,
        { temperature: 0.9 }
      );

      await whatsappService.sendToGroup(
        `🌙 *تصبحون على خير*\n\n${aiMessage}`,
        { pin: true }
      );

      // Pause notifications for 10 minutes
      notificationService.pause();

      logger.success('AI goodnight message sent');
    } catch (error) {
      logger.error('Failed to send AI goodnight', {
        error: error.message
      });
    }
  }

  /**
   * Send AI weekly report
   */
  async sendAIWeeklyReport() {
    if (!whatsappService.isClientReady()) {
      return;
    }

    logger.info('Sending AI weekly report to all users');

    for (let i = 0; i < TEAM.length; i++) {
      const member = TEAM[i];

      try {
        const stats = await productivityRepo.getUserStats(member.name);

        const systemPrompt = `أنت مساعد تحليلي أسبوعي. اكتب ملخصاً قصيراً (4-5 جمل) عن الأسبوع مع نصائح للأسبوع القادم.`;

        const userMessage = `المستخدم: ${member.name}
مهام هذا الأسبوع: ${stats.week}
إجمالي المهام: ${stats.total}
اليوم الأكثر إنتاجية: ${stats.mostProductiveDay || 'غير محدد'}

اكتب ملخصاً أسبوعياً محفزاً.`;

        const aiMessage = await aiService.generateCompletion(
          systemPrompt,
          userMessage
        );

        await whatsappService.sendToUser(
          member.phone,
          `📅 *نظرة للأسبوع*\n\n${aiMessage}`
        );

        logger.debug('AI weekly report sent', { user: member.name });

        if (i < TEAM.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
      } catch (error) {
        logger.error(`Failed to send AI weekly to ${member.name}`, {
          error: error.message
        });
      }
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    logger.info('Stopping all scheduled jobs');

    this.jobs.forEach(({ name, job }) => {
      job.stop();
      logger.debug(`Job stopped: ${name}`);
    });

    this.jobs = [];
  }

  /**
   * Send AI-powered morning task recommendations to all team members
   * Analyzes each user's tasks and suggests optimal tasks to start with
   */
  async sendMorningRecommendations() {
    if (!whatsappService.isClientReady()) {
      logger.warn('WhatsApp not ready, skipping morning recommendations');
      return;
    }

    logger.info('Sending morning AI task recommendations to all team members');

    for (let i = 0; i < TEAM.length; i++) {
      const member = TEAM[i];

      try {
        // Generate AI recommendations
        const recommendations = await behavioralService.generateMorningRecommendations(member.id);

        if (recommendations && recommendations.tasks && recommendations.tasks.length > 0) {
          // Format message
          let message = `${recommendations.greeting || '🌅 صباح الخير!'}\n\n`;
          message += `${recommendations.analysis || ''}\n\n`;

          if (recommendations.work_style_note) {
            message += `💡 ${recommendations.work_style_note}\n\n`;
          }

          message += `*📋 مهامك الموصى بها اليوم:*\n\n`;

          for (let j = 0; j < Math.min(recommendations.tasks.length, 5); j++) {
            const task = recommendations.tasks[j];
            const icon = this.getTaskTypeIcon(task.type);

            message += `${j + 1}. ${icon} *${task.task_name}*\n`;
            message += `   ⏱️ ${task.estimated_time}\n`;
            message += `   💎 ${task.ai_weight} نقطة (${this.translateComplexity(task.complexity)})\n`;
            message += `   💭 ${task.reason}\n\n`;
          }

          if (recommendations.motivation) {
            message += `\n✨ ${recommendations.motivation}`;
          }

          // Send to user privately
          await whatsappService.sendToUser(member.phone, message);

          logger.info(`Morning recommendations sent to ${member.name}`, {
            tasks: recommendations.tasks.length
          });
        } else {
          // No tasks - send motivational message
          const message = `🌅 *صباح الخير ${member.name}!*\n\n` +
            `🎉 لا توجد مهام مفتوحة! استمتع بيومك! ✨`;

          await whatsappService.sendToUser(member.phone, message);
        }

        // Delay between messages
        if (i < TEAM.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (error) {
        logger.error(`Failed to send morning recommendations to ${member.name}`, {
          error: error.message
        });
      }
    }

    logger.success('Morning recommendations completed');
  }

  /**
   * Get emoji icon for task type
   */
  getTaskTypeIcon(type) {
    const icons = {
      'quick_win': '⚡',
      'focus_task': '🎯',
      'morning_priority': '🌅',
      'afternoon_task': '🌤️',
      'urgent': '🔥',
      'important': '⭐'
    };
    return icons[type] || '📝';
  }

  /**
   * Translate complexity to Arabic
   */
  translateComplexity(complexity) {
    const translations = {
      'simple': 'بسيطة',
      'medium': 'متوسطة',
      'complex': 'معقدة',
      'very_complex': 'معقدة جداً'
    };
    return translations[complexity] || 'متوسطة';
  }

  /**
   * Send weekly achievement reports to all team members
   * Individual reports via private message
   */
  async sendWeeklyAchievementReports() {
    if (!whatsappService.isClientReady()) {
      logger.warn('WhatsApp not ready, skipping weekly achievement reports');
      return;
    }

    logger.info('Sending weekly achievement reports to all team members');

    for (let i = 0; i < TEAM.length; i++) {
      const member = TEAM[i];

      try {
        // Generate weekly report
        const report = await gamificationService.generateWeeklyReport(member.id);

        if (report) {
          // Send to user privately
          await whatsappService.sendToUser(member.phone, report);

          logger.info(`Weekly achievement report sent to ${member.name}`);
        }

        // Delay between messages
        if (i < TEAM.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (error) {
        logger.error(`Failed to send weekly achievement report to ${member.name}`, {
          error: error.message
        });
      }
    }

    logger.success('Weekly achievement reports completed');
  }

  /**
   * Get list of scheduled jobs
   * @returns {Array}
   */
  getJobs() {
    return this.jobs.map(({ name, schedule }) => ({ name, schedule }));
  }
}

// Create singleton instance
const schedulerService = new SchedulerService();

export default schedulerService;
