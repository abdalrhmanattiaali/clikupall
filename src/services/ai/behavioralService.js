/**
 * AI Behavioral Service
 * Provides intelligent task recommendations based on user behavior and AI analysis
 */

import aiService from './index.js';
import databaseService from '../../database/index.js';
import logger from '../../core/logger.js';
import clickupService from '../clickup/clickupService.js';
import { TEAM } from '../../config/team.js';
import { isNonOpenStatus } from '../../config/constants.js';

class BehavioralService {
  /**
   * Generate morning task recommendations for a user
   */
  async generateMorningRecommendations(userId) {
    try {
      logger.info('Generating morning recommendations', { userId });

      // Get user's open tasks (database snapshot + ClickUp fallback)
      const userTasks = await this.loadOpenTasks(userId);

      if (userTasks.length === 0) {
        return {
          greeting: 'صباح الخير! 🌅',
          analysis: 'لا توجد مهام مفتوحة حالياً، استغل الوقت للمراجعة أو التعلم.',
          tasks: [],
          motivation: 'استمتع بيومك ولكن راجع لوحة المهام لاحقاً للتأكد من تحديث كل شيء. ✨'
        };
      }

      // Get user behavior
      let behavior = databaseService.getUserBehavior(userId);
      if (!behavior) {
        // Analyze behavior first
        behavior = await this.analyzeUserBehavior(userId);
      }

      // Get AI recommendations
      const systemPrompt = this.buildRecommendationSystemPrompt();
      const userPrompt = this.buildRecommendationUserPrompt(userId, userTasks, behavior);

      const response = await aiService.generateCompletion(
        systemPrompt,
        userPrompt,
        {
          maxTokens: 1500,
          temperature: 0.7
        }
      );

      let recommendations = this.parseRecommendations(response);

      if (!recommendations.tasks || recommendations.tasks.length === 0) {
        logger.warn('AI returned empty recommendations, building heuristic fallback', { userId });
        recommendations = this.buildHeuristicRecommendations(userId, userTasks);
      }

      // Store recommendations in database
      const today = new Date().setHours(0, 0, 0, 0);
      const recsToStore = recommendations.tasks.map(rec => ({
        user_id: userId.toString(),
        task_id: rec.task_id,
        recommendation_type: rec.type,
        score: rec.priority_score,
        reason: rec.reason,
        recommended_for_date: today,
        recommended_for_time_slot: rec.time_slot || 'morning'
      }));

      if (recsToStore.length > 0) {
        databaseService.insertRecommendations(recsToStore);
      }

      logger.success('Morning recommendations generated', {
        userId,
        count: recommendations.tasks.length
      });

      return recommendations;
    } catch (error) {
      logger.error('Failed to generate morning recommendations', {
        userId,
        error: error.message
      });

      const fallbackTasks = await this.loadOpenTasks(userId);
      if (fallbackTasks.length > 0) {
        return this.buildHeuristicRecommendations(userId, fallbackTasks);
      }

      return {
        greeting: 'صباح الخير! 🌅',
        analysis: 'لم نتمكن من تحليل المهام الآن، لكن يمكنك اختيار مهمة ذات أولوية من لوحة ClickUp.',
        tasks: [],
        motivation: 'حافظ على تركيزك وسجّل أول مهمة تبدأ بها حتى نستطيع تتبع التقدم. 💪'
      };
    }
  }

