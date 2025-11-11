/**
 * Webhook Routes
 * مسارات webhooks من ClickUp و ERPNext
 */

import express from 'express';
import * as webhookController from '../controllers/webhookController.js';
import enhancedWebhookController from '../controllers/enhancedWebhookController.js';

const router = express.Router();

/**
 * Dedicated ClickUp webhook endpoints for mission-critical flows
 * توفر مسارات منفصلة لكل حدث مهم لتفادي تعارض الإشعارات
 */
router.post('/clickup/task-created/:webhookId?', enhancedWebhookController.handleTaskCreatedWebhook);
router.post('/clickup/task-assigned/:webhookId?', enhancedWebhookController.handleTaskAssignedWebhook);
router.post('/clickup/status-changed/:webhookId?', enhancedWebhookController.handleStatusChangedWebhook);
router.post('/clickup/task-completed/:webhookId?', enhancedWebhookController.handleTaskCompletedWebhook);
router.post('/clickup/task-comment/:webhookId?', enhancedWebhookController.handleTaskCommentWebhook);

/**
 * POST /webhooks/clickup/:webhookId?
 * Universal ClickUp webhook handler for ALL events (20+ events)
 * يستخدم عند الحاجة لمعالجة كل الأحداث في مسار واحد
 */
router.post('/clickup/:webhookId?', enhancedWebhookController.handleWebhook);
router.post('/clickup', enhancedWebhookController.handleWebhook);

// Legacy endpoints (backward compatibility)
router.post('/task-created', webhookController.handleTaskCreated);
router.post('/task-updated', webhookController.handleTaskUpdated);
router.post('/task-comment', webhookController.handleTaskComment);

/**
 * POST /webhooks/sample-request
 * ERPNext webhook for sample requests
 */
router.post('/sample-request', webhookController.handleSampleRequest);

export default router;
