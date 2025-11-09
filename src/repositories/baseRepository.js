/**
 * Base Repository
 * قاعدة بيانات JSON Files - Abstraction Layer
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../core/logger.js';
import { DatabaseError } from '../core/errors.js';
import { safeJsonParse, deepClone } from '../utils/helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BaseRepository {
  /**
   * @param {string} fileName - JSON file name
   */
  constructor(fileName) {
    this.fileName = fileName;
    this.filePath = path.join(__dirname, '../../data', fileName);
    this.cache = null;
    this.cacheTime = null;
    this.cacheDuration = 60000; // 1 minute
  }

  /**
   * Ensure data directory exists
   */
  async ensureDataDirectory() {
    const dataDir = path.dirname(this.filePath);

    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create data directory', {
        path: dataDir,
        error: error.message
      });
    }
  }

  /**
   * Read data from JSON file
   * @param {boolean} useCache - Use cache if available
   * @returns {Promise<*>} Parsed data
   */
  async read(useCache = true) {
    // Check cache
    if (useCache && this.cache && this.cacheTime) {
      const age = Date.now() - this.cacheTime;
      if (age < this.cacheDuration) {
        logger.debug(`Using cached data for ${this.fileName}`, { age });
        return deepClone(this.cache);
      }
    }

    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = safeJsonParse(data, this.getDefaultData());

      // Update cache
      this.cache = parsed;
      this.cacheTime = Date.now();

      return deepClone(parsed);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info(`Creating new file: ${this.fileName}`);
        const defaultData = this.getDefaultData();
        await this.write(defaultData);
        return deepClone(defaultData);
      }

      logger.error(`Failed to read ${this.fileName}`, {
        error: error.message
      });
      throw new DatabaseError(
        `Failed to read data from ${this.fileName}`,
        'read',
        { error: error.message }
      );
    }
  }

  /**
   * Write data to JSON file
   * @param {*} data - Data to write
   * @returns {Promise<void>}
   */
  async write(data) {
    try {
      await this.ensureDataDirectory();

      await fs.writeFile(
        this.filePath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );

      // Update cache
      this.cache = deepClone(data);
      this.cacheTime = Date.now();

      logger.debug(`Data written to ${this.fileName}`);
    } catch (error) {
      logger.error(`Failed to write ${this.fileName}`, {
        error: error.message
      });
      throw new DatabaseError(
        `Failed to write data to ${this.fileName}`,
        'write',
        { error: error.message }
      );
    }
  }

  /**
   * Update data in JSON file
   * @param {Function} updateFn - Function to update data
   * @returns {Promise<*>} Updated data
   */
  async update(updateFn) {
    try {
      const data = await this.read(false); // Don't use cache
      const updated = await updateFn(data);
      await this.write(updated);
      return updated;
    } catch (error) {
      logger.error(`Failed to update ${this.fileName}`, {
        error: error.message
      });
      throw new DatabaseError(
        `Failed to update data in ${this.fileName}`,
        'update',
        { error: error.message }
      );
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache = null;
    this.cacheTime = null;
    logger.debug(`Cache cleared for ${this.fileName}`);
  }

  /**
   * Get default data structure (override in subclasses)
   * @returns {*} Default data
   */
  getDefaultData() {
    return {};
  }

  /**
   * Check if file exists
   * @returns {Promise<boolean>}
   */
  async exists() {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete file
   * @returns {Promise<void>}
   */
  async delete() {
    try {
      await fs.unlink(this.filePath);
      this.clearCache();
      logger.info(`File deleted: ${this.fileName}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new DatabaseError(
          `Failed to delete ${this.fileName}`,
          'delete',
          { error: error.message }
        );
      }
    }
  }
}

export default BaseRepository;
