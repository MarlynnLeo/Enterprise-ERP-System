/**
 * RedisCacheService.js
 * @description Redis 缓存服务（支持分布式部署）
 * @date 2025-12-30
 * @version 2.0.0
 */

const { logger } = require('../../utils/logger');
const { getRedisClient } = require('../../config/redisClient');

class RedisCacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  /**
   * 初始化 Redis 连接（复用 redisClient 单例）
   */
  async connect() {
    try {
      this.client = await getRedisClient();
      this.isConnected = !!this.client;
      if (this.isConnected) {
        logger.info('Redis 缓存服务已就绪（复用共享连接）');
      }
      return this.isConnected;
    } catch (error) {
      logger.error('Redis 缓存服务初始化失败:', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   * @param {number} ttl - 过期时间（秒），默认 3600 秒（1小时）
   */
  async set(key, value, ttl = 3600) {
    if (!this.isConnected || !this.client) {
      logger.warn('Redis 未连接，跳过缓存设置');
      return false;
    }

    try {
      const serializedValue = JSON.stringify(value);
      await this.client.setEx(key, ttl, serializedValue);
      logger.debug(`缓存已设置: ${key} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      logger.error(`设置缓存失败 [${key}]:`, error);
      return false;
    }
  }

  /**
   * 获取缓存
   * @param {string} key - 缓存键
   * @returns {Promise<any|null>} 缓存值，不存在返回 null
   */
  async get(key) {
    if (!this.isConnected || !this.client) {
      logger.warn('Redis 未连接，跳过缓存获取');
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (value === null) {
        logger.debug(`缓存未命中: ${key}`);
        return null;
      }
      logger.debug(`缓存命中: ${key}`);
      return JSON.parse(value);
    } catch (error) {
      logger.error(`获取缓存失败 [${key}]:`, error);
      return null;
    }
  }

  /**
   * 删除缓存
   * @param {string} key - 缓存键
   */
  async del(key) {
    if (!this.isConnected || !this.client) {
      logger.warn('Redis 未连接，跳过缓存删除');
      return false;
    }

    try {
      await this.client.del(key);
      logger.debug(`缓存已删除: ${key}`);
      return true;
    } catch (error) {
      logger.error(`删除缓存失败 [${key}]:`, error);
      return false;
    }
  }

  /**
   * 批量删除缓存（支持通配符）
   * @param {string} pattern - 缓存键模式（如 'user:*'）
   */
  async delPattern(pattern) {
    if (!this.isConnected || !this.client) {
      logger.warn('Redis 未连接，跳过批量删除');
      return false;
    }

    try {
      const keys = [];
      for await (const key of this.client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        keys.push(key);
      }

      if (keys.length > 0) {
        await this.client.del(keys);
        logger.debug(`批量删除缓存: ${pattern} (${keys.length} 个键)`);
      }
      return true;
    } catch (error) {
      logger.error(`批量删除缓存失败 [${pattern}]:`, error);
      return false;
    }
  }

  /**
   * 检查缓存是否存在
   * @param {string} key - 缓存键
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`检查缓存存在性失败 [${key}]:`, error);
      return false;
    }
  }

  /**
   * 设置缓存过期时间
   * @param {string} key - 缓存键
   * @param {number} ttl - 过期时间（秒）
   */
  async expire(key, ttl) {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      await this.client.expire(key, ttl);
      logger.debug(`缓存过期时间已更新: ${key} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      logger.error(`设置缓存过期时间失败 [${key}]:`, error);
      return false;
    }
  }

  /**
   * 获取缓存剩余过期时间
   * @param {string} key - 缓存键
   * @returns {Promise<number>} 剩余秒数，-1 表示永不过期，-2 表示不存在
   */
  async ttl(key) {
    if (!this.isConnected || !this.client) {
      return -2;
    }

    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error(`获取缓存过期时间失败 [${key}]:`, error);
      return -2;
    }
  }

  /**
   * 清空所有缓存
   */
  async flushAll() {
    if (!this.isConnected || !this.client) {
      logger.warn('Redis 未连接，跳过清空缓存');
      return false;
    }

    try {
      await this.client.flushDb();
      logger.info('所有缓存已清空');
      return true;
    } catch (error) {
      logger.error('清空缓存失败:', error);
      return false;
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStats() {
    if (!this.isConnected || !this.client) {
      return {
        connected: false,
        keys: 0,
        memory: '0 MB',
      };
    }

    try {
      const info = await this.client.info('stats');
      const dbSize = await this.client.dbSize();

      return {
        connected: this.isConnected,
        keys: dbSize,
        info: info,
      };
    } catch (error) {
      logger.error('获取缓存统计信息失败:', error);
      return {
        connected: false,
        keys: 0,
        error: error.message,
      };
    }
  }

  /**
   * 关闭 Redis 连接
   */
  async disconnect() {
    // 共享连接由 redisClient.js 统一管理，此处仅清除引用
    this.client = null;
    this.isConnected = false;
    logger.info('Redis 缓存服务已断开（共享连接由 redisClient 管理）');
  }
}

// 导出单例
const redisCacheService = new RedisCacheService();

module.exports = redisCacheService;
