/**
 * Environment Configuration Module
 * تحميل والتحقق من صحة متغيرات البيئة
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * Validate required environment variables
 * @param {string[]} requiredVars - Array of required variable names
 * @throws {Error} If any required variable is missing
 */
function validateEnvVars(requiredVars) {
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env file and ensure all required variables are set.'
    );
  }
}

// Required environment variables
const REQUIRED_VARS = [
  'CLICKUP_API_TOKEN',
  'CLICKUP_TEAM_ID',
  'AI_PROVIDER'
];

// Validate on load
validateEnvVars(REQUIRED_VARS);

// Validate and normalize AI provider configuration
const aiProvider = process.env.AI_PROVIDER?.toLowerCase().trim();
const validProviders = ['claude', 'openai', 'gemini'];

if (!validProviders.includes(aiProvider)) {
  throw new Error(
    `Invalid AI_PROVIDER: "${process.env.AI_PROVIDER}"\n` +
    `Valid options are: ${validProviders.join(', ')}\n` +
    `Please update your .env file with one of these exact values: claude, openai, or gemini`
  );
}

// Validate API key for selected provider
if (aiProvider === 'claude' && !process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER is set to "claude"');
}
if (aiProvider === 'openai' && !process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required when AI_PROVIDER is set to "openai"');
}
if (aiProvider === 'gemini' && !process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is required when AI_PROVIDER is set to "gemini"');
}

/**
 * Environment configuration object
 */
export const env = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5014,
  TZ: process.env.TZ || 'Africa/Cairo',

  // ClickUp
  clickup: {
    apiToken: process.env.CLICKUP_API_TOKEN,
    teamId: process.env.CLICKUP_TEAM_ID,
    sampleListId: process.env.CLICKUP_SAMPLE_LIST_ID,
    apiBaseUrl: 'https://api.clickup.com/api/v2'
  },

  // AI Configuration
  ai: {
    provider: aiProvider, // 'claude', 'openai', or 'gemini'
    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-5-sonnet-20241022'
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: (process.env.OPENAI_MODEL || 'gpt-4o').trim().toLowerCase(),
      fallbackModels: process.env.OPENAI_FALLBACK_MODELS
        ? process.env.OPENAI_FALLBACK_MODELS
          .split(',')
          .map(model => model.trim().toLowerCase())
          .filter(Boolean)
        : ['gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      model: 'gemini-2.5-flash-preview-05-20'
    }
  },

  // WhatsApp
  whatsapp: {
    groupName: process.env.WHATSAPP_GROUP_NAME || 'Click Up notification 📢',
    sessionPath: 'sessions'
  },

  // Feature Toggles
  features: {
    aiNotifications: process.env.ENABLE_AI_NOTIFICATIONS === 'true',
    enhancedMotivation: process.env.ENABLE_ENHANCED_MOTIVATION === 'true',
    dailyReports: process.env.ENABLE_DAILY_REPORTS === 'true',
    weeklyChallenges: process.env.ENABLE_WEEKLY_CHALLENGES === 'true',
    badges: process.env.ENABLE_BADGES === 'true',
    courses: process.env.ENABLE_COURSES === 'true',
    inspirationalContent: process.env.ENABLE_INSPIRATIONAL_CONTENT === 'true'
  },

  // Notification Settings
  notifications: {
    batchDelay: parseInt(process.env.NOTIFICATION_BATCH_DELAY, 10) || 60000,
    pauseDuration: parseInt(process.env.NOTIFICATION_PAUSE_DURATION, 10) || 600000
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    toFile: process.env.LOG_TO_FILE === 'true'
  }
};

export default env;
