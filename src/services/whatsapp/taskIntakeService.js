import eventBus, { EVENTS } from '../../core/eventBus.js';
import logger from '../../core/logger.js';
import whatsappService from './whatsappService.js';
import clickupService from '../clickup/clickupService.js';
import TEAM, { findMemberByPhone, normalizePhone } from '../../config/team.js';
import taskDraftingService from '../ai/taskDraftingService.js';
import { findIntakeListByKey, getDefaultIntakeList, TASK_INTAKE_LISTS } from '../../config/taskIntake.js';
import assigneeSuggestionService from './assigneeSuggestionService.js';
import intakePreferencesRepository from './intakePreferencesRepository.js';

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

    if (await assigneeSuggestionService.maybeHandleManualTrigger(payload, member)) {
      return;
    }

    if (assigneeSuggestionService.shouldConsumeMessage(payload)) {
      const consumed = await assigneeSuggestionService.handleResponse(payload, member);
      if (consumed) {
        return;
      }
    }

    const session = this.getSession(payload.chatId, member);
    session.updatedAt = Date.now();

    if (message.hasMedia && session.stage === 'IDLE') {
      await this.startImageBlueprint(session, message);
      return;
    }

    if (message.hasMedia && this.shouldCaptureAttachment(session)) {
      await this.captureAttachment(session, message);
      return;
    }

    if (message.hasMedia) {
      const attachmentBlocker = session.stage === 'SELECTING_ASSIGNEE'
        ? '👤 اختر المكلف بالأرقام أولاً قبل إرسال أي مرفقات.'
        : '📝 أرسل وصف المهمة أولاً قبل مشاركة المرفقات.';
      await whatsappService.sendMessage(session.chatId, attachmentBlocker);
      return;
    }

    const body = (payload?.body || '').trim();
    if (!body) {
      return;
    }

    if (this.isRestartCommand(body)) {
      await this.cancelSession(session, 'تم بدء طلب جديد. أرسل وصف المهمة التي تريد إنشاءها.');
      session.stage = 'IDLE';
      session.attachments = [];
      session.additionalNotes = [];
      session.blueprint = null;
      session.originalText = '';
      session.selectedAssignees = [];
      return;
    }

    switch (session.stage) {
      case 'IDLE':
        if (this.isCancelCommand(body)) {
          await whatsappService.sendMessage(session.chatId, 'لا يوجد طلب نشط حالياً. أرسل وصف المهمة للبدء.');
          return;
        }
        await this.startBlueprint(session, body);
        break;
      case 'PROCESSING':
        if (this.isCancelCommand(body)) {
          await this.cancelSession(session, 'تم إلغاء الطلب أثناء التحضير. أرسل وصفاً جديداً عند الرغبة في البدء من جديد.');
          return;
        }
        await this.notifyStillProcessing(session);
        break;
      case 'SELECTING_LIST':
        await this.handleListSelection(session, body);
        break;
      case 'SELECTING_ASSIGNEE':
        await this.handleAssigneeSelection(session, body);
        break;
      case 'SELECTING_TITLE':
        await this.handleTitleSelection(session, body);
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
      selectedAssignees: [],
      arabicTitle: '',
      titleLanguage: 'en',
      preferences: [],
      additionalNotes: [],
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
    session.additionalNotes = [];
    session.blueprint = null;
    session.targetList = this.defaultList;
    session.selectedAssignees = [];
    session.arabicTitle = '';
    session.titleLanguage = 'en';
    session.preferences = await intakePreferencesRepository.getMemberPreferences(session.member?.id);

    await whatsappService.sendMessage(session.chatId, `👌 فهمت: *${body}*\nجاري تحويل الطلب إلى مهمة مرتبة...`);

    const blueprint = await taskDraftingService.generateBlueprint(body, {
      member: session.member,
      listCatalog: TASK_INTAKE_LISTS,
      preferences: session.preferences
    });

    session.blueprint = blueprint;
    session.targetList = findIntakeListByKey(blueprint.listKey) || this.defaultList;
    session.arabicTitle = this.deriveArabicTitle(session);
    session.stage = 'SELECTING_LIST';

    const summary = this.buildBlueprintSummary(session);
    await whatsappService.sendMessage(session.chatId, summary);
    if (blueprint.needsCustomerName) {
      await whatsappService.sendMessage(session.chatId, '❓ اسم العميل غير واضح، اكتب اسم العميل أو رقم الطلب لتأكيده.');
    }
    await this.promptForList(session);
  }

  async startImageBlueprint(session, message) {
    try {
      session.stage = 'PROCESSING';
      session.originalText = message?.caption || '[Image intake]';
      session.attachments = [];
      session.additionalNotes = [];
      session.blueprint = null;
      session.targetList = this.defaultList;
      session.selectedAssignees = [];
      session.arabicTitle = '';
      session.titleLanguage = 'en';
      session.preferences = await intakePreferencesRepository.getMemberPreferences(session.member?.id);

      await whatsappService.sendMessage(session.chatId, '🖼️ تم استلام الملف/الصورة، جاري قراءة المستند وتحويله إلى مهمة واضحة...');

      const media = await message.downloadMedia();
      if (!media) {
        await whatsappService.sendMessage(session.chatId, '⚠️ لم أستطع تحميل الملف. أعد الإرسال أو استخدم وصفاً نصياً.');
        session.stage = 'IDLE';
        return;
      }

      const attachment = {
        filename: media.filename || `document-${Date.now()}.${this.getExtension(media.mimetype)}`,
        mimetype: media.mimetype,
        buffer: Buffer.from(media.data, 'base64')
      };

      session.attachments = [attachment];

      const blueprint = await taskDraftingService.generateBlueprintFromImage(attachment, {
        member: session.member,
        listCatalog: TASK_INTAKE_LISTS,
        preferences: session.preferences
      });

      session.blueprint = blueprint;
      session.targetList = findIntakeListByKey(blueprint.listKey) || this.defaultList;
      session.arabicTitle = this.deriveArabicTitle(session);
      session.stage = 'SELECTING_LIST';

      const summary = this.buildBlueprintSummary(session);
      await whatsappService.sendMessage(session.chatId, summary);
      if (blueprint.needsCustomerName) {
        await whatsappService.sendMessage(session.chatId, '❓ اسم العميل غير واضح في المستند، اكتب اسم العميل أو رقم الـ PO لو متاح.');
      }
      await this.promptForList(session);
    } catch (error) {
      logger.error('Failed to start image blueprint', { error: error.message });
      session.stage = 'IDLE';
      await whatsappService.sendMessage(session.chatId, '❌ حدث خطأ أثناء تحليل الصورة. أرسل وصفاً نصياً أو حاول مرة أخرى.');
    }
  }

  buildBlueprintSummary(session) {
    const blueprint = session.blueprint;
    const due = blueprint.dueDateHint ? `\n• *Due:* ${blueprint.dueDateHint}` : '';
    const arabicTitle = this.deriveArabicTitle(session);
    const currentTitle = this.getSelectedTitle(session);

    return `📋 *Task Blueprint Ready*\n• *Title (EN):* ${blueprint.title}\n• *عنوان مقترح (AR):* ${arabicTitle}\n• *العنوان الحالي:* ${currentTitle}\n• *List:* ${session.targetList?.name || 'General'}\n• *Priority:* ${blueprint.priority}${due}\n• *Reason:* ${blueprint.listReason}`;
  }

  async promptForList(session) {
    const recommended = session.targetList?.name || 'General';
    const reason = session.blueprint?.listReason || 'AI suggestion';
    await whatsappService.sendMessage(session.chatId, `📂 القائمة المقترحة: ${recommended}\nℹ️ السبب: ${reason}\n\n1. اعتماد القائمة المقترحة والمتابعة\nأرسل رقم قائمة آخر للتغيير أو 99 لعرض كل القوائم بالأرقام.\n0 للإلغاء.`);
  }

  async promptForAssignee(session) {
    const teamOptions = this.getTeamOptions();
    if (teamOptions.length === 0) {
      session.selectedAssignees = [session.member];
      session.stage = 'SELECTING_TITLE';
      await this.promptForTitleLanguage(session);
      return;
    }

    const optionLines = teamOptions.map(opt => `${opt.number}. ${opt.member.name}`).join('\n');
    const message = `👤 من سيكون مكلفاً بهذه المهمة؟\n${optionLines}\n0. إلغاء الطلب\n\nأرسل الأرقام (مثال: 1 أو 1 3) لاختيار المكلفين.`;
    await whatsappService.sendMessage(session.chatId, message);
  }

  async promptForTitleLanguage(session) {
    const titleSwitches = this.getTitleSwitchOptions();
    const titleLines = titleSwitches.map(opt => `${opt.label}`).join(' | ');
    await whatsappService.sendMessage(session.chatId, `📝 لغة العنوان؟ ${titleLines}\n0. إلغاء الطلب\n\nأرسل رقم واحد لاختيار اللغة.`);
  }

  async handleListSelection(session, body) {
    const choices = this.extractNumericSelections(body);
    if (choices.length === 0) {
      await whatsappService.sendMessage(session.chatId, 'أرسل رقم القائمة أو 99 لعرض القوائم بالأرقام.');
      await this.promptForList(session);
      return;
    }

    if (choices.includes(1)) {
      await whatsappService.sendMessage(session.chatId, `📂 تم اعتماد القائمة المقترحة: ${session.targetList?.name || 'General'}`);
      await this.recordListChoice(session);
      session.stage = 'SELECTING_ASSIGNEE';
      await this.promptForAssignee(session);
      return;
    }

    if (choices.includes(0)) {
      await this.cancelSession(session, 'تم إلغاء الطلب بناءً على اختيارك. أرسل وصفاً جديداً عند الحاجة.');
      return;
    }

    if (choices.includes(99)) {
      await this.sendListOptions(session);
      return;
    }

    const listOptions = this.getListOptions();
    const listByNumber = new Map(listOptions.map(opt => [opt.number, opt.list]));
    const picked = choices.map(choice => listByNumber.get(choice)).find(Boolean);

    if (!picked) {
      await whatsappService.sendMessage(session.chatId, 'لم أتعرف على الرقم المرسل. أرسل 99 لعرض القوائم أو رقم قائمة صحيح.');
      await this.promptForList(session);
      return;
    }

    session.targetList = picked;
    await whatsappService.sendMessage(session.chatId, `📂 تم اختيار القائمة: ${picked.name}`);
    await this.recordListChoice(session);
    session.stage = 'SELECTING_ASSIGNEE';
    await this.promptForAssignee(session);
  }

  async handleTitleSelection(session, body) {
    const choices = this.extractNumericSelections(body);
    if (choices.length === 0) {
      await whatsappService.sendMessage(session.chatId, 'أرسل رقم 8 أو 9 لاختيار لغة العنوان، أو 0 للإلغاء.');
      await this.promptForTitleLanguage(session);
      return;
    }

    if (choices.includes(0)) {
      await this.cancelSession(session, 'تم إلغاء الطلب بناءً على اختيارك. أرسل وصفاً جديداً عند الحاجة.');
      return;
    }

    const titleSwitches = this.getTitleSwitchOptions();
    const titleByNumber = new Map(titleSwitches.map(opt => [opt.number, opt.value]));
    const selectedLanguage = choices.map(choice => titleByNumber.get(choice)).find(Boolean);

    if (!selectedLanguage) {
      await whatsappService.sendMessage(session.chatId, 'الرجاء اختيار رقم لغة صحيح (8 أو 9).');
      await this.promptForTitleLanguage(session);
      return;
    }

    session.titleLanguage = selectedLanguage;
    const titleLabel = selectedLanguage === 'ar' ? 'العنوان العربي' : 'العنوان الإنجليزي';
    await whatsappService.sendMessage(session.chatId, `📝 تم ضبط لغة العنوان: ${titleLabel}`);

    if (this.shouldSkipAttachmentStep(session)) {
      session.stage = 'AWAITING_CONFIRMATION';
      await this.sendFinalPreview(session);
      return;
    }

    session.stage = 'COLLECTING_ATTACHMENTS';
    await this.sendAttachmentPrompt(session);
  }

  async sendListOptions(session) {
    const listOptions = this.getListOptions();
    const listLines = listOptions.length > 0 ? listOptions.map(opt => `${opt.number}. ${opt.list.name}`).join('\n') : '—';
    await whatsappService.sendMessage(session.chatId, `📂 القوائم المتاحة:\n${listLines}\n\nاختر رقم قائمة واحد أو 0 للإلغاء.`);
  }

  async sendAttachmentPrompt(session) {
    const blueprint = session.blueprint || {};
    let attachmentQuestion = '📎 يمكنك الآن إرسال ملفات أو كتابة تعليمات إضافية تدعم المهمة.\n- أرسل الملفات مباشرة أو اكتب الملاحظات التي تريد إضافتها.\n- عند الانتهاء اختر *1* للمتابعة أو *2* للإلغاء.';
    if (blueprint.attachmentsPrompt) {
      attachmentQuestion += `\n💡 اقتراح AI: ${blueprint.attachmentsPrompt}`;
    }
    await whatsappService.sendMessage(session.chatId, attachmentQuestion);
  }

  async handleAttachmentCommand(session, body) {
    if (this.isCancelCommand(body)) {
      await this.cancelSession(session, 'تم إلغاء إنشاء المهمة. أرسل وصفاً جديداً عند الحاجة.');
      return;
    }

    if (this.isDoneCommand(body) || this.isNegative(body)) {
      session.stage = 'AWAITING_CONFIRMATION';
      await this.sendFinalPreview(session);
      return;
    }

    if (this.isAffirmative(body)) {
      await whatsappService.sendMessage(session.chatId, 'أرسل الملفات أو الملاحظات الآن، وعند الانتهاء اختر الرقم 1 للمتابعة أو 2 للإلغاء.');
      return;
    }

    if (body) {
      session.additionalNotes.push(body);
      await whatsappService.sendMessage(session.chatId, '✍️ تم حفظ ملاحظتك. يمكنك إرسال المزيد أو اختيار الرقم 1 عند الانتهاء.');
      return;
    }

    await whatsappService.sendMessage(session.chatId, 'أرسل الملفات أو الملاحظات الآن، أو اختر الرقم 1 بعد الانتهاء.');
  }

  async handleAssigneeSelection(session, body) {
    const choices = this.extractNumericSelections(body);
    if (choices.length === 0) {
      await whatsappService.sendMessage(session.chatId, 'الرجاء إرسال رقم واحد أو أكثر من القائمة لتحديد المكلفين.');
      await this.promptForAssignee(session);
      return;
    }

    if (choices.includes(0)) {
      await this.cancelSession(session, 'تم إلغاء الطلب بناءً على اختيارك. أرسل وصفاً جديداً عند الحاجة.');
      return;
    }

    const teamOptions = this.getTeamOptions();

    const selected = choices
      .map(choice => teamOptions.find(opt => opt.number === choice)?.member)
      .filter(member => !!member && member.id)
      .filter((member, index, arr) => arr.findIndex(other => other.id === member.id) === index);

    if (selected.length === 0) {
      await whatsappService.sendMessage(session.chatId, 'لم أتعرف على الأرقام المرسلة. أعد المحاولة باستخدام أرقام من القائمة.');
      await this.promptForAssignee(session);
      return;
    }

    session.selectedAssignees = selected;
    const assigneeNames = selected.map(m => m.name).join(', ');
    await whatsappService.sendMessage(session.chatId, `✅ تم اختيار المكلفين: ${assigneeNames}`);

    session.stage = 'SELECTING_TITLE';
    await this.promptForTitleLanguage(session);
  }

  async handleConfirmation(session, body) {
    if (this.isDoneCommand(body)) {
      await this.createClickUpTask(session);
      return;
    }

    if (this.isCancelCommand(body) || this.isNegative(body)) {
      await this.cancelSession(session, 'تم إلغاء إنشاء المهمة. أرسل وصفاً جديداً عند الحاجة.');
      return;
    }

    await whatsappService.sendMessage(session.chatId, 'اختر الرقم 1 لإنشاء المهمة أو 2 لإلغاء الطلب.');
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
    return ATTACHMENT_STAGES.includes(session.stage);
  }

  shouldSkipAttachmentStep(session) {
    return session?.blueprint?.source === 'image';
  }

  getExtension(mimetype = '') {
    if (!mimetype.includes('/')) {
      return 'bin';
    }
    const [, ext] = mimetype.split('/');
    if (ext === 'jpeg') return 'jpg';
    return ext || 'bin';
  }

  getTeamOptions() {
    return TEAM.map((member, index) => ({ number: index + 1, member }));
  }

  extractNumericSelections(text) {
    if (!text) {
      return [];
    }

    const matches = text.match(/\d+/g);
    if (!matches) {
      return [];
    }

    return matches
      .map(value => parseInt(value, 10))
      .filter(number => Number.isInteger(number));
  }

  async sendFinalPreview(session) {
    const attachmentsInfo = session.attachments.length > 0
      ? `\n• Attachments ready: ${session.attachments.length}`
      : '';
    const notesInfo = session.additionalNotes.length > 0
      ? `\n• Extra notes: ${session.additionalNotes.length}`
      : '';
    const assigneeNames = this.formatAssigneeNames(session);
    const selectedTitle = this.getSelectedTitle(session);
    const altTitleLine = session.titleLanguage === 'ar'
      ? `\n• English title: ${session.blueprint.title}`
      : `\n• عنوان عربي مقترح: ${this.deriveArabicTitle(session)}`;

    const message = `✅ جاهز لإنشاء المهمة التالية:\n• *Title:* ${selectedTitle}${altTitleLine}\n• *List:* ${session.targetList?.name}\n• *Assignees:* ${assigneeNames}\n• *Due hint:* ${session.blueprint.dueDateHint || 'Not specified'}${attachmentsInfo}${notesInfo}\n\nاختر الإجراء المناسب:\n1. إنشاء المهمة الآن\n2. إلغاء الطلب`;

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
      const createdTask = await clickupService.createTask(listId, payload, {
        asUserId: session.member?.id
      });

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
      `### Objective\n- ${blueprint.summary}`,
      `### Requirements\n${blueprint.requirements.map(req => `- ${req}`).join('\n')}`,
      `### Steps\n${blueprint.checklist.map((item, index) => `${index + 1}. ${item}`).join('\n')}`,
      `### Source\n- ${session.originalText}`
    ];

    const phoneDigits = normalizePhone(member?.phone || session.chatId);
    const requesterName = member?.name || 'غير معروف';
    const requesterPhone = phoneDigits ? `+${phoneDigits}` : 'غير متوفر';
    const requesterId = member?.id ? member.id : 'غير معروف';
    descriptionParts.push(
      `### WhatsApp Intake Metadata\n- Requester: ${requesterName}\n- Phone: ${requesterPhone}\n- Chat: ${session.chatId}\n- ClickUp User ID: ${requesterId}`
    );

    if (session.additionalNotes.length > 0) {
      descriptionParts.push(`### Extra Notes\n${session.additionalNotes.map(note => `- ${note}`).join('\n')}`);
    }

    const dueDate = this.resolveDueDate(blueprint.dueDateHint);
    const priority = this.mapPriority(blueprint.priority);

    const payload = {
      name: blueprint.title,
      description: descriptionParts.join('\n\n'),
      assignees: this.getAssigneeIds(session, member),
      notify_all: true,
      tags: this.buildTags(member, session.chatId),
      followers: this.getFollowerIds(member)
    };

    if (dueDate) {
      payload.due_date = dueDate;
    }

    if (priority) {
      payload.priority = priority;
    }

    return payload;
  }

  buildTags(member, chatId) {
    const tags = ['whatsapp-intake'];
    const phoneDigits = normalizePhone(member?.phone || chatId);
    if (phoneDigits) {
      tags.push(`from-${phoneDigits}`);
      if (member?.id) {
        tags.push(`from-id-${member.id}`);
      }
    }

    const normalizedName = (member?.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (normalizedName) {
      tags.push(`from-${normalizedName}`);
    }

    return tags;
  }

  getFollowerIds(member) {
    if (!member?.id) {
      return [];
    }

    return [member.id];
  }

  async recordListChoice(session) {
    try {
      await intakePreferencesRepository.recordListChoice(session.member?.id, session.targetList?.key);
      session.preferences = await intakePreferencesRepository.getMemberPreferences(session.member?.id);
    } catch (error) {
      logger.warn('Failed to persist list choice preference', { error: error.message });
    }
  }

  formatAssigneeNames(session) {
    const selected = session.selectedAssignees?.length ? session.selectedAssignees : (session.member ? [session.member] : []);
    return selected.length > 0 ? selected.map(m => m.name).join(', ') : 'غير محدد';
  }

  getAssigneeIds(session, fallbackMember) {
    const selected = session.selectedAssignees?.length ? session.selectedAssignees : (fallbackMember ? [fallbackMember] : []);
    return selected
      .map(assignee => assignee?.id)
      .filter(id => typeof id === 'number');
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
    return /^(1|تم|done|finish|ready)$/i.test(text);
  }

  isCancelCommand(text) {
    return /^(0|2|cancel|الغاء|إلغاء|stop)$/i.test(text);
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

  deriveArabicTitle(session) {
    if (!session?.blueprint) return '';
    const aiTitle = (session.blueprint.arabicTitle || '').trim();
    if (aiTitle) return aiTitle;
    const requestText = (session.originalText || '').trim();
    const hasArabic = /[ء-ي]/.test(requestText);
    if (hasArabic) {
      return requestText.slice(0, 90);
    }
    return `${session.blueprint.title} (ترجمة مقترحة)`;
  }

  getSelectedTitle(session) {
    return (session?.titleLanguage === 'ar' && session?.arabicTitle)
      ? session.arabicTitle
      : session?.blueprint?.title;
  }

  getListOptions() {
    return TASK_INTAKE_LISTS.map((list, index) => ({ number: 20 + index, list }));
  }

  getTitleSwitchOptions() {
    return [
      { number: 8, value: 'en', label: '8. العنوان بالإنجليزية (افتراضي)' },
      { number: 9, value: 'ar', label: '9. العنوان بالعربية' }
    ];
  }
}

const taskIntakeService = new WhatsAppTaskIntakeService();

export default taskIntakeService;
