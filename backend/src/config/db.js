/**
 * db.js
 * @description 后端数据库连接与查询核心模块
 * @date 2025-08-27
 * @version 2.0.0 - 集成 SafePool 自动重试机制
 */

require('dotenv').config();
const logger = require('../utils/logger');
// bcrypt 已移至 seeds/001_default_admin_and_roles.js，此处不再需要
const { getPoolConfig, getPoolSafetyConfig } = require('./database-config');
const poolFactory = require('../database/ConnectionPoolFactory');
const { DBManager } = require('../database/DBManager');

// 获取安全保护配置
const safetyConfig = getPoolSafetyConfig();

// 创建主连接池（包含连接自动回收保护）
const { pool: rawPool, manager } = poolFactory.createPool('main', getPoolConfig(), {
  healthCheckInterval: 15000, // 15秒检查一次
  healthCheckTimeout: 3000, // 3秒超时
  connectionTimeout: 10000, // 10秒连接超时
  enableMetrics: true,
  enableLeakDetection: process.env.NODE_ENV !== 'production',
  leakDetectionThreshold: 30000,
  warmupEnabled: true,
  warmupConnections: 2,
  // 连接泄漏安全保护
  maxConnectionHoldTime: safetyConfig.maxConnectionHoldTime,
  acquireTimeout: safetyConfig.acquireTimeout,
});

// 直接使用原生连接池，依靠底层 enableKeepAlive 和 idleTimeout 来管理健康连接
const pool = rawPool;

// 启动连接池管理器(异步)
(async () => {
  try {
    await manager.start();

    // 初始化数据库管理器
    const dbManager = new DBManager('main');
    dbManager.initialize();

    logger.info('✅ 数据库系统初始化完成');
  } catch (error) {
    logger.error('❌ 数据库系统初始化失败:', error);
    process.exit(1);
  }
})();

// 监听管理器事件
manager.on('health:critical', ({ failedCount }) => {
  logger.error(`⚠️  数据库连接池健康检查严重失败 (${failedCount}次),请立即检查数据库连接`);
});

manager.on('leak:detected', (leaks) => {
  logger.warn(`⚠️  检测到 ${leaks.length} 个可能的连接泄漏`);
});

// 优雅关闭处理
const gracefulShutdown = async (signal) => {
  logger.info(`收到${signal}信号,开始优雅关闭...`);

  try {
    // 关闭 Redis 连接
    try {
      const { closeRedis } = require('./redisClient');
      await closeRedis();
    } catch (_) { /* Redis 可能未启用 */ }

    await poolFactory.closeAll();
    logger.info('✅ 所有数据库连接池已关闭');
    process.exit(0);
  } catch (error) {
    logger.error('关闭数据库连接池失败:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGUSR2', async () => {
  logger.info(`收到 SIGUSR2 信号(nodemon),开始优雅关闭...`);
  try {
    await poolFactory.closeAll();
    logger.info('✅ 所有数据库连接池已关闭');
    process.kill(process.pid, 'SIGUSR2');
  } catch (error) {
    logger.error('关闭数据库连接池失败:', error);
    process.exit(1);
  }
});

// 统一查询接口（提供给老代码使用）
const query = async (sql, params) => {
  // 清理参数：将undefined转换为null
  const cleanParams = params ? params.map((param) => (param === undefined ? null : param)) : [];

  const [result] = await pool.execute(sql, cleanParams);
  return {
    rows: result,
    insertId: result.insertId,
    affectedRows: result.affectedRows,
  };
};

// 工具函数：确保参数为数字类型
const ensureNumber = (value, defaultValue = 0) => {
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
};

// 获取事务连接客户端
// 用于需要显式管理事务的地方（BEGIN, COMMIT, ROLLBACK）
// 注意：SafePool 已经在 pool.getConnection 层统一处理了重试逻辑
const getClient = async () => {
  const connection = await pool.getConnection();

  // 保存原始方法的引用
  const originalQuery = connection.query.bind(connection);
  const originalExecute = connection.execute.bind(connection);

  // 仅做返回值格式兼容，返回前端需要的结果结构
  connection.query = async (sql, params) => {
    const upperSql = sql.trim().toUpperCase();
    if (upperSql === 'BEGIN' || upperSql === 'COMMIT' || upperSql === 'ROLLBACK') {
      await originalQuery(sql);
      return { success: true, rows: [] };
    } else {
      const safeParams = Array.isArray(params) ? params : params ? [params] : [];
      const [rows] = await originalExecute(sql, safeParams);
      return {
        success: true,
        rows: rows,
        insertId: rows.insertId,
        affectedRows: rows.affectedRows,
      };
    }
  };
  
  return connection;
};

// 直接获取原始连接（已受 SafePool 保护）
const getConnection = async () => {
  return await pool.getConnection();
};

/**
 * @deprecated 表结构已迁移至 Knex 迁移文件 (migrations/) 管理，种子数据由 seeds/ 管理
 * 此函数保留为空操作以维持向后兼容
 */
async function initDatabase() {
  // 表结构由 migrations/20260312000001-000010 管理
  // 种子数据由 seeds/001_default_admin_and_roles.js 管理
  // 启动时由 index.js 中 knex.migrate.latest() 自动执行迁移
}

// Initialize database on module load
initDatabase();

// Database access functions
module.exports = {
  pool,
  query,
  getClient,
  getConnection,
  ensureNumber,
  initDatabase,
};
