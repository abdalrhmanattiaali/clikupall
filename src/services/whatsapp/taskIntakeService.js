import eventBus, { EVENTS } from '../../core/eventBus.js';
import logger from '../../core/logger.js';
import whatsappService from './whatsappService.js';
import clickupService from '../clickup/clickupService.js';
import { findMemberByPhone, normalizePhone } from '../../config/team.js';
import taskDraftingService from '../ai/taskDraftingService.js';
import { findIntakeListByKey, getDefaultIntakeList, TASK_INTAKE_LISTS } from '../../config/taskIntake.js';

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const ATTACHMENT_STAGES = ['COLLECTING_ATTACHMENTS'];

class WhatsAppTaskIntakeService {
  constructor() {
    this.sessions = new Map();
    this.defaultList = getDefaultIntakeList();
    eventBus.onEvent(EVENTS.WHATSAPP_MESSAGE_RECEIVED, (payload) => this.handleIncomingMessage(payload));
    logger.info('WhatsApp personal task intake ready', {
      defaultList: this.defaultList?.name,
      lists: TASK_INTAKE_LISTS.map(list => `${list.name} (${list.key})`).join(', ')
    });
  }

  async handleIncomingMessage(payload) {
    const message = payload?.raw;
    if (!message || payload?.fromMe) {
      return;
    }

    if (payload?.isGroup || payload?.chatId?.endsWith('@g.us')) {
      return;
    }

    const member = this.identifyMember(payload?.chatId);
    if (!member) {
      logger.debug('Skipping personal message from unknown contact', { chatId: payload?.chatId });
      return;
    }

    const session = this.getSession(payload.chatId, member);
    session.updatedAt = Date.now();

    if (message.hasMedia && this.shouldCaptureAttachment(session)) {
      await this.captureAttachment(session, message);
      return;
    }

    if (message.hasMedia) {
      await whatsappService.sendMessage(session.chatId, '📝 أرسل وصف المهمة أولاً قبل مشاركة المرفقات.');
      return;
    }

    const body = (payload?.body || '').trim();
    if (!body) {
      return;
    }

    if (this.isCancelCommand(body)) {
      await this.cancelSession(session, 'تم إلغاء الطلب بناءً على طلبك. أرسل وصفاً جديداً متى شئت.');
      return;
    }

    if (this.isRestartCommand(body)) {
      await this.cancelSession(session, 'تم بدء طلب جديد. أرسل وصف المهمة التي تريد إنشاءها.');
      session.stage = 'IDLE';
      session.attachments = [];
      session.blueprint = null;
      session.originalText = '';
      return;
    }

    switch (session.stage) {
      case 'IDLE':
        await this.startBlueprint(session, body);
        break;
      case 'PROCESSING':
        await this.notifyStillProcessing(session);
        break;
      case 'AWAITING_ATTACHMENT_DECISION':
        await this.handleAttachmentDecision(session, body);
        break;
      case 'COLLECTING_ATTACHMENTS':
        await this.handleAttachmentCommand(session, body);
        break;
      case 'AWAITING_CONFIRMATION':
        await this.handleConfirmation(session, body);
        break;
      default:
        session.stage = 'IDLE';
        await this.startBlueprint(session, body);
        break;
    }
  }

  getSession(chatId, member) {
    const existing = this.sessions.get(chatId);
    if (existing && Date.now() - existing.updatedAt <= SESSION_TIMEOUT) {
      return existing;
    }

    const session = {
      chatId,
      member,
      stage: 'IDLE',
      originalText: '',
      blueprint: null,
      attachments: [],
      targetList: this.defaultList,
      updatedAt: Date.now()
    };

    this.sessions.set(chatId, session);
    return session;
  }

  identifyMember(chatId) {
    if (!chatId) return null;
    const digits = normalizePhone(chatId);
    return findMemberByPhone(digits);
  }

  async startBlueprint(session, body) {
    if (!body) {
      return;
    }

    session.stage = 'PROCESSING';
    session.originalText = body;
    session.attachments = [];
    session.blueprint = null;
    session.targetList = this.defaultList;

    await whatsappService.sendMessage(session.chatId, `👌 فهمت: *${body}*\nجاري تحويل الطلب إلى مهمة مرتبة...`);

    const blueprint = await taskDraftingService.generateBlueprint(body, {
      member: session.member,
      listCatalog: TASK_INTAKE_LISTS
    });

    session.blueprint = blueprint;
    session.targetList = findIntakeListByKey(blueprint.listKey) || this.defaultList;
    session.stage = 'AWAITING_ATTACHMENT_DECISION';

    const summary = this.buildBlueprintSummary(session);
    await whatsappService.sendMessage(session.chatId, summary);

    let attachmentQuestion = '📎 هل ترغب في إضافة ملف أو صورة تدعم هذه المهمة؟\n- أرسل "نعم" ثم أرسل الملفات.\n- أرسل "لا" للمتابعة دون مرفقات.';
    if (blueprint.attachmentsPrompt) {
      attachmentQuestion += `\n💡 اقتراح AI: ${blueprint.attachmentsPrompt}`;
    }
    await whatsappService.sendMessage(session.chatId, attachmentQuestion);
  }

