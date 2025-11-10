/**
 * Webhook Routes
 * مسارات webhooks من ClickUp و ERPNext
 */

import express from 'express';
import * as webhookController from '../controllers/webhookController.js';

const router = express.Router();

/**
 * POST /webhooks/task-created
 * ClickUp webhook for task creation
 */
router.post('/task-created', webhookController.handleTaskCreated);

/**
 * POST /webhooks/task-updated
 * ClickUp webhook for task updates
 */
router.post('/task-updated', webhookController.handleTaskUpdated);

/**
 * POST /webhooks/task-comment
 * ClickUp webhook for new comments
 */
router.post('/task-comment', webhookController.handleTaskComment);

/**
 * POST /webhooks/sample-request
 * ERPNext webhook for sample requests
 */
router.post('/sample-request', webhookController.handleSampleRequest);

export default router;
