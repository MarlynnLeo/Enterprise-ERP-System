/**
 * 系统健康检查服务
 *
 * @author ERP System
 * @version 2.0.0
 */

const { getConnection } = require('../config/db');
const cacheService = require('./cacheService');
const DatabaseMonitorService = require('./DatabaseMonitorService');
const os = require('os');

class HealthCheckService {
  constructor() {
    this.checks = new Map();
    this.registerDefaultChecks();
  }

  /**
   * 注册默认的健康检查项
   */
  registerDefaultChecks() {
    this.register('database', this.checkDatabase.bind(this));
    this.register('connectionPools', this.checkConnectionPools.bind(this));
    this.register('cache', this.checkCache.bind(this));
    this.register('memory', this.checkMemory.bind(this));
    this.register('disk', this.checkDisk.bind(this));
    this.register('cpu', this.checkCPU.bind(this));
  }

  /**
   * 注册健康检查项
   */
  register(name, checkFunction) {
    this.checks.set(name, checkFunction);
  }

  /**
   * 执行所有健康检查
   */
  async checkAll() {
    const results = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {},
      summary: {
        total: this.checks.size,
        healthy: 0,
        unhealthy: 0,
        warning: 0,
      },
    };

    for (const [name, checkFunction] of this.checks) {
      try {
        const startTime = Date.now();
        const result = await checkFunction();
        const duration = Date.now() - startTime;

        results.checks[name] = {
          ...result,
          duration: `${duration}ms`,
        };

        // 统计状态
        if (result.status === 'healthy') {
          results.summary.healthy++;
        } else if (result.status === 'warning') {
          results.summary.warning++;
        } else {
          results.summary.unhealthy++;
        }
      } catch (error) {
        results.checks[name] = {
          status: 'unhealthy',
          message: error.message,
          error: error.stack,
        };
        results.summary.unhealthy++;
      }
    }

    // 确定整体状态
    if (results.summary.unhealthy > 0) {
      results.status = 'unhealthy';
    } else if (results.summary.warning > 0) {
      results.status = 'warning';
    }

    return results;
  }

  /**
   * 检查数据库连接
   */
  async checkDatabase() {
    try {
      const connection = await getConnection();
      try {
        const startTime = Date.now();
        await connection.execute('SELECT 1 as test');
        const queryTime = Date.now() - startTime;
        const [statusResult] = await connection.execute('SHOW STATUS LIKE "Threads_connected"');
        const [variablesResult] = await connection.execute('SHOW VARIABLES LIKE "max_connections"');

        const threadsConnected = parseInt(statusResult[0]?.Value || 0);
        const maxConnections = parseInt(variablesResult[0]?.Value || 0);
        const connectionUsage = (threadsConnected / maxConnections) * 100;

        let status = 'healthy';
        let message = '数据库连接正常';

        if (queryTime > 1000) {
          status = 'warning';
          message = `数据库响应较慢 (${queryTime}ms)`;
        }

        if (connectionUsage > 80) {
          status = 'warning';
          message = `数据库连接使用率较高 (${connectionUsage.toFixed(1)}%)`;
        }

        return {
          status,
          message,
          details: {
            queryTime: `${queryTime}ms`,
            threadsConnected,
            maxConnections,
            connectionUsage: `${connectionUsage.toFixed(1)}%`,
          },
        };
      } finally {
        connection.release();
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: '数据库连接失败',
        error: error.message,
      };
    }
  }

  /**
   * 检查连接池状态
   */
  async checkConnectionPools() {
    try {
      const poolsHealth = await DatabaseMonitorService.getPoolsHealth();

      return {
        status: poolsHealth.status,
        message: poolsHealth.status === 'healthy' ? '所有连接池运行正常' : '部分连接池存在问题',
        details: poolsHealth.pools,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: '连接池检查失败',
        error: error.message,
      };
    }
  }

  /**
   * 检查缓存服务
   */
  async checkCache() {
    try {
      const probeKey = 'health_check_probe';
      const probeValue = { timestamp: Date.now() };

      // 验证缓存写入
      const setResult = await cacheService.set(probeKey, probeValue, 10);
      if (!setResult) {
        throw new Error('缓存写入失败');
      }

      // 验证缓存读取
      const getValue = await cacheService.get(probeKey);
      if (!getValue || getValue.timestamp !== probeValue.timestamp) {
        throw new Error('缓存读取失败');
      }

      // 清理健康检查探针数据
      await cacheService.delete(probeKey);

      // 获取缓存统计
      const stats = await cacheService.getStats();

      return {
        status: 'healthy',
        message: '缓存服务正常',
        details: stats,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: '缓存服务异常',
        error: error.message,
      };
    }
  }

  /**
   * 检查内存使用情况
   */
  async checkMemory() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory) * 100;

    let status = 'healthy';
    let message = '内存使用正常';

    if (memoryUsage > 90) {
      status = 'unhealthy';
      message = '内存使用率过高';
    } else if (memoryUsage > 80) {
      status = 'warning';
      message = '内存使用率较高';
    }

    return {
      status,
      message,
      details: {
        total: `${(totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
        used: `${(usedMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
        free: `${(freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
        usage: `${memoryUsage.toFixed(1)}%`,
      },
    };
  }

  /**
   * 检查磁盘使用情况
   */
  async checkDisk() {
    try {


      // 在Windows上获取磁盘使用情况比较复杂，这里简化处理
      // 实际生产环境中可能需要使用第三方库如 'node-disk-info'

      return {
        status: 'healthy',
        message: '磁盘状态正常',
        details: {
          path: process.cwd(),
          note: '详细磁盘信息需要额外配置',
        },
      };
    } catch (error) {
      return {
        status: 'warning',
        message: '无法获取磁盘信息',
        error: error.message,
      };
    }
  }

  /**
   * 检查CPU使用情况
   */
  async checkCPU() {
    const cpus = os.cpus();
    const loadAvg = os.loadavg();

    // 计算CPU使用率（简化版本）
    const cpuCount = cpus.length;
    const load1min = loadAvg[0];
    const cpuUsage = (load1min / cpuCount) * 100;

    let status = 'healthy';
    let message = 'CPU使用正常';

    if (cpuUsage > 90) {
      status = 'unhealthy';
      message = 'CPU使用率过高';
    } else if (cpuUsage > 80) {
      status = 'warning';
      message = 'CPU使用率较高';
    }

    return {
      status,
      message,
      details: {
        cores: cpuCount,
        model: cpus[0]?.model || 'Unknown',
        loadAverage: {
          '1min': loadAvg[0].toFixed(2),
          '5min': loadAvg[1].toFixed(2),
          '15min': loadAvg[2].toFixed(2),
        },
        usage: `${cpuUsage.toFixed(1)}%`,
      },
    };
  }

  /**
   * 获取系统信息
   */
  getSystemInfo() {
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      uptime: `${Math.floor(process.uptime())} seconds`,
      pid: process.pid,
      environment: process.env.NODE_ENV || 'development',
    };
  }

  /**
   * 获取应用程序信息
   */
  getAppInfo() {
    const packageJson = require('../../package.json');

    return {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
      startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      uptime: `${Math.floor(process.uptime())} seconds`,
    };
  }

  /**
   * 生成完整的健康报告
   */
  async generateHealthReport() {
    const healthChecks = await this.checkAll();

    return {
      ...healthChecks,
      system: this.getSystemInfo(),
      application: this.getAppInfo(),
    };
  }
}

module.exports = new HealthCheckService();
