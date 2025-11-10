/**
 * Intelligent Motivation Service
 * خدمة الإشعارات التحفيزية الذكية - 4 مرات يومياً
 *
 * Features:
 * - Analyzes team task status and workload
 * - Generates contextual AI-powered motivational content
 * - Avoids repetition with content tracking
 * - Adapts tone and message based on time and team state
 */

import logger from '../../core/logger.js';
import aiService from '../ai/index.js';
import clickupService from '../clickup/clickupService.js';
import whatsappService from '../whatsapp/whatsappService.js';
import productivityRepo from '../../repositories/productivityRepository.js';
import { TEAM } from '../../config/team.js';
import { isToday, formatDateArabic } from '../../utils/helpers.js';

class MotivationService {
  constructor() {
    this.contentHistory = []; // Track sent messages to avoid repetition
    this.maxHistorySize = 50; // Keep last 50 messages

    // Content types for rotation
    this.contentTypes = {
      QUOTE: 'اقتباس',
      STORY: 'قصة نجاح',
      PROVERB: 'حكمة',
      MIXED: 'محتوى مختلط'
    };

    // Schedule configuration
    this.schedule = {
      morning: { time: '08:00', goal: 'طاقة وحماس للبداية', tone: 'متفائل ونشيط' },
      midday: { time: '12:00', goal: 'تركيز واستمرارية', tone: 'محفز وعملي' },
      afternoon: { time: '16:00', goal: 'دفعة للإنجاز', tone: 'مشجع ومثابر' },
      evening: { time: '20:00', goal: 'تأمل وإنجاز', tone: 'إيجابي وممتن' }
    };
  }

  /**
   * Analyze team context for AI prompt
   * تحليل حالة الفريق لتخصيص الرسالة التحفيزية
   */
  async analyzeTeamContext() {
    try {
      const context = {
        totalTasks: 0,
        openTasks: 0,
        completedToday: 0,
        overdueTasks: 0,
        highPriorityTasks: 0,
        membersWithTasks: 0,
        topPerformer: null,
        teamMood: 'متوازن', // متوازن، مشغول، هادئ
        workloadLevel: 'معتدل' // خفيف، معتدل، مرتفع، شديد
      };

      // Analyze tasks for each team member
      const memberStats = [];

      for (const member of TEAM) {
        try {
          const tasks = await clickupService.getTasksForMember(member.id, {
            include_closed: false
          });

          const openTasks = tasks.filter(t => !t.status?.status?.includes('complete'));
          const todayCompleted = await this.getTodayCompletedCount(member.id);
          const overdue = tasks.filter(t => {
            if (!t.due_date) return false;
            return new Date(parseInt(t.due_date)) < Date.now();
          });
          const highPriority = tasks.filter(t => t.priority && t.priority.id >= 2);

          context.totalTasks += tasks.length;
          context.openTasks += openTasks.length;
          context.completedToday += todayCompleted;
          context.overdueTasks += overdue.length;
          context.highPriorityTasks += highPriority.length;

          if (openTasks.length > 0) {
            context.membersWithTasks++;
          }

          memberStats.push({
            name: member.name,
            openTasks: openTasks.length,
            completedToday: todayCompleted,
            overdue: overdue.length
          });
        } catch (error) {
          logger.warn(`Failed to analyze tasks for ${member.name}`, { error: error.message });
        }
      }

      // Determine top performer
      const sortedByCompleted = memberStats.sort((a, b) => b.completedToday - a.completedToday);
      if (sortedByCompleted.length > 0 && sortedByCompleted[0].completedToday > 0) {
        context.topPerformer = sortedByCompleted[0].name;
      }

      // Determine team mood and workload
      const avgOpenTasks = context.openTasks / TEAM.length;

      if (avgOpenTasks < 3) {
        context.teamMood = 'هادئ';
        context.workloadLevel = 'خفيف';
      } else if (avgOpenTasks < 6) {
        context.teamMood = 'متوازن';
        context.workloadLevel = 'معتدل';
      } else if (avgOpenTasks < 10) {
        context.teamMood = 'مشغول';
        context.workloadLevel = 'مرتفع';
      } else {
        context.teamMood = 'مشغول جداً';
        context.workloadLevel = 'شديد';
      }

      // Adjust mood based on overdue tasks
      if (context.overdueTasks > 5) {
        context.teamMood = 'يحتاج دفعة';
      }

      logger.debug('Team context analyzed', context);
      return context;
    } catch (error) {
      logger.error('Failed to analyze team context', { error: error.message });
      return {
        totalTasks: 0,
        openTasks: 0,
        completedToday: 0,
        teamMood: 'متوازن',
        workloadLevel: 'معتدل'
      };
    }
  }

