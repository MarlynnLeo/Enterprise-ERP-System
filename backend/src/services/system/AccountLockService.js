/**
 * AccountLockService.js
 * @description 账号锁定服务 — 防暴力破解
 * 连续登录失败 N 次后自动锁定账号一段时间
 * v3: 已存在用户使用 MySQL 持久化；Redis/内存仅辅助记录不存在的用户名。
 * @date 2026-04-18
 * @version 3.0.0
 */

const { logger } = require('../../utils/logger');
const { getRedisClient } = require('../../config/redisClient');
const { pool } = require('../../config/db');
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
// Redis key 前缀
const KEY_PREFIX = 'acc_lock:';

// 内存降级存储
const memoryStore = new Map();

function canonicalUsername(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) throw new Error('INVALID_USERNAME');
  return normalized;
}

/**
 * 获取 Redis 客户端（带降级）
 */
async function getClient() {
  try {
    const client = await getRedisClient();
    if (client && client.isOpen) return client;
  } catch (error) {
    logger.warn(`账号锁定 Redis 不可用，将使用降级策略: ${error.message}`);
    return null;
  }
  return null;
}

function remainingMinutesFromSeconds(seconds) {
  return Math.max(0, Math.ceil(Number(seconds || 0) / 60));
}

function isLockedRow(row) {
  if (!row) return false;
  if (Number(row.login_locked) === 1) return true;
  if (!row.locked_until) return false;
  const timestamp = row.locked_until instanceof Date
    ? row.locked_until.getTime()
    : new Date(row.locked_until).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

async function getAuxiliaryRecord(username) {
  const client = await getClient();
  if (client) {
    try {
      const data = await client.get(`${KEY_PREFIX}${username}`);
      if (!data) return null;
      try {
        return JSON.parse(data);
      } catch (error) {
        logger.warn('清理损坏的账号锁定 Redis 记录', { username, error: error.message });
        await client.del(`${KEY_PREFIX}${username}`);
      }
    } catch (error) {
      logger.warn('读取账号锁定 Redis 记录失败，转入降级策略', {
        username,
        error: error.message,
      });
    }
  }
  return memoryStore.get(username) || null;
}

async function clearAuxiliaryRecord(username) {
  const client = await getClient();
  if (client) {
    try {
      await client.del(`${KEY_PREFIX}${username}`);
    } catch (error) {
      logger.warn('清理账号锁定 Redis 记录失败', { username, error: error.message });
    }
  }
  memoryStore.delete(username);
}

async function setAuxiliaryRecord(username, record) {
  const client = await getClient();
  if (client) {
    try {
      const ttl = record.lockedUntil
        ? LOCK_DURATION_SECONDS + 300
        : 1800;
      await client.setEx(`${KEY_PREFIX}${username}`, ttl, JSON.stringify(record));
      return;
    } catch (error) {
      logger.warn('写入账号锁定 Redis 记录失败，转入降级策略', {
        username,
        error: error.message,
      });
    }
  }
  memoryStore.set(username, record);
}

async function findUserLockRow(username, connection = pool) {
  const [rows] = await connection.execute(
    `SELECT id, username, COALESCE(failed_login_attempts, 0) AS failed_login_attempts,
            locked_until,
            CASE WHEN locked_until IS NOT NULL AND locked_until > NOW() THEN 1 ELSE 0 END AS login_locked,
            CASE WHEN locked_until IS NOT NULL AND locked_until > NOW()
              THEN GREATEST(TIMESTAMPDIFF(SECOND, NOW(), locked_until), 0)
              ELSE 0 END AS remaining_lock_seconds
       FROM users
      WHERE LOWER(username) = ?
      LIMIT 1${connection === pool ? '' : ' FOR UPDATE'}`,
    [username]
  );
  return rows[0] || null;
}

class AccountLockService {
  /**
   * 检查账号是否被锁定
   * @param {string} username - 用户名
   * @returns {Promise<{ locked: boolean, remainingMinutes: number }>}
   */
  static async isLocked(username) {
    username = canonicalUsername(username);
    // Persist lock state for real users in MySQL. This avoids a login turning
    // into HTTP 500 merely because the optional Redis counter is unavailable.
    const userRow = await findUserLockRow(username);
    if (userRow) {
      if (isLockedRow(userRow)) {
        return {
          locked: true,
          remainingMinutes: remainingMinutesFromSeconds(userRow.remaining_lock_seconds),
        };
      }

      // Clear an expired timestamp lazily. A failed login after expiry should
      // start a fresh five-attempt window rather than inheriting old attempts.
      if (userRow.locked_until) {
        await pool.execute(
          'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = ?',
          [userRow.id]
        );
      }
      return { locked: false, remainingMinutes: 0 };
    }

    // Unknown usernames are tracked only as an auxiliary anti-enumeration
    // measure. Redis/memory failures are intentionally fail-open to 401.
    const record = await getAuxiliaryRecord(username);
    if (!record || !record.lockedUntil) return { locked: false, remainingMinutes: 0 };
    if (Date.now() < Number(record.lockedUntil)) {
      return { locked: true, remainingMinutes: Math.ceil((Number(record.lockedUntil) - Date.now()) / 60000) };
    }
    await clearAuxiliaryRecord(username);
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
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const userRow = await findUserLockRow(username, connection);
      if (userRow) {
        // A concurrent request cannot bypass the threshold because the row is
        // locked for the duration of this transaction.
        if (isLockedRow(userRow)) {
          await connection.rollback();
          return {
            locked: true,
            remainingAttempts: 0,
            lockDurationMinutes: remainingMinutesFromSeconds(userRow.remaining_lock_seconds),
          };
        }

        const previousCount = userRow.locked_until ? 0 : Number(userRow.failed_login_attempts || 0);
        const failedCount = previousCount + 1;
        const locked = failedCount >= MAX_FAILED_ATTEMPTS;
        const lockedUntil = locked ? new Date(Date.now() + LOCK_DURATION_MS) : null;
        await connection.execute(
          `UPDATE users
              SET failed_login_attempts = ?,
                  locked_until = ?,
                  updated_at = NOW()
            WHERE id = ?`,
          [failedCount, lockedUntil, userRow.id]
        );
        await connection.commit();

        if (locked) {
          logger.warn('Account locked after repeated login failures', {
            username,
            ip,
            failedCount,
            lockMinutes: LOCK_DURATION_MINUTES,
          });
          return { locked: true, remainingAttempts: 0, lockDurationMinutes: LOCK_DURATION_MINUTES };
        }

        const remainingAttempts = Math.max(0, MAX_FAILED_ATTEMPTS - failedCount);
        logger.info('Login failure recorded', { username, ip, failedCount, remainingAttempts });
        return { locked: false, remainingAttempts, lockDurationMinutes: 0 };
      }

      await connection.rollback();
    } catch (error) {
      try { await connection.rollback(); } catch { /* preserve original error */ }
      throw error;
    } finally {
      connection.release();
    }

    // Unknown username: keep the previous Redis/memory anti-enumeration
    // behavior, but never let its storage failure escape as a 500.
    const record = (await getAuxiliaryRecord(username)) || {
      failedCount: 0,
      lockedUntil: null,
      lastFailedAt: null,
    };
    if (record.lockedUntil && Date.now() >= Number(record.lockedUntil)) {
      record.failedCount = 0;
      record.lockedUntil = null;
    }
    record.failedCount = Number(record.failedCount || 0) + 1;
    record.lastFailedAt = Date.now();
    if (record.failedCount >= MAX_FAILED_ATTEMPTS) {
      record.lockedUntil = Date.now() + LOCK_DURATION_MS;
      await setAuxiliaryRecord(username, record);
      return { locked: true, remainingAttempts: 0, lockDurationMinutes: LOCK_DURATION_MINUTES };
    }
    await setAuxiliaryRecord(username, record);
    return {
      locked: false,
      remainingAttempts: MAX_FAILED_ATTEMPTS - record.failedCount,
      lockDurationMinutes: 0,
    };
  }

  /**
   * 登录成功，清除失败记录
   * @param {string} username - 用户名
   */
  static async clearFailedAttempts(username) {
    username = canonicalUsername(username);
    await pool.execute(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE LOWER(username) = ?',
      [username]
    );
    await clearAuxiliaryRecord(username);
  }

  /**
   * 管理员手动解锁
   * @param {string} username - 用户名
   */
  static async unlock(username) {
    username = canonicalUsername(username);
    await pool.execute(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE LOWER(username) = ?',
      [username]
    );
    await clearAuxiliaryRecord(username);
    logger.info(`🔓 [手动解锁] 账号 ${username} 已被管理员解锁`);
  }

  /**
   * 获取所有锁定状态（管理员接口）
   * @returns {Promise<Array>}
   */
  static async getLockedAccounts() {
    const [rows] = await pool.execute(
      `SELECT id, username, failed_login_attempts, locked_until,
              GREATEST(TIMESTAMPDIFF(SECOND, NOW(), locked_until), 0) AS remaining_lock_seconds
         FROM users
        WHERE locked_until IS NOT NULL AND locked_until > NOW()
        ORDER BY locked_until ASC`
    );
    const locked = rows.map((row) => ({
      id: row.id,
      username: row.username,
      failedCount: Number(row.failed_login_attempts || 0),
      lockedUntil: new Date(row.locked_until).toISOString(),
      remainingMinutes: remainingMinutesFromSeconds(row.remaining_lock_seconds),
      source: 'database',
    }));

    const client = await getClient();
    if (client) {
      try {
        const keys = await client.keys(`${KEY_PREFIX}*`);
        for (const key of keys) {
          const username = key.slice(KEY_PREFIX.length);
          const record = await getAuxiliaryRecord(username);
          if (record?.lockedUntil && Date.now() < Number(record.lockedUntil)) {
            locked.push({
              username,
              failedCount: Number(record.failedCount || 0),
              lockedUntil: new Date(Number(record.lockedUntil)).toISOString(),
              remainingMinutes: Math.ceil((Number(record.lockedUntil) - Date.now()) / 60000),
              source: 'redis',
            });
          }
        }
      } catch (error) {
        logger.warn('读取未知用户名锁定列表失败', { error: error.message });
      }
    }
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
