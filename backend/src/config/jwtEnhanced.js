/**
 * jwtEnhanced.js
 * @description 增强的JWT配置，支持access token和refresh token
 * @date 2025-11-21
 * @version 2.0.0
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { logger } = require('../utils/logger');
const {
  buildAuthCookieOptions,
  clearAuthCookies,
  clearCsrfCookies,
} = require('../utils/cookieSecurity');

const ALLOWED_JWT_ALGORITHMS = Object.freeze(['HS256']);

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

if (!ALLOWED_JWT_ALGORITHMS.includes(String(process.env.JWT_ALGORITHM || 'HS256'))) {
  throw new Error(`Unsupported JWT_ALGORITHM. Allowed values: ${ALLOWED_JWT_ALGORITHMS.join(', ')}`);
}

for (const [name, value] of Object.entries({
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
})) {
  if (process.env.NODE_ENV === 'production' && Buffer.byteLength(String(value), 'utf8') < 32) {
    throw new Error(`${name} must be at least 32 bytes in production`);
  }
}

// JWT配置
const JWT_CONFIG = {
  accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '2h', // 2小时
  refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d', // 7天
  accessSecret: process.env.JWT_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
  issuer: process.env.JWT_ISSUER || 'erp-system',
  audience: process.env.JWT_AUDIENCE || 'erp-users',
  algorithm: process.env.JWT_ALGORITHM || 'HS256',
};

/**
 * 生成访问令牌和刷新令牌
 * ✅ 安全优化: JWT中只存储最小必要信息(id, username)
 * 不再存储role等敏感信息,所有权限判断都从数据库获取
 * @param {Object} user - 用户对象
 * @returns {Object} { accessToken, refreshToken }
 */
const generateTokens = (user, options = {}) => {
  const refreshJti = options.refreshJti || crypto.randomUUID();
  const refreshFamilyId = options.refreshFamilyId || crypto.randomUUID();
  // ✅ 安全优化: 只存储id和username,不存储role
  // 权限信息应该从数据库实时获取,而不是信任JWT中的数据
  const payload = {
    id: user.id,
    username: user.username,
    tokenVersion: Number(user.token_version || 0),
    type: 'access',
    // ❌ 不再存储: role, permissions等敏感信息
  };

  const accessToken = jwt.sign(payload, JWT_CONFIG.accessSecret, {
    expiresIn: JWT_CONFIG.accessTokenExpiry,
    issuer: JWT_CONFIG.issuer,
    audience: JWT_CONFIG.audience,
    algorithm: JWT_CONFIG.algorithm,
    subject: String(user.id),
  });

  const refreshToken = jwt.sign(
    {
      id: user.id,
      type: 'refresh',
      tokenVersion: user.token_version || 0, // 用于token撤销
      familyId: refreshFamilyId,
    },
    JWT_CONFIG.refreshSecret,
    {
      expiresIn: JWT_CONFIG.refreshTokenExpiry,
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
      algorithm: JWT_CONFIG.algorithm,
      subject: String(user.id),
      jwtid: refreshJti,
    }
  );

  return { accessToken, refreshToken, refreshJti, refreshFamilyId };
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
    const decoded = jwt.verify(token, JWT_CONFIG.accessSecret, {
      algorithms: [JWT_CONFIG.algorithm],
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
    });
    if (decoded.type !== 'access') throw new Error('访问令牌类型错误');
    return decoded;
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
    const decoded = jwt.verify(token, JWT_CONFIG.refreshSecret, {
      algorithms: [JWT_CONFIG.algorithm],
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
    });
    if (decoded.type !== 'refresh' || !decoded.jti || !decoded.familyId) {
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
  ALLOWED_JWT_ALGORITHMS,
};