  async loadOpenTasks(userId) {
    let tasks = [];
    const normalizedUserId = Number.isFinite(Number(userId)) ? Number(userId) : userId;

    try {
      const dbTasks = databaseService.getUserTasks
        ? databaseService.getUserTasks(normalizedUserId, { status: 'open' })
        : [];
      const resolved = typeof dbTasks?.then === 'function' ? await dbTasks : dbTasks;
      if (Array.isArray(resolved) && resolved.length > 0) {
        tasks = resolved
          .map(task => this.normalizeDatabaseTask(task))
          .filter(task => task && !this.isClosedStatus(task.status_name));
      }
    } catch (error) {
      logger.warn('Failed to load database tasks for recommendations', {
        userId,
        error: error.message
      });
    }

    if (tasks.length > 0) {
      return tasks;
    }

    try {
      const clickupTasks = await clickupService.getAllTasksForMember(normalizedUserId, {
        includeClosed: false,
        includeSubtasks: true
      });

      return clickupTasks
        .filter(task => !isNonOpenStatus(task.status?.status, task.status?.type))
        .map(task => this.normalizeClickupTask(task))
        .filter(Boolean);
    } catch (error) {
      logger.error('Failed to load ClickUp tasks for recommendations', {
        userId,
        error: error.message
      });
    }

    return [];
  }

  normalizeDatabaseTask(task) {
    if (!task) return null;

    const aiWeight = this.extractAiWeight(task);
    const complexity = task.ai_complexity || this.inferComplexity(aiWeight);
    const estimatedTime = task.ai_estimated_time
      ? Number(task.ai_estimated_time)
      : this.estimateTimeFromWeight(aiWeight);

    return {
      id: task.id?.toString() || task.task_id?.toString(),
      name: task.name || task.task_name || 'مهمة بدون اسم',
      status_name: task.status_name || task.status || 'Open',
      priority_label: task.priority_label || task.priority || 'عادية',
      due_date: task.due_date || task.dueDate || null,
      ai_weight: aiWeight,
      ai_complexity: complexity,
      ai_estimated_time: estimatedTime,
      parent_id: task.parent_id || task.parentId || null,
      parent_name: task.parent_name || task.parentName || null
    };
  }

  normalizeClickupTask(task) {
    if (!task) return null;

    const aiWeight = this.extractAiWeight(task);
    const complexity = task.ai_complexity || this.inferComplexity(aiWeight);
    const estimatedTime = this.estimateTimeFromWeight(aiWeight, task.time_estimate);

    return {
      id: task.id?.toString(),
      name: task.name || 'مهمة بدون اسم',
      status_name: task.status?.status || task.status?.type || 'Open',
      priority_label: task.priority?.label || task.priority?.priority || 'عادية',
      due_date: task.due_date || null,
      ai_weight: aiWeight,
      ai_complexity: complexity,
      ai_estimated_time: estimatedTime,
      parent_id: task.parent?.id || task.parent_id || null,
      parent_name: task.parent?.name || task.parent?.task_name || null
    };
  }

  extractAiWeight(task) {
    const direct = task.ai_weight ?? task.aiWeight ?? task.weight ?? null;
    if (direct !== null && !Number.isNaN(Number(direct))) {
      return Number(direct);
    }

    const fields = task.custom_fields || task.customFields;
    if (Array.isArray(fields)) {
      for (const field of fields) {
        const value = field?.value;
        if (!value && value !== 0) continue;
        const label = (field?.name || field?.label || '').toLowerCase();
        if (label.includes('ai weight') || label.includes('ai score') || label.includes('weight')) {
          const weight = Number(value);
          if (!Number.isNaN(weight)) {
            return weight;
          }
        }
      }
    }

    return null;
  }

  inferComplexity(aiWeight) {
    if (!Number.isFinite(aiWeight)) return 'متوسطة';
    if (aiWeight <= 20) return 'بسيطة';
    if (aiWeight <= 40) return 'متوسطة';
    if (aiWeight <= 70) return 'معقدة';
    return 'معقدة جداً';
  }

  estimateTimeFromWeight(aiWeight, timeEstimateMs = null) {
    if (Number.isFinite(timeEstimateMs) && timeEstimateMs > 0) {
      return Math.max(15, Math.round(timeEstimateMs / 60000));
    }

    if (!Number.isFinite(aiWeight)) {
      return 45;
    }

    if (aiWeight <= 20) return 20;
    if (aiWeight <= 40) return 45;
    if (aiWeight <= 70) return 90;
    return 150;
  }

