/**
 * AccountLockService.js
 * @description 账号锁定服务 — 防暴力破解
 * 连续登录失败 N 次后自动锁定账号一段时间
 * v2: 使用 Redis 持久化，支持分布式部署；生产环境需显式允许才可降级为内存。
 * @date 2026-04-18
 * @version 2.0.0
 */

const { logger } = require('../../utils/logger');
const { getRedisClient } = require('../../config/redisClient');
const { PASSWORD_POLICY } = require('../../config/security');
const { normalizeUsername } = require('../../utils/usernameSecurity');

// 配置：与 security.PASSWORD_POLICY.maxAttempts 对齐（可用环境变量覆盖）
const MAX_FAILED_ATTEMPTS =
  parseInt(process.env.LOGIN_MAX_FAILED_ATTEMPTS, 10) ||
  Number(PASSWORD_POLICY?.maxAttempts) ||
  5;
const LOCK_DURATION_MINUTES = parseInt(process.env.LOGIN_LOCK_DURATION_MINUTES) || 15;
const LOCK_DURATION_MS = LOCK_DURATION_MINUTES * 60 * 1000;
const LOCK_DURATION_SECONDS = LOCK_DURATION_MINUTES * 60;
const ALLOW_MEMORY_FALLBACK =
  process.env.ACCOUNT_LOCK_ALLOW_MEMORY_FALLBACK === 'true' ||
  process.env.NODE_ENV !== 'production';

// Redis key 前缀
const KEY_PREFIX = 'acc_lock:';

// 内存降级存储
const memoryStore = new Map();
let memoryFallbackWarned = false;

function canonicalUsername(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) throw new Error('INVALID_USERNAME');
  return normalized;
}

function useMemoryFallback(reason) {
  if (!ALLOW_MEMORY_FALLBACK) {
    throw new Error(`账号锁定服务需要可用的 Redis；${reason}`);
  }
  if (!memoryFallbackWarned) {
    logger.warn(`账号锁定服务使用内存存储：${reason}`);
    memoryFallbackWarned = true;
  }
  return null;
}

/**
 * 获取 Redis 客户端（带降级）
 */
async function getClient() {
  try {
    const client = await getRedisClient();
    if (client && client.isOpen) return client;
  } catch (error) {
    return useMemoryFallback(`Redis 客户端获取失败: ${error.message}`);
  }
  return useMemoryFallback('Redis 未启用或未连接');
}

class AccountLockService {
  /**
   * 检查账号是否被锁定
   * @param {string} username - 用户名
   * @returns {Promise<{ locked: boolean, remainingMinutes: number }>}
   */
  static async isLocked(username) {
    username = canonicalUsername(username);
    const client = await getClient();

    if (client) {
      // Redis 模式
      try {
        const data = await client.get(`${KEY_PREFIX}${username}`);
        if (!data) return { locked: false, remainingMinutes: 0 };

        const record = JSON.parse(data);
        if (!record.lockedUntil) return { locked: false, remainingMinutes: 0 };

        const now = Date.now();
        if (now < record.lockedUntil) {
          const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
          return { locked: true, remainingMinutes };
        }

        // 锁定已过期，清除
        await client.del(`${KEY_PREFIX}${username}`);
        return { locked: false, remainingMinutes: 0 };
      } catch (err) {
        logger.error('Redis AccountLock isLocked 错误:', err.message);
        useMemoryFallback(`Redis 锁定状态读取失败: ${err.message}`);
      }
    }

    // 内存降级
    const record = memoryStore.get(username);
    if (!record || !record.lockedUntil) return { locked: false, remainingMinutes: 0 };

    const now = Date.now();
    if (now < record.lockedUntil) {
      return { locked: true, remainingMinutes: Math.ceil((record.lockedUntil - now) / 60000) };
    }
    memoryStore.delete(username);
    return { locked: false, remainingMinutes: 0 };
  }

