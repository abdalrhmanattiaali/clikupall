/**
 * Test Routes
 * مسارات الاختبار
 */

import express from 'express';
import logger from '../core/logger.js';
import aiService from '../services/ai/index.js';
import clickupService from '../services/clickup/clickupService.js';
import whatsappService from '../services/whatsapp/whatsappService.js';
import notificationService from '../services/notification/notificationService.js';
import schedulerService from '../services/scheduler/schedulerService.js';
import motivationService from '../services/motivation/motivationService.js';
import gamificationService from '../services/gamification/gamificationService.js';
import leaderboardService from '../services/gamification/leaderboardService.js';
import productivityRepo from '../repositories/productivityRepository.js';
import achievementRepo from '../repositories/achievementRepository.js';
import { TEAM, findMemberByName, findMemberById } from '../config/team.js';
import { ALL_BADGES } from '../config/badges.js';
import { SHIELD_LEVELS } from '../config/shields.js';
import databaseService from '../database/index.js';
import enhancedClickUpService from '../services/clickup/enhancedClickupService.js';
import taskWeightingService from '../services/ai/taskWeightingService.js';
import behavioralService from '../services/ai/behavioralService.js';

const router = express.Router();

/**
 * GET /test/ai
 * Test AI service
 */
router.get('/ai', async (req, res) => {
  try {
    const response = await aiService.generateCompletion(
      'أنت مساعد ذكي',
      'قل مرحباً بالعربية',
      { maxTokens: 100 }
    );

    res.json({
      success: true,
      provider: aiService.getProviderName(),
      response
    });
  } catch (error) {
    logger.error('AI test failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /test/whatsapp
 * Test WhatsApp connection
 */
router.get('/whatsapp', async (req, res) => {
  try {
    const isReady = whatsappService.isClientReady();
    const groupId = whatsappService.getGroupChatId();

    res.json({
      success: true,
      isReady,
      hasGroup: !!groupId
    });
  } catch (error) {
    logger.error('WhatsApp test failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /test/notification-queue
 * Get notification queue status
 */
router.get('/notification-queue', async (req, res) => {
  try {
    const status = notificationService.getStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    logger.error('Notification queue test failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /test/scheduler-jobs
 * Get all scheduled jobs
 */
router.get('/scheduler-jobs', async (req, res) => {
  try {
    const jobs = schedulerService.getJobs();
    res.json({ success: true, jobs, count: jobs.length });
  } catch (error) {
    logger.error('Scheduler jobs test failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /test/clickup-task/:taskId
 * Test fetching a specific task
 */
router.get('/clickup-task/:taskId', async (req, res) => {
  try {
    const task = await clickupService.getTask(req.params.taskId);
    res.json({ success: true, task });
  } catch (error) {
    logger.error('ClickUp task test failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /test/user-stats/:userName
 * Get user productivity stats
 */
router.get('/user-stats/:userName', async (req, res) => {
  try {
    const stats = await productivityRepo.getUserStats(req.params.userName);
    res.json({ success: true, stats });
  } catch (error) {
    logger.error('User stats test failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /test/user-achievements/:userName
 * Get user achievements
 */
router.get('/user-achievements/:userName', async (req, res) => {
  try {
    const achievements = await achievementRepo.getUserAchievements(req.params.userName);
    res.json({ success: true, achievements });
  } catch (error) {
    logger.error('User achievements test failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /test/send-message
 * Test sending WhatsApp message
 * Body: { phone, message }
 */
router.post('/send-message', async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone and message are required' });
    }

    await whatsappService.sendToUser(phone, message);

    res.json({ success: true, message: 'Message sent' });
  } catch (error) {
    logger.error('Send message test failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /test/send-to-group
 * Test sending message to group
 * Body: { message }
 */
router.post('/send-to-group', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    await whatsappService.sendToGroup(message);

    res.json({ success: true, message: 'Message sent to group' });
  } catch (error) {
    logger.error('Send to group test failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /test/team-members
 * Get all team members
 */
router.get('/team-members', async (req, res) => {
  try {
    res.json({
      success: true,
      team: TEAM,
      count: TEAM.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /test/pause-notifications
 * Pause notifications for testing
 */
router.post('/pause-notifications', async (req, res) => {
  try {
    const { duration } = req.body;
    notificationService.pause(duration || 600000);

    res.json({
      success: true,
      message: 'Notifications paused',
      duration: duration || 600000
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /test/resume-notifications
 * Resume notifications
 */
router.post('/resume-notifications', async (req, res) => {
  try {
    notificationService.resume();

    res.json({
      success: true,
      message: 'Notifications resumed'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /test/send-test-message
 * Send a test message to the WhatsApp group (simple GET endpoint for easy testing)
 */
router.get('/send-test-message', async (req, res) => {
  try {
    if (!whatsappService.isClientReady()) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp is not ready yet. Please wait or scan QR code.'
      });
    }

    if (!whatsappService.getGroupChatId()) {
      return res.status(404).json({
        success: false,
        error: 'Group chat not found. Please check WHATSAPP_GROUP_NAME in .env'
      });
    }

    const testMessage = `✅ رسالة اختبار من التطبيق

🤖 النظام يعمل بشكل صحيح!
⏰ الوقت: ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}

إذا وصلتك هذه الرسالة، معنى ذلك أن:
✓ السيرفر يعمل
✓ الواتساب متصل
✓ المجموعة مكتشفة

الآن يمكنك تكوين Webhooks في ClickUp لاستقبال الإشعارات!

راجع ملف WEBHOOK_SETUP.md للتعليمات الكاملة.`;

    await whatsappService.sendToGroup(testMessage);

    res.json({
      success: true,
      message: 'Test message sent to WhatsApp group successfully! Check your phone.'
    });
  } catch (error) {
    logger.error('Test message failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /test/motivation/:timeSlot
 * Test motivational message generation for specific time slot
 * Time slots: morning, midday, afternoon, evening
 */
router.get('/motivation/:timeSlot', async (req, res) => {
  try {
    const { timeSlot } = req.params;
    const validSlots = ['morning', 'midday', 'afternoon', 'evening'];

    if (!validSlots.includes(timeSlot)) {
      return res.status(400).json({
        success: false,
        error: `Invalid time slot. Valid options: ${validSlots.join(', ')}`
      });
    }

    logger.info(`Testing ${timeSlot} motivational message generation`);

    const message = await motivationService.generateMotivationalMessage(timeSlot);

    res.json({
      success: true,
      timeSlot,
      message,
      length: message.length,
      aiProvider: aiService.getProviderName()
    });
  } catch (error) {
    logger.error('Motivation test failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /test/send-motivation/:timeSlot
 * Send motivational message to WhatsApp group
 */
router.post('/send-motivation/:timeSlot', async (req, res) => {
  try {
    const { timeSlot } = req.params;
    const validSlots = ['morning', 'midday', 'afternoon', 'evening'];

    if (!validSlots.includes(timeSlot)) {
      return res.status(400).json({
        success: false,
        error: `Invalid time slot. Valid options: ${validSlots.join(', ')}`
      });
    }

    const result = await motivationService.sendMotivationalMessage(timeSlot);

    res.json({
      success: result,
      timeSlot,
      message: result
        ? 'Motivational message sent to WhatsApp group!'
        : 'Failed to send message. Check logs.'
    });
  } catch (error) {
    logger.error('Send motivation failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /test/motivation-context
 * Get current team context for motivation
 */
router.get('/motivation-context', async (req, res) => {
  try {
    const context = await motivationService.analyzeTeamContext();

    res.json({
      success: true,
      context,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Context analysis failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /test/motivation-history
 * Get motivation content history
 */
router.get('/motivation-history', async (req, res) => {
  try {
    const history = motivationService.getContentHistory();

    res.json({
      success: true,
      totalMessages: history.length,
      history: history.map(h => ({
        timeSlot: h.timeSlot,
        type: h.type,
        timestamp: new Date(h.timestamp).toLocaleString('ar-EG', {
          timeZone: 'Africa/Cairo'
        }),
        preview: h.message
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /test/motivation-history
 * Clear motivation history (for testing)
 */
router.delete('/motivation-history', async (req, res) => {
  try {
    motivationService.clearHistory();

    res.json({
      success: true,
      message: 'Motivation history cleared'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 🏆 GAMIFICATION TEST ENDPOINTS
 */

/**
 * GET /test/badges
 * List all available badges
 */
router.get('/badges', async (req, res) => {
  try {
    res.json({
      success: true,
      totalBadges: ALL_BADGES.length,
      badges: ALL_BADGES.map(b => ({
        id: b.id,
        name: b.name,
        category: b.category,
        points: b.points,
        rarity: b.rarity
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /test/shields
 * List all shield levels
 */
router.get('/shields', async (req, res) => {
  try {
    res.json({
      success: true,
      totalLevels: SHIELD_LEVELS.length,
      shields: SHIELD_LEVELS
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /test/user-achievements/:userId
 * Get user achievements and stats
 */
router.get('/user-achievements/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const stats = await gamificationService.getUserStats(userId);
    const member = findMemberById(userId);

    res.json({
      success: true,
      user: member?.name || `User ${userId}`,
      stats
    });
  } catch (error) {
    logger.error('Failed to get user achievements', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /test/leaderboard/:type
 * Get leaderboard (types: points, tasks, streak)
 */
router.get('/leaderboard/:type?', async (req, res) => {
  try {
    const type = req.params.type || 'points';
    const leaderboard = await gamificationService.getLeaderboard(type);

    res.json({
      success: true,
      type,
      leaderboard
    });
  } catch (error) {
    logger.error('Failed to get leaderboard', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /test/send-leaderboard
 * Send leaderboard to WhatsApp group
 */
router.post('/send-leaderboard', async (req, res) => {
  try {
    const { type = 'points' } = req.body;
    const result = await leaderboardService.sendLeaderboardToGroup(type);

    res.json({
      success: result,
      message: result ? 'Leaderboard sent!' : 'Failed to send'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /test/send-weekly-reports
 * Trigger weekly achievement reports
 */
router.post('/send-weekly-reports', async (req, res) => {
  try {
    await schedulerService.sendWeeklyAchievementReports();
    res.json({
      success: true,
      message: 'Weekly reports sent to all team members'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /test/simulate-task-complete
 * Simulate task completion for testing gamification
 */
router.post('/simulate-task-complete', async (req, res) => {
  try {
    const { userId, taskName = 'Test Task' } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const mockTask = {
      id: `test-${Date.now()}`,
      name: taskName,
      status: { status: 'complete' },
      priority: { id: 2 },
      assignees: [{ id: parseInt(userId) }],
      date_created: Date.now() - 3600000, // 1 hour ago
      date_closed: Date.now()
    };

    const result = await gamificationService.processCompletedTask(mockTask, parseInt(userId));

    res.json({
      success: true,
      result,
      message: 'Task completion simulated successfully'
    });
  } catch (error) {
    logger.error('Failed to simulate task', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== NEW AI & DATABASE ENDPOINTS ====================

/**
 * GET /test/db-stats
 * Get database statistics
 */
router.get('/db-stats', (req, res) => {
  try {
    const stats = databaseService.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /test/sync-task/:taskId
 * Fetch and store complete task data from ClickUp
 */
router.post('/sync-task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await enhancedClickUpService.fetchCompleteTaskData(taskId);

    res.json({
      success: true,
      task,
      message: 'Task synced to database successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /test/analyze-task/:taskId
 * Calculate AI weight for a task
 */
router.post('/analyze-task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    // Get task from database or fetch from API
    let task = databaseService.getTask(taskId);
    if (!task) {
      task = await enhancedClickUpService.fetchCompleteTaskData(taskId);
    }

    // Calculate AI weight
    const analysis = await taskWeightingService.calculateTaskWeight(task);

    res.json({
      success: true,
      task_id: taskId,
      task_name: task.name,
      analysis
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /test/task/:taskId
 * Get complete task data from database
 */
router.get('/task/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const task = databaseService.getTask(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found in database'
      });
    }

    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /test/user-tasks/:userId
 * Get all tasks for a user
 */
router.get('/user-tasks/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const { status, priority } = req.query;

    const tasks = databaseService.getUserTasks(userId, {
      status,
      priority
    });

    res.json({
      success: true,
      user_id: userId,
      count: tasks.length,
      tasks
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /test/morning-recommendations/:userId
 * Generate morning task recommendations for a user
 */
router.post('/morning-recommendations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const recommendations = await behavioralService.generateMorningRecommendations(parseInt(userId));

    res.json({
      success: true,
      user_id: userId,
      recommendations
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /test/analyze-behavior/:userId
 * Analyze user behavior and work patterns
 */
router.post('/analyze-behavior/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const behavior = await behavioralService.analyzeUserBehavior(parseInt(userId));

    res.json({
      success: true,
      user_id: userId,
      behavior
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /test/user-behavior/:userId
 * Get stored user behavior data
 */
router.get('/user-behavior/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    const behavior = databaseService.getUserBehavior(userId);

    if (!behavior) {
      return res.status(404).json({
        success: false,
        error: 'No behavior data found for this user'
      });
    }

    res.json({ success: true, user_id: userId, behavior });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /test/task-events/:taskId
 * Get all events for a task
 */
router.get('/task-events/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const { limit } = req.query;

    const events = databaseService.getTaskEvents(taskId, limit ? parseInt(limit) : 50);

    res.json({
      success: true,
      task_id: taskId,
      count: events.length,
      events
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /test/send-recommendations
 * Trigger morning recommendations for all users
 */
router.post('/send-recommendations', async (req, res) => {
  try {
    await schedulerService.sendMorningRecommendations();
    res.json({
      success: true,
      message: 'Morning recommendations sent to all team members'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /test/sync-all-tasks
 * Sync all tasks from ClickUp to database (WARNING: May take time)
 */
router.post('/sync-all-tasks', async (req, res) => {
  try {
    const result = await enhancedClickUpService.syncAllTasks();

    res.json({
      success: true,
      ...result,
      message: 'All tasks synced successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
