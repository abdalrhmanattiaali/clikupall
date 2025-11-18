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
  }

  async generateBlueprint(requestText, { member, listCatalog }) {
    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(requestText, member, listCatalog);

      const response = await aiService.generateCompletion(systemPrompt, userPrompt, {
        temperature: 0.35,
        maxTokens: 1800
      });

      const parsed = this.extractJson(response);
      const normalized = this.normalizeBlueprint(parsed, requestText);
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

      return this.fallbackBlueprint(requestText, member);
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

  normalizeBlueprint(blueprint, requestText) {
    const checklist = Array.isArray(blueprint?.checklist) && blueprint.checklist.length > 0
      ? blueprint.checklist
      : this.defaultChecklist;

    const requirements = Array.isArray(blueprint?.requirements) && blueprint.requirements.length > 0
      ? blueprint.requirements
      : ['Confirm inputs referenced in the request'];

    return {
      title: blueprint?.task_title || this.generateTitleFromRequest(requestText),
      summary: blueprint?.task_summary || 'Auto-generated ClickUp task',
      description: blueprint?.task_description || this.buildFallbackDescription(requestText, requirements, checklist),
      requirements,
      checklist,
      priority: (blueprint?.priority || 'normal').toLowerCase(),
      dueDateHint: blueprint?.due_date_hint || '',
      listKey: blueprint?.list_key || 'general',
      listReason: blueprint?.list_reason || 'Defaulted to general inbox due to missing AI reasoning.',
      attachmentsPrompt: blueprint?.attachments_prompt || ''
    };
  }

  fallbackBlueprint(requestText, member) {
    const checklist = this.defaultChecklist;
    const requirements = ['Clarify scope with requester'];

    return {
      title: this.generateTitleFromRequest(requestText, member),
      summary: 'Draft task derived from WhatsApp without AI JSON',
      description: this.buildFallbackDescription(requestText, requirements, checklist),
      requirements,
      checklist,
      priority: 'normal',
      dueDateHint: '',
      listKey: 'general',
      listReason: 'Fallback general list due to AI failure.',
      attachmentsPrompt: ''
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
}

const taskDraftingService = new TaskDraftingService();

export default taskDraftingService;
