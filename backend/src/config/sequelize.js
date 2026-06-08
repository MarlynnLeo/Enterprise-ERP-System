/**
 * sequelize.js
 * @description 后端业务逻辑文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { logger } = require('../utils/logger');
require('dotenv').config();
const { Sequelize } = require('sequelize');
const { getSequelizeConfig } = require('./database-config');

// 创建Sequelize实例 - 完全使用统一配置
const config = getSequelizeConfig();
const sequelize = new Sequelize(config.database, config.username, config.password, {
  host: config.host,
  port: config.port,
  dialect: config.dialect,
  logging: config.logging,
  pool: {
    ...config.pool,
    // 从池中取出连接前验证是否仍然有效
    validate: (connection) => {
      return connection && !connection._closing && !connection._protocolError;
    },
  },
  define: config.define,
  dialectOptions: config.dialectOptions, // 完全使用统一配置，不再本地覆写
  retry: config.retry, // 完全使用统一配置
  benchmark: config.benchmark,
  isolationLevel: config.isolationLevel,
  timezone: config.timezone,
});

// 验证连接并初始化
const initSequelize = async (retryCount = 0, maxRetries = 3) => {
  try {
    // 尝试连接数据库
    await sequelize.authenticate();

    return true;
  } catch {
    // Error logged
    if (retryCount < maxRetries) {
      const delay = Math.pow(2, retryCount) * 2000; // 指数退避：2s, 4s, 8s
      return new Promise((resolve) => {
        setTimeout(async () => {
          const result = await initSequelize(retryCount + 1, maxRetries);
          resolve(result);
        }, delay);
      });
    } else {
      logger.error('💥 数据库连接失败，已达到最大重试次数');
      logger.error('🔧 请检查数据库配置和网络连接');

      // 在开发环境中不退出进程，允许手动重试
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }

      return false;
    }
  }
};

// 启动连接
// 注: Sequelize 连接池关闭由 db.js 中的 gracefulShutdown 统一管理
initSequelize();

module.exports = sequelize;
