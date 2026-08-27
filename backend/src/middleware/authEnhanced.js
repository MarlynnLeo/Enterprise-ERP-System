/**
 * authEnhanced.js
 * @description 增强的认证中间件，支持Cookie和refresh token
 * @date 2025-11-21
 * @version 2.0.0
 */

const {
  verifyAccessToken,
  verifyRefreshToken,
  getTokensFromCookies,
  clearTokenCookies,
} = require('../config/jwtEnhanced');
const { logger } = require('../utils/logger');
const { ResponseHandler } = require('../utils/responseHandler');
const { pool } = require('../config/db');
const PasswordSecurity = require('../utils/passwordSecurity');
const {
  isTransientDatabaseError,
  retryTransientDatabaseRead,
} = require('../utils/databaseAvailability');

// 生产环境强制关闭遗留 token（无 tokenVersion 一律拒绝）
const allowLegacyAccessTokens =
  process.env.NODE_ENV !== 'production' && process.env.ALLOW_LEGACY_ACCESS_TOKENS === 'true';

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_LEGACY_ACCESS_TOKENS === 'true') {
  // 启动时仅 warn 一次（模块加载）
  const { logger: bootLogger } = require('../utils/logger');
  bootLogger.warn(
    '[安全] 生产环境已忽略 ALLOW_LEGACY_ACCESS_TOKENS=true，必须使用带 tokenVersion 的令牌'
  );
}

