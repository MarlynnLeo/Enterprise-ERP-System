/**
 * AccountLockService.js
 * @description 账号锁定服务 — 防暴力破解
 * 连续登录失败 N 次后自动锁定账号一段时间
 * @date 2026-04-07
 * @version 1.0.0
 */

const { logger } = require('../../utils/logger');

// 配置
const MAX_FAILED_ATTEMPTS = parseInt(process.env.LOGIN_MAX_FAILED_ATTEMPTS) || 5;
const LOCK_DURATION_MINUTES = parseInt(process.env.LOGIN_LOCK_DURATION_MINUTES) || 15;
const LOCK_DURATION_MS = LOCK_DURATION_MINUTES * 60 * 1000;

// 内存存储（生产环境建议使用 Redis）
// key: username, value: { failedCount, lockedUntil, lastFailedAt }
const loginAttempts = new Map();

class AccountLockService {
  /**
   * 检查账号是否被锁定
   * @param {string} username - 用户名
   * @returns {{ locked: boolean, remainingMinutes: number }}
   */
  static isLocked(username) {
    const record = loginAttempts.get(username);
    if (!record || !record.lockedUntil) {
      return { locked: false, remainingMinutes: 0 };
    }

    const now = Date.now();
    if (now < record.lockedUntil) {
      const remainingMs = record.lockedUntil - now;
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      return { locked: true, remainingMinutes };
    }

    // 锁定已过期，清除记录
    loginAttempts.delete(username);
    return { locked: false, remainingMinutes: 0 };
  }

  /**
   * 记录一次登录失败
   * @param {string} username - 用户名
   * @param {string} ip - 客户端IP
   * @returns {{ locked: boolean, remainingAttempts: number, lockDurationMinutes: number }}
   */
  static recordFailedAttempt(username, ip = '') {
    const record = loginAttempts.get(username) || {
      failedCount: 0,
      lockedUntil: null,
      lastFailedAt: null,
    };

    record.failedCount++;
    record.lastFailedAt = Date.now();

    // 达到锁定阈值
    if (record.failedCount >= MAX_FAILED_ATTEMPTS) {
      record.lockedUntil = Date.now() + LOCK_DURATION_MS;
      loginAttempts.set(username, record);

      logger.warn(`🔒 [账号锁定] 用户 ${username} 连续 ${record.failedCount} 次登录失败，已锁定 ${LOCK_DURATION_MINUTES} 分钟`, {
        username,
        ip,
        failedCount: record.failedCount,
        lockedUntil: new Date(record.lockedUntil).toISOString(),
      });

      return {
        locked: true,
        remainingAttempts: 0,
        lockDurationMinutes: LOCK_DURATION_MINUTES,
      };
    }

    loginAttempts.set(username, record);

    const remainingAttempts = MAX_FAILED_ATTEMPTS - record.failedCount;
    logger.info(`⚠️ [登录失败] 用户 ${username} 第 ${record.failedCount} 次失败，剩余 ${remainingAttempts} 次机会`, {
      username,
      ip,
    });

    return {
      locked: false,
      remainingAttempts,
      lockDurationMinutes: 0,
    };
  }

  /**
   * 登录成功，清除失败记录
   * @param {string} username - 用户名
   */
  static clearFailedAttempts(username) {
    if (loginAttempts.has(username)) {
      loginAttempts.delete(username);
    }
  }

  /**
   * 管理员手动解锁
   * @param {string} username - 用户名
   */
  static unlock(username) {
    loginAttempts.delete(username);
    logger.info(`🔓 [手动解锁] 账号 ${username} 已被管理员解锁`);
  }

  /**
   * 获取所有锁定状态（管理员接口）
   * @returns {Array}
   */
  static getLockedAccounts() {
    const now = Date.now();
    const locked = [];

    loginAttempts.forEach((record, username) => {
      if (record.lockedUntil && now < record.lockedUntil) {
        locked.push({
          username,
          failedCount: record.failedCount,
          lockedUntil: new Date(record.lockedUntil).toISOString(),
          remainingMinutes: Math.ceil((record.lockedUntil - now) / 60000),
        });
      }
    });

    return locked;
  }

  /**
   * 定期清理过期记录（防止内存泄漏）
   */
  static cleanup() {
    const now = Date.now();
    const expireThreshold = 30 * 60 * 1000; // 30分钟无活动的记录清理

    loginAttempts.forEach((record, username) => {
      const isExpiredLock = record.lockedUntil && now > record.lockedUntil;
      const isStaleRecord = record.lastFailedAt && (now - record.lastFailedAt) > expireThreshold;

      if (isExpiredLock || isStaleRecord) {
        loginAttempts.delete(username);
      }
    });
  }
}

// 每10分钟清理过期记录
setInterval(() => AccountLockService.cleanup(), 10 * 60 * 1000);

module.exports = AccountLockService;
