/**
 * jwtEnhanced.js
 * @description 增强的JWT配置，支持access token和refresh token
 * @date 2025-11-21
 * @version 2.0.0
 */

const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const {
  buildAuthCookieOptions,
  clearAuthCookies,
  clearCsrfCookies,
} = require('../utils/cookieSecurity');

// 验证JWT密钥环境变量
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required. Please set it in your .env file.');
}

if (!process.env.JWT_REFRESH_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_REFRESH_SECRET environment variable is required in production. ' +
      'Using the same secret for access and refresh tokens is a security risk.'
    );
  }
  logger.warn(
    'JWT_REFRESH_SECRET not set, using JWT_SECRET as fallback. This is not recommended for production.'
  );
}

// JWT配置
const JWT_CONFIG = {
  accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '2h', // 2小时
  refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d', // 7天
  accessSecret: process.env.JWT_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
};

/**
 * 生成访问令牌和刷新令牌
 * ✅ 安全优化: JWT中只存储最小必要信息(id, username)
 * 不再存储role等敏感信息,所有权限判断都从数据库获取
 * @param {Object} user - 用户对象
 * @returns {Object} { accessToken, refreshToken }
 */
const generateTokens = (user) => {
  // ✅ 安全优化: 只存储id和username,不存储role
  // 权限信息应该从数据库实时获取,而不是信任JWT中的数据
  const payload = {
    id: user.id,
    username: user.username,
    tokenVersion: Number(user.token_version || 0),
    // ❌ 不再存储: role, permissions等敏感信息
  };

  const accessToken = jwt.sign(payload, JWT_CONFIG.accessSecret, {
    expiresIn: JWT_CONFIG.accessTokenExpiry,
  });

  const refreshToken = jwt.sign(
    {
      id: user.id,
      type: 'refresh',
      tokenVersion: user.token_version || 0, // 用于token撤销
    },
    JWT_CONFIG.refreshSecret,
    { expiresIn: JWT_CONFIG.refreshTokenExpiry }
  );

  return { accessToken, refreshToken };
};

/**
 * 生成访问令牌（兼容旧版本）
 * @param {Object} user - 用户对象
 * @returns {string} accessToken
 */
const generateToken = (user) => {
  const { accessToken } = generateTokens(user);
  return accessToken;
};

/**
 * 验证访问令牌
 * @param {string} token - JWT令牌
 * @returns {Object} 解码后的payload
 * @throws {Error} 令牌无效或过期
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, JWT_CONFIG.accessSecret);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('访问令牌已过期', { cause: error });
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('访问令牌无效', { cause: error });
    }
    throw error;
  }
};

/**
 * 验证刷新令牌
 * @param {string} token - 刷新令牌
 * @returns {Object} 解码后的payload
 * @throws {Error} 令牌无效或过期
 */
const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_CONFIG.refreshSecret);
    if (decoded.type !== 'refresh') {
      throw new Error('令牌类型错误');
    }
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('刷新令牌已过期', { cause: error });
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('刷新令牌无效', { cause: error });
    }
    throw error;
  }
};

/**
 * 从Cookie中获取令牌
 * @param {Object} req - Express请求对象
 * @returns {Object} { accessToken, refreshToken }
 */
const getTokensFromCookies = (req) => {
  return {
    accessToken: req.cookies?.accessToken,
    refreshToken: req.cookies?.refreshToken,
  };
};

/**
 * 设置令牌到Cookie
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {string} accessToken - 访问令牌
 * @param {string} refreshToken - 刷新令牌
 */
const setTokensToCookies = (req, res, accessToken, refreshToken) => {
  // Clear secure/insecure variants first so mixed HTTP/HTTPS entry points do
  // not leave behind a stale cookie the browser cannot overwrite.
  clearAuthCookies(res);

  const cookieMeta = buildAuthCookieOptions(req);

  res.cookie(
    'accessToken',
    accessToken,
    buildAuthCookieOptions(req, { maxAge: 2 * 60 * 60 * 1000 })
  );

  res.cookie(
    'refreshToken',
    refreshToken,
    buildAuthCookieOptions(req, { maxAge: 7 * 24 * 60 * 60 * 1000 })
  );

  logger.debug('Token cookies have been set', {
    accessTokenSet: !!accessToken,
    refreshTokenSet: !!refreshToken,
    secure: cookieMeta.secure,
    sameSite: cookieMeta.sameSite,
  });
};

/**
 * Clear token cookies (and related CSRF cookies)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const clearTokenCookies = (req, res) => {
  clearAuthCookies(res);
  clearCsrfCookies(res);
  logger.info('Token cookies have been cleared');
};

module.exports = {
  generateToken,
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  getTokensFromCookies,
  setTokensToCookies,
  clearTokenCookies,
  JWT_CONFIG,
};
