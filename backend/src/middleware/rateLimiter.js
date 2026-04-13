/**
 * rateLimiter.js
 * @description API限流中间件 - 统一使用 security.js 中的配置
 * @date 2026-04-10
 * @version 2.0.0
 *
 * ✅ 重构: 消除与 security.js 的配置重复和不一致
 * 所有限流参数统一从 RATE_LIMIT_CONFIG 读取
 */

const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');
const { RATE_LIMIT_CONFIG } = require('../config/security');

// 通用API限流 — 从 security.js 统一配置读取
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.global.windowMs,
  max: RATE_LIMIT_CONFIG.global.max,
  standardHeaders: RATE_LIMIT_CONFIG.global.standardHeaders,
  legacyHeaders: RATE_LIMIT_CONFIG.global.legacyHeaders,
  message: RATE_LIMIT_CONFIG.global.message,
  skip: RATE_LIMIT_CONFIG.global.skip,
  handler: (req, res, next, options) => {
    logger.warn(`API Rate Limit Exceeded: ${req.ip} -> ${req.originalUrl}`);
    res.status(options.statusCode).json(options.message);
  },
});

// 登录/认证接口限流 — 从 security.js 统一配置读取
const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.login.windowMs,
  max: RATE_LIMIT_CONFIG.login.max,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: RATE_LIMIT_CONFIG.login.skipSuccessfulRequests,
  message: RATE_LIMIT_CONFIG.login.message,
  handler: (req, res, next, options) => {
    logger.warn(`Auth Rate Limit Exceeded: ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
});

// 导出限流器
module.exports = {
  apiLimiter,
  authLimiter,
};