function createAuthError(message, code = 'INVALID_TOKEN', statusCode = 401) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function loadVerifiedAccessUser(decoded) {
  const userId = Number(decoded?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw createAuthError('认证令牌用户无效', 'INVALID_TOKEN', 401);
  }

  const [users] = await retryTransientDatabaseRead(
    () =>
      pool.execute(
         `SELECT id, username, real_name, status, token_version,
                 force_password_change, password_changed_at, password_expires_at
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [userId]
      ),
    {
      onRetry: (error, attempt, delayMs) => {
        logger.warn('Authenticated user lookup will retry after a transient database error', {
          attempt,
          delayMs,
          code: error.code,
        });
      },
    }
  );
  const user = users[0];

  if (!user) {
    throw createAuthError('用户不存在或已被删除', 'USER_NOT_FOUND', 401);
  }

  if (Number(user.status) !== 1) {
    throw createAuthError('账号已被禁用，请联系管理员', 'ACCOUNT_DISABLED', 403);
  }

  const dbTokenVersion = Number(user.token_version || 0);
  if (decoded.tokenVersion === undefined) {
    if (!allowLegacyAccessTokens) {
      throw createAuthError('令牌版本缺失，请重新登录', 'TOKEN_REVOKED', 401);
    }
  } else if (Number(decoded.tokenVersion) !== dbTokenVersion) {
    throw createAuthError('令牌已失效，请重新登录', 'TOKEN_REVOKED', 401);
  }

  return {
    ...decoded,
    id: user.id,
    username: user.username,
    realName: user.real_name,
    tokenVersion: dbTokenVersion,
    passwordExpired: false,
    passwordChangeRequired: false,
  };
}

function enforcePasswordLifecycle(_req, _user) {
  // 密码生命周期与强制改密拦截已彻底关闭
  return null;
}

/**
 * 认证中间件 - 支持Cookie和Authorization Header
 */
const authenticateToken = async (req, res, next) => {
  try {
    let token = null;

    // 1. 尝试从Cookie获取token
    const { accessToken } = getTokensFromCookies(req);
    if (accessToken) {
      token = accessToken;
    }

    // 2. 如果Cookie中没有，尝试从Authorization Header获取（向后兼容）
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    // 3. 如果都没有，返回401
    if (!token) {
      return ResponseHandler.error(res, '未提供认证令牌', 'NO_TOKEN', 401);
    }

    // 4. 验证token，并实时校验用户状态与token版本
    const decoded = verifyAccessToken(token);
    req.user = await loadVerifiedAccessUser(decoded);
    const lifecycleError = enforcePasswordLifecycle(req, req.user);
    if (lifecycleError) throw lifecycleError;
    next();
  } catch (error) {
    logger.warn('Token验证失败:', { error: error.message, path: req.path });

    if (isTransientDatabaseError(error)) {
      return ResponseHandler.error(
        res,
        '认证服务暂时不可用，请稍后重试',
        'AUTH_SERVICE_UNAVAILABLE',
        503
      );
    }

    if (['TOKEN_REVOKED', 'ACCOUNT_DISABLED', 'USER_NOT_FOUND'].includes(error.code)) {
      clearTokenCookies(req, res);
    }

    return ResponseHandler.error(
      res,
      error.message || '认证令牌无效或已过期',
      error.code || (error.message.includes('过期') ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'),
      error.statusCode || 401,
      error
    );
  }
};

/**
 * 可选认证中间件 - 如果有token则验证，没有则继续
 */
const optionalAuth = async (req, res, next) => {
  try {
    const { accessToken } = getTokensFromCookies(req);
    const authHeader = req.headers.authorization;
    const token =
      accessToken || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

    if (token) {
      const decoded = verifyAccessToken(token);
      req.user = await loadVerifiedAccessUser(decoded);
    }
  } catch (error) {
    // 忽略错误，继续处理
    logger.debug('可选认证失败:', error.message);
    if (['TOKEN_REVOKED', 'ACCOUNT_DISABLED', 'USER_NOT_FOUND'].includes(error.code)) {
      clearTokenCookies(req, res);
    }
  }
  next();
};

/**
 * 验证刷新令牌中间件
 */
const authenticateRefreshToken = async (req, res, next) => {
  try {
    // 从 Cookie 或请求体中获取刷新令牌
    const { refreshToken } = getTokensFromCookies(req);
    const token = refreshToken || req.body?.refreshToken;

    if (!token) {
      return ResponseHandler.error(res, '未提供刷新令牌', 'NO_REFRESH_TOKEN', 401);
    }

    // 验证刷新令牌签名
    const decoded = verifyRefreshToken(token);

    // ✅ 安全加固: 校验 token_version（确保令牌未被吊销）
    const userId = Number(decoded?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return ResponseHandler.error(res, '刷新令牌用户无效', 'INVALID_REFRESH_TOKEN', 401);
    }

    const [users] = await retryTransientDatabaseRead(
      () => pool.execute(
        `SELECT id, status, token_version, force_password_change,
                password_changed_at, password_expires_at
           FROM users WHERE id = ? LIMIT 1`,
        [userId]
      ),
      {
        onRetry: (error, attempt, delayMs) => {
          logger.warn('Refresh token verification will retry after a transient database error', {
            attempt,
            delayMs,
            code: error.code,
          });
        },
      }
    );
    const user = users[0];

    if (!user) {
      clearTokenCookies(req, res);
      return ResponseHandler.error(res, '用户不存在', 'USER_NOT_FOUND', 401);
    }

    if (Number(user.status) !== 1) {
      clearTokenCookies(req, res);
      return ResponseHandler.error(res, '账号已被禁用', 'ACCOUNT_DISABLED', 403);
    }

    const dbTokenVersion = Number(user.token_version || 0);
    // 与 Access Token 对齐：生产/全部环境均要求 tokenVersion 存在且匹配
    if (decoded.tokenVersion === undefined || decoded.tokenVersion === null) {
      clearTokenCookies(req, res);
      return ResponseHandler.error(
        res,
        '刷新令牌缺少版本信息，请重新登录',
        'TOKEN_VERSION_REQUIRED',
        401
      );
    }
    if (Number(decoded.tokenVersion) !== dbTokenVersion) {
      clearTokenCookies(req, res);
      return ResponseHandler.error(res, '刷新令牌已失效，请重新登录', 'TOKEN_REVOKED', 401);
    }

    if (!decoded.jti || !decoded.familyId) {
      clearTokenCookies(req, res);
      return ResponseHandler.error(
        res,
        '刷新令牌需要重新登录',
        'REFRESH_TOKEN_ROTATION_REQUIRED',
        401
      );
    }

    req.user = {
      ...decoded,
      passwordExpired: PasswordSecurity.isPasswordExpired(
        user.password_changed_at,
        user.password_expires_at
      ),
      passwordChangeRequired: PasswordSecurity.isPasswordChangeRequired(user),
    };
    req.refreshToken = token;
    next();
  } catch (error) {
    if (isTransientDatabaseError(error)) {
      return ResponseHandler.error(
        res,
        '认证服务暂时不可用，请稍后重试',
        'AUTH_SERVICE_UNAVAILABLE',
        503
      );
    }

    clearTokenCookies(req, res);
    return ResponseHandler.error(
      res,
      error.message || '刷新令牌无效或已过期',
      'INVALID_REFRESH_TOKEN',
      401,
      error
    );
  }
};

module.exports = {
  authenticateToken,
  optionalAuth,
  authenticateRefreshToken,
};
