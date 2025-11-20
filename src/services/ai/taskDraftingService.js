import aiService from './index.js';
import logger from '../../core/logger.js';
import { TASK_INTAKE_LISTS } from '../../config/taskIntake.js';

class TaskDraftingService {
  constructor() {
    this.defaultChecklist = [
      'Clarify scope with requester',
      'Define deliverables and owners',
      'Share progress update'
    ];

    this.listKeywordHints = [
      {
        key: 'clients_quotes',
        reason: 'Detected quotation / pricing keywords from the request.',
        keywords: ['عرض سعر', 'عروض اسعار', 'quote', 'pricing', 'تسعير']
      },
      {
        key: 'clients_order_approvals',
        reason: 'Order approval keywords detected (اعتماد طلب / approvals).',
        keywords: ['اعتماد طلب', 'approve order', 'اعتماد اوردر', 'approval request']
      },
      {
        key: 'clients_sample_approvals',
        reason: 'Sample approval workflow detected.',
        keywords: ['اعتماد عينات', 'sample approval', 'sample signoff']
      },
      {
        key: 'orders_invoicing',
        reason: 'Invoice / billing keywords detected.',
        keywords: ['فاتورة', 'فواتير', 'invoice', 'billing']
      },
      {
        key: 'orders_delivery',
        reason: 'Delivery / shipping context detected.',
        keywords: ['توصيل', 'delivery', 'شحن', 'courier']
      },
      {
        key: 'orders_preparation',
        reason: 'Order preparation context detected.',
        keywords: ['تحضير', 'تجهيز', 'order prep', 'pack order']
      },
      {
        key: 'orders_samples',
        reason: 'Sample preparation request detected.',
        keywords: ['تجهيز عينات', 'prepare samples', 'sample kit']
      },
      {
        key: 'daily_procurement',
        reason: 'Procurement / purchasing words detected.',
        keywords: ['مشتريات', 'شراء', 'procurement', 'توريد']
      },
      {
        key: 'daily_transport',
        reason: 'Transportation / moving request detected.',
        keywords: ['نقل', 'transport', 'move items', 'شحن داخلي']
      },
      {
        key: 'daily_maintenance',
        reason: 'Maintenance / repair request detected.',
        keywords: ['صيانه', 'صيانة', 'maintenance', 'repair']
      },
      {
        key: 'finance_transfers',
        reason: 'Money transfer instructions detected.',
        keywords: ['تحويل', 'حوالة', 'transfer', 'bank transfer']
      },
      {
        key: 'finance_tax_returns',
        reason: 'Tax filing references detected.',
        keywords: ['ضريبة', 'tax', 'اقرار']
      },
      {
        key: 'finance_receipts_review',
        reason: 'Incoming payment review detected.',
        keywords: ['استقبال اموال', 'تحصيل', 'receipts review']
      },
      {
        key: 'finance_receivables_followup',
        reason: 'Receivables / collection follow-up detected.',
        keywords: ['مستحقات', 'collection', 'receivables']
      },
      {
        key: 'opportunities_luna',
        reason: 'LUNA opportunity mentioned in the request.',
        keywords: ['لونا', 'luna']
      },
      {
        key: 'opportunities_shera_pharma',
        reason: 'Shera Pharma opportunity mentioned in the request.',
        keywords: ['شيرا', 'shera']
      },
      {
        key: 'opportunities_brand_company',
        reason: 'Brand company opportunity detected.',
        keywords: ['براند', 'brand company']
      },
      {
        key: 'opportunities_integrated_cosmetics',
        reason: 'Integrated cosmetics lead detected.',
        keywords: ['المتكاملة', 'integrated cosmetics']
      },
      {
        key: 'opportunities_milano_pharma',
        reason: 'Milano Pharma lead mentioned.',
        keywords: ['ميلانو', 'milano']
      },
      {
        key: 'clients_followups',
        reason: 'General client follow-up request detected.',
        keywords: ['متابعة', 'follow up', 'متابعه طلب']
      },
      {
        key: 'erp_updates',
        reason: 'ERP / system update keywords detected.',
        keywords: ['erp', 'نظام', 'system update', 'اوتوميشن']
      },
      {
        key: 'erp_inventory',
        reason: 'Inventory entry / withdrawal detected.',
        keywords: ['مخزون', 'inventory', 'stock entry', 'سحب مخزون']
      },
      {
        key: 'finance_purchase_entry',
        reason: 'Purchase entry keywords detected.',
        keywords: ['ادخال مشتريات', 'purchase entry', 'مشتريات']
      }
    ];
  }

