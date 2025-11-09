/**
 * Claude AI Provider (Anthropic)
 * مزود خدمة Claude AI من Anthropic
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import logger from '../../core/logger.js';
import { AIProviderInterface } from './index.js';

class ClaudeProvider extends AIProviderInterface {
  constructor() {
    super();
    this.apiKey = env.ai.claude.apiKey;
    this.model = env.ai.claude.model;
    this.client = null;

    if (this.isAvailable()) {
      this.client = new Anthropic({ apiKey: this.apiKey });
      logger.debug('Claude provider initialized', { model: this.model });
    }
  }

  /**
   * Check if Claude is available
   * @returns {boolean}
   */
  isAvailable() {
    return !!(this.apiKey && this.apiKey !== 'your_claude_api_key_here' && !this.apiKey.includes('YOUR-API-KEY'));
  }

  /**
   * Generate completion using Claude
   * @param {string} systemPrompt - System instruction
   * @param {string} userMessage - User message
   * @param {Object} options - Additional options
   * @returns {Promise<string>} AI response
   */
  async generateCompletion(systemPrompt, userMessage, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('Claude API key is not configured');
    }

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options.maxTokens || 1024,
        temperature: options.temperature || 0.7,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage
          }
        ]
      });

      return response.content[0]?.text?.trim() || '';
    } catch (error) {
      logger.error('Claude API error', {
        error: error.message,
        status: error.status
      });
      throw error;
    }
  }

  /**
   * Chat with Claude (multi-turn conversation)
   * @param {Array} messages - Array of {role, content} messages
   * @param {Object} options - Additional options
   * @returns {Promise<string>} AI response
   */
  async chat(messages, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('Claude API key is not configured');
    }

    try {
      // Extract system message if present
      let systemPrompt = '';
      const chatMessages = messages.filter(msg => {
        if (msg.role === 'system') {
          systemPrompt = msg.content;
          return false;
        }
        return true;
      });

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options.maxTokens || 1024,
        temperature: options.temperature || 0.7,
        system: systemPrompt,
        messages: chatMessages
      });

      return response.content[0]?.text?.trim() || '';
    } catch (error) {
      logger.error('Claude chat error', {
        error: error.message,
        status: error.status
      });
      throw error;
    }
  }
}

export default ClaudeProvider;
