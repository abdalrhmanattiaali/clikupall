/**
 * AI Behavioral Service
 * Provides intelligent task recommendations based on user behavior and AI analysis
 */

import aiService from './index.js';
import databaseService from '../../database/index.js';
import logger from '../../core/logger.js';
import { TEAM } from '../../config/team.js';

class BehavioralService {
  /**
   * Generate morning task recommendations for a user
   */
  async generateMorningRecommendations(userId) {
    try {
      logger.info('Generating morning recommendations', { userId });

      // Get user's open tasks
      const userTasks = databaseService.getUserTasks(userId, {
        status: 'open'
      }).filter(t => t.status_name !== 'Complete' && t.status_name !== 'Closed');

      if (userTasks.length === 0) {
        return {
          message: '🎉 لا توجد مهام مفتوحة! استمتع بيومك!',
          recommendations: []
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

      const recommendations = this.parseRecommendations(response);

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

      return {
        message: '❌ حدث خطأ في توليد التوصيات',
        recommendations: []
      };
    }
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