  async generateBlueprint(requestText, { member, listCatalog } = {}) {
    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(requestText, member, listCatalog);

      const response = await aiService.generateCompletion(systemPrompt, userPrompt, {
        temperature: 0.35,
        maxTokens: 1800
      });

      const parsed = this.extractJson(response);
      const normalized = await this.normalizeBlueprint(parsed, requestText, listCatalog);
      normalized.title = await this.ensureEnglishTitle(normalized.title, requestText);

      logger.success('AI task blueprint generated', {
        requester: member?.name,
        listKey: normalized.listKey,
        priority: normalized.priority
      });

      return normalized;
    } catch (error) {
      logger.error('Failed to generate AI task blueprint', {
        error: error.message
      });

      const fallback = await this.fallbackBlueprint(requestText, member, listCatalog);
      fallback.title = await this.ensureEnglishTitle(fallback.title, requestText);
      return fallback;
    }
  }

  async generateBlueprintFromImage(attachment, { member = {}, listCatalog } = {}) {
    const catalog = Array.isArray(listCatalog) && listCatalog.length > 0
      ? listCatalog
      : TASK_INTAKE_LISTS;

    const base64 = attachment?.buffer ? attachment.buffer.toString('base64') : '';
    const safeFilename = attachment?.filename || 'document.jpg';
    const fileInfo = `Name: ${safeFilename} | Mime: ${attachment?.mimetype || 'unknown'}`;

    try {
      const systemPrompt = this.buildImageSystemPrompt();
      const userPrompt = this.buildImageUserPrompt({
        member,
        fileInfo,
        base64,
        listCatalog: catalog
      });

      const response = await aiService.generateCompletion(systemPrompt, userPrompt, {
        temperature: 0.35,
        maxTokens: 2200
      });

      const parsed = this.extractJson(response);
      const normalized = await this.normalizeBlueprint(parsed, safeFilename, catalog);
      normalized.title = await this.ensureEnglishTitle(normalized.title, safeFilename);
      normalized.source = 'image';

      logger.success('AI image blueprint generated', {
        requester: member?.name,
        listKey: normalized.listKey,
        priority: normalized.priority,
        filename: safeFilename
      });

      return normalized;
    } catch (error) {
      logger.error('Failed to generate AI image blueprint', {
        error: error.message,
        filename: safeFilename
      });

      const fallback = await this.fallbackBlueprintFromImage(safeFilename, member, catalog);
      fallback.source = 'image';
      return fallback;
    }
  }

  buildSystemPrompt() {
    return `You are an elite operations coordinator that transforms raw WhatsApp notes into polished ClickUp tasks.
You MUST answer with valid JSON only.
Every task title and description must be written in English and follow a crisp template.
Break the description into structured sections (Objective, Requirements, Execution Path, Success Criteria).
Before proposing anything, deduce what the task needs in order to be completed (resources, approvals, files, people).

Respond with this JSON schema:
{
  "task_title": "string",
  "task_summary": "one sentence english summary",
  "task_description": "multi-line english markdown with headers",
  "requirements": ["resource or dependency"],
  "checklist": ["actionable english step"],
  "priority": "urgent | high | normal | low",
  "due_date_hint": "ISO date or human window",
  "list_key": "one of the provided list keys",
  "list_reason": "why this list fits",
  "attachments_prompt": "what files to request if any"
}
Ensure checklist items cover the entire execution path and never leave the list_key empty.`;
  }

  buildUserPrompt(requestText, member, listCatalog) {
    const catalog = Array.isArray(listCatalog) && listCatalog.length > 0
      ? listCatalog
      : TASK_INTAKE_LISTS;

    const listsDescription = catalog
      .map(list => `- key: ${list.key} | name: ${list.name} | focus: ${list.description}`)
      .join('\n');

    const listsJson = JSON.stringify(
      catalog.map(list => ({
        key: list.key,
        name: list.name,
        description: list.description,
        listId: list.listId
      })),
      null,
      2
    );

    return `Requester: ${member?.name || 'Unknown member'}
Phone hint: ${member?.phone || 'N/A'}
Raw Arabic request: """${requestText}"""

Available ClickUp lists:
${listsDescription}

Full list catalog (JSON):
${listsJson}

Decide which list should receive the task and generate the JSON response.`;
  }

  buildImageSystemPrompt() {
    return `You are a senior operations coordinator who converts base64-encoded business documents into ClickUp tasks.
You MUST answer with valid JSON only.
Images will often be purchase orders, sales orders, invoices, quotations, or delivery notes.
Extract the document intent (purchase vs sales), customer name, supplier, PO number, total, and due/shipping dates when visible.
Every task title and description must be written in English and include the customer name and PO/Order number when present.
Break the description into sections (Objective, Key Details, Requirements, Execution Path, Success Criteria).
Ensure checklist items cover fulfilling or processing the document (validate items, confirm quantities, arrange delivery, update systems).

Respond with this JSON schema:
{
  "task_title": "string",
  "task_summary": "one sentence english summary",
  "task_description": "multi-line english markdown with headers and extracted doc facts",
  "requirements": ["resource or dependency"],
  "checklist": ["actionable english step"],
  "priority": "urgent | high | normal | low",
  "due_date_hint": "ISO date or human window",
  "list_key": "one of the provided list keys",
  "list_reason": "why this list fits",
  "attachments_prompt": "what files to request if any"
}
Always pick the most relevant list_key; never leave it empty.`;
  }

  buildImageUserPrompt({ member, fileInfo, base64, listCatalog }) {
    const catalog = Array.isArray(listCatalog) && listCatalog.length > 0
      ? listCatalog
      : TASK_INTAKE_LISTS;

    const listsDescription = catalog
      .map(list => `- key: ${list.key} | name: ${list.name} | focus: ${list.description}`)
      .join('\n');

    const listsJson = JSON.stringify(
      catalog.map(list => ({
        key: list.key,
        name: list.name,
        description: list.description,
        listId: list.listId
      })),
      null,
      2
    );

    const trimmedImage = base64?.length > 8000 ? `${base64.slice(0, 8000)}...` : (base64 || '');

    return `Requester: ${member?.name || 'Unknown member'}
Phone hint: ${member?.phone || 'N/A'}
Document info: ${fileInfo}

Available ClickUp lists:
${listsDescription}

Full list catalog (JSON):
${listsJson}

Base64-encoded image (may be truncated):
${trimmedImage}

Detect the document type, customer name, PO number, and generate the JSON response.`;
  }

  async ensureEnglishTitle(title, requestText) {
    const trimmedTitle = (title || '').trim();
    if (this.looksEnglish(trimmedTitle)) {
      return trimmedTitle;
    }

    try {
      const systemPrompt = 'You rewrite short task names into polished English titles (max 9 words). Respond with JSON {"title": "..."} only.';
      const userPrompt = `Original WhatsApp note: ${requestText}
Current title: ${trimmedTitle || 'N/A'}
Return an action-oriented English task title.`;
      const response = await aiService.generateCompletion(systemPrompt, userPrompt, {
        temperature: 0.2,
        maxTokens: 100
      });
      const parsed = this.extractJson(response);
      if (parsed?.title) {
        return parsed.title.trim();
      }
    } catch (error) {
      logger.warn('AI English title rewrite failed', { error: error.message });
    }

    return this.fallbackEnglishTitle(requestText);
  }

  looksEnglish(text) {
    if (!text) {
      return false;
    }
    const letters = text.replace(/[^A-Za-z]/g, '');
    return letters.length >= Math.max(3, Math.ceil(text.length * 0.4));
  }

  fallbackEnglishTitle(requestText) {
    const defaultTitle = 'WhatsApp Intake Task';
    if (!requestText) {
      return defaultTitle;
    }
    const sanitized = requestText
      .replace(/[^\w\s]/g, ' ')
      .replace(/[\u0600-\u06FF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!sanitized) {
      return defaultTitle;
    }
    const words = sanitized.split(' ').slice(0, 8).join(' ');
    return words || defaultTitle;
  }

  extractJson(response) {
    if (!response) {
      throw new Error('Empty AI response');
    }

    const trimmed = response.trim();
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed);
    }

    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }

    throw new Error('AI response did not include JSON');
  }

  async normalizeBlueprint(blueprint, requestText, listCatalog) {
    const checklist = Array.isArray(blueprint?.checklist) && blueprint.checklist.length > 0
      ? blueprint.checklist
      : this.defaultChecklist;

    const requirements = Array.isArray(blueprint?.requirements) && blueprint.requirements.length > 0
      ? blueprint.requirements
      : ['Confirm inputs referenced in the request'];

    const listSelection = await this.resolveListSelection(
      blueprint?.list_key,
      requestText,
      listCatalog,
      blueprint?.list_reason
    );

    return {
      title: blueprint?.task_title || this.generateTitleFromRequest(requestText),
      summary: blueprint?.task_summary || 'Auto-generated ClickUp task',
      description: blueprint?.task_description || this.buildFallbackDescription(requestText, requirements, checklist),
      requirements,
      checklist,
      priority: (blueprint?.priority || 'normal').toLowerCase(),
      dueDateHint: blueprint?.due_date_hint || '',
      listKey: listSelection.listKey,
      listReason: listSelection.listReason,
      attachmentsPrompt: blueprint?.attachments_prompt || ''
    };
  }

  async fallbackBlueprint(requestText, member, listCatalog) {
    const checklist = this.defaultChecklist;
    const requirements = ['Clarify scope with requester'];
    const listSelection = await this.resolveListSelection(null, requestText, listCatalog);

    return {
      title: this.generateTitleFromRequest(requestText, member),
      summary: 'Draft task derived from WhatsApp without AI JSON',
      description: this.buildFallbackDescription(requestText, requirements, checklist),
      requirements,
      checklist,
      priority: 'normal',
      dueDateHint: '',
      listKey: listSelection.listKey,
      listReason: listSelection.listReason,
      attachmentsPrompt: ''
    };
  }

  async fallbackBlueprintFromImage(filename, member, listCatalog) {
    const checklist = [
      'Extract key fields from the document',
      'Confirm supplier/customer details',
      'Record PO/Invoice number and totals',
      'Share next steps with the owner'
    ];
    const requirements = ['Confirm figures and document intent with requester'];
    const requestText = `[Image Intake] ${filename || 'Document'}`;
    const listSelection = await this.resolveListSelection(null, requestText, listCatalog);

    return {
      title: this.generateTitleFromRequest(requestText, member),
      summary: 'Draft task derived from document image without AI JSON',
      description: this.buildFallbackDescription(requestText, requirements, checklist),
      requirements,
      checklist,
      priority: 'normal',
      dueDateHint: '',
      listKey: listSelection.listKey,
      listReason: listSelection.listReason || 'Fallback general list after vision failure.',
      attachmentsPrompt: 'Attach the document image if not already linked.'
    };
  }

  generateTitleFromRequest(requestText, member) {
    const cleaned = requestText.replace(/\s+/g, ' ').trim();
    const snippet = cleaned.split(' ').slice(0, 6).join(' ');
    const owner = member?.name ? `${member.name}'s` : 'Team';
    return `${owner} Task :: ${snippet}`;
  }

  buildFallbackDescription(requestText, requirements, checklist) {
    const requirementsList = requirements.map(req => `- ${req}`).join('\n');
    const checklistList = checklist.map((item, index) => `${index + 1}. ${item}`).join('\n');

    return `### Objective\nTranslate the requester note into an actionable ClickUp task.\n\n### Source Note\n${requestText}\n\n### Requirements\n${requirementsList}\n\n### Execution Path\n${checklistList}\n\n### Success Criteria\n- Task acknowledged in ClickUp\n- Owner updates progress within the same day`;
  }

  async resolveListSelection(listKeyFromAi, requestText, listCatalog, aiReason) {
    const catalog = this.resolveCatalog(listCatalog);
    const normalizedAiKey = listKeyFromAi?.toString().trim().toLowerCase();

    if (normalizedAiKey) {
      const aiMatch = catalog.find(list => list.key.toLowerCase() === normalizedAiKey);
      if (aiMatch) {
        return {
          listKey: aiMatch.key,
          listReason: aiReason || `AI mapped the request to ${aiMatch.name}.`
        };
      }
    }

    const aiFallbackSelection = await this.requestListSelectionFromAi(requestText, catalog);
    if (aiFallbackSelection) {
      return aiFallbackSelection;
    }

    const heuristicMatch = this.inferListByKeywords(requestText, catalog);
    if (heuristicMatch) {
      return heuristicMatch;
    }

    const defaultList = catalog.find(list => list.isDefault) || catalog[0];
    return {
      listKey: defaultList.key,
      listReason: `Fallback to ${defaultList.name} due to missing AI selection.`
    };
  }

  async requestListSelectionFromAi(requestText, catalog) {
    if (!requestText) {
      return null;
    }

    try {
      const systemPrompt = 'You only choose the most appropriate ClickUp list key for an Arabic WhatsApp task request. Respond with JSON.';
      const catalogJson = JSON.stringify(
        catalog.map(list => ({ key: list.key, name: list.name, description: list.description })),
        null,
        2
      );

      const userPrompt = `Incoming request (Arabic allowed): ${requestText}\nList catalog: ${catalogJson}\nReturn {"list_key":"key","list_reason":"why"}.`;

      const response = await aiService.generateCompletion(systemPrompt, userPrompt, {
        temperature: 0.15,
        maxTokens: 400
      });

      const parsed = this.extractJson(response);
      const normalizedKey = parsed?.list_key?.toString().trim().toLowerCase();
      if (!normalizedKey) {
        return null;
      }

      const match = catalog.find(list => list.key.toLowerCase() === normalizedKey);
      if (!match) {
        return null;
      }

      return {
        listKey: match.key,
        listReason: parsed?.list_reason || `AI mapped the request to ${match.name}.`
      };
    } catch (error) {
      logger.warn('AI list selection fallback failed', { error: error.message });
      return null;
    }
  }

  inferListByKeywords(requestText, catalog) {
    if (!requestText) {
      return null;
    }

    const normalizedRequest = this.normalizeText(requestText);
    if (!normalizedRequest) {
      return null;
    }

    for (const hint of this.listKeywordHints) {
      if (!hint.keywords || hint.keywords.length === 0) {
        continue;
      }

      const matched = hint.keywords.some(keyword => {
        const normalizedKeyword = this.normalizeText(keyword);
        return normalizedKeyword && normalizedRequest.includes(normalizedKeyword);
      });

      if (matched) {
        const listMatch = catalog.find(list => list.key === hint.key) ||
          catalog.find(list => this.normalizeText(list.name).includes(this.normalizeText(hint.keywords[0] || '')));

        if (listMatch) {
          return {
            listKey: listMatch.key,
            listReason: hint.reason || `Matched ${listMatch.name} keywords.`
          };
        }
      }
    }

    return null;
  }

  resolveCatalog(listCatalog) {
    if (Array.isArray(listCatalog) && listCatalog.length > 0) {
      return listCatalog;
    }
    return TASK_INTAKE_LISTS;
  }

  normalizeText(text) {
    if (!text) {
      return '';
    }
    return text
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[\s]+/g, ' ');
  }
}

const taskDraftingService = new TaskDraftingService();

export default taskDraftingService;
