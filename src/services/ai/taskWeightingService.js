/**
 * AI Task Weighting Service
 * Uses AI to intelligently calculate task weight/points based on complexity, requirements, etc.
 */

import crypto from 'crypto';
import aiService from './index.js';
import databaseService from '../../database/index.js';
import logger from '../../core/logger.js';

class TaskWeightingService {
  /**
   * Calculate task weight using AI analysis
   * Returns weight (0-100 points) based on complexity, skills, time, etc.
   */
  async calculateTaskWeight(task) {
    try {
      logger.info('Calculating AI task weight', { taskId: task.id, name: task.name });

      // Check cache first
      const cacheKey = `task_weight_${task.id}`;
      const inputHash = this.generateTaskHash(task);
      const cached = databaseService.getCache(cacheKey);

      if (cached && cached.input_hash === inputHash) {
        logger.info('Using cached task weight', {
          taskId: task.id,
          weight: cached.result.weight
        });
        return cached.result;
      }

      // Build AI prompt
      const systemPrompt = this.buildWeightingSystemPrompt();
      const userPrompt = this.buildWeightingUserPrompt(task);

      // Get AI analysis
      const response = await aiService.generateCompletion(
        systemPrompt,
        userPrompt,
        {
          maxTokens: 800,
          temperature: 0.3 // Lower temperature for consistent evaluation
        }
      );

      // Parse AI response
      const analysis = this.parseWeightingResponse(response);

      // Store in cache (30 days)
      databaseService.setCache(
        cacheKey,
        'task_weight',
        analysis,
        inputHash,
        30 * 24 * 60 * 60 * 1000, // 30 days
        {
          model_used: 'gpt-5',
          tokens_used: response.length
        }
      );

      // Update task in database
      databaseService.updateTaskAIAnalysis(task.id, {
        ai_weight: analysis.weight,
        ai_complexity: analysis.complexity,
        ai_estimated_time: analysis.estimated_time,
        ai_skills_required: JSON.stringify(analysis.skills_required),
        ai_dependencies: JSON.stringify(analysis.dependencies || [])
      });

      logger.success('Task weight calculated', {
        taskId: task.id,
        weight: analysis.weight,
        complexity: analysis.complexity
      });

      return analysis;
    } catch (error) {
      logger.error('Failed to calculate task weight', {
        taskId: task.id,
        error: error.message
      });

      // Return default weight on error
      return {
        weight: 10, // Default base weight
        complexity: 'medium',
        estimated_time: 60,
        skills_required: [],
        reasoning: 'Error calculating weight - using default'
      };
    }
  }

