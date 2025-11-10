/**
 * Google Gemini AI Provider
 * مزود خدمة Google Gemini AI
 */

import axios from 'axios';
import { env } from '../../config/env.js';
import logger from '../../core/logger.js';
import AIProviderInterface from './baseProvider.js';

class GeminiProvider extends AIProviderInterface {
  constructor() {
    super();
    this.apiKey = env.ai.gemini.apiKey;
    this.model = env.ai.gemini.model;
    this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;

    if (this.isAvailable()) {
      logger.debug('Gemini provider initialized', { model: this.model });
    }
  }

  /**
   * Check if Gemini is available
   * @returns {boolean}
   */
  isAvailable() {
    return !!(this.apiKey && this.apiKey !== 'your_gemini_api_key_here' && !this.apiKey.includes('YOUR-API-KEY'));
  }

  /**
   * Generate completion using Gemini
   * @param {string} systemPrompt - System instruction
   * @param {string} userMessage - User message
   * @param {Object} options - Additional options
   * @returns {Promise<string>} AI response
   */
  async generateCompletion(systemPrompt, userMessage, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('Gemini API key is not configured');
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}?key=${this.apiKey}`,
        {
          contents: [
            {
              parts: [
                { text: userMessage }
              ]
            }
          ],
          systemInstruction: {
            parts: [
              { text: systemPrompt }
            ]
          },
          generationConfig: {
            temperature: options.temperature || 0.7,
            maxOutputTokens: options.maxTokens || 1024
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } catch (error) {
      logger.error('Gemini API error', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Chat with Gemini (multi-turn conversation)
   * @param {Array} messages - Array of {role, content} messages
   * @param {Object} options - Additional options
   * @returns {Promise<string>} AI response
   */
  async chat(messages, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('Gemini API key is not configured');
    }

    try {
      // Extract system message if present
      let systemPrompt = '';
      const contents = messages
        .filter(msg => {
          if (msg.role === 'system') {
            systemPrompt = msg.content;
            return false;
          }
          return true;
        })
        .map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        }));

      const payload = {
        contents,
        generationConfig: {
          temperature: options.temperature || 0.7,
          maxOutputTokens: options.maxTokens || 1024
        }
      };

      if (systemPrompt) {
        payload.systemInstruction = {
          parts: [{ text: systemPrompt }]
        };
      }

      const response = await axios.post(
        `${this.apiUrl}?key=${this.apiKey}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } catch (error) {
      logger.error('Gemini chat error', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Generate with Google Search integration
   * @param {string} systemPrompt - System instruction
   * @param {string} userMessage - User message
   * @param {Object} options - Additional options
   * @returns {Promise<string>} AI response
   */
  async generateWithSearch(systemPrompt, userMessage, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('Gemini API key is not configured');
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}?key=${this.apiKey}`,
        {
          contents: [
            {
              parts: [
                { text: userMessage }
              ]
            }
          ],
          tools: [
            {
              google_search: {}
            }
          ],
          systemInstruction: {
            parts: [
              { text: systemPrompt }
            ]
          },
          generationConfig: {
            temperature: options.temperature || 0.7,
            maxOutputTokens: options.maxTokens || 1024
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } catch (error) {
      logger.error('Gemini search error', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }
}

export default GeminiProvider;
