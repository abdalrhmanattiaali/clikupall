/**
 * Webhook Routes
 * مسارات webhooks من ClickUp و ERPNext
 */

import express from 'express';
import * as webhookController from '../controllers/webhookController.js';
import enhancedWebhookController from '../controllers/enhancedWebhookController.js';

const router = express.Router();

/**
 * POST /webhooks/clickup/:webhookId?
 * Universal ClickUp webhook handler for ALL events (20+ events)
 * Use this endpoint for all ClickUp webhooks
 *
 * Supported events:
 * - Task Management: created, updated, deleted, assignee add/remove, status, priority, etc.
 * - Dates & Time: due date, start date, time tracked
 * - Checklists: item resolved, all resolved
 * - Subtasks: created, all resolved
 * - Comments: posted, updated
 *
 * URL formats:
 * - /webhooks/clickup (without ID)
 * - /webhooks/clickup/your-webhook-id (with custom ID for tracking)
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