  isClosedStatus(statusName = '') {
    const normalized = statusName.toLowerCase();
    return ['complete', 'closed', 'done', 'مكتملة', 'منتهية'].some(label => normalized.includes(label));
  }

  buildHeuristicRecommendations(userId, tasks) {
    const member = TEAM.find(m => m.id === parseInt(userId));
    const userName = member?.name || 'عضو الفريق';
    const sortedTasks = this.rankTasks(tasks);
    const urgentCount = tasks.filter(task => this.isDueSoon(task)).length;
    const selected = sortedTasks.slice(0, 5).map((task, index) => this.toRecommendation(task, index));

    return {
      greeting: `🌅 صباح الخير ${userName}!`,
      analysis: `تم تحليل ${tasks.length} مهمة مفتوحة (${urgentCount} بحاجة لاتخاذ إجراء سريع). تم اختيار القائمة التالية كبداية قوية لليوم.`,
      work_style_note: 'تم اختيار المهام وفق أقرب المواعيد وأعلى وزن AI لضمان أثر واضح منذ الصباح.',
      tasks: selected,
      motivation: 'ابدأ بالمهمة الأولى ثم سجّل تقدمك بعد كل خطوة لتحافظ على التركيز والزخم. 💪'
    };
  }

  rankTasks(tasks) {
    return [...tasks].sort((a, b) => {
      const dueA = a.due_date ? Number(a.due_date) : Infinity;
      const dueB = b.due_date ? Number(b.due_date) : Infinity;
      if (dueA !== dueB) {
        return dueA - dueB;
      }

      const weightA = Number.isFinite(a.ai_weight) ? a.ai_weight : 0;
      const weightB = Number.isFinite(b.ai_weight) ? b.ai_weight : 0;
      if (weightA !== weightB) {
        return weightB - weightA;
      }

      return (a.priority_label || '').localeCompare(b.priority_label || '');
    });
  }

  toRecommendation(task, index) {
    const aiWeight = Number.isFinite(task.ai_weight) ? task.ai_weight : 30;
    const complexity = task.ai_complexity || this.inferComplexity(aiWeight);
    const estimatedTime = task.ai_estimated_time || this.estimateTimeFromWeight(aiWeight);
    const type = this.classifyTaskType(aiWeight, task, index);
    const reason = this.buildReason(task, aiWeight);
    const timeSlot = this.getTimeSlotSuggestion(index, aiWeight);
    const priorityScore = this.calculatePriorityScore(task, index);
    const taskName = task.parent_name ? `${task.name} ← ${task.parent_name}` : task.name;

    return {
      task_id: task.id,
      task_name: taskName,
      type,
      priority_score: Number(priorityScore.toFixed(2)),
      reason,
      estimated_time: `${estimatedTime} دقيقة`,
      time_slot: timeSlot,
      ai_weight: aiWeight,
      complexity
    };
  }

  classifyTaskType(aiWeight, task, index) {
    if (this.isDueSoon(task)) {
      return 'urgent';
    }
    if (aiWeight <= 20) {
      return 'quick_win';
    }
    if (aiWeight >= 60) {
      return 'focus_task';
    }
    return index === 0 ? 'morning_priority' : 'afternoon_task';
  }

  buildReason(task, aiWeight) {
    const reasons = [];
    if (this.isDueToday(task)) {
      reasons.push('الموعد النهائي اليوم');
    } else if (this.isDueSoon(task)) {
      reasons.push('الموعد النهائي خلال 48 ساعة');
    }

    if (aiWeight >= 60) {
      reasons.push('وزن مرتفع يحتاج جلسة تركيز');
    } else if (aiWeight <= 20) {
      reasons.push('مهمة خفيفة تمنحك بداية سريعة');
    }

    if (reasons.length === 0) {
      reasons.push('إغلاقها يحرك التقدم في المسار الحالي');
    }

    return reasons.join(' + ');
  }