  /**
   * 记录一次登录失败
   * @param {string} username - 用户名
   * @param {string} ip - 客户端IP
   * @returns {Promise<{ locked: boolean, remainingAttempts: number, lockDurationMinutes: number }>}
   */
  static async recordFailedAttempt(username, ip = '') {
    username = canonicalUsername(username);
    const client = await getClient();

    if (client) {
      try {
        const key = `${KEY_PREFIX}${username}`;
        const existing = await client.get(key);
        const record = existing ? JSON.parse(existing) : {
          failedCount: 0,
          lockedUntil: null,
          lastFailedAt: null,
        };

        record.failedCount++;
        record.lastFailedAt = Date.now();

        // 达到锁定阈值
        if (record.failedCount >= MAX_FAILED_ATTEMPTS) {
          record.lockedUntil = Date.now() + LOCK_DURATION_MS;

          // 设置 Redis TTL = 锁定时间 + 5分钟缓冲
          await client.setEx(key, LOCK_DURATION_SECONDS + 300, JSON.stringify(record));

          logger.warn(`Account locked after repeated login failures: username=${username}, failedCount=${record.failedCount}, lockMinutes=${LOCK_DURATION_MINUTES}`, {
            username, ip, failedCount: record.failedCount,
            lockedUntil: new Date(record.lockedUntil).toISOString(),
          });

          return { locked: true, remainingAttempts: 0, lockDurationMinutes: LOCK_DURATION_MINUTES };
        }

        // 未锁定，设置 30 分钟自动过期
        await client.setEx(key, 1800, JSON.stringify(record));

        const remainingAttempts = MAX_FAILED_ATTEMPTS - record.failedCount;
        logger.info(`Login failure recorded: username=${username}, failedCount=${record.failedCount}, remainingAttempts=${remainingAttempts}`, {
          username, ip,
        });

        return { locked: false, remainingAttempts, lockDurationMinutes: 0 };
      } catch (err) {
        logger.error('Redis AccountLock recordFailedAttempt 错误:', err.message);
        useMemoryFallback(`Redis 登录失败记录写入失败: ${err.message}`);
      }
    }

    // 内存降级
    const record = memoryStore.get(username) || { failedCount: 0, lockedUntil: null, lastFailedAt: null };
    record.failedCount++;
    record.lastFailedAt = Date.now();

    if (record.failedCount >= MAX_FAILED_ATTEMPTS) {
      record.lockedUntil = Date.now() + LOCK_DURATION_MS;
      memoryStore.set(username, record);
      logger.warn(`Account locked after repeated login failures in memory mode: username=${username}, failedCount=${record.failedCount}`);
      return { locked: true, remainingAttempts: 0, lockDurationMinutes: LOCK_DURATION_MINUTES };
    }

    memoryStore.set(username, record);
    return { locked: false, remainingAttempts: MAX_FAILED_ATTEMPTS - record.failedCount, lockDurationMinutes: 0 };
  }

  /**
   * 登录成功，清除失败记录
   * @param {string} username - 用户名
   */
  static async clearFailedAttempts(username) {
    username = canonicalUsername(username);
    const client = await getClient();
    if (client) {
      try {
        await client.del(`${KEY_PREFIX}${username}`);
      } catch (error) {
        logger.error('Redis AccountLock clearFailedAttempts 错误:', error.message);
        useMemoryFallback(`Redis 登录失败记录清理失败: ${error.message}`);
      }
    }
    memoryStore.delete(username);
  }

  /**
   * 管理员手动解锁
   * @param {string} username - 用户名
   */
  static async unlock(username) {
    username = canonicalUsername(username);
    const client = await getClient();
    if (client) {
      try {
        await client.del(`${KEY_PREFIX}${username}`);
      } catch (error) {
        logger.error('Redis AccountLock unlock 错误:', error.message);
        useMemoryFallback(`Redis 手动解锁失败: ${error.message}`);
      }
    }
    memoryStore.delete(username);
    logger.info(`🔓 [手动解锁] 账号 ${username} 已被管理员解锁`);
  }

  /**
   * 获取所有锁定状态（管理员接口）
   * @returns {Promise<Array>}
   */
  static async getLockedAccounts() {
    const now = Date.now();
    const locked = [];

    const client = await getClient();
    if (client) {
      try {
        const keys = await client.keys(`${KEY_PREFIX}*`);
        for (const key of keys) {
          const data = await client.get(key);
          if (!data) continue;
          const record = JSON.parse(data);
          const username = key.replace(KEY_PREFIX, '');

          if (record.lockedUntil && now < record.lockedUntil) {
            locked.push({
              username,
              failedCount: record.failedCount,
              lockedUntil: new Date(record.lockedUntil).toISOString(),
              remainingMinutes: Math.ceil((record.lockedUntil - now) / 60000),
              source: 'redis',
            });
          }
        }
        return locked;
      } catch (err) {
        logger.error('Redis getLockedAccounts 错误:', err.message);
        useMemoryFallback(`Redis 锁定账号列表读取失败: ${err.message}`);
      }
    }

    // 内存降级
    memoryStore.forEach((record, username) => {
      if (record.lockedUntil && now < record.lockedUntil) {
        locked.push({
          username,
          failedCount: record.failedCount,
          lockedUntil: new Date(record.lockedUntil).toISOString(),
          remainingMinutes: Math.ceil((record.lockedUntil - now) / 60000),
          source: 'memory',
        });
      }
    });
    return locked;
  }

  /**
   * 定期清理过期记录（仅清理内存，Redis 由 TTL 自动过期）
   */
  static cleanup() {
    const now = Date.now();
    const expireThreshold = 30 * 60 * 1000;
    memoryStore.forEach((record, username) => {
      if ((record.lockedUntil && now > record.lockedUntil) ||
          (record.lastFailedAt && (now - record.lastFailedAt) > expireThreshold)) {
        memoryStore.delete(username);
      }
    });
  }
}

// 每10分钟清理内存中的过期记录
const accountLockCleanupTimer = setInterval(() => AccountLockService.cleanup(), 10 * 60 * 1000);
accountLockCleanupTimer.unref?.();

module.exports = AccountLockService;
