/**
 * 系统健康检查控制器
 * @description 提供系统状态和数据库连接检查
 * @author 系统
 * @date 2025-09-04
 */

const { ResponseHandler } = require('../../utils/responseHandler');

// 使用统一的连接池，不再自建裸连接
const { pool } = require('../../config/db');
const sequelize = require('../../config/sequelize');
const { getBasicConfig } = require('../../config/database-config');

class HealthController {
  /**
   * 系统健康检查
   */
  static async healthCheck(req, res) {
    try {
      const startTime = Date.now();

      // 检查各个组件状态
      const checks = await Promise.allSettled([
        HealthController.checkDatabase(),
        HealthController.checkSequelize(),
        HealthController.checkRedis(),
        HealthController.checkMemory(),
        HealthController.checkDisk(),
      ]);

      const [database, sequelizeCheck, redis, memory, disk] = checks;

      const responseTime = Date.now() - startTime;

      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        checks: {
          database:
            database.status === 'fulfilled'
              ? database.value
              : { status: 'error', error: database.reason?.message },
          sequelize:
            sequelizeCheck.status === 'fulfilled'
              ? sequelizeCheck.value
              : { status: 'error', error: sequelizeCheck.reason?.message },
          redis:
            redis.status === 'fulfilled'
              ? redis.value
              : { status: 'error', error: redis.reason?.message },
          memory:
            memory.status === 'fulfilled'
              ? memory.value
              : { status: 'error', error: memory.reason?.message },
          disk:
            disk.status === 'fulfilled'
              ? disk.value
              : { status: 'error', error: disk.reason?.message },
        },
      };

      // 判断整体健康状态
      const hasErrors = Object.values(health.checks).some((check) => check.status === 'error');
      if (hasErrors) {
        health.status = 'degraded';
      }

      const statusCode = health.status === 'healthy' ? 200 : 503;

      res.status(statusCode).json({
        success: health.status === 'healthy',
        data: health,
      });
    } catch (error) {
      ResponseHandler.error(res, '健康检查失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 数据库连接检查
   */
  static async checkDatabase() {
    try {
      const startTime = Date.now();
      const config = getBasicConfig();

      // 使用统一的连接池而不是每次创建临时连接
      const [rows] = await pool.execute('SELECT 1 as test');
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        host: config.host,
        port: config.port,
        database: config.database,
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        code: error.code,
      };
    }
  }

  /**
   * Sequelize连接检查
   */
  static async checkSequelize() {
    try {
      const startTime = Date.now();

      await sequelize.authenticate();
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        dialect: sequelize.getDialect(),
        version: sequelize.getDatabaseVersion ? await sequelize.getDatabaseVersion() : 'unknown',
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  /**
   * Redis连接检查
   */
  static async checkRedis() {
    try {
      // 这里可以添加Redis连接检查
      // 如果没有Redis，返回跳过状态
      return {
        status: 'skipped',
        message: 'Redis检查已跳过',
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  /**
   * 内存使用检查
   */
  static async checkMemory() {
    try {
      const memUsage = process.memoryUsage();
      const totalMem = require('os').totalmem();
      const freeMem = require('os').freemem();

      const usedMemoryMB = Math.round(memUsage.rss / 1024 / 1024);
      const totalMemoryGB = Math.round((totalMem / 1024 / 1024 / 1024) * 100) / 100;
      const freeMemoryGB = Math.round((freeMem / 1024 / 1024 / 1024) * 100) / 100;

      const memoryUsagePercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

      return {
        status: memoryUsagePercent > 90 ? 'warning' : 'healthy',
        processMemory: `${usedMemoryMB}MB`,
        systemMemory: {
          total: `${totalMemoryGB}GB`,
          free: `${freeMemoryGB}GB`,
          usage: `${memoryUsagePercent}%`,
        },
        details: {
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  /**
   * 磁盘空间检查
   */
  static async checkDisk() {
    try {
      const fs = require('fs');
      const path = require('path');

      const stats = fs.statSync(path.resolve('./'));

      return {
        status: 'healthy',
        message: '磁盘检查已简化',
        workingDirectory: process.cwd(),
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  /**
   * 数据库详细状态
   */
  static async databaseStatus(req, res) {
    try {
      const config = getBasicConfig();

      // 使用统一的连接池
      const [versionRows] = await pool.query('SELECT VERSION() as version');
      const [processRows] = await pool.query('SHOW PROCESSLIST');
      const [sizeRows] = await pool.query(
        `SELECT 
          table_schema as 'database_name',
          ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as 'size_mb'
        FROM information_schema.tables 
        WHERE table_schema = ?
        GROUP BY table_schema`,
        [config.database]
      );
      const [tableRows] = await pool.query(
        `SELECT COUNT(*) as table_count 
        FROM information_schema.tables 
        WHERE table_schema = ?`,
        [config.database]
      );

      res.json({
        success: true,
        data: {
          connection: {
            host: config.host,
            port: config.port,
            database: config.database,
            status: 'connected',
          },
          version: versionRows[0].version,
          connections: processRows.length,
          database: {
            name: config.database,
            size: sizeRows[0] ? `${sizeRows[0].size_mb}MB` : 'unknown',
            tables: tableRows[0].table_count,
          },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      ResponseHandler.error(res, '获取数据库状态失败', 'SERVER_ERROR', 500, error);
    }
  }
}

module.exports = HealthController;
