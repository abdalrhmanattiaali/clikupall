/**
 * URL Shortener Utility
 * اختصار الروابط باستخدام TinyURL
 */

import axios from 'axios';
import logger from '../core/logger.js';

/**
 * Shorten URL using TinyURL service
 * @param {string} longUrl - Long URL to shorten
 * @returns {Promise<string>} Shortened URL or original if failed
 */
export async function shortenUrl(longUrl) {
  if (!longUrl) return '';

  try {
    const response = await axios.get(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`,
      { timeout: 5000 }
    );

    return response.data;
  } catch (error) {
    logger.warn('Failed to shorten URL, using original', {
      url: longUrl.substring(0, 50),
      error: error.message
    });
    return longUrl;
  }
}

/**
 * Batch shorten multiple URLs
 * @param {string[]} urls - Array of URLs to shorten
 * @returns {Promise<Object>} Map of original to shortened URLs
 */
export async function batchShortenUrls(urls) {
  const results = {};

  for (const url of urls) {
    results[url] = await shortenUrl(url);
  }

  return results;
}

export default {
  shortenUrl,
  batchShortenUrls
};
