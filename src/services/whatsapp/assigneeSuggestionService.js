import logger from '../../core/logger.js';
import whatsappService from './whatsappService.js';
import clickupService from '../clickup/clickupService.js';
import aiService from '../ai/index.js';
import productivityRepo from '../../repositories/productivityRepository.js';
import TEAM, { findMemberById, findMemberByPhone, getWhatsAppId } from '../../config/team.js';
import { isNonOpenStatus } from '../../config/constants.js';

/**
 * Assignee Suggestion Service
 * يقترح مكلفين للمهام غير المسندة، ويرسل طلب استلام رقمي عبر واتساب.
 */
class AssigneeSuggestionService {
  constructor() {
    this.pendingOffers = new Map(); // chatId -> { member, offers: [offer], createdAt }
  }

  /**
   * Run a daily sweep: fetch unassigned tasks, rank candidates, and notify them.
   */
  async runDailyAssigneeSweep() {
    if (!whatsappService.isClientReady()) {
      logger.warn('WhatsApp not ready, skipping assignee sweep');
      return;
    }

    const tasks = await this.collectUnassignedTasks();
    if (tasks.length === 0) {
      logger.info('No unassigned tasks found for assignee sweep');
      return;
    }

    const memberProfiles = await this.buildMemberProfiles();

    for (const task of tasks) {
      try {
        const recommendation = await this.recommendAssignee(task, memberProfiles);
        if (!recommendation || !recommendation.assigneeId) {
          logger.debug('No recommendation generated for task', { taskId: task.id });
          continue;
        }

        const candidateId = Number(recommendation.assigneeId);
        const memberId = Number.isFinite(candidateId) ? candidateId : recommendation.assigneeId;
        const member = findMemberById(memberId);
        if (!member) {
          logger.warn('Recommended assignee not found in team list', { recommendation });
          continue;
        }

        await this.queueOffer(member, task, recommendation);
      } catch (error) {
        logger.error('Failed to process assignee recommendation', {
          taskId: task.id,
          error: error.message
        });
      }
    }
  }

  /**
   * Collect all open tasks without assignees (including subtasks).
   */
  async collectUnassignedTasks() {
    try {
      const tasks = await clickupService.getAllTeamTasks({ includeClosed: false, includeSubtasks: true });

      const filtered = (tasks || []).filter(task => {
        const hasAssignees = Array.isArray(task.assignees) && task.assignees.length > 0;
        return !hasAssignees && !isNonOpenStatus(task.status?.status, task.status?.type);
      });

      return filtered.map(task => ({
        id: task.id,
        name: task.name || 'مهمة بدون اسم',
        url: task.url || `https://app.clickup.com/t/${task.id}`,
        status: task.status?.status || task.status?.type || 'Open',
        listName: task.list?.name || 'قائمة غير معروفة',
        parentId: task.parent || task.parent_id || null,
        aiWeight: this.extractAiWeight(task),
        priority: task.priority?.priority || task.priority?.label || 'عادية'
      }));
    } catch (error) {
      logger.error('Failed to collect unassigned tasks', { error: error.message });
      return [];
    }
  }

  extractAiWeight(task) {
    const direct = task.ai_weight ?? task.aiWeight ?? task.weight ?? null;
    if (direct !== null && !Number.isNaN(Number(direct))) {
      return Number(direct);
    }

    const fields = task.custom_fields || task.customFields;
    if (Array.isArray(fields)) {
      for (const field of fields) {
        const label = (field?.name || field?.label || '').toLowerCase();
        if (label.includes('ai weight') || label.includes('ai score') || label.includes('weight')) {
          const weight = Number(field?.value);
          if (!Number.isNaN(weight)) {
            return weight;
          }
        }
      }
    }

    return null;
  }

  async buildMemberProfiles() {
    const profiles = [];

    for (const member of TEAM) {
      const entries = await productivityRepo.getUserEntries(member, { includeSubtasks: true });
      const todayEntries = entries.filter(e => this.isToday(e.timestamp));
      const weekEntries = entries.filter(e => this.isThisWeek(e.timestamp));

      const weightSum = entries.reduce((sum, entry) => {
        const w = Number(entry.aiWeight ?? entry.ai_weight ?? entry.points ?? entry.weight);
        return sum + (Number.isFinite(w) ? w : 0);
      }, 0);

      const categories = {};
      entries.forEach(entry => {
        if (Array.isArray(entry.categories)) {
          entry.categories.forEach(cat => {
            categories[cat] = (categories[cat] || 0) + 1;
          });
        }
      });

      const skillIndex = (entries.length * 2) + (todayEntries.length * 3) + (weekEntries.length * 1.5) + (weightSum * 0.2);

      profiles.push({
        id: member.id,
        name: member.name,
        total: entries.length,
        today: todayEntries.length,
        week: weekEntries.length,
        weightSum,
        categories,
        skillIndex: Number(skillIndex.toFixed(2))
      });
    }

    return profiles;
  }

  isToday(timestamp) {
    if (!timestamp) return false;
    const date = new Date(timestamp);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
  }