  /**
   * Get completed tasks count for today
   */
  async getTodayCompletedCount(userId) {
    try {
      const stats = await productivityRepo.getUserStats(userId);
      return stats.today || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Select content type for diversity
   */
  selectContentType(timeSlot) {
    // Weight-based random selection for diversity
    const weights = {
      [this.contentTypes.STORY]: 40,    // 40% قصص نجاح
      [this.contentTypes.QUOTE]: 30,    // 30% اقتباسات
      [this.contentTypes.PROVERB]: 20,  // 20% حكم وأمثال
      [this.contentTypes.MIXED]: 10     // 10% محتوى مختلط
    };

    // Avoid last used type
    const recentTypes = this.contentHistory
      .slice(-3)
      .map(h => h.type)
      .filter(t => t);

    // Reduce weight for recently used types
    Object.keys(weights).forEach(type => {
      const recentCount = recentTypes.filter(t => t === type).length;
      weights[type] = Math.max(5, weights[type] - (recentCount * 15));
    });

    // Random selection based on weights
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (const [type, weight] of Object.entries(weights)) {
      random -= weight;
      if (random <= 0) {
        return type;
      }
    }

    return this.contentTypes.STORY;
  }

  /**
   * Build AI prompt based on time and context
   */
  buildAIPrompt(timeSlot, context, contentType) {
    const slot = this.schedule[timeSlot];
    const currentTime = new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Cairo'
    });

    // System prompt (مخصص للتحفيز)
    const systemPrompt = `أنت مساعد تحفيزي احترافي متخصص في إلهام الفرق والموظفين. مهمتك إنشاء رسائل تحفيزية يومية باللغة العربية تجمع بين الحكمة والعملية والإلهام.

القواعد الأساسية:
1. اكتب بلغة عربية فصحى سهلة ومفهومة
2. كل رسالة يجب أن تكون قصيرة (150-250 حرف للاقتباسات، 300-500 للقصص)
3. ركز على القيمة العملية والتطبيق الفوري
4. نوّع بين الأساليب: اقتباسات، قصص نجاح، أمثال، حكم
5. اربط المحتوى بسياق العمل والإنتاجية
6. تجنب التكرار والكليشيهات المستهلكة
7. اختم كل رسالة بنقطة عمل واضحة أو سؤال تأملي`;

    // Time-specific user prompts
    const timePrompts = {
      morning: `ولّد رسالة تحفيزية صباحية للفريق.

الوقت: ${currentTime}
نوع المحتوى: ${contentType}
الهدف: ${slot.goal}
النبرة: ${slot.tone}

حالة الفريق:
- إجمالي المهام المفتوحة: ${context.openTasks}
- المهام المكتملة اليوم: ${context.completedToday}
- مستوى العمل: ${context.workloadLevel}
- حالة الفريق: ${context.teamMood}
${context.topPerformer ? `- أفضل أداء اليوم: ${context.topPerformer}` : ''}

${contentType === this.contentTypes.QUOTE ? `اختر اقتباساً ملهماً من شخصية ناجحة (عربية أو عالمية) عن البدايات القوية والطاقة الصباحية.` : ''}
${contentType === this.contentTypes.STORY ? `اكتب قصة نجاح قصيرة (2-3 جمل) عن تحدي صباحي تحول لإنجاز كبير.` : ''}
${contentType === this.contentTypes.PROVERB ? `استخدم حكمة أو مثل عربي أو عالمي عن أهمية البدايات القوية.` : ''}

الصيغة المطلوبة:
\`\`\`
🌅 [العنوان]

[المحتوى الرئيسي]

💡 خطوة اليوم: [إجراء واحد محدد وقابل للتنفيذ]
\`\`\``,

      midday: `ولّد رسالة تحفيزية لمنتصف اليوم.

الوقت: ${currentTime}
نوع المحتوى: ${contentType}
الهدف: ${slot.goal}
النبرة: ${slot.tone}

حالة الفريق:
- المهام المفتوحة: ${context.openTasks}
- المهام المكتملة اليوم: ${context.completedToday}
- المهام المتأخرة: ${context.overdueTasks}
- مستوى العمل: ${context.workloadLevel}

${context.workloadLevel === 'شديد' ? 'الفريق تحت ضغط كبير - ركز على المثابرة والتنظيم' : ''}
${context.completedToday > 5 ? 'الفريق منتج اليوم - احتفل بالإنجاز وشجع على المزيد' : ''}

${contentType === this.contentTypes.STORY ? `اكتب قصة عن المثابرة والاستمرارية في منتصف الطريق.` : ''}
${contentType === this.contentTypes.QUOTE ? `اختر اقتباساً عن قوة التركيز والانضباط.` : ''}
${contentType === this.contentTypes.PROVERB ? `استخدم حكمة عن إدارة الطاقة والاستمرار.` : ''}

الصيغة:
\`\`\`
⚡ [العنوان]

[المحتوى]

✅ الآن: [نصيحة عملية فورية]
\`\`\``,

      afternoon: `ولّد رسالة تحفيزية لفترة بعد الظهر.

الوقت: ${currentTime}
نوع المحتوى: ${contentType}
الهدف: ${slot.goal}
النبرة: ${slot.tone}

حالة الفريق:
- المهام المفتوحة: ${context.openTasks}
- المهام عالية الأولوية: ${context.highPriorityTasks}
- المهام المكتملة اليوم: ${context.completedToday}
- حالة الفريق: ${context.teamMood}

${context.overdueTasks > 0 ? `تنبيه: ${context.overdueTasks} مهمة متأخرة - ركز على الإنجاز` : ''}

${contentType === this.contentTypes.STORY ? `قصة عن لحظة حاسمة غيرت كل شيء.` : ''}
${contentType === this.contentTypes.QUOTE ? `اقتباس عن قوة الإنهاء والإتمام.` : ''}
${contentType === this.contentTypes.PROVERB ? `حكمة عن أهمية الجهد الأخير.` : ''}

الصيغة:
\`\`\`
🎯 [العنوان]

[المحتوى]

🚀 التحدي: [مهمة محددة لإنهاء اليوم بقوة]
\`\`\``,

      evening: `ولّد رسالة تحفيزية مسائية.

الوقت: ${currentTime}
نوع المحتوى: ${contentType}
الهدف: ${slot.goal}
النبرة: ${slot.tone}

إنجازات اليوم:
- المهام المكتملة: ${context.completedToday}
- الأعضاء النشطون: ${context.membersWithTasks}
${context.topPerformer ? `- نجم اليوم: ${context.topPerformer}` : ''}

${context.completedToday > 10 ? 'يوم منتج جداً - احتفل بالإنجاز' : ''}
${context.completedToday === 0 ? 'يوم هادئ - ركز على التخطيط للغد' : ''}

${contentType === this.contentTypes.PROVERB ? `حكمة عن الامتنان والتقدير.` : ''}
${contentType === this.contentTypes.STORY ? `قصة عن أهمية التأمل والتعلم من اليوم.` : ''}
${contentType === this.contentTypes.QUOTE ? `اقتباس عن النمو المستمر.` : ''}

الصيغة:
\`\`\`
🌙 [العنوان]

[المحتوى]

💭 تأمل: [سؤال أو فكرة للتأمل]
\`\`\``
    };

    return {
      systemPrompt,
      userPrompt: timePrompts[timeSlot]
    };
  }

