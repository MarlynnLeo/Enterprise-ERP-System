/**
 * 数据库监控服务（极简版）
 * 监控目前统一合并的数据库连接池
 *
 * @author ERP System
 * @version 3.0.0
 */

const { pool } = require('../config/db');
const logger = require('../utils/logger');

class DatabaseMonitorService {
  /**
   * 获取所有连接池的健康状态
   */
  static async getPoolsHealth() {
    try {
      // 检查底层连接
      const connection = await pool.getConnection();
      try {
        await connection.ping();
      } finally {
        connection.release();
      }

      return {
        status: 'healthy',
        pools: {
          main: {
            status: 'healthy',
            message: 'Connected',
          }
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('获取连接池健康状态失败:', error);
      return {
        status: 'unhealthy',
        pools: {
          main: {
            status: 'unhealthy',
            error: error.message,
          }
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  static getPoolsStats() {
    return {
      message: '原生 mysql2 pool 使用中，高级监控指标已禁用。',
      timestamp: new Date().toISOString(),
    };
  }

  static getPoolHealth() {
    return this.getPoolsHealth();
  }

  static getPoolStats() {
    return this.getPoolsStats();
  }

  static resetPoolMetrics() {
    return { success: true, message: '指标不支持重置' };
  }

  static getPoolNames() {
    return ['main'];
  }

  static async generateMonitorReport() {
    return await this.getPoolsHealth();
  }
}

module.exports = DatabaseMonitorService;
