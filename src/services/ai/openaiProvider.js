/**
 * OpenAI Provider (ChatGPT)
 * مزود خدمة OpenAI - يدعم GPT-4o و GPT-4 و GPT-3.5
 */

import axios from 'axios';
import { env } from '../../config/env.js';
import logger from '../../core/logger.js';
import { AIProviderInterface } from './index.js';

class OpenAIProvider extends AIProviderInterface {
  constructor() {
    super();
    this.apiKey = env.ai.openai.apiKey;
    this.model = env.ai.openai.model;
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';

    if (this.isAvailable()) {
      logger.debug('OpenAI provider initialized', { model: this.model });
    }
  }

  /**
   * Check if OpenAI is available
   * @returns {boolean}
   */
  isAvailable() {
    return !!(this.apiKey && this.apiKey !== 'your_openai_api_key_here' && !this.apiKey.includes('YOUR-API-KEY'));
  }

  /**
   * Generate completion using OpenAI
   * @param {string} systemPrompt - System instruction
   * @param {string} userMessage - User message
   * @param {Object} options - Additional options
   * @returns {Promise<string>} AI response
   */
  async generateCompletion(systemPrompt, userMessage, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('OpenAI API key is not configured');
    }

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          max_tokens: options.maxTokens || 1024,
          temperature: options.temperature || 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data?.choices?.[0]?.message?.content?.trim() || '';
    } catch (error) {
      logger.error('OpenAI API error', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Chat with OpenAI (multi-turn conversation)
   * @param {Array} messages - Array of {role, content} messages
   * @param {Object} options - Additional options
   * @returns {Promise<string>} AI response
   */
  async chat(messages, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('OpenAI API key is not configured');
    }

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: messages,
          max_tokens: options.maxTokens || 1024,
          temperature: options.temperature || 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data?.choices?.[0]?.message?.content?.trim() || '';
    } catch (error) {
      logger.error('OpenAI chat error', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Stream chat response (for future use)
   * @param {Array} messages - Array of messages
   * @param {Function} onChunk - Callback for each chunk
   * @param {Object} options - Additional options
   */
  async streamChat(messages, onChunk, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('OpenAI API key is not configured');
    }

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: messages,
          max_tokens: options.maxTokens || 1024,
          temperature: options.temperature || 0.7,
          stream: true
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'stream'
        }
      );

      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;

              if (content) {
                onChunk(content);
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      });
    } catch (error) {
      logger.error('OpenAI stream error', {
        error: error.message
      });
      throw error;
    }
  }
}

export default OpenAIProvider;
