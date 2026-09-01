/**
 * CacheManager.js
 * @description 统一缓存管理器（自动切换 Redis 和内存缓存）
 * @date 2025-12-30
 * @version 2.0.0
 */

const NodeCache = require('node-cache');
const redisCacheService = require('./RedisCacheService');
const { logger } = require('../../utils/logger');

class CacheManager {
  constructor() {
    // 内存缓存作为备用方案
    this.memoryCache = new NodeCache({
      stdTTL: 3600, // 默认 1 小时
      checkperiod: 600, // 每 10 分钟检查过期
      useClones: false, // 不克隆对象，提高性能
    });

    this.useRedis = false;
    this.initialized = false;
  }

  /**
   * 初始化缓存管理器
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // 检查是否启用 Redis
      const redisEnabled = process.env.REDIS_ENABLED !== 'false';

      if (!redisEnabled) {
        this.useRedis = false;
        this.initialized = true;
        logger.info('Cache manager initialized with in-memory cache because Redis is disabled');
        return;
      }

      // 尝试连接 Redis
      const redisConnected = await redisCacheService.connect();

      if (redisConnected) {
        this.useRedis = true;
        logger.info('Cache manager initialized with Redis cache');
      } else {
        this.useRedis = false;
        logger.warn('Cache manager fell back to in-memory cache because Redis is unavailable');
      }

      this.initialized = true;
    } catch (error) {
      logger.error('缓存管理器初始化失败:', error);
      this.useRedis = false;
      this.initialized = true;
    }
  }

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   * @param {number} ttl - 过期时间（秒），默认 3600 秒
   */
  async set(key, value, ttl = 3600) {
    try {
      if (this.useRedis) {
        return await redisCacheService.set(key, value, ttl);
      } else {
        return this.memoryCache.set(key, value, ttl);
      }
    } catch (error) {
      logger.error(`设置缓存失败 [${key}]:`, error);
      return false;
    }
  }

