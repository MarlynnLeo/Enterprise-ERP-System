/**
 * Online time tracking middleware.
 *
 * Records lightweight user activity events without blocking the request.
 */

const db = require('../config/db');
const { logger } = require('../utils/logger');

class OnlineTimeTracker {
  constructor() {
    this.excludePaths = ['/api/ping', '/api/health', '/api/auth/refresh'];
    this.lastRecordTime = new Map();
    this.minInterval = 10000;
  }

  createMiddleware() {
    return async (req, res, next) => {
      next();

      setImmediate(() => {
        this.recordActivity(req).catch((error) => {
          logger.debug('Failed to record online activity:', error.message);
        });
      });
    };
  }

  async recordActivity(req) {
    try {
      if (!this.shouldRecord(req)) {
        return;
      }

      const userId = req.user?.id;
      const username = req.user?.username;

      if (!userId || !username) {
        return;
      }

      const now = Date.now();
      const lastTime = this.lastRecordTime.get(userId) || 0;
      if (now - lastTime < this.minInterval) {
        return;
      }

      this.lastRecordTime.set(userId, now);

      const sql = `
        INSERT INTO audit_logs (
          user_id, username, action, method, path,
          ip_address, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW())
      `;

      const values = [
        userId,
        username,
        'ACTIVITY',
        req.method,
        req.path,
        this.getClientIP(req),
      ];

      await db.query(sql, values);
    } catch (error) {
      logger.debug('Failed to record activity:', error.message);
    }
  }

  shouldRecord(req) {
    if (this.excludePaths.some((path) => req.path.startsWith(path))) {
      return false;
    }

    return Boolean(req.user);
  }

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

  cleanupCache() {
    const now = Date.now();
    const maxAge = 60000;

    for (const [userId, timestamp] of this.lastRecordTime.entries()) {
      if (now - timestamp > maxAge) {
        this.lastRecordTime.delete(userId);
      }
    }
  }
}

const tracker = new OnlineTimeTracker();
const onlineTimeCleanupTimer = setInterval(() => {
  tracker.cleanupCache();
}, 60000);
onlineTimeCleanupTimer.unref?.();

module.exports = tracker;