  /**
   * Build system prompt for task weighting
   */
  buildWeightingSystemPrompt() {
    return `أنت خبير في تقييم المهام وتحليل التعقيد ومسارات التنفيذ. قبل أن تمنح أي نقاط، اسأل نفسك: *"ما الذي تحتاجه هذه المهمة لكي تُنجز؟"* وحدد الموارد، البيانات، الموافقات، والأدوات المطلوبة لإنجازها بنجاح. بعد فهم المتطلبات، قيّم صعوبة المسار بناءً على العوامل التالية.

**معايير التقييم (وزن إجمالي 0-100 نقطة):**

1. **التعقيد الفني (0-30 نقطة)**
   - بسيط (5 نقاط): مهام روتينية، لا تتطلب مهارات خاصة
   - متوسط (15 نقطة): تتطلب معرفة معتدلة وبعض التفكير
   - معقد (25 نقطة): تتطلب مهارات متقدمة وحل مشكلات
   - معقد جداً (30 نقطة): تتطلب خبرة عميقة وإبداع

2. **الوقت المتوقع (0-25 نقطة)**
   - أقل من ساعة (5 نقاط)
   - 1-3 ساعات (10 نقاط)
   - 3-8 ساعات (18 نقاط)
   - أكثر من 8 ساعات (25 نقطة)

3. **عدد المهارات المطلوبة (0-20 نقطة)**
   - مهارة واحدة (5 نقاط)
   - 2-3 مهارات (12 نقطة)
   - 4+ مهارات (20 نقطة)

4. **التأثير والأهمية (0-15 نقطة)**
   - تأثير محدود (3 نقاط)
   - تأثير متوسط (8 نقاط)
   - تأثير كبير (15 نقطة)

5. **المتطلبات والاعتماديات/تداخل المسار (0-10 نقطة)**
   - مستقلة تماماً (2 نقطة)
   - بعض الاعتماديات أو موافقات (6 نقاط)
   - اعتماديات معقدة أو مسار طويل متعدد الأطراف (10 نقاط)

**تحليل المسار والمتطلبات:**
- لخص المراحل/الخطوات الرئيسية للمهمة.
- اذكر ما الذي تحتاجه المهمة لكي تُنجز (بيانات، صلاحيات، فرق أخرى، أدوات، ملفات، إلخ).
- اربط نقاط الوزن بمدى صعوبة كل مرحلة في المسار.

**ارجع نتيجة بصيغة JSON:**
\`\`\`json
{
  "weight": 45,
  "complexity": "complex",
  "estimated_time": 240,
  "skills_required": ["JavaScript", "API Integration", "Testing"],
  "dependencies": ["Task must be done after API is ready"],
  "requirements_to_complete": ["بيانات العملاء", "صلاحية الوصول إلى واجهة API"],
  "path_analysis": [
    {"stage": "التحضير", "needs": "جمع المتطلبات من الفريق", "risk": "متوسط"},
    {"stage": "التنفيذ", "needs": "تطوير التكامل", "risk": "مرتفع"}
  ],
  "reasoning": "المهمة معقدة لأنها تتطلب...",
  "breakdown": {
    "technical_complexity": 25,
    "time_estimate": 18,
    "skills_count": 12,
    "impact": 8,
    "dependencies": 6
  }
}
\`\`\`

**القواعد:**
- الوزن الكلي = مجموع كل النقاط (0-100)
- complexity يمكن أن يكون: "simple", "medium", "complex", "very_complex"
- estimated_time بالدقائق
- يجب أن يتضمن التحليل متطلبات واضحة ومساراً مختصراً
- كن موضوعياً ومنطقياً في التقييم
- ارجع JSON فقط بدون نص إضافي`;
  }

  /**
   * Build user prompt with task details
   */
  buildWeightingUserPrompt(task) {
    const tags = Array.isArray(task.tags) ? task.tags :
                 (task.tags ? JSON.parse(task.tags) : []);

    const assigneeCount = Array.isArray(task.assignee_ids) ? task.assignee_ids.length :
                          (task.assignee_ids ? JSON.parse(task.assignee_ids).length : 0);

    let prompt = `**قيّم المهمة التالية:**

**اسم المهمة:** ${task.name}

**الوصف:** ${task.description || 'لا يوجد وصف'}

**الأولوية:** ${task.priority_label || 'عادية'}

**الحالة:** ${task.status_name || 'غير معروف'}`;

    if (task.due_date) {
      const dueDate = new Date(parseInt(task.due_date));
      const now = new Date();
      const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
      prompt += `\n**الموعد النهائي:** ${dueDate.toLocaleDateString('ar-EG')} (بعد ${daysUntilDue} يوم)`;
    }

    if (tags.length > 0) {
      prompt += `\n**الوسوم:** ${tags.join(', ')}`;
    }

    if (task.checklist_total > 0) {
      prompt += `\n**قائمة المهام:** ${task.checklist_total} عناصر (${task.checklist_resolved} مكتمل)`;
    }

    if (task.subtasks_total > 0) {
      prompt += `\n**المهام الفرعية:** ${task.subtasks_total} مهمة فرعية (${task.subtasks_resolved} مكتملة)`;
    }

    if (assigneeCount > 1) {
      prompt += `\n**عدد المكلفين:** ${assigneeCount} أشخاص (عمل جماعي)`;
    }

    if (task.list_name) {
      prompt += `\n**القائمة:** ${task.list_name}`;
    }

    if (task.folder_name) {
      prompt += `\n**المجلد:** ${task.folder_name}`;
    }

    prompt += `\n\n*سؤال جوهري:* ما الذي تحتاجه هذه المهمة لكي تُنجز بالكامل؟ حدد الموارد أو الموافقات أو البيانات أو الأشخاص المطلوبين، ثم استخدم هذه الإجابة لتقدير المسار ومنح الوزن (0-100 نقطة).`;

    return prompt;
  }