  /**
   * 获取缓存
   * @param {string} key - 缓存键
   * @returns {Promise<any|null>} 缓存值
   */
  async get(key) {
    try {
      if (this.useRedis) {
        return await redisCacheService.get(key);
      } else {
        const value = this.memoryCache.get(key);
        return value !== undefined ? value : null;
      }
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
    try {
      if (this.useRedis) {
        return await redisCacheService.del(key);
      } else {
        return this.memoryCache.del(key) > 0;
      }
    } catch (error) {
      logger.error(`删除缓存失败 [${key}]:`, error);
      return false;
    }
  }

  async delete(key) {
    return this.del(key);
  }

  /**
   * 批量删除缓存（支持通配符）
   * @param {string} pattern - 缓存键模式（如 'user:*'）
   */
  async delPattern(pattern) {
    try {
      if (this.useRedis) {
        return await redisCacheService.delPattern(pattern);
      } else {
        // 内存缓存不支持通配符，需要遍历所有键
        const keys = this.memoryCache.keys();
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        const matchedKeys = keys.filter((key) => regex.test(key));

        if (matchedKeys.length > 0) {
          this.memoryCache.del(matchedKeys);
          logger.debug(`批量删除缓存: ${pattern} (${matchedKeys.length} 个键)`);
        }
        return true;
      }
    } catch (error) {
      logger.error(`批量删除缓存失败 [${pattern}]:`, error);
      return false;
    }
  }

  async deleteByPrefix(prefix) {
    try {
      if (this.useRedis) {
        if (!redisCacheService.isConnected || !redisCacheService.client) {
          return 0;
        }

        const keys = [];
        for await (const key of redisCacheService.client.scanIterator({
          MATCH: `${prefix}*`,
          COUNT: 100,
        })) {
          keys.push(key);
        }

        if (keys.length > 0) {
          await redisCacheService.client.del(...keys);
          logger.debug(`Delete Redis cache by prefix: ${prefix} (${keys.length} keys)`);
        }
        return keys.length;
      }

      const keys = this.memoryCache.keys().filter((key) => key.startsWith(prefix));
      if (keys.length > 0) {
        this.memoryCache.del(keys);
        logger.debug(`Delete cache by prefix: ${prefix} (${keys.length} keys)`);
      }
      return keys.length;
    } catch (error) {
      logger.error(`Delete cache by prefix failed [${prefix}]:`, error);
      return 0;
    }
  }

  /**
   * 检查缓存是否存在
   * @param {string} key - 缓存键
   */
  async exists(key) {
    try {
      if (this.useRedis) {
        return await redisCacheService.exists(key);
      } else {
        return this.memoryCache.has(key);
      }
    } catch (error) {
      logger.error(`检查缓存存在性失败 [${key}]:`, error);
      return false;
    }
  }

  async has(key) {
    return this.exists(key);
  }

  /**
   * 清空所有缓存
   */
  async flushAll() {
    try {
      if (this.useRedis) {
        return await redisCacheService.flushAll();
      } else {
        this.memoryCache.flushAll();
        logger.debug('All in-memory caches cleared');
        return true;
      }
    } catch (error) {
      logger.error('清空缓存失败:', error);
      return false;
    }
  }

  async clear() {
    return this.flushAll();
  }

  /**
   * 获取缓存统计信息
   */
  async getStats() {
    try {
      if (this.useRedis) {
        return await redisCacheService.getStats();
      } else {
        const stats = this.memoryCache.getStats();
        return {
          type: 'memory',
          connected: true,
          keys: stats.keys,
          hits: stats.hits,
          misses: stats.misses,
          hitRate: stats.hits / (stats.hits + stats.misses) || 0,
        };
      }
    } catch (error) {
      logger.error('获取缓存统计信息失败:', error);
      return {
        type: this.useRedis ? 'redis' : 'memory',
        connected: false,
        error: error.message,
      };
    }
  }

  /**
   * 获取或设置缓存（缓存穿透保护）
   * @param {string} key - 缓存键
   * @param {Function} fetchFunction - 获取数据的函数
   * @param {number} ttl - 过期时间（秒）
   */
  async getOrSet(key, fetchFunction, ttl = 3600) {
    try {
      // 先尝试从缓存获取
      const cachedValue = await this.get(key);
      if (cachedValue !== null) {
        return cachedValue;
      }

      // 缓存未命中，执行获取函数
      const value = await fetchFunction();

      // 存入缓存
      if (value !== null && value !== undefined) {
        await this.set(key, value, ttl);
      }

      return value;
    } catch (error) {
      logger.error(`getOrSet 失败 [${key}]:`, error);
      // 如果获取失败，尝试直接执行获取函数
      return await fetchFunction();
    }
  }

  /**
   * 关闭缓存管理器
   */
  async shutdown() {
    try {
      if (this.useRedis) {
        await redisCacheService.disconnect();
      }
      this.memoryCache.flushAll();
      this.memoryCache.close();
      logger.info('缓存管理器已关闭');
    } catch (error) {
      logger.error('关闭缓存管理器失败:', error);
    }
  }
}

// 导出单例
const cacheManager = new CacheManager();

const cacheMiddleware = (ttl = 300, keyGenerator = null) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = keyGenerator
      ? keyGenerator(req)
      : `http:${req.originalUrl}:${JSON.stringify(req.query)}`;

    try {
      const cachedResponse = await cacheManager.get(cacheKey);
      if (cachedResponse !== null) {
        return res.json(cachedResponse);
      }

      const originalJson = res.json.bind(res);
      res.json = function (data) {
        cacheManager.set(cacheKey, data, ttl).catch((error) => {
          logger.error('HTTP response cache write failed:', error);
        });
        return originalJson(data);
      };

      return next();
    } catch (error) {
      logger.error('HTTP response cache middleware failed:', error);
      return next();
    }
  };
};

module.exports = cacheManager;
module.exports.cacheMiddleware = cacheMiddleware;