  buildBlueprintSummary(session) {
    const blueprint = session.blueprint;
    const checklist = blueprint.checklist.map((item, index) => `${index + 1}. ${item}`).join('\n');
    const requirements = blueprint.requirements.map(req => `- ${req}`).join('\n');
    const due = blueprint.dueDateHint ? `\n• *Due:* ${blueprint.dueDateHint}` : '';

    return `📋 *Task Blueprint Ready*\n• *Title:* ${blueprint.title}\n• *List:* ${session.targetList?.name || 'General'}\n• *Priority:* ${blueprint.priority}${due}\n• *Reason:* ${blueprint.listReason}\n\n*Requirements*\n${requirements}\n\n*Checklist*\n${checklist}\n\n*Description Preview*\n${blueprint.description}`;
  }

  async handleAttachmentDecision(session, body) {
    if (this.isAffirmative(body)) {
      session.stage = 'COLLECTING_ATTACHMENTS';
      await whatsappService.sendMessage(session.chatId, '👍 أرسل الملفات الآن، وعند الانتهاء اكتب "تم" للمتابعة.');
      return;
    }

    if (this.isNegative(body)) {
      session.stage = 'AWAITING_CONFIRMATION';
      await this.sendFinalPreview(session);
      return;
    }

    await whatsappService.sendMessage(session.chatId, 'أرسل "نعم" لإضافة ملفات أو "لا" للمتابعة بدونها. يمكنك أيضاً كتابة "إلغاء" لإلغاء الطلب.');
  }

  async handleAttachmentCommand(session, body) {
    if (this.isAffirmative(body)) {
      await whatsappService.sendMessage(session.chatId, 'ارسل الملفات مباشرة، وعند الانتهاء اكتب "تم".');
      return;
    }

    if (this.isNegative(body)) {
      session.stage = 'AWAITING_CONFIRMATION';
      await this.sendFinalPreview(session);
      return;
    }

    if (this.isDoneCommand(body)) {
      session.stage = 'AWAITING_CONFIRMATION';
      await this.sendFinalPreview(session);
      return;
    }

    await whatsappService.sendMessage(session.chatId, 'أرسل الملفات الآن أو اكتب "تم" بعد الانتهاء.');
  }

  async handleConfirmation(session, body) {
    if (this.isDoneCommand(body)) {
      await this.createClickUpTask(session);
      return;
    }

    if (this.isNegative(body)) {
      await this.cancelSession(session, 'تم إلغاء إنشاء المهمة. أرسل وصفاً جديداً عند الحاجة.');
      return;
    }

    await whatsappService.sendMessage(session.chatId, 'اكتب "تم" لإنشاء المهمة أو "إلغاء" للتراجع.');
  }

  async captureAttachment(session, message) {
    try {
      session.updatedAt = Date.now();
      const media = await message.downloadMedia();
      if (!media) {
        await whatsappService.sendMessage(session.chatId, '⚠️ لم أستطع حفظ المرفق، حاول مرة أخرى.');
        return;
      }

      const filename = media.filename || `attachment-${session.attachments.length + 1}.${this.getExtension(media.mimetype)}`;
      const buffer = Buffer.from(media.data, 'base64');
      session.attachments.push({ filename, mimetype: media.mimetype, buffer });

      await whatsappService.sendMessage(session.chatId, `📥 تم حفظ المرفق: ${filename}`);
    } catch (error) {
      logger.warn('Failed to capture WhatsApp attachment', { error: error.message });
      await whatsappService.sendMessage(session.chatId, '⚠️ حدث خطأ أثناء حفظ الملف. حاول مرة أخرى أو أكمل بدون مرفقات.');
    }
  }

  shouldCaptureAttachment(session) {
    return ATTACHMENT_STAGES.includes(session.stage) || session.stage === 'AWAITING_ATTACHMENT_DECISION';
  }

  getExtension(mimetype = '') {
    if (!mimetype.includes('/')) {
      return 'bin';
    }
    const [, ext] = mimetype.split('/');
    if (ext === 'jpeg') return 'jpg';
    return ext || 'bin';
  }

