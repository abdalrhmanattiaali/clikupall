/**
 * AI Service Factory
 * مصنع خدمات الذكاء الاصطناعي - يدعم Claude و OpenAI و Gemini
 */

import { env } from '../../config/env.js';
import logger from '../../core/logger.js';
import { AIError } from '../../core/errors.js';
import AIProviderInterface from './baseProvider.js';
import ClaudeProvider from './claudeProvider.js';
import OpenAIProvider from './openaiProvider.js';
import GeminiProvider from './geminiProvider.js';

/**
 * AI Service Class
 * خدمة الذكاء الاصطناعي الرئيسية
 */
class AIService {
  constructor() {
    this.provider = null;
    this.providerName = env.ai.provider;
    this.initializeProvider();
  }

  /**
   * Initialize AI provider based on configuration
   */
  initializeProvider() {
    try {
      switch (this.providerName) {
        case 'claude':
          this.provider = new ClaudeProvider();
          break;
        case 'openai':
          this.provider = new OpenAIProvider();
          break;
        case 'gemini':
          this.provider = new GeminiProvider();
          break;
        default:
          throw new Error(`Unknown AI provider: ${this.providerName}`);
      }

      if (!this.provider.isAvailable()) {
        throw new Error(`AI provider "${this.providerName}" is not properly configured`);
      }

      logger.success(`AI Service initialized with provider: ${this.providerName}`);
    } catch (error) {
      logger.error(`Failed to initialize AI provider: ${error.message}`);
      throw new AIError(`AI Service initialization failed: ${error.message}`, this.providerName);
    }
  }

  /**
   * Generate AI completion
   * @param {string} systemPrompt - System instruction
   * @param {string} userMessage - User message/prompt
   * @param {Object} options - Additional options
   * @returns {Promise<string>} AI response
   */
  async generateCompletion(systemPrompt, userMessage, options = {}) {
    try {
      logger.debug('Generating AI completion', {
        provider: this.providerName,
        systemPromptLength: systemPrompt.length,
        userMessageLength: userMessage.length
      });

      const response = await this.provider.generateCompletion(systemPrompt, userMessage, options);

      logger.debug('AI completion generated successfully', {
        provider: this.providerName,
        responseLength: response.length
      });

      return response;
    } catch (error) {
      logger.error('AI completion generation failed', {
        provider: this.providerName,
        error: error.message
      });
      throw new AIError(
        `Failed to generate AI completion: ${error.message}`,
        this.providerName,
        { originalError: error }
      );
    }
  }

  /**
   * Chat with AI (multi-turn conversation)
   * @param {Array} messages - Array of chat messages
   * @param {Object} options - Additional options
   * @returns {Promise<string>} AI response
   */
  async chat(messages, options = {}) {
    try {
      logger.debug('Starting AI chat', {
        provider: this.providerName,
        messageCount: messages.length
      });

      const response = await this.provider.chat(messages, options);

      logger.debug('AI chat completed successfully', {
        provider: this.providerName,
        responseLength: response.length
      });

      return response;
    } catch (error) {
      logger.error('AI chat failed', {
        provider: this.providerName,
        error: error.message
      });
      throw new AIError(
        `Failed to chat with AI: ${error.message}`,
        this.providerName,
        { originalError: error }
      );
    }
  }

  /**
   * Get current provider name
   * @returns {string} Provider name
   */
  getProviderName() {
    return this.providerName;
  }

  /**
   * Check if AI service is available
   * @returns {boolean} Availability status
   */
  isAvailable() {
    return this.provider && this.provider.isAvailable();
  }

  /**
   * Switch to a different provider (runtime switching)
   * @param {string} providerName - New provider name
   */
  switchProvider(providerName) {
    logger.info(`Switching AI provider from ${this.providerName} to ${providerName}`);
    this.providerName = providerName;
    this.initializeProvider();
  }
}

// Create singleton instance
const aiService = new AIService();

export default aiService;
export { AIService, AIProviderInterface };
