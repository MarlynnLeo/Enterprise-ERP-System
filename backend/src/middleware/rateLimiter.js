/**
 * rateLimiter.js
 * @description API限流中间件 — Redis 分布式 + 内存回退
 * @date 2026-04-18
 * @version 3.1.0
 *
 * ✅ v3.1: 修复 ERR_ERL_STORE_REUSE 和 ERR_ERL_DOUBLE_COUNT
 *   - 每个 limiter 使用独立的 RedisStore 实例（不同 prefix）
 *   - limiter 在初始化时创建一次，不在每次请求时重复创建
 */

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { logger } = require('../utils/logger');
const { RATE_LIMIT_CONFIG } = require('../config/security');
const { getRedisClient } = require('../config/redisClient');
const { ResponseHandler } = require('../utils/responseHandler');

const ALLOW_MEMORY_FALLBACK =
  process.env.NODE_ENV !== 'production' ||
  process.env.RATE_LIMIT_ALLOW_MEMORY_FALLBACK === 'true';

/**
 * 为指定配置创建 RedisStore（每个 limiter 独立实例）
 * @param {import('redis').RedisClientType} redisClient
 * @param {string} prefix - 唯一前缀
 */
function createRedisStore(redisClient, prefix) {
  return new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix,
  });
}

/**
 * 构建限流器
 * @param {object} config - 限流配置
 * @param {import('redis').RedisClientType|null} redisClient
 * @param {string} storePrefix - Redis key 前缀
 * @param {object} extra - 额外选项
 */
function buildLimiter(config, redisClient, storePrefix, extra = {}) {
  const opts = {
    windowMs: config.windowMs,
    max: config.max,
    standardHeaders: config.standardHeaders ?? true,
    legacyHeaders: config.legacyHeaders ?? false,
    message: config.message,
    ...extra,
  };

  // 如果 Redis 可用，创建独立的 RedisStore
  if (redisClient) {
    opts.store = createRedisStore(redisClient, storePrefix);
    logger.info(`Rate limiter enabled with Redis store: prefix=${storePrefix}`);
  }

  return rateLimit(opts);
}

// 限流器引用（延迟初始化）
let _apiLimiter = null;
let _authLimiter = null;
let _mfaLimiter = null;

/**
 * 初始化所有限流器（只执行一次）
 */
async function initLimiters() {
  let redisClient = null;
  try {
    redisClient = await getRedisClient();
  } catch (err) {
    if (!ALLOW_MEMORY_FALLBACK) {
      logger.error('Redis connection failed; production rate limiting cannot start safely', err);
      throw new Error(`Production rate limiting requires Redis: ${err.message}`, { cause: err });
    }
    logger.warn('Redis connection failed; rate limiting is using in-memory mode:', err.message);
  }

  if (!redisClient) {
    if (!ALLOW_MEMORY_FALLBACK) {
      throw new Error(
        'Production rate limiting requires Redis. Set RATE_LIMIT_ALLOW_MEMORY_FALLBACK=true only for an explicitly accepted single-instance deployment.'
      );
    }
    logger.warn('Redis is unavailable; rate limiting is using in-memory mode');
  }

  // 通用 API 限流器 — 独立 prefix: rl:api:
  _apiLimiter = buildLimiter(
    RATE_LIMIT_CONFIG.global,
    redisClient,
    'rl:api:',
    {
      skip: RATE_LIMIT_CONFIG.global.skip,
      handler: (req, res, _next, options) => {
        logger.warn(`API Rate Limit Exceeded: ${req.ip} -> ${req.originalUrl}`);
        ResponseHandler.error(
          res,
          options.message?.message || '请求过于频繁，请稍后再试',
          options.message?.code || 'RATE_LIMIT_EXCEEDED',
          options.statusCode
        );
      },
    }
  );

  // 登录/认证限流器 — 独立 prefix: rl:auth:
  _authLimiter = buildLimiter(
    RATE_LIMIT_CONFIG.login,
    redisClient,
    'rl:auth:',
    {
      skipSuccessfulRequests: RATE_LIMIT_CONFIG.login.skipSuccessfulRequests,
      handler: (req, res, _next, options) => {
        logger.warn(`Auth Rate Limit Exceeded: ${req.ip}`);
        ResponseHandler.error(
          res,
          options.message?.message || '登录尝试次数过多，请稍后再试',
          options.message?.code || 'AUTH_RATE_LIMIT_EXCEEDED',
          options.statusCode
        );
      },
    }
  );

  _mfaLimiter = buildLimiter(
    RATE_LIMIT_CONFIG.mfa,
    redisClient,
    'rl:mfa:',
    {
      skipSuccessfulRequests: RATE_LIMIT_CONFIG.mfa.skipSuccessfulRequests,
      handler: (req, res, _next, options) => {
        logger.warn(`MFA Rate Limit Exceeded: ${req.ip}`);
        ResponseHandler.error(
          res,
          options.message?.message || '多因素认证尝试过于频繁，请稍后再试',
          options.message?.code || 'MFA_RATE_LIMIT_EXCEEDED',
          options.statusCode
        );
      },
    }
  );
}

// 启动时异步初始化
const storeReady = initLimiters();

// 通用API限流（等待初始化完成后代理到真实 limiter）
const apiLimiter = (req, res, next) => {
  if (_apiLimiter) {
    return _apiLimiter(req, res, next);
  }
  // 初始化尚未完成，等待后执行
  storeReady
    .then(() => _apiLimiter(req, res, next))
    .catch((error) => {
      logger.error('API rate limiter initialization failed', error);
      ResponseHandler.error(
        res,
        '请求保护服务暂不可用，请稍后重试',
        'RATE_LIMIT_SERVICE_UNAVAILABLE',
        503
      );
    });
};

// 登录/认证接口限流
const authLimiter = (req, res, next) => {
  if (_authLimiter) {
    return _authLimiter(req, res, next);
  }
  storeReady
    .then(() => _authLimiter(req, res, next))
    .catch((error) => {
      logger.error('Authentication rate limiter initialization failed', error);
      ResponseHandler.error(
        res,
        '登录保护服务暂不可用，请稍后重试',
        'AUTH_RATE_LIMIT_SERVICE_UNAVAILABLE',
        503
      );
    });
};

const mfaLimiter = (req, res, next) => {
  if (_mfaLimiter) return _mfaLimiter(req, res, next);
  storeReady
    .then(() => _mfaLimiter(req, res, next))
    .catch((error) => {
      logger.error('MFA rate limiter initialization failed', error);
      ResponseHandler.error(
        res,
        '多因素认证保护服务暂不可用，请稍后重试',
        'MFA_RATE_LIMIT_SERVICE_UNAVAILABLE',
        503
      );
    });
};

// 导出限流器
module.exports = {
  apiLimiter,
  authLimiter,
  mfaLimiter,
};
