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
import productivityRepo from '../repositories/productivityRepository.js';
import achievementRepo from '../repositories/achievementRepository.js';
import { TEAM, findMemberByName } from '../config/team.js';

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

export default router;