  /**
   * Generate motivational message using AI
   */
  async generateMotivationalMessage(timeSlot) {
    try {
      logger.info(`Generating ${timeSlot} motivational message...`);

      // Analyze team context
      const context = await this.analyzeTeamContext();

      // Select content type for diversity
      const contentType = this.selectContentType(timeSlot);

      // Build AI prompt
      const { systemPrompt, userPrompt } = this.buildAIPrompt(timeSlot, context, contentType);

      // Generate content using AI
      const message = await aiService.generateCompletion(
        systemPrompt,
        userPrompt,
        {
          maxTokens: 600,
          temperature: 0.8 // More creative
        }
      );

      // Track in history
      this.contentHistory.push({
        timestamp: Date.now(),
        timeSlot,
        type: contentType,
        message: message.substring(0, 100) // Store first 100 chars for comparison
      });

      // Keep history size limited
      if (this.contentHistory.length > this.maxHistorySize) {
        this.contentHistory.shift();
      }

      logger.success(`${timeSlot} motivational message generated`, {
        type: contentType,
        length: message.length
      });

      return message;
    } catch (error) {
      logger.error(`Failed to generate ${timeSlot} motivational message`, {
        error: error.message
      });

      // Fallback message
      return this.getFallbackMessage(timeSlot);
    }
  }