  getTimeSlotSuggestion(index, aiWeight) {
    if (aiWeight >= 60) {
      return 'morning';
    }
    if (aiWeight <= 20) {
      return index === 0 ? 'morning' : 'afternoon';
    }
    return index <= 1 ? 'morning' : 'afternoon';
  }

  calculatePriorityScore(task, index) {
    const base = 1 - (index * 0.12);
    const dueSoonBonus = this.isDueSoon(task) ? 0.15 : 0;
    const weightBonus = Number.isFinite(task.ai_weight)
      ? Math.min(task.ai_weight, 80) / 400
      : 0.05;
    return Math.min(1, Math.max(0.5, base + dueSoonBonus + weightBonus));
  }

  isDueSoon(task) {
    if (!task?.due_date) return false;
    const dueTime = Number(task.due_date);
    if (!Number.isFinite(dueTime)) return false;
    const diffHours = (dueTime - Date.now()) / (1000 * 60 * 60);
    return diffHours <= 48;
  }

  isDueToday(task) {
    if (!task?.due_date) return false;
    const due = new Date(Number(task.due_date));
    const now = new Date();
    return due.getFullYear() === now.getFullYear() &&
      due.getMonth() === now.getMonth() &&
      due.getDate() === now.getDate();
  }

  /**
   * Build system prompt for recommendations
   */
  buildRecommendationSystemPrompt() {
    return `أنت مساعد ذكي متخصص في إدارة المهام والإنتاجية. مهمتك هي تحليل مهام المستخدم وإعطاء توصيات ذكية عن أفضل المهام للبدء بها.

**معايير التوصية:**

1. **الأولوية والموعد النهائي**
   - المهام العاجلة والمهمة أولاً
   - المهام القريبة من الموعد النهائي

2. **الوزن والتعقيد (AI Weight)**
   - في الصباح: ابدأ بمهام متوسطة التعقيد (20-50 نقطة)
   - "Quick Wins": مهام خفيفة سريعة (10-20 نقطة) لبناء الزخم
   - "Focus Tasks": مهام معقدة (50-80 نقطة) تحتاج تركيز

3. **نمط عمل المستخدم**
   - Fast Starter: مهام سريعة في البداية
   - Deep Thinker: مهام معقدة في أوقات التركيز
   - Steady Worker: توزيع متوازن

4. **الوقت المتاح**
   - صباحاً (8-12): 2-3 مهام (مزيج سريع + متوسط)
   - ظهراً (12-4): مهمة معقدة واحدة أو عدة مهام متوسطة
   - مساءً (4-8): مهام خفيفة أو إنهاء ما بدأ

**صيغة الرد:**

ارجع JSON بهذا الشكل:
\`\`\`json
{
  "greeting": "صباح الخير! 🌅",
  "analysis": "لديك 12 مهمة مفتوحة، 3 منها عاجلة...",
  "work_style_note": "أنت من نوع Fast Starter، لذا سنبدأ بمهمة سريعة!",
  "tasks": [
    {
      "task_id": "abc123",
      "task_name": "Review API documentation",
      "type": "quick_win",
      "priority_score": 0.95,
      "reason": "مهمة سريعة (15 دقيقة) ستعطيك زخم للبدء",
      "estimated_time": "15 دقيقة",
      "time_slot": "morning",
      "ai_weight": 15,
      "complexity": "simple"
    },
    {
      "task_id": "def456",
      "task_name": "Implement user authentication",
      "type": "focus_task",
      "priority_score": 0.88,
      "reason": "مهمة مهمة وتحتاج تركيز، وقت الصباح مثالي لها",
      "estimated_time": "2-3 ساعات",
      "time_slot": "morning",
      "ai_weight": 65,
      "complexity": "complex"
    },
    {
      "task_id": "ghi789",
      "task_name": "Update documentation",
      "type": "afternoon_task",
      "priority_score": 0.65,
      "reason": "مهمة خفيفة مناسبة لبعد الظهر",
      "estimated_time": "45 دقيقة",
      "time_slot": "afternoon",
      "ai_weight": 20,
      "complexity": "simple"
    }
  ],
  "motivation": "ابدأ بالمهمة السريعة لتكتسب زخم، ثم انتقل للمهمة المعقدة! 💪"
}
\`\`\`

**القواعد:**
- رتب المهام حسب priority_score (أعلى = أهم)
- اقترح 3-5 مهام كحد أقصى
- نوّع بين quick_win و focus_task و afternoon_task
- كن محفزاً وإيجابياً
- استخدم إيموجي مناسب
- ارجع JSON فقط`;
  }

