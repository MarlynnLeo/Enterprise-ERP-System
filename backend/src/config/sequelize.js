/**
 * sequelize.js
 * @description 后端业务逻辑文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const logger = require('../utils/logger');
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

    // 设置连接事件监听（如果支持）
    try {
      setupConnectionEventListeners();
    } catch (hookError) {
      logger.warn('⚠️  跳过事件监听器设置:', hookError.message);
    }

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

// 设置连接事件监听器 - 优化版本
const setupConnectionEventListeners = () => {
  try {
    // 只在开发环境显示详细连接信息
    if (process.env.NODE_ENV === 'development') {
      sequelize.addHook('afterConnect', (_connection) => {
        // 连接成功，无需额外操作
      });
    }

    // 优化断开连接的监听 - 减少日志噪音
    sequelize.addHook('beforeDisconnect', (_connection) => {
      // 只在开发环境且启用详细日志时显示
      if (process.env.NODE_ENV === 'development' && process.env.ENABLE_DEBUG_LOG === 'true') {
        // 断开连接前的操作
      }
    });

    // 添加错误监听
    sequelize.addHook('afterDisconnect', (_connection) => {
      if (process.env.NODE_ENV === 'development') {
        // 断开连接后的操作
      }
    });
  } catch (error) {
    logger.warn('⚠️  设置连接事件监听器失败:', error.message);
  }
};

// 优雅关闭数据库连接
const closeSequelize = async () => {
  try {
    await sequelize.close();
    logger.info('🔒 数据库连接已关闭');
  } catch {
    // Error logged
  }
};

// 进程退出时关闭连接
process.on('SIGINT', async () => {
  logger.info('\n📴 收到退出信号，正在关闭数据库连接...');
  await closeSequelize();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('\n📴 收到终止信号，正在关闭数据库连接...');
  await closeSequelize();
  process.exit(0);
});

// 启动连接
initSequelize();

module.exports = sequelize;
