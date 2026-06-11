/**
 * 性能监控路由
 * @description 提供系统性能监控和健康检查接口
 * @author 系统
 * @date 2025-08-28
 */

const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const router = express.Router();
const { authenticateToken } = require('../middleware/authEnhanced');
const { requirePermission } = require('../middleware/requirePermission');
const {
  getPerformanceReport,
  getSystemMetrics,
  resetPerformanceStats,
} = require('../middleware/performanceMonitor');
const { logger } = require('../utils/logger');
const { ResponseHandler } = require('../utils/responseHandler');

const LOG_DIR = path.resolve(__dirname, '../../logs');
const LOG_LEVELS = ['error', 'warn', 'info', 'debug'];
const MAX_LOG_READ_BYTES = 1024 * 1024;

function clampLogLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(parsed, 1), 1000);
}

function normalizeLogDate(value) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  return value;
}

function getLogFilePath(level, date) {
  const filePath = path.resolve(LOG_DIR, `${level}-${date}.log`);
  if (!filePath.startsWith(`${LOG_DIR}${path.sep}`)) {
    throw new Error('Invalid log path');
  }
  return filePath;
}

async function readRecentLogEntries(level, date, limit) {
  const filePath = getLogFilePath(level, date);
  let handle;

  try {
    const stats = await fs.stat(filePath);
    const start = Math.max(0, stats.size - MAX_LOG_READ_BYTES);
    const length = stats.size - start;
    const buffer = Buffer.alloc(length);

    handle = await fs.open(filePath, 'r');
    await handle.read(buffer, 0, length, start);

    const lines = buffer.toString('utf8').split(/\r?\n/).filter(Boolean);
    const completeLines = start > 0 ? lines.slice(1) : lines;

    return completeLines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { timestamp: null, level: level.toUpperCase(), message: line };
        }
      })
      .reverse();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  } finally {
    if (handle) {
      await handle.close();
    }
  }
}

router.get('/health', authenticateToken, requirePermission('system:monitor'), (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      memory: process.memoryUsage(),
      pid: process.pid,
    };

    res.json(healthStatus);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

router.get('/metrics', authenticateToken, requirePermission('system:monitor'), (req, res) => {
  try {
    const metrics = getSystemMetrics();
    ResponseHandler.success(res, metrics, '获取系统指标成功');
  } catch (error) {
    logger.error('Failed to get system metrics:', error);
    ResponseHandler.error(res, '获取系统指标失败', 'SERVER_ERROR', 500, error);
  }
});

router.get('/performance', authenticateToken, requirePermission('system:monitor'), (req, res) => {
  try {
    const report = getPerformanceReport();
    ResponseHandler.success(res, report, '获取性能报告成功');
  } catch (error) {
    logger.error('Failed to get performance report:', error);
    ResponseHandler.error(res, '获取性能报告失败', 'SERVER_ERROR', 500, error);
  }
});

router.post(
  '/performance/reset',
  authenticateToken,
  requirePermission('system:admin'),
  (req, res) => {
    try {
      resetPerformanceStats();

      logger.audit('Performance stats reset', req.user.id, {
        action: 'reset_performance_stats',
        timestamp: new Date().toISOString(),
      });

      ResponseHandler.success(res, null, '性能统计已重置');
    } catch (error) {
      logger.error('Failed to reset performance stats:', error);
      ResponseHandler.error(res, '重置性能统计失败', 'SERVER_ERROR', 500, error);
    }
  }
);

router.get('/logs', authenticateToken, requirePermission('system:monitor'), async (req, res) => {
  try {
    const date = normalizeLogDate(req.query.date);
    if (!date) {
      return ResponseHandler.error(res, '日志日期格式必须为 YYYY-MM-DD', 'VALIDATION_ERROR', 400);
    }

    const requestedLevel = String(req.query.level || 'all').toLowerCase();
    const levels = requestedLevel === 'all' ? LOG_LEVELS : [requestedLevel];
    if (levels.some((level) => !LOG_LEVELS.includes(level))) {
      return ResponseHandler.error(res, '无效的日志级别', 'VALIDATION_ERROR', 400);
    }

    const limit = clampLogLimit(req.query.limit);
    const entriesByLevel = await Promise.all(
      levels.map((level) => readRecentLogEntries(level, date, limit))
    );

    const logs = entriesByLevel
      .flat()
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, limit);

    return ResponseHandler.success(
      res,
      {
        list: logs,
        meta: {
          date,
          level: requestedLevel,
          limit,
        },
      },
      '获取日志成功'
    );
  } catch (error) {
    logger.error('Failed to get logs:', error);
    ResponseHandler.error(res, '获取日志失败', 'SERVER_ERROR', 500, error);
  }
});

module.exports = router;