  /**
   * Build user prompt with tasks and behavior
   */
  buildRecommendationUserPrompt(userId, tasks, behavior) {
    const member = TEAM.find(m => m.id === parseInt(userId));
    const userName = member?.name || 'المستخدم';

    const now = new Date();
    const hour = now.getHours();
    let timeOfDay = 'صباحاً';
    if (hour >= 12 && hour < 16) timeOfDay = 'ظهراً';
    else if (hour >= 16 && hour < 20) timeOfDay = 'مساءً';
    else if (hour >= 20) timeOfDay = 'ليلاً';

    let prompt = `**المستخدم:** ${userName}
**الوقت الحالي:** ${timeOfDay} (${hour}:00)
**عدد المهام المفتوحة:** ${tasks.length}

`;

    // Add behavior insights if available
    if (behavior) {
      prompt += `**نمط العمل:** ${behavior.ai_work_style || 'غير محدد'}
**أكثر وقت إنتاجية:** الساعة ${behavior.most_productive_hour || '9'}:00
**معدل المهام يومياً:** ${behavior.avg_tasks_per_day?.toFixed(1) || 'غير معروف'}
**معدل الإنجاز في الوقت:** ${(behavior.on_time_completion_rate * 100).toFixed(0)}%

`;
    }

    prompt += `**قائمة المهام:**\n\n`;

    // Add tasks (limit to 20 for token management)
    const tasksToShow = tasks.slice(0, 20);
    for (const task of tasksToShow) {
      prompt += `- **${task.name}**\n`;
      prompt += `  - ID: ${task.id}\n`;
      prompt += `  - الأولوية: ${task.priority_label || 'عادية'}\n`;
      prompt += `  - الحالة: ${task.status_name}\n`;

      if (task.ai_weight) {
        prompt += `  - الوزن AI: ${task.ai_weight} نقطة (${task.ai_complexity})\n`;
        prompt += `  - الوقت المتوقع: ${task.ai_estimated_time} دقيقة\n`;
      }

      if (task.due_date) {
        const dueDate = new Date(parseInt(task.due_date));
        const daysUntil = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
        prompt += `  - الموعد النهائي: بعد ${daysUntil} يوم\n`;
      }

      if (task.checklist_total > 0) {
        const progress = (task.checklist_resolved / task.checklist_total * 100).toFixed(0);
        prompt += `  - التقدم: ${progress}% (${task.checklist_resolved}/${task.checklist_total})\n`;
      }

      prompt += `\n`;
    }

    if (tasks.length > 20) {
      prompt += `... وهناك ${tasks.length - 20} مهمة أخرى\n\n`;
    }

    prompt += `\nاقترح أفضل 3-5 مهام للبدء بها الآن، مع مراعاة الوقت الحالي ونمط عمل المستخدم.`;

    return prompt;
  }

