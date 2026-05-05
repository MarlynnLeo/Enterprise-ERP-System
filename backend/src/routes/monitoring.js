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
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const {
  getPerformanceReport,
  getSystemMetrics,
  resetPerformanceStats,
} = require('../middleware/performanceMonitor');
const { logger } = require('../utils/logger');

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

/**
 * @swagger
 * tags:
 *   name: 系统监控
 *   description: 系统性能监控和健康检查接口
 */

/**
 * @swagger
 * /monitoring/health:
 *   get:
 *     summary: 系统健康检查
 *     tags: [系统监控]
 *     responses:
 *       200:
 *         description: 系统健康状态
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                   description: 系统运行时间（秒）
 *                 version:
 *                   type: string
 *                   description: 应用版本
 */
router.get('/health', (req, res) => {
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

/**
 * @swagger
 * /monitoring/metrics:
 *   get:
 *     summary: 获取系统性能指标
 *     tags: [系统监控]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 系统性能指标
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cpu:
 *                   type: object
 *                   description: CPU使用情况
 *                 memory:
 *                   type: object
 *                   description: 内存使用情况
 *                 uptime:
 *                   type: number
 *                   description: 系统运行时间
 */
router.get('/metrics', authenticateToken, requirePermission('system:monitor'), (req, res) => {
  try {
    const metrics = getSystemMetrics();
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error('Failed to get system metrics:', error);
    res.status(500).json({
      success: false,
      message: '获取系统指标失败',
    });
  }
});

/**
 * @swagger
 * /monitoring/performance:
 *   get:
 *     summary: 获取性能统计报告
 *     tags: [系统监控]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 性能统计报告
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 requests:
 *                   type: object
 *                   description: 请求统计
 *                 system:
 *                   type: object
 *                   description: 系统指标
 *                 topEndpoints:
 *                   type: array
 *                   description: 热门端点
 *                 slowEndpoints:
 *                   type: array
 *                   description: 慢响应端点
 */
router.get('/performance', authenticateToken, requirePermission('system:monitor'), (req, res) => {
  try {
    const report = getPerformanceReport();
    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error('Failed to get performance report:', error);
    res.status(500).json({
      success: false,
      message: '获取性能报告失败',
    });
  }
});

/**
 * @swagger
 * /monitoring/performance/reset:
 *   post:
 *     summary: 重置性能统计
 *     tags: [系统监控]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 重置成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
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

      res.json({
        success: true,
        message: '性能统计已重置',
      });
    } catch (error) {
      logger.error('Failed to reset performance stats:', error);
      res.status(500).json({
        success: false,
        message: '重置性能统计失败',
      });
    }
  }
);

/**
 * @swagger
 * /monitoring/logs:
 *   get:
 *     summary: 获取系统日志
 *     tags: [系统监控]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [error, warn, info, debug]
 *         description: 日志级别
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: 返回条数限制
 *     responses:
 *       200:
 *         description: 系统日志
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/logs', authenticateToken, requirePermission('system:monitor'), async (req, res) => {
  try {
    const date = normalizeLogDate(req.query.date);
    if (!date) {
      return res.status(400).json({
        success: false,
        message: '日志日期格式必须为 YYYY-MM-DD',
      });
    }

    const requestedLevel = String(req.query.level || 'all').toLowerCase();
    const levels = requestedLevel === 'all' ? LOG_LEVELS : [requestedLevel];
    if (levels.some((level) => !LOG_LEVELS.includes(level))) {
      return res.status(400).json({
        success: false,
        message: '无效的日志级别',
      });
    }

    const limit = clampLogLimit(req.query.limit);
    const entriesByLevel = await Promise.all(
      levels.map((level) => readRecentLogEntries(level, date, limit))
    );

    const logs = entriesByLevel
      .flat()
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, limit);

    return res.json({
      success: true,
      data: logs,
      meta: {
        date,
        level: requestedLevel,
        limit,
      },
    });
  } catch (error) {
    logger.error('Failed to get logs:', error);
    res.status(500).json({
      success: false,
      message: '获取日志失败',
    });
  }
});

module.exports = router;
