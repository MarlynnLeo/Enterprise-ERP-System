/**
 * csrfEnhanced.js
 * @description 增强的CSRF保护中间件 (使用 csrf-csrf)
 * @date 2025-12-18
 * @version 2.0.0
 * @changes 从 csurf 迁移到 csrf-csrf (更安全、更现代)
 */

const { doubleCsrf } = require('csrf-csrf');
const crypto = require('crypto');
const { logger } = require('../utils/logger');
const { ResponseHandler } = require('../utils/responseHandler');
const {
  clearCsrfCookies,
  getCookieSameSite,
  getCsrfCookieName,
  shouldUseSecureCookies,
} = require('../utils/cookieSecurity');

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

if (isProduction && !process.env.CSRF_SECRET) {
  throw new Error('CSRF_SECRET environment variable is required in production.');
}

const developmentCsrfSecret = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');
if (!isProduction && !isTest && !process.env.CSRF_SECRET) {
  logger.warn('CSRF_SECRET 未配置，开发环境将使用本次进程生成的临时密钥');
}

const getCsrfSecret = () => process.env.CSRF_SECRET || developmentCsrfSecret;

const getSessionIdentifier = (req) => {
  const access =
    req.cookies?.accessToken || req.cookies?.token || req.signedCookies?.accessToken || '';
  if (access && typeof access === 'string') {
    return `sess:${access.slice(0, 48)}`;
  }
  const uid = req.user?.id;
  if (uid) return `uid:${uid}`;
  return `ip:${req.ip || 'anonymous'}`;
};

const createCsrfVariant = (secure) =>
  doubleCsrf({
    getSecret: getCsrfSecret,
    getSessionIdentifier,
    cookieName: secure ? getCsrfCookieName({ secure: true, protocol: 'https' }) : getCsrfCookieName({ protocol: 'http' }),
    cookieOptions: {
      httpOnly: true,
      secure,
      sameSite: getCookieSameSite(),
      path: '/',
      maxAge: 86400000,
    },
    size: 64,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getTokenFromRequest: (req) => req.headers['x-csrf-token'] || req.body._csrf,
  });

const csrfVariants = {
  secure: createCsrfVariant(true),
  insecure: createCsrfVariant(false),
};

const getCsrfVariant = (req) =>
  shouldUseSecureCookies(req) ? csrfVariants.secure : csrfVariants.insecure;

const generateCsrfToken = (req, res) => getCsrfVariant(req).generateCsrfToken(req, res);

const doubleCsrfProtection = (req, res, next) =>
  getCsrfVariant(req).doubleCsrfProtection(req, res, next);

/**
 * CSRF Token获取端点
 */
const getCsrfToken = (req, res) => {
  // Ensure only the cookie variant for the current transport remains.
  clearCsrfCookies(res);
  const csrfToken = generateCsrfToken(req, res);
  res.json({
    success: true,
    csrfToken: csrfToken,
  });
};

/**
 * CSRF错误处理中间件
 */
const csrfErrorHandler = (err, req, res, next) => {
  // csrf-csrf 抛出的错误信息不同
  if (err && (err.code === 'EBADCSRFTOKEN' || err.message?.includes('csrf'))) {
    logger.warn('CSRF验证失败:', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      error: err.message,
    });

    return ResponseHandler.error(
      res,
      'CSRF令牌无效或已过期，请刷新页面后重试',
      'INVALID_CSRF_TOKEN',
      403
    );
  }

  next(err);
};

/**
 * 条件CSRF保护 - 某些端点可以跳过
 */
const conditionalCsrfProtection = (req, res, next) => {
  // 跳过GET、HEAD、OPTIONS请求 (已在 doubleCsrf 配置中设置)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // 跳过公开API端点
  if (req.path.startsWith('/api/public/')) {
    return next();
  }

  // 跳过健康检查（含根路径别名）
  if (
    req.path === '/api/ping' ||
    req.path === '/api/health' ||
    req.path === '/ping' ||
    req.path === '/health'
  ) {
    return next();
  }

  // 跳过认证端点（登录/注册/刷新Token不需要CSRF保护）
  if (req.path === '/api/auth/login' || req.path === '/api/auth/register' || req.path === '/api/auth/refresh') {
    return next();
  }

  // 跳过钉钉事件回调端点（使用独立的签名验证）
  if (req.path === '/api/dingtalk/callback') {
    return next();
  }

  // ✅ 安全修复: 已移除基于 User-Agent 的跳过（可被伪造）
  // ✅ 安全修复: 已移除 /api/admin/ 无条件跳过

  // Pure Bearer API clients do not rely on browser cookies, so they can skip
  // CSRF. Browser cookie sessions must still pass CSRF even if a legacy
  // Authorization header is also present.
  const authHeader = req.get('Authorization') || '';
  const hasAuthCookie = Boolean(req.cookies?.accessToken || req.cookies?.refreshToken);
  if (authHeader.startsWith('Bearer ') && !hasAuthCookie) {
    return next();
  }

  // 应用CSRF保护
  doubleCsrfProtection(req, res, next);
};

module.exports = {
  csrfProtection: doubleCsrfProtection, // 保持向后兼容
  conditionalCsrfProtection,
  getCsrfToken,
  csrfErrorHandler,
  generateCsrfToken, // 导出 token 生成函数
};