  /**
   * Parse recommendations from AI response
   */
  parseRecommendations(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const recommendations = JSON.parse(jsonMatch[0]);

      // Validate structure
      if (!recommendations.tasks || !Array.isArray(recommendations.tasks)) {
        throw new Error('Invalid recommendations structure');
      }

      return recommendations;
    } catch (error) {
      logger.error('Failed to parse recommendations', {
        error: error.message,
        response: response.substring(0, 200)
      });

      return {
        greeting: '👋 مرحباً!',
        analysis: 'حدث خطأ في تحليل المهام',
        tasks: [],
        motivation: 'استمر في العمل الجيد! 💪'
      };
    }
  }

  /**
   * Analyze user behavior and work patterns
   */
  async analyzeUserBehavior(userId) {
    try {
      logger.info('Analyzing user behavior', { userId });

      // Get user's completed tasks from events
      const completedTasks = databaseService.db
        .prepare(`
          SELECT t.*, e.changed_at as completion_time
          FROM tasks t
          JOIN task_events e ON t.id = e.task_id
          WHERE e.trigger_type = 'STATUS_CHANGED'
            AND e.next_value LIKE '%complete%'
            AND t.assignee_ids LIKE ?
          ORDER BY e.changed_at DESC
          LIMIT 100
        `)
        .all(`%"${userId}"%`);

      if (completedTasks.length < 3) {
        logger.info('Not enough data for behavior analysis', { userId });
        return null;
      }

      // Calculate metrics
      const metrics = this.calculateBehaviorMetrics(completedTasks);

      // Get AI analysis
      const systemPrompt = this.buildBehaviorAnalysisSystemPrompt();
      const userPrompt = this.buildBehaviorAnalysisUserPrompt(userId, completedTasks, metrics);

      const response = await aiService.generateCompletion(
        systemPrompt,
        userPrompt,
        {
          maxTokens: 1000,
          temperature: 0.5
        }
      );

      const analysis = this.parseBehaviorAnalysis(response);

      // Store in database
      databaseService.upsertUserBehavior(userId, {
        username: TEAM.find(m => m.id === parseInt(userId))?.name || 'Unknown',
        most_productive_hour: metrics.most_productive_hour,
        avg_tasks_per_day: metrics.avg_tasks_per_day,
        preferred_task_types: JSON.stringify(metrics.preferred_task_types),
        avg_completion_time_minutes: metrics.avg_completion_time_minutes,
        on_time_completion_rate: metrics.on_time_completion_rate,
        overdue_rate: metrics.overdue_rate,
        ai_work_style: analysis.work_style,
        ai_strengths: JSON.stringify(analysis.strengths),
        ai_improvement_areas: JSON.stringify(analysis.improvement_areas),
        ai_recommended_schedule: JSON.stringify(analysis.recommended_schedule),
        last_analyzed_at: Date.now(),
        total_tasks_analyzed: completedTasks.length
      });

      logger.success('User behavior analyzed', {
        userId,
        work_style: analysis.work_style
      });

      return databaseService.getUserBehavior(userId);
    } catch (error) {
      logger.error('Failed to analyze user behavior', {
        userId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Calculate behavior metrics from completed tasks
   */
  calculateBehaviorMetrics(completedTasks) {
    const hourCounts = new Array(24).fill(0);
    let totalCompletionTime = 0;
    let onTimeCount = 0;
    let overdueCount = 0;
    const taskTypes = {};

    for (const task of completedTasks) {
      // Hour analysis
      const completionDate = new Date(task.completion_time);
      const hour = completionDate.getHours();
      hourCounts[hour]++;

      // Completion time
      if (task.created_at && task.completion_time) {
        const timeToComplete = (task.completion_time - task.created_at) / (1000 * 60); // minutes
        totalCompletionTime += timeToComplete;
      }

      // On-time rate
      if (task.due_date) {
        if (task.completion_time <= task.due_date) {
          onTimeCount++;
        } else {
          overdueCount++;
        }
      }

      // Task types (from tags or list)
      const tags = task.tags ? JSON.parse(task.tags) : [];
      for (const tag of tags) {
        taskTypes[tag] = (taskTypes[tag] || 0) + 1;
      }
    }

    // Find most productive hour
    const most_productive_hour = hourCounts.indexOf(Math.max(...hourCounts));

    // Calculate averages
    const avg_completion_time_minutes = totalCompletionTime / completedTasks.length;
    const tasksWithDueDate = onTimeCount + overdueCount;
    const on_time_completion_rate = tasksWithDueDate > 0 ? onTimeCount / tasksWithDueDate : 1;
    const overdue_rate = tasksWithDueDate > 0 ? overdueCount / tasksWithDueDate : 0;

    // Preferred task types
    const preferred_task_types = Object.entries(taskTypes)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([type]) => type);

    // Calculate avg tasks per day
    const dates = completedTasks.map(t => new Date(t.completion_time).toDateString());
    const uniqueDays = [...new Set(dates)].length;
    const avg_tasks_per_day = completedTasks.length / Math.max(uniqueDays, 1);

    return {
      most_productive_hour,
      avg_tasks_per_day,
      preferred_task_types,
      avg_completion_time_minutes,
      on_time_completion_rate,
      overdue_rate
    };
  }

  /**
   * Build behavior analysis system prompt
   */
  buildBehaviorAnalysisSystemPrompt() {
    return `أنت محلل سلوك وإنتاجية متخصص. مهمتك تحليل نمط عمل المستخدم وتقديم رؤى مفيدة.

**أنماط العمل الشائعة:**
- **Fast Starter**: يبدأ بمهام سريعة لبناء الزخم
- **Deep Thinker**: يفضل مهام معقدة تحتاج تركيز عميق
- **Steady Worker**: يعمل بوتيرة ثابتة على مهام متنوعة
- **Night Owl**: أكثر إنتاجية في المساء/الليل
- **Early Bird**: أكثر إنتاجية في الصباح
- **Sprint Worker**: يعمل بكثافة في فترات قصيرة

**ارجع JSON:**
\`\`\`json
{
  "work_style": "fast_starter",
  "strengths": ["سريع في إنجاز المهام البسيطة", "منظم", "ملتزم بالمواعيد"],
  "improvement_areas": ["يمكن تحسين التعامل مع المهام المعقدة"],
  "recommended_schedule": {
    "morning": "مهام معقدة (2 ساعة تركيز)",
    "midday": "مهام متوسطة + استراحة",
    "afternoon": "مهام سريعة + متابعة",
    "evening": "مراجعة وتخطيط"
  },
  "insights": "المستخدم يعمل بشكل ممتاز في الصباح، ينصح بجدولة المهام المعقدة في هذا الوقت"
}
\`\`\``;
  }

  /**
   * Build behavior analysis user prompt
   */
  buildBehaviorAnalysisUserPrompt(userId, completedTasks, metrics) {
    const member = TEAM.find(m => m.id === parseInt(userId));

    let prompt = `**المستخدم:** ${member?.name || 'Unknown'}
**عدد المهام المكتملة:** ${completedTasks.length}

**المقاييس:**
- أكثر وقت إنتاجية: الساعة ${metrics.most_productive_hour}:00
- معدل المهام يومياً: ${metrics.avg_tasks_per_day.toFixed(1)}
- متوسط وقت الإنجاز: ${metrics.avg_completion_time_minutes.toFixed(0)} دقيقة
- معدل الإنجاز في الوقت: ${(metrics.on_time_completion_rate * 100).toFixed(0)}%
- معدل التأخير: ${(metrics.overdue_rate * 100).toFixed(0)}%

`;

    if (metrics.preferred_task_types.length > 0) {
      prompt += `**أنواع المهام المفضلة:** ${metrics.preferred_task_types.join(', ')}\n\n`;
    }

    prompt += `حلل نمط العمل وقدم رؤى مفيدة.`;

    return prompt;
  }

  /**
   * Parse behavior analysis
   */
  parseBehaviorAnalysis(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      return {
        work_style: 'steady_worker',
        strengths: ['منظم', 'ملتزم'],
        improvement_areas: [],
        recommended_schedule: {},
        insights: 'تحليل أولي - يحتاج المزيد من البيانات'
      };
    }
  }
}

// Singleton instance
const behavioralService = new BehavioralService();

export default behavioralService;
