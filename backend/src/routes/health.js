/**
 * 健康检查路由
 */

const express = require('express');
const router = express.Router();
const healthCheckService = require('../services/HealthCheckService');
const DatabaseMonitorService = require('../services/DatabaseMonitorService');
const { cacheMiddleware } = require('../services/cacheService');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');

const monitorAccess = [authenticateToken, requirePermission('system:monitor')];

/**
 * 简单健康检查 - 用于负载均衡器
 */
router.get('/ping', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * 基础健康检查
 */
router.get('/health', monitorAccess, async (req, res) => {
  try {
    const healthStatus = await healthCheckService.checkAll();

    const statusCode =
      healthStatus.status === 'healthy' ? 200 : healthStatus.status === 'warning' ? 200 : 503;

    res.status(statusCode).json(healthStatus);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      message: '健康检查失败',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * 详细健康报告
 */
router.get('/health/detailed', monitorAccess, async (req, res) => {
  try {
    const healthReport = await healthCheckService.generateHealthReport();

    const statusCode =
      healthReport.status === 'healthy' ? 200 : healthReport.status === 'warning' ? 200 : 503;

    res.status(statusCode).json(healthReport);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      message: '生成健康报告失败',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * 系统信息
 */
router.get('/info', monitorAccess, cacheMiddleware(60), (req, res) => {
  try {
    const systemInfo = healthCheckService.getSystemInfo();
    const appInfo = healthCheckService.getAppInfo();

    res.json({
      system: systemInfo,
      application: appInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: '获取系统信息失败',
      message: error.message,
    });
  }
});

/**
 * 数据库健康检查
 */
router.get('/health/database', monitorAccess, async (req, res) => {
  try {
    const dbHealth = await healthCheckService.checkDatabase();

    const statusCode =
      dbHealth.status === 'healthy' ? 200 : dbHealth.status === 'warning' ? 200 : 503;

    res.status(statusCode).json({
      component: 'database',
      ...dbHealth,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      component: 'database',
      status: 'unhealthy',
      message: '数据库健康检查失败',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * 缓存健康检查
 */
router.get('/health/cache', monitorAccess, async (req, res) => {
  try {
    const cacheHealth = await healthCheckService.checkCache();

    const statusCode = cacheHealth.status === 'healthy' ? 200 : 503;

    res.status(statusCode).json({
      component: 'cache',
      ...cacheHealth,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      component: 'cache',
      status: 'unhealthy',
      message: '缓存健康检查失败',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * 内存使用情况
 */
router.get('/health/memory', monitorAccess, async (req, res) => {
  try {
    const memoryHealth = await healthCheckService.checkMemory();

    const statusCode =
      memoryHealth.status === 'healthy' ? 200 : memoryHealth.status === 'warning' ? 200 : 503;

    res.status(statusCode).json({
      component: 'memory',
      ...memoryHealth,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      component: 'memory',
      status: 'unhealthy',
      message: '内存检查失败',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * 就绪检查 - 用于Kubernetes readiness probe
 */
router.get('/ready', async (req, res) => {
  try {
    // 检查关键组件
    const dbHealth = await healthCheckService.checkDatabase();
    const cacheHealth = await healthCheckService.checkCache();

    const isReady = dbHealth.status !== 'unhealthy' && cacheHealth.status !== 'unhealthy';

    if (isReady) {
      res.status(200).json({
        status: 'ready',
        message: '服务已就绪',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        message: '服务未就绪',
        details: {
          database: dbHealth.status,
          cache: cacheHealth.status,
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      message: '就绪检查失败',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * 存活检查 - 用于Kubernetes liveness probe
 */
router.get('/live', (req, res) => {
  // 简单的存活检查，只要进程在运行就返回成功
  res.status(200).json({
    status: 'alive',
    message: '服务存活',
    uptime: `${Math.floor(process.uptime())} seconds`,
    timestamp: new Date().toISOString(),
  });
});

/**
 * 性能指标
 */
router.get('/metrics', monitorAccess, async (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const metrics = {
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memory: {
          rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
          heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
          heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
          external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
      },
      timestamp: new Date().toISOString(),
    };

    res.json(metrics);
  } catch (error) {
    res.status(500).json({
      error: '获取性能指标失败',
      message: error.message,
    });
  }
});

/**
 * 连接池健康检查
 */
router.get('/pools', monitorAccess, async (req, res) => {
  try {
    const poolsHealth = await DatabaseMonitorService.getPoolsHealth();

    const statusCode =
      poolsHealth.status === 'healthy' ? 200 : poolsHealth.status === 'warning' ? 200 : 503;

    res.status(statusCode).json({
      component: 'connectionPools',
      ...poolsHealth,
    });
  } catch (error) {
    res.status(503).json({
      component: 'connectionPools',
      status: 'unhealthy',
      message: '连接池健康检查失败',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * 连接池统计信息
 */
router.get('/pools/stats', monitorAccess, async (req, res) => {
  try {
    const stats = DatabaseMonitorService.getPoolsStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: '获取连接池统计信息失败',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * 特定连接池健康检查
 */
router.get('/pools/:poolName', monitorAccess, async (req, res) => {
  try {
    const { poolName } = req.params;
    const health = DatabaseMonitorService.getPoolHealth(poolName);

    const statusCode = health.status === 'healthy' ? 200 : health.status === 'warning' ? 200 : 503;

    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      message: '连接池健康检查失败',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * 特定连接池统计信息
 */
router.get('/pools/:poolName/stats', monitorAccess, async (req, res) => {
  try {
    const { poolName } = req.params;
    const stats = DatabaseMonitorService.getPoolStats(poolName);
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: '获取连接池统计信息失败',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * 重置连接池指标
 */
router.post('/pools/:poolName/reset', monitorAccess, async (req, res) => {
  try {
    const { poolName } = req.params;
    const result = DatabaseMonitorService.resetPoolMetrics(poolName);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: '重置连接池指标失败',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * 数据库监控报告
 */
router.get('/database/report', monitorAccess, async (req, res) => {
  try {
    const report = await DatabaseMonitorService.generateMonitorReport();
    res.json(report);
  } catch (error) {
    res.status(500).json({
      error: '生成监控报告失败',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