  async sendFinalPreview(session) {
    const attachmentsInfo = session.attachments.length > 0
      ? `\n• Attachments ready: ${session.attachments.length}`
      : '';

    const message = `✅ جاهز لإنشاء المهمة التالية:\n• *Title:* ${session.blueprint.title}\n• *List:* ${session.targetList?.name}\n• *Assignee:* ${session.member.name}\n• *Due hint:* ${session.blueprint.dueDateHint || 'Not specified'}${attachmentsInfo}\n\nأرسل "تم" للإنشاء أو "إلغاء" للتراجع.`;

    await whatsappService.sendMessage(session.chatId, message);
  }

  async createClickUpTask(session) {
    try {
      await whatsappService.sendMessage(session.chatId, '⏳ جاري إنشاء المهمة ورفع المرفقات...');

      const listId = session.targetList?.listId || this.defaultList?.listId;
      if (!listId) {
        await whatsappService.sendMessage(session.chatId, '❌ لم يتم إعداد معرّف قائمة ClickUp لاستقبال هذه المهمة. حدّث متغير WHATSAPP_TASK_LISTS أو CLICKUP_SAMPLE_LIST_ID.');
        logger.error('Missing ClickUp list ID for WhatsApp intake');
        session.stage = 'IDLE';
        return;
      }

      const payload = this.buildClickUpPayload(session);
      const createdTask = await clickupService.createTask(listId, payload);

      for (const attachment of session.attachments) {
        await clickupService.addAttachment(createdTask.id, attachment.buffer, attachment.filename);
      }

      await whatsappService.sendMessage(session.chatId, `🎯 تم إنشاء المهمة *${createdTask.name}* في قائمة *${session.targetList?.name}*\n🔗 ${createdTask.url}`);
      this.sessions.delete(session.chatId);
    } catch (error) {
      logger.error('Failed to create ClickUp task from WhatsApp intake', { error: error.message });
      await whatsappService.sendMessage(session.chatId, '❌ حدث خطأ أثناء إنشاء المهمة. حاول مرة أخرى أو تواصل مع المطور.');
      session.stage = 'IDLE';
    }
  }

  buildClickUpPayload(session) {
    const { blueprint, member } = session;
    const descriptionParts = [
      `### Objective\n${blueprint.summary}`,
      `### Original WhatsApp Note\n${session.originalText}`,
      `### Requirements\n${blueprint.requirements.map(req => `- ${req}`).join('\n')}`,
      `### Execution Path\n${blueprint.checklist.map((item, index) => `${index + 1}. ${item}`).join('\n')}`,
      `### Detailed Brief\n${blueprint.description}`
    ];

    const dueDate = this.resolveDueDate(blueprint.dueDateHint);
    const priority = this.mapPriority(blueprint.priority);

    const payload = {
      name: blueprint.title,
      description: descriptionParts.join('\n\n'),
      assignees: member?.id ? [member.id] : [],
      notify_all: true
    };

    if (dueDate) {
      payload.due_date = dueDate;
    }

    if (priority) {
      payload.priority = priority;
    }

    return payload;
  }

  resolveDueDate(hint) {
    if (!hint) {
      return null;
    }

    const timestamp = Date.parse(hint);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }

    const within = hint.match(/(\d+)\s*(day|hour)/i);
    if (within) {
      const value = parseInt(within[1], 10);
      if (within[2].startsWith('day')) {
        return Date.now() + value * 24 * 60 * 60 * 1000;
      }
      if (within[2].startsWith('hour')) {
        return Date.now() + value * 60 * 60 * 1000;
      }
    }

    return null;
  }

  mapPriority(priority) {
    switch ((priority || '').toLowerCase()) {
      case 'urgent':
        return 1;
      case 'high':
        return 2;
      case 'normal':
        return 3;
      case 'low':
        return 4;
      default:
        return null;
    }
  }

  isAffirmative(text) {
    return /^(y|yes|نعم|ايوه|تمام|طبعا)/i.test(text);
  }

  isNegative(text) {
    return /^(n|no|لا|كلا|later)/i.test(text);
  }

  isDoneCommand(text) {
    return /^(تم|done|finish|ready)$/i.test(text);
  }

  isCancelCommand(text) {
    return /^(cancel|الغاء|إلغاء|stop)$/i.test(text);
  }

  isRestartCommand(text) {
    return /^(start|reset|جديد|مهمة جديدة)/i.test(text);
  }

  async cancelSession(session, message) {
    this.sessions.delete(session.chatId);
    await whatsappService.sendMessage(session.chatId, message);
  }

  async notifyStillProcessing(session) {
    await whatsappService.sendMessage(session.chatId, '⏳ ما زلت أجهز القالب، سأرسل لك الملخص حالما يجهز.');
  }
}

const taskIntakeService = new WhatsAppTaskIntakeService();

export default taskIntakeService;
