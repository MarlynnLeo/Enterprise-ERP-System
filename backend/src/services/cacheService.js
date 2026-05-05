/**
 * 缓存服务
 * 用于缓存频繁访问的数据
 * @date 2025-10-17
 */

const { logger } = require('../utils/logger');
class CacheService {
  constructor(defaultTTL = 300) {
    this.cache = new Map();
    this.timers = new Map();
    this.defaultTTL = defaultTTL;
    this.stats = {
      hits: 0,
      misses: 0,
    };
  }

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {*} value - 缓存值
   * @param {number} ttl - 过期时间（秒）
   */
  set(key, value, ttl = this.defaultTTL) {
    // 清除旧的定时器
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // 设置新值
    this.cache.set(key, {
      value,
      setTime: Date.now(),
      ttl,
    });

    // 设置过期时间
    const timer = setTimeout(() => {
      this.cache.delete(key);
      this.timers.delete(key);
      logger.debug(`[缓存过期] ${key}`);
    }, ttl * 1000);
    timer.unref?.();

    this.timers.set(key, timer);
    logger.debug(`[缓存设置] ${key}, TTL: ${ttl}s`);
  }

  /**
   * 获取缓存
   * @param {string} key - 缓存键
   * @returns {*} 缓存值
   */
  get(key) {
    const item = this.cache.get(key);

    if (item) {
      this.stats.hits++;
      logger.debug(`[缓存命中] ${key}`);
      return item.value;
    }

    this.stats.misses++;
    return undefined;
  }

  /**
   * 检查缓存是否存在
   * @param {string} key - 缓存键
   * @returns {boolean}
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * 删除缓存
   * @param {string} key - 缓存键
   */
  delete(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    const existed = this.cache.has(key);
    this.cache.delete(key);
    if (existed) {
      logger.info(`🗑️ [缓存删除] ${key}`);
    }
  }

  /**
   * 删除匹配前缀的所有缓存
   * @param {string} prefix - 前缀
   */
  deleteByPrefix(prefix) {
    let count = 0;
    const deletedKeys = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.delete(key);
        deletedKeys.push(key);
        count++;
      }
    }
    logger.info(`🗑️ [批量删除缓存] 前缀: ${prefix}, 数量: ${count}, 键: ${deletedKeys.join(', ')}`);
    return count;
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.cache.clear();
    this.timers.clear();
    this.stats = { hits: 0, misses: 0 };
    logger.debug('[缓存清空] 所有缓存已清空');
  }

  /**
   * 获取缓存统计信息
   * @returns {Object}
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : 0;

    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      total,
      hitRate: `${hitRate}%`,
    };
  }

  /**
   * 获取缓存大小（字节）
   * @returns {number}
   */
  getSize() {
    let size = 0;
    for (const [key, item] of this.cache.entries()) {
      size += key.length;
      size += JSON.stringify(item.value).length;
    }
    return size;
  }

  /**
   * 获取所有缓存键
   * @returns {Array}
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * 打印缓存信息
   */
  printStats() {
    const stats = this.getStats();
    logger.debug('========== 缓存统计 ==========');
    logger.debug(`缓存数量: ${stats.size}`);
    logger.debug(`命中次数: ${stats.hits}`);
    logger.debug(`未命中次数: ${stats.misses}`);
    logger.debug(`命中率: ${stats.hitRate}`);
    logger.debug(`缓存大小: ${(this.getSize() / 1024).toFixed(2)}KB`);
    logger.debug('=============================');
  }
}

// 创建单例实例
const cacheService = new CacheService(300); // 默认5分钟过期

// ✅ 新增：缓存中间件 - 用于HTTP响应缓存
const cacheMiddleware = (ttl = 300, keyGenerator = null) => {
  return async (req, res, next) => {
    // 只缓存GET请求
    if (req.method !== 'GET') {
      return next();
    }

    // 生成缓存键
    const cacheKey = keyGenerator
      ? keyGenerator(req)
      : `http:${req.originalUrl}:${JSON.stringify(req.query)}`;

    try {
      // 检查缓存
      const cachedResponse = cacheService.get(cacheKey);
      if (cachedResponse) {
        return res.json(cachedResponse);
      }

      // 拦截响应
      const originalJson = res.json;
      res.json = function (data) {
        // 缓存响应数据
        cacheService.set(cacheKey, data, ttl);
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      logger.error('缓存中间件错误:', error);
      next();
    }
  };
};

module.exports = cacheService;
module.exports.cacheMiddleware = cacheMiddleware;
