/**
 * cacheManager.js
 * @description 通用内存缓存管理器（带 TTL 自动过期）
 * @date 2026-06-22
 *
 * 适用于高频读取、低频变更的数据（物料基础数据、汇率、权限列表等）。
 * 生产环境如需分布式缓存，可替换底层存储为 Redis，接口保持不变。
 *
 * 用法:
 *   const cache = require('./cacheManager');
 *   // 写入（TTL 60 秒）
 *   cache.set('materials:list', data, 60);
 *   // 读取
 *   const hit = cache.get('materials:list');
 *   // 带自动填充的获取
 *   const data = await cache.getOrSet('rates:USD', () => fetchFromDB(), 300);
 *   // 失效
 *   cache.invalidate('materials:list');
 *   cache.invalidatePrefix('materials:');  // 批量失效
 */

const { logger } = require('./logger');

class CacheManager {
  constructor() {
    /** @type {Map<string, {value: any, expiresAt: number}>} */
    this._store = new Map();
    this._hits = 0;
    this._misses = 0;

    // 每 5 分钟清理过期条目
    this._cleanupTimer = setInterval(() => this._cleanup(), 5 * 60 * 1000);
    this._cleanupTimer.unref?.();
  }

  /**
   * 获取缓存值
   * @param {string} key
   * @returns {any|null} 缓存值，不存在或已过期返回 null
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) {
      this._misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      this._misses++;
      return null;
    }
    this._hits++;
    return entry.value;
  }

  /**
   * 写入缓存
   * @param {string} key
   * @param {any} value
   * @param {number} ttlSeconds - 过期时间（秒），默认 60
   */
  set(key, value, ttlSeconds = 60) {
    this._store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * 获取或自动填充
   * @param {string} key
   * @param {Function} fetchFn - 缓存未命中时的数据获取函数（支持 async）
   * @param {number} ttlSeconds - 过期时间（秒）
   * @returns {Promise<any>}
   */
  async getOrSet(key, fetchFn, ttlSeconds = 60) {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetchFn();
    this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * 删除指定缓存
   * @param {string} key
   */
  invalidate(key) {
    this._store.delete(key);
  }

  /**
   * 按前缀批量删除缓存
   * @param {string} prefix
   * @returns {number} 删除的条目数
   */
  invalidatePrefix(prefix) {
    let count = 0;
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this._store.clear();
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * 获取缓存统计
   * @returns {{size: number, hits: number, misses: number, hitRate: string}}
   */
  stats() {
    const total = this._hits + this._misses;
    return {
      size: this._store.size,
      hits: this._hits,
      misses: this._misses,
      hitRate: total > 0 ? `${((this._hits / total) * 100).toFixed(1)}%` : '0%',
    };
  }

  /** 清理过期条目 */
  _cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this._store) {
      if (now > entry.expiresAt) {
        this._store.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug(`[CacheManager] 清理了 ${cleaned} 个过期缓存条目`);
    }
  }

  /** 关闭缓存管理器（用于优雅退出） */
  destroy() {
    clearInterval(this._cleanupTimer);
    this._store.clear();
  }
}

// 单例导出
module.exports = new CacheManager();