  isThisWeek(timestamp) {
    if (!timestamp) return false;
    const date = new Date(timestamp);
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(now.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return date >= weekStart && date <= weekEnd;
  }

  async recommendAssignee(task, memberProfiles) {
    const systemPrompt = 'أنت مدير عمليات تختار أفضل شخص لاستلام مهمة غير مسندة بناءً على إنجازات الفريق. اختر عضواً واحداً فقط من القائمة وأعد النتيجة بصيغة JSON.';

    const userPrompt = `المهمة: ${task.name}\nالقائمة: ${task.listName}\nالحالة: ${task.status}\nالوزن التقديري: ${task.aiWeight || 'غير محدد'}\nالأولوية: ${task.priority}\n\nأعضاء الفريق مع المؤشرات:\n${JSON.stringify(memberProfiles)}\n\nأعد JSON بالشكل {"assignee_id": <id>, "reason": "...", "confidence": 0-1}`;

    try {
      const response = await aiService.generateCompletion(systemPrompt, userPrompt, { temperature: 0.4, maxTokens: 400 });
      const parsed = this.parseRecommendation(response);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      logger.warn('AI recommendation failed, using fallback', { error: error.message });
    }

    const fallback = [...memberProfiles].sort((a, b) => b.skillIndex - a.skillIndex)[0];
    if (!fallback) return null;

    return {
      assigneeId: fallback.id,
      reason: `ترجيح يدوي: أعلى مؤشر إنجاز (${fallback.skillIndex})`,
      confidence: 0.55
    };
  }

  parseRecommendation(response) {
    if (!response) return null;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const data = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response);

      if (!data.assignee_id) return null;

      return {
        assigneeId: data.assignee_id,
        reason: data.reason || 'ترجيح تلقائي من الذكاء الاصطناعي',
        confidence: typeof data.confidence === 'number' ? data.confidence : 0.7
      };
    } catch (error) {
      logger.warn('Failed to parse AI recommendation', { error: error.message });
      return null;
    }
  }

  async queueOffer(member, task, recommendation) {
    const chatId = getWhatsAppId(member);
    const existing = this.pendingOffers.get(chatId) || { member, offers: [] };

    existing.offers.push({ task, recommendation, createdAt: Date.now() });
    this.pendingOffers.set(chatId, existing);

    if (existing.offers.length === 1) {
      await this.sendOfferMessage(chatId, member, existing.offers[0]);
    }
  }

  async sendOfferMessage(chatId, member, offer) {
    const message = this.buildOfferMessage(member, offer);
    await whatsappService.sendMessage(chatId, message);
  }

  buildOfferMessage(member, offer) {
    const task = offer.task;
    const reason = offer.recommendation?.reason || 'ترشيح تلقائي بناءً على الأداء';
    const weight = Number.isFinite(task.aiWeight) ? `• الوزن: ${task.aiWeight} نقطة\n` : '';

    let message = '🎯 *ترشيح تكليف تلقائي*\n\n';
    message += `📌 المهمة: ${task.name}\n`;
    message += `📂 القائمة: ${task.listName}\n`;
    message += `⚡ السبب: ${reason}\n`;
    message += weight;
    message += `🔗 ${task.url}\n\n`;
    message += 'اختر رقم الإجراء:\n';
    message += '1) أستلم المهمة الآن\n';
    message += '2) أعتذر / مررها لاحقاً\n';
    message += '\nالرد يكون بالرقم فقط.';

    return message;
  }

  /**
   * Determine if a chat has a pending offer.
   */
  hasPendingOffer(chatId) {
    const pending = this.pendingOffers.get(chatId);
    return pending && pending.offers.length > 0;
  }

  /**
   * Handle numeric response for pending offers.
   */
  async handleResponse(payload, member) {
    const chatId = payload?.chatId;
    const body = (payload?.body || '').trim();

    if (!chatId || !body || !this.hasPendingOffer(chatId)) {
      return false;
    }

    const choice = parseInt(body, 10);
    if (Number.isNaN(choice)) {
      await whatsappService.sendMessage(chatId, 'الرجاء الرد برقم 1 أو 2 فقط.');
      return true;
    }

    const session = this.pendingOffers.get(chatId);
    const currentOffer = session.offers[0];

    if (choice === 1) {
      await this.assignTaskToMember(currentOffer.task, member);
      await whatsappService.sendMessage(chatId, `✅ تم إسناد المهمة إليك: ${currentOffer.task.name}`);
      session.offers.shift();
    } else if (choice === 2) {
      await whatsappService.sendMessage(chatId, 'تم تسجيل رفضك، سنحاول مع عضو آخر لاحقاً.');
      session.offers.shift();
    } else {
      await whatsappService.sendMessage(chatId, 'الخيارات المتاحة: 1 للاستلام، 2 للاعتذار.');
    }

    if (session.offers.length > 0) {
      await this.sendOfferMessage(chatId, session.member, session.offers[0]);
    } else {
      this.pendingOffers.delete(chatId);
    }

    return true;
  }

  async assignTaskToMember(task, member) {
    try {
      await clickupService.updateTask(task.id, {
        assignees: {
          add: [member.id],
          rem: []
        }
      });

      logger.success('Task assigned via suggestion flow', {
        taskId: task.id,
        assignee: member.name
      });
    } catch (error) {
      logger.error('Failed to assign task from suggestion', {
        taskId: task.id,
        assignee: member.name,
        error: error.message
      });
      await whatsappService.sendMessage(getWhatsAppId(member), 'تعذر إسناد المهمة حالياً، حاول لاحقاً أو بلغ المشرف.');
    }
  }

  /**
   * Help other services skip intake when offer is active.
   */
  shouldConsumeMessage(payload) {
    if (!payload || payload.isGroup) return false;
    const chatId = payload.chatId;
    if (!chatId) return false;
    const member = findMemberByPhone(chatId);
    if (!member) return false;
    return this.hasPendingOffer(chatId);
  }
}

const assigneeSuggestionService = new AssigneeSuggestionService();

export default assigneeSuggestionService;