  /**
   * Send motivational message to WhatsApp group
   */
  async sendMotivationalMessage(timeSlot) {
    try {
      if (!whatsappService.isClientReady()) {
        logger.warn('WhatsApp not ready, skipping motivational message');
        return false;
      }

      const message = await this.generateMotivationalMessage(timeSlot);

      await whatsappService.sendToGroup(message, {
        linkPreview: false
      });

      logger.success(`${timeSlot} motivational message sent to group`);
      return true;
    } catch (error) {
      logger.error(`Failed to send ${timeSlot} motivational message`, {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Fallback messages when AI fails
   */
  getFallbackMessage(timeSlot) {
    const fallbacks = {
      morning: `🌅 صباح الإنجاز

"النجاح لا يأتي من ما تفعله أحياناً، بل من ما تفعله دائماً"

💡 خطوة اليوم: ابدأ بأصعب مهمة في قائمتك خلال أول ساعة`,

      midday: `⚡ استمر بقوة

"الطريق إلى النجاح دائماً قيد الإنشاء" - ليلي توملين

✅ الآن: خذ استراحة 5 دقائق، ثم عد بتركيز أقوى`,

      afternoon: `🎯 الدفعة الأخيرة

"لا تتوقف عندما تتعب، توقف عندما تنتهي"

🚀 التحدي: أنهِ مهمة واحدة كاملة قبل نهاية اليوم`,

      evening: `🌙 يوم آخر، درس جديد

"كل يوم قد لا يكون جيداً، لكن هناك شيء جيد في كل يوم"

💭 تأمل: ما الشيء الواحد الذي تعلمته اليوم؟`
    };

    return fallbacks[timeSlot] || fallbacks.morning;
  }

  /**
   * Get content history for analytics
   */
  getContentHistory() {
    return this.contentHistory;
  }

  /**
   * Clear content history (for testing)
   */
  clearHistory() {
    this.contentHistory = [];
    logger.info('Motivation content history cleared');
  }
}

// Create singleton instance
const motivationService = new MotivationService();

export default motivationService;
