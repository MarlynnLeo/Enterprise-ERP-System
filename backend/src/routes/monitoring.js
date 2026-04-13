/**
 * 性能监控路由
 * @description 提供系统性能监控和健康检查接口
 * @author 系统
 * @date 2025-08-28
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const {
  getPerformanceReport,
  getSystemMetrics,
  resetPerformanceStats,
} = require('../middleware/performanceMonitor');
const {
  clearBlacklist,
  removeFromBlacklist,
  getSecurityStatus,
} = require('../middleware/securityEnhanced');
const { logger } = require('../utils/logger');

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
    const { level = 'info', limit = 100 } = req.query;

    // 这里原本返回了一条写死的假日志
    // 企业级系统中，实时监控流应当对接收集网关或采取文件动态流解析，暂不支持直接模拟返回
    return res.status(501).json({
      success: false,
      message: '日志流式读取组件正处于架构升级中，当前版本暂未提供文件日志下发能力'
    });
  } catch (error) {
    logger.error('Failed to get logs:', error);
    res.status(500).json({
      success: false,
      message: '获取日志失败',
    });
  }
});

/**
 * @swagger
 * /monitoring/security:
 *   get:
 *     summary: 获取安全状态
 *     tags: [系统监控]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 安全状态信息
 */
router.get('/security', authenticateToken, requirePermission('system:monitor'), (req, res) => {
  try {
    const securityStatus = getSecurityStatus();
    res.json({
      success: true,
      data: securityStatus,
    });
  } catch (error) {
    logger.error('Failed to get security status:', error);
    res.status(500).json({
      success: false,
      message: '获取安全状态失败',
    });
  }
});

/**
 * @swagger
 * /monitoring/security/blacklist/clear:
 *   post:
 *     summary: 清除IP黑名单
 *     tags: [系统监控]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 清除成功
 */
router.post(
  '/security/blacklist/clear',
  authenticateToken,
  requirePermission('system:admin'),
  (req, res) => {
    try {
      clearBlacklist();

      logger.audit('Security blacklist cleared', req.user.id, {
        action: 'clear_blacklist',
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        message: 'IP黑名单已清除',
      });
    } catch (error) {
      logger.error('Failed to clear blacklist:', error);
      res.status(500).json({
        success: false,
        message: '清除黑名单失败',
      });
    }
  }
);

/**
 * @swagger
 * /monitoring/security/blacklist/remove:
 *   post:
 *     summary: 移除特定IP
 *     tags: [系统监控]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ip:
 *                 type: string
 *                 description: 要移除的IP地址
 *     responses:
 *       200:
 *         description: 移除成功
 */
router.post(
  '/security/blacklist/remove',
  authenticateToken,
  requirePermission('system:admin'),
  (req, res) => {
    try {
      const { ip } = req.body;

      if (!ip) {
        return res.status(400).json({
          success: false,
          message: 'IP地址不能为空',
        });
      }

      removeFromBlacklist(ip);

      logger.audit('IP removed from blacklist', req.user.id, {
        action: 'remove_from_blacklist',
        ip,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        message: `IP ${ip} 已从黑名单移除`,
      });
    } catch (error) {
      logger.error('Failed to remove IP from blacklist:', error);
      res.status(500).json({
        success: false,
        message: '移除IP失败',
      });
    }
  }
);

module.exports = router;
