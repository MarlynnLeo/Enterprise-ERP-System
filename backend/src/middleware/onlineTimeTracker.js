/**
 * 在线时长追踪中间件
 * 轻量级实现，用于统计用户在线时长
 */

const db = require('../config/db');
const { logger } = require('../utils/logger');

class OnlineTimeTracker {
  constructor() {
    // 排除的路径（避免过度记录）
    this.excludePaths = ['/api/ping', '/api/health', '/api/auth/refresh'];

    // 使用内存缓存避免频繁写数据库
    this.lastRecordTime = new Map(); // user_id -> timestamp
    this.minInterval = 10000; // 最小记录间隔10秒
  }

  /**
   * 创建中间件
   */
  createMiddleware() {
    return async (req, res, next) => {
      // 立即调用next()，不阻塞请求
      next();

      // 异步记录活动
      setImmediate(() => {
        this.recordActivity(req).catch((error) => {
          // 非阻塞失败：记录日志但不影响主请求
          logger.logger.debug('记录在线活动失败（不影响业务）:', error.message);
        });
      });
    };
  }

  /**
   * 记录用户活动
   */
  async recordActivity(req) {
    try {
      // 检查是否需要记录
      if (!this.shouldRecord(req)) {
        return;
      }

      const userId = req.user?.id;
      const username = req.user?.username;

      // 必须有用户信息
      if (!userId || !username) {
        return;
      }

      // 检查是否在最小间隔内
      const now = Date.now();
      const lastTime = this.lastRecordTime.get(userId) || 0;
      if (now - lastTime < this.minInterval) {
        return; // 跳过，避免过度记录
      }

      // 更新最后记录时间
      this.lastRecordTime.set(userId, now);

      // 使用 db.query 而非 db.pool.execute，以获得自动重试能力
      const sql = `
        INSERT INTO audit_logs (
          user_id, username, action, method, path, 
          ip_address, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW())
      `;

      const values = [
        userId,
        username,
        'ACTIVITY', // 标记为活动记录
        req.method,
        req.path,
        this.getClientIP(req),
      ];

      await db.query(sql, values);
    } catch (error) {
      // 非阻塞失败：记录日志但不影响主请求
      logger.logger.debug('记录活动失败（不影响业务）:', error.message);
    }
  }

  /**
   * 判断是否需要记录
   */
  shouldRecord(req) {
    // 排除特定路径
    if (this.excludePaths.some((path) => req.path.startsWith(path))) {
      return false;
    }

    // 必须有用户信息
    if (!req.user) {
      return false;
    }

    return true;
  }

  /**
   * 获取客户端IP
   */
  getClientIP(req) {
    return (
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.headers['x-real-ip'] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.connection?.socket?.remoteAddress ||
      'unknown'
    );
  }

  /**
   * 清理过期的缓存
   */
  cleanupCache() {
    const now = Date.now();
    const maxAge = 60000; // 1分钟

    for (const [userId, timestamp] of this.lastRecordTime.entries()) {
      if (now - timestamp > maxAge) {
        this.lastRecordTime.delete(userId);
      }
    }
  }
}

// 创建单例
const tracker = new OnlineTimeTracker();

// 定期清理缓存
setInterval(() => {
  tracker.cleanupCache();
}, 60000); // 每分钟清理一次

module.exports = tracker;
