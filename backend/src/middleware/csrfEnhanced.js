/**
 * csrfEnhanced.js
 * @description 增强的CSRF保护中间件 (使用 csrf-csrf)
 * @date 2025-12-18
 * @version 2.0.0
 * @changes 从 csurf 迁移到 csrf-csrf (更安全、更现代)
 */

const { doubleCsrf } = require('csrf-csrf');
const { logger } = require('../utils/logger');

// 配置 CSRF 保护
const {
  generateToken, // 生成 CSRF token
  doubleCsrfProtection, // CSRF 保护中间件
} = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,
  cookieName: '__Host-psifi.x-csrf-token', // 推荐的安全 cookie 名称
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 86400000, // 24小时
  },
  size: 64, // token 大小
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'], // 忽略的 HTTP 方法
  getTokenFromRequest: (req) => {
    // 从请求头或请求体中获取 token
    return req.headers['x-csrf-token'] || req.body._csrf;
  },
});

/**
 * CSRF Token获取端点
 */
const getCsrfToken = (req, res) => {
  const csrfToken = generateToken(req, res);
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

    return res.status(403).json({
      success: false,
      message: 'CSRF令牌无效或已过期，请刷新页面后重试',
      code: 'INVALID_CSRF_TOKEN',
    });
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

  // 跳过健康检查
  if (req.path === '/api/ping' || req.path === '/api/health') {
    return next();
  }

  // 跳过认证端点（登录/注册/刷新Token不需要CSRF保护）
  if (req.path === '/api/auth/login' || req.path === '/api/auth/register' || req.path === '/api/auth/refresh') {
    return next();
  }

  // 跳过打印API端点（打印功能使用token认证）
  if (req.path.startsWith('/api/print/')) {
    return next();
  }

  // 跳过管理员工具API端点（临时修复工具）
  if (req.path.startsWith('/api/admin/')) {
    return next();
  }

  // 跳过钉钉集成API端点（回调和内部同步）
  if (req.path.startsWith('/api/dingtalk/')) {
    return next();
  }

  // 移动端或API调用可能使用JWT而非Cookie，跳过CSRF
  const userAgent = req.get('User-Agent') || '';
  if (userAgent.includes('Mobile') || userAgent.includes('App')) {
    return next();
  }

  // 携带 JWT Bearer Token 的请求天然免疫 CSRF 攻击，无需二次校验
  const authHeader = req.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
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
  generateToken, // 导出 token 生成函数
};
