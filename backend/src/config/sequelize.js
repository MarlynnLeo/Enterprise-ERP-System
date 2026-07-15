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

const isTestRuntime = process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);
let initRetryTimer = null;
let pendingRetryResolve = null;
let initializationCancelled = false;
let initPromise = null;

const getDefaultMaxRetries = () => (isTestRuntime ? 0 : 3);

const clearInitRetryTimer = () => {
  if (initRetryTimer) {
    clearTimeout(initRetryTimer);
    initRetryTimer = null;
  }

  if (pendingRetryResolve) {
    pendingRetryResolve(false);
    pendingRetryResolve = null;
  }
};

const waitForRetry = (delay) =>
  new Promise((resolve) => {
    pendingRetryResolve = resolve;
    initRetryTimer = setTimeout(() => {
      initRetryTimer = null;
      pendingRetryResolve = null;
      resolve(true);
    }, delay);
    initRetryTimer.unref?.();
  });

// 验证连接并初始化
const initSequelize = async (retryCount = 0, maxRetries = getDefaultMaxRetries()) => {
  if (initializationCancelled) {
    return false;
  }

  try {
    // 尝试连接数据库
    await sequelize.authenticate();

    return true;
  } catch (error) {
    if (initializationCancelled) {
      return false;
    }

    if (retryCount < maxRetries) {
      const delay = Math.pow(2, retryCount) * 2000; // 指数退避：2s, 4s, 8s
      const shouldRetry = await waitForRetry(delay);
      if (!shouldRetry || initializationCancelled) {
        return false;
      }

      return initSequelize(retryCount + 1, maxRetries);
    }

    logger.error('Database connection failed after maximum retries', {
      message: error.message,
      attempts: retryCount + 1,
      maxRetries,
    });

    // 在生产环境中数据库不可用时终止进程，避免服务以不完整状态运行
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }

    return false;
  }
};

const startSequelizeInitialization = (options = {}) => {
  initializationCancelled = false;

  if (!initPromise) {
    const maxRetries = options.maxRetries ?? getDefaultMaxRetries();
    initPromise = initSequelize(0, maxRetries).finally(() => {
      initPromise = null;
    });
  }

  return initPromise;
};

const stopSequelizeInitialization = () => {
  initializationCancelled = true;
  clearInitRetryTimer();
};

// 启动连接
// 注: Sequelize 连接池关闭由 db.js 中的 gracefulShutdown 统一管理
if (!isTestRuntime || process.env.SEQUELIZE_AUTO_INIT === 'true') {
  startSequelizeInitialization();
}

sequelize.initSequelize = startSequelizeInitialization;
sequelize.stopInitialization = stopSequelizeInitialization;

module.exports = sequelize;
