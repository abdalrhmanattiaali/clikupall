/**
 * AI Provider Base Class / Interface
 * الكلاس الأساسي لجميع مزودي خدمات الذكاء الاصطناعي
 *
 * All AI providers must extend this class and implement its methods
 */

class AIProviderInterface {
  /**
   * Generate AI completion
   * @param {string} systemPrompt - System instruction
   * @param {string} userMessage - User message
   * @param {Object} options - Additional options
   * @returns {Promise<string>} AI response
   */
  async generateCompletion(systemPrompt, userMessage, options = {}) {
    throw new Error('Method generateCompletion() must be implemented by provider');
  }

  /**
   * Chat with AI (multi-turn conversation)
   * @param {Array} messages - Array of {role, content} messages
   * @param {Object} options - Additional options
   * @returns {Promise<string>} AI response
   */
  async chat(messages, options = {}) {
    throw new Error('Method chat() must be implemented by provider');
  }

  /**
   * Check if provider is available and configured
   * @returns {boolean} Availability status
   */
  isAvailable() {
    throw new Error('Method isAvailable() must be implemented by provider');
  }
}

export default AIProviderInterface;
