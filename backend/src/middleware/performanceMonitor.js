/**
 * performanceMonitor.js
 * @description 性能监控中间件
 * @date 2025-08-27
 * @version 1.0.0
 */

/**
 * 简化的性能监控器
 */
const { logger } = require('../utils/logger');
const crypto = require('crypto');
class SimplePerformanceMonitor {
  /**
   * 构造函数
   */
  constructor() {
    this.stats = {
      totalRequests: 0,
      slowRequests: 0,
      errorRequests: 0,
      avgResponseTime: 0,
      totalResponseTime: 0,
    };
  }

  /**
   * 性能监控中间件
   * @param {Object} options - 配置选项
   * @returns {Function} Express中间件函数
   */
  middleware(options = {}) {
    const { slowThreshold = 1000, enableLogging = false } = options;

    return (req, res, next) => {
      const startTime = Date.now();

      // 生成请求ID
      const requestId = `${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
      req.requestId = requestId;
      res.setHeader('X-Request-ID', requestId);

      // 监听响应完成事件
      res.on('finish', () => {
        const duration = Date.now() - startTime;

        // 更新统计信息
        this.updateStats(duration, res.statusCode);

        // 记录慢请求
        if (duration > slowThreshold && enableLogging) {
          logger.warn(`慢请求: ${req.method} ${req.originalUrl} - ${duration}ms [${requestId}]`);
        }

        // 记录错误请求
        if (res.statusCode >= 500 && enableLogging) {
          logger.error(
            `❌ 服务器错误: ${req.method} ${req.originalUrl} - ${res.statusCode} [${requestId}]`
          );
        }
      });

      next();
    };
  }

  /**
   * 更新统计信息
   * @param {number} duration - 响应时间
   * @param {number} statusCode - 状态码
   */
  updateStats(duration, statusCode) {
    this.stats.totalRequests++;
    this.stats.totalResponseTime += duration;
    this.stats.avgResponseTime = Math.round(
      this.stats.totalResponseTime / this.stats.totalRequests
    );

    if (duration > 1000) {
      this.stats.slowRequests++;
    }

    if (statusCode >= 400) {
      this.stats.errorRequests++;
    }
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计数据
   */
  getStats() {
    return {
      ...this.stats,
      uptime: Math.round(process.uptime()),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      slowRequests: 0,
      errorRequests: 0,
      avgResponseTime: 0,
      totalResponseTime: 0,
    };
  }
}

// 创建全局实例
const monitor = new SimplePerformanceMonitor();

// 创建中间件函数
const performanceMonitor = monitor.middleware({
  slowThreshold: 1000,
  enableLogging: process.env.NODE_ENV !== 'production',
});

// 导出函数和工具
module.exports = {
  performanceMonitor,
  getPerformanceReport: () => monitor.getStats(),
  getSystemMetrics: () => ({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    timestamp: new Date().toISOString(),
  }),
  resetPerformanceStats: () => monitor.resetStats(),
};
