/**
 * redisClient.js
 * @description Redis 客户端单例 — 供限流、缓存等模块共用同一连接
 * @date 2026-04-17
 * @version 1.0.0
 */

const redis = require('redis');
const { logger } = require('../utils/logger');

let client = null;
let connectPromise = null;

/**
 * 获取或创建 Redis 客户端（懒初始化，保证单例）
 * @returns {Promise<import('redis').RedisClientType|null>}
 */
async function getRedisClient() {
  if (client && client.isOpen) return client;
  if (connectPromise) return connectPromise;

  const enabled = process.env.REDIS_ENABLED === 'true';
  if (!enabled) {
    logger.info('Redis 未启用 (REDIS_ENABLED != true)，跳过连接');
    return null;
  }

  connectPromise = (async () => {
    try {
      const url = buildRedisUrl();
      client = redis.createClient({
        url,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Redis 重连失败次数过多，停止重连');
              return new Error('Redis max retries');
            }
            return Math.min(retries * 200, 5000);
          },
        },
      });

      client.on('error', (err) => logger.error('Redis 错误:', err.message));
      client.on('reconnecting', () => logger.warn('Redis 重连中…'));

      await client.connect();
      logger.info(`✅ Redis 已连接 (${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379})`);
      return client;
    } catch (err) {
      logger.error('Redis 连接失败，限流将回退到内存:', err.message);
      client = null;
      return null;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

function buildRedisUrl() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = process.env.REDIS_PORT || 6379;
  const password = process.env.REDIS_PASSWORD || '';
  const username = process.env.REDIS_USERNAME || 'erp_app';
  const db = process.env.REDIS_DB || 0;
  // Redis 6+ ACL 格式: redis://username:password@host:port/db
  const auth = password ? `${username}:${encodeURIComponent(password)}@` : '';
  return `redis://${auth}${host}:${port}/${db}`;
}

/**
 * 优雅关闭
 */
async function closeRedis() {
  if (client && client.isOpen) {
    await client.quit();
    logger.info('Redis 连接已关闭');
    client = null;
  }
}

module.exports = { getRedisClient, closeRedis };