  /**
   * Parse AI response to extract weight analysis
   */
  parseWeightingResponse(response) {
    try {
      // Extract JSON from response (may be wrapped in markdown)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const analysis = JSON.parse(jsonMatch[0]);

      // Validate structure
      if (typeof analysis.weight !== 'number') {
        throw new Error('Invalid weight value');
      }

      // Ensure weight is in range
      analysis.weight = Math.max(1, Math.min(100, analysis.weight));

      // Ensure required fields
      analysis.complexity = analysis.complexity || 'medium';
      analysis.estimated_time = analysis.estimated_time || 60;
      analysis.skills_required = analysis.skills_required || [];
      analysis.dependencies = analysis.dependencies || [];

      return analysis;
    } catch (error) {
      logger.error('Failed to parse AI weighting response', {
        error: error.message,
        response: response.substring(0, 200)
      });

      // Return default on parse error
      return {
        weight: 10,
        complexity: 'medium',
        estimated_time: 60,
        skills_required: [],
        dependencies: [],
        reasoning: 'Failed to parse AI response - using default'
      };
    }
  }

  /**
   * Generate hash of task for cache invalidation
   */
  generateTaskHash(task) {
    const relevantData = {
      name: task.name,
      description: task.description,
      priority: task.priority_label,
      checklist: task.checklist_total,
      subtasks: task.subtasks_total,
      tags: task.tags
    };

    return crypto
      .createHash('md5')
      .update(JSON.stringify(relevantData))
      .digest('hex');
  }

  /**
   * Batch calculate weights for multiple tasks
   */
  async calculateBatchWeights(tasks, maxConcurrent = 3) {
    logger.info('Calculating batch task weights', { count: tasks.length });

    const results = [];

    // Process in batches to avoid rate limits
    for (let i = 0; i < tasks.length; i += maxConcurrent) {
      const batch = tasks.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(task => this.calculateTaskWeight(task))
      );
      results.push(...batchResults);

      // Small delay between batches
      if (i + maxConcurrent < tasks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.success('Batch weights calculated', { count: results.length });

    return results;
  }

  /**
   * Recalculate weight if task significantly changed
   */
  async recalculateIfNeeded(task) {
    const cached = databaseService.getTask(task.id);

    if (!cached || !cached.ai_weight) {
      // Never analyzed - calculate now
      return await this.calculateTaskWeight(task);
    }

    // Check if task changed significantly
    const currentHash = this.generateTaskHash(task);
    const cacheKey = `task_weight_${task.id}`;
    const cachedAnalysis = databaseService.getCache(cacheKey);

    if (!cachedAnalysis || cachedAnalysis.input_hash !== currentHash) {
      // Task changed - recalculate
      logger.info('Task changed significantly, recalculating weight', {
        taskId: task.id
      });
      return await this.calculateTaskWeight(task);
    }

    // Use cached weight
    return {
      weight: cached.ai_weight,
      complexity: cached.ai_complexity,
      estimated_time: cached.ai_estimated_time,
      skills_required: cached.ai_skills_required ? JSON.parse(cached.ai_skills_required) : [],
      from_cache: true
    };
  }
}

// Singleton instance
const taskWeightingService = new TaskWeightingService();

export default taskWeightingService;
