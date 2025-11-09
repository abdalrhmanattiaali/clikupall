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
      await this.setupRoutes();

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
  }

  /**
   * Setup Express middleware
   */
  setupExpress() {
    // Parse raw JSON bodies for webhooks
    this.app.use(express.raw({ type: 'application/json' }));

    // Parse JSON bodies for API endpoints
    this.app.use(express.json());

    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true }));

    // Static files
    this.app.use(express.static('public'));

    // Request logging middleware
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`);
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
      // AI Service (already initialized in import)
      logger.success(`AI Service ready (${aiService.getProviderName()})`);

      // WhatsApp Service
      logger.info('Initializing WhatsApp service...');
      // TODO: Import and initialize when created
      // const whatsappService = await import('./src/services/whatsapp/whatsappService.js');
      // await whatsappService.default.initialize();

      // Scheduler Service
      logger.info('Initializing scheduler service...');
      // TODO: Import and initialize when created
      // const schedulerService = await import('./src/services/scheduler/schedulerService.js');
      // schedulerService.default.initialize();

      logger.success('All services initialized');
    } catch (error) {
      logger.error('Service initialization failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Setup application routes
   */
  async setupRoutes() {
    logger.info('Setting up routes...');

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime(),
        aiProvider: aiService.getProviderName()
      });
    });

    // TODO: Import and register route modules when created
    // const webhookRoutes = await import('./src/routes/webhooks.js');
    // const dashboardRoutes = await import('./src/routes/dashboard.js');
    // const testRoutes = await import('./src/routes/test.js');
    //
    // this.app.use('/webhooks', webhookRoutes.default);
    // this.app.use('/dashboard', dashboardRoutes.default);
    // this.app.use('/test', testRoutes.default);

    // Temporary basic routes for testing
    this.app.get('/', (req, res) => {
      res.send(`
        <h1>ClickUp All - Task Management System</h1>
        <p>Status: Running</p>
        <p>AI Provider: ${aiService.getProviderName()}</p>
        <p>Version: 4.0.0</p>
        <ul>
          <li><a href="/health">Health Check</a></li>
        </ul>
      `);
    });

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

    // Task events
    eventBus.onEvent(EVENTS.TASK_COMPLETED, async (data) => {
      logger.debug('Task completed event received', { taskId: data.taskId });
      // TODO: Handle task completion
    });

    // Notification events
    eventBus.onEvent(EVENTS.NOTIFICATION_SENT, (data) => {
      logger.debug('Notification sent', { type: data.type });
    });

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
        path: req.path
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
      // Close HTTP server
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        logger.info('HTTP server closed');
      }

      // Close other services
      // TODO: Add service cleanup when services are implemented
      // await whatsappService.disconnect();
      // await schedulerService.stop();

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
