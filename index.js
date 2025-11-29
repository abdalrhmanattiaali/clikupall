/**
 * ClickUp All - Main Entry Point
 * نقطة الدخول الرئيسية للتطبيق
 */

import express from 'express';
import { env } from './src/config/env.js';
import logger from './src/core/logger.js';
import eventBus, { EVENTS } from './src/core/eventBus.js';

// Services
import aiService from './src/services/ai/index.js';
import whatsappService from './src/services/whatsapp/whatsappService.js';
import notificationService from './src/services/notification/enhancedNotificationService.js';
import schedulerService from './src/services/scheduler/schedulerService.js';
import './src/services/whatsapp/taskIntakeService.js';
import databaseService from './src/database/index.js';

// Routes
import webhookRoutes from './src/routes/webhooks.js';
import testRoutes from './src/routes/test.js';

/**
 * Main Application Class
 */
class Application {
  constructor() {
    this.app = express();
    this.port = env.PORT;
    this.isReady = false;
  }

  /**
   * Initialize application
   */
  async initialize() {
    try {
      logger.start('ClickUp All - Starting Application...');
      logger.separator();

      // Log environment
      this.logEnvironment();

      // Setup Express
      this.setupExpress();

      // Initialize services
      await this.initializeServices();

      // Setup routes
      this.setupRoutes();

      // Setup event listeners
      this.setupEventListeners();

      // Setup error handlers
      this.setupErrorHandlers();

      // Start server
      this.startServer();

      this.isReady = true;
      eventBus.emitEvent(EVENTS.APP_READY);

      logger.separator();
      logger.success('Application initialized successfully!');
      logger.info(`AI Provider: ${aiService.getProviderName()}`);
      logger.info(`Server running at: http://0.0.0.0:${this.port}`);
      logger.separator();
    } catch (error) {
      logger.error('Failed to initialize application', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  }

  /**
   * Log environment info
   */
  logEnvironment() {
    logger.info('Environment Configuration:');
    logger.info(`  NODE_ENV: ${env.NODE_ENV}`);
    logger.info(`  PORT: ${env.PORT}`);
    logger.info(`  TZ: ${env.TZ}`);
    logger.info(`  AI Provider: ${env.ai.provider}`);
    logger.info('Feature Toggles:');
    logger.info(`  AI Notifications: ${env.features.aiNotifications}`);
    logger.info(`  Daily Reports: ${env.features.dailyReports}`);
    logger.info(`  Weekly Challenges: ${env.features.weeklyChallenges}`);
    logger.info(`  Badges: ${env.features.badges}`);
  }

  /**
   * Setup Express middleware
   */
  setupExpress() {
    // Parse raw JSON bodies for webhooks
    this.app.use(express.raw({ type: 'application/json', limit: '10mb' }));

    // Parse JSON bodies for API endpoints
    this.app.use(express.json({ limit: '10mb' }));

    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Static files
    this.app.use(express.static('public'));

    // Request logging middleware
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')?.substring(0, 50)
      });
      next();
    });

    logger.success('Express middleware configured');
  }

  /**
   * Initialize all services
   */
  async initializeServices() {
    logger.info('Initializing services...');

    try {
      // Database Service
      logger.info('Initializing database service...');
      await databaseService.initialize();
      logger.success('Database Service ready');

      // AI Service (already initialized in import)
      logger.success(`AI Service ready (${aiService.getProviderName()})`);

      // WhatsApp Service
      logger.info('Initializing WhatsApp service...');
      await whatsappService.initialize();

      // Notification Service (already initialized in import)
      logger.success('Notification Service ready');

      // Scheduler Service
      logger.info('Initializing scheduler service...');
      schedulerService.initialize();
      logger.success('Scheduler Service ready');

      logger.success('All services initialized');
    } catch (error) {
      logger.error('Service initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Setup application routes
   */
  setupRoutes() {
    logger.info('Setting up routes...');

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime(),
        aiProvider: aiService.getProviderName(),
        whatsappReady: whatsappService.isClientReady(),
        notificationQueue: notificationService.getStatus()
      });
    });

    // Home page
    this.app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>ClickUp All - نظام إدارة المهام</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #333; border-bottom: 3px solid #7b2cbf; padding-bottom: 10px; }
            .status { display: inline-block; padding: 5px 15px; border-radius: 20px; margin: 5px; font-size: 14px; }
            .status.success { background: #d4edda; color: #155724; }
            .status.warning { background: #fff3cd; color: #856404; }
            ul { list-style: none; padding: 0; }
            li { padding: 10px; margin: 5px 0; background: #f8f9fa; border-radius: 5px; }
            a { color: #7b2cbf; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🚀 ClickUp All - نظام إدارة المهام</h1>

            <h3>📊 حالة النظام</h3>
            <div>
              <span class="status success">✅ التطبيق يعمل</span>
              <span class="status ${whatsappService.isClientReady() ? 'success' : 'warning'}">
                ${whatsappService.isClientReady() ? '✅' : '⏳'} WhatsApp ${whatsappService.isClientReady() ? 'متصل' : 'قيد الاتصال'}
              </span>
              <span class="status success">✅ AI: ${aiService.getProviderName()}</span>
            </div>

            <h3>🔗 الروابط المفيدة</h3>
            <ul>
              <li><a href="/health">📊 فحص صحة النظام (Health Check)</a></li>
              <li><a href="/test/ai">🤖 اختبار AI Service</a></li>
              <li><a href="/test/whatsapp">📱 اختبار WhatsApp</a></li>
              <li><a href="/test/notification-queue">📮 حالة قائمة الإشعارات</a></li>
              <li><a href="/test/scheduler-jobs">⏰ المهام المجدولة</a></li>
              <li><a href="/test/team-members">👥 أعضاء الفريق</a></li>
            </ul>

            <h3>📡 Webhook Endpoints</h3>
            <ul>
              <li>POST /webhooks/task-created</li>
              <li>POST /webhooks/task-updated</li>
              <li>POST /webhooks/task-comment</li>
              <li>POST /webhooks/sample-request</li>
            </ul>

            <h3>ℹ️ معلومات النظام</h3>
            <ul>
              <li>النسخة: 4.0.0</li>
              <li>البيئة: ${env.NODE_ENV}</li>
              <li>المنفذ: ${env.PORT}</li>
              <li>المنطقة الزمنية: ${env.TZ}</li>
            </ul>
          </div>
        </body>
        </html>
      `);
    });

    // Register route modules
    this.app.use('/webhooks', webhookRoutes);
    this.app.use('/test', testRoutes);

    logger.success('Routes configured');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    logger.info('Setting up event listeners...');

    // Application events
    eventBus.onEvent(EVENTS.APP_ERROR, (error) => {
      logger.error('Application error occurred', { error });
    });

    // WhatsApp events
    eventBus.onEvent(EVENTS.WHATSAPP_READY, () => {
      logger.success('WhatsApp service is ready and connected');
    });

    eventBus.onEvent(EVENTS.WHATSAPP_DISCONNECTED, (data) => {
      logger.warn('WhatsApp service disconnected', data);
    });

    // Task events are handled by NotificationService
    logger.success('Event listeners configured');
  }

  /**
   * Setup error handlers
   */
  setupErrorHandlers() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        path: req.path,
        message: 'The requested endpoint does not exist'
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error in request', {
        method: req.method,
        path: req.path,
        error: error.message,
        stack: error.stack
      });

      const statusCode = error.statusCode || 500;
      const message = error.isOperational ? error.message : 'Internal Server Error';

      res.status(statusCode).json({
        error: message,
        ...(env.NODE_ENV === 'development' && { stack: error.stack })
      });
    });

    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
      });
      this.shutdown(1);
    });

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', {
        reason,
        promise
      });
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', () => this.shutdown(0));
    process.on('SIGINT', () => this.shutdown(0));

    logger.success('Error handlers configured');
  }

  /**
   * Start HTTP server
   */
  startServer() {
    this.server = this.app.listen(this.port, '0.0.0.0', () => {
      logger.success(`Server listening on port ${this.port}`);
    });
  }

  /**
   * Graceful shutdown
   * @param {number} code - Exit code
   */
  async shutdown(code = 0) {
    logger.warn('Shutting down gracefully...');

    try {
      // Stop scheduler
      schedulerService.stop();
      logger.info('Scheduler stopped');

      // Close HTTP server
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        logger.info('HTTP server closed');
      }

      // Disconnect WhatsApp
      await whatsappService.disconnect();
      logger.info('WhatsApp disconnected');

      logger.stop('Application stopped');
      process.exit(code);
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
      process.exit(1);
    }
  }
}

// Create and run application
const app = new Application();
app.initialize().catch((error) => {
  logger.error('Fatal error during initialization', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

export default app;
