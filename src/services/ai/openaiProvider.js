/**
 * OpenAI Provider (ChatGPT)
 * مزود خدمة OpenAI - يدعم GPT-4o و GPT-4 و GPT-3.5
 */

import axios from 'axios';
import { env } from '../../config/env.js';
import logger from '../../core/logger.js';
import AIProviderInterface from './baseProvider.js';

class OpenAIProvider extends AIProviderInterface {
  constructor() {
    super();
    this.apiKey = env.ai.openai.apiKey;
    this.primaryModel = env.ai.openai.model;
    this.fallbackModels = env.ai.openai.fallbackModels || [];
    this.modelsToTry = this.buildModelPriorityList();
    this.model = this.modelsToTry[0];
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

  buildModelPriorityList() {
    const uniqueModels = new Set([
      this.primaryModel,
      ...(this.fallbackModels || [])
    ].filter(Boolean));

    return Array.from(uniqueModels);
  }

  shouldFallback(error) {
    const status = error.response?.status;
    const errorCode = error.response?.data?.error?.code;
    return status === 404 || errorCode === 'model_not_found';
  }

  async withModelFallback(executor) {
    if (!this.isAvailable()) {
      throw new Error('OpenAI API key is not configured');
    }

    let lastError;

    for (const model of this.modelsToTry) {
      try {
        const result = await executor(model);
        if (this.model !== model) {
          logger.warn('OpenAI provider switched model due to fallback', {
            previousModel: this.model,
            newModel: model
          });
          this.model = model;
        }
        return result;
      } catch (error) {
        lastError = error;
        if (this.shouldFallback(error)) {
          logger.warn('OpenAI model unavailable, attempting fallback', {
            failedModel: model,
            error: error.response?.data?.error || error.message
          });
          continue;
        }
        throw error;
      }
    }

    logger.error('All configured OpenAI models failed', { attemptedModels: this.modelsToTry });
    throw lastError || new Error('Unable to reach OpenAI with any configured model');
  }

  /**
   * Generate completion using OpenAI
   */
  async generateCompletion(systemPrompt, userMessage, options = {}) {
    return this.withModelFallback(async (model) => {
      const response = await axios.post(
        this.apiUrl,
        {
          model,
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
    });
  }

  /**
   * Chat with OpenAI (multi-turn conversation)
   */
  async chat(messages, options = {}) {
    return this.withModelFallback(async (model) => {
      const response = await axios.post(
        this.apiUrl,
        {
          model,
          messages,
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
    });
  }

  /**
   * Stream chat response (for future use)
   */
  async streamChat(messages, onChunk, options = {}) {
    return this.withModelFallback(async (model) => {
      const response = await axios.post(
        this.apiUrl,
        {
          model,
          messages,
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
    });
  }
}

export default OpenAIProvider;
