/**
 * WhatsApp Service
 * خدمة التعامل مع WhatsApp Web
 */

import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { env } from '../../config/env.js';
import logger from '../../core/logger.js';
import eventBus, { EVENTS } from '../../core/eventBus.js';
import { WhatsAppError } from '../../core/errors.js';
import { chunkMessage } from '../../utils/helpers.js';

class WhatsAppService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.groupChatId = null;
  }

  /**
   * Initialize WhatsApp client
   */
  async initialize() {
    logger.info('Initializing WhatsApp client...');

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: env.whatsapp.sessionPath
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      }
    });

    this.setupEventHandlers();

    try {
      await this.client.initialize();
    } catch (error) {
      logger.error('Failed to initialize WhatsApp client', {
        error: error.message
      });
      throw new WhatsAppError('WhatsApp initialization failed', {
        originalError: error
      });
    }
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    this.client.on('qr', (qr) => {
      logger.info('QR Code received, please scan with WhatsApp:');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('authenticated', () => {
      logger.success('WhatsApp authenticated successfully');
    });

    this.client.on('ready', async () => {
      logger.success('WhatsApp client is ready');
      this.isReady = true;

      // Find group chat
      await this.findGroupChat();

      eventBus.emitEvent(EVENTS.WHATSAPP_READY);
    });

    this.client.on('auth_failure', (msg) => {
      logger.error('WhatsApp authentication failed', { msg });
      this.isReady = false;
    });

    this.client.on('disconnected', (reason) => {
      logger.warn('WhatsApp disconnected', { reason });
      this.isReady = false;
      eventBus.emitEvent(EVENTS.WHATSAPP_DISCONNECTED, { reason });
    });

    this.client.on('error', (error) => {
      logger.error('WhatsApp client error', { error: error.message });
    });

    // Diagnostic: Log incoming messages
    this.client.on('message', message => {
      if (message.from !== 'status@broadcast') {
        logger.debug('WhatsApp message received', {
          from: message.from.substring(0, 15) + '...',
          body: message.body.substring(0, 50)
        });
      }
    });
  }

  /**
   * Find group chat by name
   */
  async findGroupChat() {
    try {
      const chats = await this.client.getChats();
      const group = chats.find(
        c => c.isGroup && c.name === env.whatsapp.groupName
      );

      if (group) {
        this.groupChatId = group.id._serialized;
        logger.success('Group chat found', {
          name: group.name,
          id: this.groupChatId.substring(0, 20) + '...'
        });
      } else {
        logger.warn('Group chat not found', {
          name: env.whatsapp.groupName
        });
      }
    } catch (error) {
      logger.error('Failed to find group chat', {
        error: error.message
      });
    }
  }

  /**
   * Send message
   * @param {string} chatId - Chat ID or phone number
   * @param {string} message - Message text
   * @param {Object} options - Additional options
   */
  async sendMessage(chatId, message, options = {}) {
    if (!this.isReady) {
      throw new WhatsAppError('WhatsApp client is not ready');
    }

    try {
      // Split long messages
      const chunks = chunkMessage(message);

      for (const chunk of chunks) {
        const sentMessage = await this.client.sendMessage(chatId, chunk, {
          linkPreview: false,
          ...options
        });

        logger.debug('WhatsApp message sent', {
          chatId: chatId.substring(0, 15) + '...',
          length: chunk.length
        });

        // Pin if requested and it's the first chunk
        if (options.pin && chunks.indexOf(chunk) === 0 && chatId === this.groupChatId) {
          try {
            await sentMessage.pin();
            logger.debug('Message pinned successfully');
          } catch (pinError) {
            logger.warn('Failed to pin message', {
              error: pinError.message
            });
          }
        }
      }

      return true;
    } catch (error) {
      logger.error('Failed to send WhatsApp message', {
        chatId: chatId.substring(0, 15) + '...',
        error: error.message
      });

      throw new WhatsAppError(
        `Failed to send message: ${error.message}`,
        { chatId, originalError: error }
      );
    }
  }

  /**
   * Send message to group
   * @param {string} message - Message text
   * @param {Object} options - Additional options
   */
  async sendToGroup(message, options = {}) {
    if (!this.groupChatId) {
      throw new WhatsAppError('Group chat not found');
    }

    return await this.sendMessage(this.groupChatId, message, options);
  }

  /**
   * Send message to user by phone
   * @param {string} phone - Phone number
   * @param {string} message - Message text
   * @param {Object} options - Additional options
   */
  async sendToUser(phone, message, options = {}) {
    const chatId = `${phone}@c.us`;
    return await this.sendMessage(chatId, message, options);
  }

  /**
   * Get group chat ID
   * @returns {string|null}
   */
  getGroupChatId() {
    return this.groupChatId;
  }

  /**
   * Disconnect client
   */
  async disconnect() {
    if (this.client) {
      await this.client.destroy();
      this.isReady = false;
      logger.info('WhatsApp client disconnected');
    }
  }

  /**
   * Get client instance
   */
  getClient() {
    return this.client;
  }

  /**
   * Check if ready
   */
  isClientReady() {
    return this.isReady;
  }
}

// Create singleton instance
const whatsappService = new WhatsAppService();

export default whatsappService;
