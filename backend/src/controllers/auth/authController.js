/**
 * authController.js
 * @description 认证控制器
 * @date 2025-08-27
 * @version 1.1.0
 */

const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');
const { mapKeysToSnake } = require('../../utils/fieldMap');
const { isTransientDatabaseError } = require('../../utils/databaseAvailability');

const {
  generateTokens,
  setTokensToCookies,
  clearTokenCookies,
} = require('../../config/jwtEnhanced');

const PasswordSecurity = require('../../utils/passwordSecurity');
const AccountLockService = require('../../services/system/AccountLockService');
const AuthService = require('../../services/auth/AuthService');
const RefreshTokenService = require('../../services/auth/RefreshTokenService');
const { normalizeUsername } = require('../../utils/usernameSecurity');
const { revokeUserSockets } = require('../../utils/sessionRevocation');
const AuditLogService = require('../../services/system/AuditLogService');

const PROFILE_AUTHORIZATION_FIELDS = new Set([
  'department_id', 'departmentId', 'role', 'role_id', 'roleId',
  'role_ids', 'roleIds', 'status', 'position', 'is_super_admin', 'isSuperAdmin',
]);
const PROFILE_EDITABLE_FIELDS = new Set([
  'real_name', 'realName', 'name', 'email', 'phone', 'avatar', 'bio',
]);

async function logAuthenticationEvent(req, event, details = {}, user = null) {
  try {
    await AuditLogService.log({
      request_id: req?.traceId || req?.headers?.['x-request-id'] || null,
      operator_id: user?.id || req?.user?.id || null,
      operator_name: user?.username || req?.user?.username || 'anonymous',
      action: `AUTH_${event}`,
      module: 'auth',
      target_table: 'users',
      target_id: user?.id || req?.user?.id || 'N/A',
      new_payload: {
        event,
        outcome: details.outcome || 'unknown',
        reason: details.reason || undefined,
        username: details.username || user?.username || req?.user?.username || undefined,
      },
      method: req?.method,
      path: req?.originalUrl || req?.url,
      ip_address: req?.ip || req?.socket?.remoteAddress,
      user_agent: req?.get?.('User-Agent') || req?.headers?.['user-agent'],
    });
  } catch (error) {
    logger.warn('[Auth] authentication audit event failed', { event, error: error.message });
  }
}

const passwordLifecycle = (user) => ({
  force_password_change: Boolean(user.force_password_change),
  password_expired: PasswordSecurity.isPasswordExpired(
    user.password_changed_at,
    user.password_expires_at
  ),
  password_change_required: PasswordSecurity.isPasswordChangeRequired(user),
});

function publicAuthUser(user) {
  return {
    id: user.id,
    username: user.username,
    real_name: user.real_name,
    email: user.email,
    ...passwordLifecycle(user),
  };
}

function invalidCredentialsMessage(lockResult = null) {
  if (lockResult?.locked) {
    return `密码连续输错 ${Number(process.env.LOGIN_MAX_FAILED_ATTEMPTS) || 5} 次，账号已锁定，请联系管理员解除锁定`;
  }
  // Do not leak remaining-attempt counts to unauthenticated clients
  // (user enumeration / lockout timing aid). Lockout itself is still announced.
  void lockResult;
  return '用户名或密码错误';
}

async function issueAuthenticatedSession(req, res, user) {
  const { accessToken, refreshToken, refreshJti, refreshFamilyId } = generateTokens(user);
  await RefreshTokenService.register({
    userId: user.id,
    jti: refreshJti,
    familyId: refreshFamilyId,
    token: refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  setTokensToCookies(req, res, accessToken, refreshToken);
  return publicAuthUser(user);
}

const login = async (req, res) => {
  const rawUsername = req.body?.username;
  const password = req.body?.password;
  const username = normalizeUsername(rawUsername);

  // 0. 输入校验：用户名和密码不能为空
  if (!username || typeof password !== 'string' || !password) {
    await logAuthenticationEvent(req, 'LOGIN', {
      outcome: 'failure',
      reason: 'invalid_input',
      username: typeof rawUsername === 'string' ? rawUsername.slice(0, 100) : undefined,
    });
    return ResponseHandler.error(res, '用户名和密码不能为空', 'VALIDATION_ERROR', 400);
  }

  try {
    // 1. 检查账号是否被锁定
    const lockStatus = await AccountLockService.isLocked(username);
    if (lockStatus.locked) {
      logger.warn('Login rejected because account is locked', { username });
      await logAuthenticationEvent(req, 'LOGIN', {
        outcome: 'failure', reason: 'account_locked', username,
      });
      return ResponseHandler.error(
        res,
        `账号已锁定，请联系管理员解除锁定（约 ${lockStatus.remainingMinutes || 1} 分钟后也会自动恢复）`,
        'ACCOUNT_LOCKED',
        423
      );
    }

    // 2. 查询用户
    const user = await AuthService.findUserByUsername(username);

    if (!user) {
      // 用户不存在也记录失败（防止用户名枚举）
      const result = await AccountLockService.recordFailedAttempt(username, req.ip);
      await logAuthenticationEvent(req, 'LOGIN', {
        outcome: 'failure',
        reason: result.locked ? 'account_locked' : 'invalid_credentials',
        username,
      });
      return ResponseHandler.error(
        res,
        invalidCredentialsMessage(result),
        result.locked ? 'ACCOUNT_LOCKED' : 'VALIDATION_ERROR',
        result.locked ? 423 : 401
      );
    }

    // 3. 检查用户状态是否禁用
    if (user.status === 0) {
      await logAuthenticationEvent(req, 'LOGIN', {
        outcome: 'failure', reason: 'account_disabled', username,
      }, user);
      return ResponseHandler.error(res, '账号已被禁用，请联系管理员', 'VALIDATION_ERROR', 403);
    }

    // 4. 验证密码（防御性检查：确保密码哈希存在）
    if (!user.password) {
      logger.error(`Login rejected because password hash is missing: username=${username}, userId=${user.id}`);
      return ResponseHandler.error(res, '账户数据异常，请联系管理员', 'SERVER_ERROR', 500);
    }
    const isMatch = await PasswordSecurity.verifyPassword(password, user.password);

    if (!isMatch) {
      const result = await AccountLockService.recordFailedAttempt(username, req.ip);
      await logAuthenticationEvent(req, 'LOGIN', {
        outcome: 'failure',
        reason: result.locked ? 'account_locked' : 'invalid_credentials',
        username,
      }, user);
      return ResponseHandler.error(
        res,
        invalidCredentialsMessage(result),
        result.locked ? 'ACCOUNT_LOCKED' : 'VALIDATION_ERROR',
        result.locked ? 423 : 401
      );
    }

    // 5. 登录成功，清除失败记录
    await AccountLockService.clearFailedAttempts(username);

    // 6. 签发访问/刷新令牌。
    const authUser = await issueAuthenticatedSession(req, res, user);

    // Access/refresh tokens are set only as HttpOnly cookies.
    ResponseHandler.success(
      res,
      {
        user: {
          ...authUser,
        },
      },
      '登录成功'
    );

    logger.info('User login succeeded', { userId: user.id, username: user.username });
    await logAuthenticationEvent(req, 'LOGIN', { outcome: 'success' }, user);
  } catch (error) {
    const log = req.logger || logger;
    log.error('[Auth] 登录失败:', {
      error: error.message,
      code: error.code,
      path: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    await logAuthenticationEvent(req, 'LOGIN', {
      outcome: 'error',
      reason: isTransientDatabaseError(error) ? 'database_unavailable' : 'server_error',
      username,
    });

    if (isTransientDatabaseError(error)) {
      return ResponseHandler.error(
        res,
        '登录服务暂时不可用，请稍后重试',
        'AUTH_SERVICE_UNAVAILABLE',
        503
      );
    }

    return ResponseHandler.error(res, '服务器错误', 'SERVER_ERROR', 500, error);
  }
};

// 获取用户信息
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await AuthService.getUserProfile(userId);

    if (!user) {
      return ResponseHandler.error(res, '用户不存在', 'NOT_FOUND', 404);
    }

    // 附加角色信息到用户对象
    await AuthService.attachUserRoles(user);

    ResponseHandler.success(res, user, '获取用户信息成功');
  } catch (error) {
    logger.error('[Auth] 获取用户信息失败:', error);
    ResponseHandler.error(res, '服务器错误', 'SERVER_ERROR', 500, error);
  }
};

// 更新用户信息
const updateUserProfile = async (req, res) => {
  try {

    const userId = req.user.id;
    const rawBody = req.body || {};
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      return ResponseHandler.error(res, '个人资料格式无效', 'VALIDATION_ERROR', 400);
    }
    const forbiddenField = Object.keys(rawBody).find((key) => PROFILE_AUTHORIZATION_FIELDS.has(key));
    if (forbiddenField) {
      return ResponseHandler.forbidden(res, '部门、岗位、角色和状态只能由用户管理流程修改');
    }
    const unknownField = Object.keys(rawBody).find((key) => !PROFILE_EDITABLE_FIELDS.has(key));
    if (unknownField) {
      return ResponseHandler.error(res, `不允许更新字段: ${unknownField}`, 'VALIDATION_ERROR', 400);
    }
    const body = mapKeysToSnake(rawBody);
    const { real_name, email, phone, avatar, bio } = body;
    // name 为前端展示字段别名，mapKeysToSnake 后仍可能保留 name
    const name = req.body?.name;

    // 构建更新字段映射
    const fields = {};
    if (real_name !== undefined || name !== undefined) fields.real_name = real_name || name;
    if (email !== undefined) fields.email = email;
    if (phone !== undefined) fields.phone = phone;
    if (avatar !== undefined) fields.avatar = avatar;
    if (bio !== undefined) fields.bio = bio;

    const updated = await AuthService.updateUserProfile(userId, fields);
    if (!updated) {
      return ResponseHandler.error(res, '没有可更新的字段', 'VALIDATION_ERROR', 400);
    }

    // 返回更新后的用户信息，包括部门和角色
    const user = await AuthService.getUserProfile(userId);

    // 附加角色信息到用户对象
    await AuthService.attachUserRoles(user);

    await logAuthenticationEvent(req, 'PROFILE_UPDATE', {
      outcome: 'success', reason: 'self_service_profile',
    }, user);

    ResponseHandler.success(res, user, '更新用户信息成功');
  } catch (error) {
    logger.error('[Auth] 更新用户信息失败:', error);
    await logAuthenticationEvent(req, 'PROFILE_UPDATE', {
      outcome: 'failure', reason: error.code || 'profile_update_failed',
    }, req.user);
    if (error.code === 'PROFILE_FIELD_FORBIDDEN') {
      return ResponseHandler.forbidden(res, '个人资料包含不可编辑的授权字段');
    }
    if (error.code === 'PROFILE_FIELD_INVALID') {
      return ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
    }
    return ResponseHandler.error(res, '服务器错误', 'SERVER_ERROR', 500, error);
  }
};

// 更改密码
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    // 获取当前用户密码哈希
    const passwordHash = await AuthService.getUserPasswordHash(userId);

    if (!passwordHash) {
      return ResponseHandler.error(res, '用户不存在', 'NOT_FOUND', 404);
    }

    // 验证当前密码
    const isCurrentPasswordValid = await PasswordSecurity.verifyPassword(
      currentPassword,
      passwordHash
    );
    if (!isCurrentPasswordValid) {
      return ResponseHandler.error(res, '当前密码不正确', 'VALIDATION_ERROR', 400);
    }

    if (await PasswordSecurity.verifyPassword(newPassword, passwordHash)) {
      return ResponseHandler.error(res, '新密码不能与当前密码相同', 'VALIDATION_ERROR', 400);
    }

    // 验证新密码强度
    const passwordValidation = PasswordSecurity.validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      return ResponseHandler.error(
        res,
        `密码不符合安全要求：${passwordValidation.errors.join('；')}`,
        'VALIDATION_ERROR',
        400
      );
    }


    // 密码历史：禁止重复使用最近 N 次密码
    const db = require('../../config/db');
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const historyOk = await PasswordSecurity.checkPasswordHistory(
        userId,
        newPassword,
        connection
      );
      if (!historyOk) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          '新密码不能与最近使用过的密码相同',
          'VALIDATION_ERROR',
          400
        );
      }

      const hashedNewPassword = await PasswordSecurity.hashPassword(newPassword);
      // 更新密码时递增 token_version，强制所有设备重新登录
      await AuthService.updatePassword(userId, hashedNewPassword, connection);
      await PasswordSecurity.savePasswordHistory(userId, hashedNewPassword, connection);
      await connection.commit();
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original password change error.
      }
      throw error;
    } finally {
      connection.release();
    }

    revokeUserSockets(userId, 'password_changed');
    clearTokenCookies(req, res);
    await logAuthenticationEvent(req, 'PASSWORD_CHANGE', { outcome: 'success' }, req.user);
    return ResponseHandler.success(res, null, '密码修改成功，请重新登录');
  } catch (error) {
    logger.error('[Auth] 修改密码失败:', error);
    await logAuthenticationEvent(req, 'PASSWORD_CHANGE', {
      outcome: 'failure', reason: error.code || 'password_change_failed',
    }, req.user);
    return ResponseHandler.error(res, '服务器错误', 'SERVER_ERROR', 500, error);
  }
};

// Magic bytes 校验 — 防止伪造 Content-Type
const MAGIC_BYTES = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
  'image/gif': [Buffer.from('GIF87a'), Buffer.from('GIF89a')],
  'image/webp': [Buffer.from('RIFF')], // RIFF header
};

function validateMagicBytes(filePath, mimetype) {
  const fs = require('fs');
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }

  const signatures = MAGIC_BYTES[mimetype];
  if (!signatures) return false;

  if (mimetype === 'image/webp') {
    return (
      buf.subarray(0, 4).equals(Buffer.from('RIFF')) &&
      buf.subarray(8, 12).equals(Buffer.from('WEBP'))
    );
  }

  return signatures.some((sig) => buf.subarray(0, sig.length).equals(sig));
}

// 上传用户头像（文件系统存储）
const uploadAvatar = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return ResponseHandler.error(res, '请上传头像文件', 'VALIDATION_ERROR', 400);
    }

    // Magic bytes 校验 — 确保文件内容与声明的 MIME 类型一致
    if (!validateMagicBytes(req.file.path, req.file.mimetype)) {
      // 删除不合格的文件
      const fs = require('fs');
      fs.unlinkSync(req.file.path);
      return ResponseHandler.error(res, '文件内容与声明的类型不一致', 'VALIDATION_ERROR', 400);
    }

    // 构建相对URL（前端通过 /uploads/avatars/xxx.png 访问）
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    // 删除旧头像文件（如果是文件系统路径）
    const oldAvatar = await AuthService.getUserAvatar(userId);
    if (oldAvatar && oldAvatar.startsWith('/uploads/avatars/')) {
      const fs = require('fs');
      const path = require('path');
      const avatarDir = path.resolve(process.cwd(), 'uploads', 'avatars');
      const oldPath = path.resolve(process.cwd(), `.${oldAvatar}`);
      if (oldPath.startsWith(avatarDir + path.sep) && fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
        logger.info('[Auth] 已删除旧头像文件:', oldPath);
      }
    }

    // 更新数据库：存文件路径而非 Base64
    const affectedRows = await AuthService.updateAvatar(userId, avatarUrl);

    if (affectedRows === 0) {
      return ResponseHandler.error(res, '用户不存在', 'NOT_FOUND', 404);
    }

    ResponseHandler.success(res, { avatarUrl }, '头像上传成功');
  } catch (error) {
    logger.error('[Auth] 头像上传失败:', error);
    ResponseHandler.error(
      res,
      '头像上传失败',
      'SERVER_ERROR',
      500,
      error
    );
  }
};

// 获取用户权限列表
// ✅ 重构：统一使用 authUtils.getUserPermissions 确保一致性
const getUserPermissions = async (req, res) => {
  try {
    const userId = req.user.id;

    // ✅ 直接使用 PermissionService 获取权限
    const PermissionService = require('../../services/PermissionService');
    const permissions = await PermissionService.getUserPermissions(userId);

    logger.info(
      `📋 [Auth] 用户 ${req.user.username}(ID:${userId}) 权限数: ${permissions.length}`
    );

    return ResponseHandler.success(res, permissions, '获取用户权限成功');
  } catch (error) {
    logger.error('[Auth] 获取用户权限失败:', error);
    return ResponseHandler.error(res, '获取用户权限失败', 'SERVER_ERROR', 500, error);
  }
};

// 更新用户头像特效
const updateAvatarFrame = async (req, res) => {
  try {
    const userId = req.user.id;
    const body = mapKeysToSnake(req.body || {});
    const frameId = req.body.frameId || body.avatarFrame;

    const decorativeFrameIds = new Set([
      'silver-moon',
      'flame-phoenix',
      'ocean-crystal',
      'emerald-vine',
      'neon-prism',
      'royal-crown',
      'galaxy-orbit',
      'sakura-dream',
      'ice-crystal',
      'cyber-blue',
      'rainbow-star',
      'lava-dragon',
      'pearl-wings',
      'jade-bamboo',
      'purple-magic',
    ]);

    if (!frameId || (!decorativeFrameIds.has(frameId) && frameId !== 'none')) {
      return ResponseHandler.error(res, '无效的头像特效ID', 'VALIDATION_ERROR', 400);
    }

    // 更新用户的头像特效设置
    await AuthService.updateAvatarFrame(userId, frameId);

    logger.info('[Auth] 头像特效更新成功:', { userId, frameId });

    ResponseHandler.success(res, { frameId }, '头像特效已更新');
  } catch (error) {
    logger.error('[Auth] 更新头像特效失败:', error);
    ResponseHandler.error(res, '更新头像特效失败', 'SERVER_ERROR', 500, error);
  }
};

// 登出
const logout = async (req, res) => {
  try {
    // ✅ 安全修复: 递增 token_version 使所有已发出的 refresh token 失效
    if (req.user?.id) {
      await AuthService.incrementTokenVersion(req.user.id);
      await RefreshTokenService.revokeUserTokens(req.user.id);
    }

    // 清除Cookie中的令牌
    clearTokenCookies(req, res);

    ResponseHandler.success(res, null, '登出成功');

    await logAuthenticationEvent(req, 'LOGOUT', { outcome: 'success' }, req.user);

    logger.info('[Auth] 用户登出(已吊销Token):', { userId: req.user?.id });
  } catch (error) {
    logger.error('[Auth] 登出失败:', error);
    ResponseHandler.error(res, '服务器错误', 'SERVER_ERROR', 500, error);
  }
};

// 刷新访问令牌
const refreshToken = async (req, res) => {
  try {
    const userId = req.user.id;

    // 从数据库重新获取用户信息
    const user = await AuthService.findUserForRefresh(userId);

    if (!user) {
      return ResponseHandler.error(res, '用户不存在', 'NOT_FOUND', 404);
    }

    if (Number(user.status) !== 1) {
      clearTokenCookies(req, res);
      return ResponseHandler.error(res, '账号已被禁用，请联系管理员', 'ACCOUNT_DISABLED', 403);
    }

    // 检查token版本（用于token撤销）
    if (
      req.user.tokenVersion === undefined ||
      Number(user.token_version || 0) !== Number(req.user.tokenVersion)
    ) {
      clearTokenCookies(req, res);
      return ResponseHandler.error(res, '令牌已被撤销', 'UNAUTHORIZED', 401);
    }

    // 生成新的令牌对
    const {
      accessToken,
      refreshToken: newRefreshToken,
      refreshJti: newRefreshJti,
      refreshFamilyId: newRefreshFamilyId,
    } = generateTokens(user, { refreshFamilyId: req.user.familyId });

    const rotation = await RefreshTokenService.rotate({
      userId,
      oldJti: req.user.jti,
      oldFamilyId: req.user.familyId,
      oldToken: req.refreshToken,
      newJti: newRefreshJti,
      newFamilyId: newRefreshFamilyId,
      newToken: newRefreshToken,
      newAccessToken: accessToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // Multi-tab race: return the winner's cookie pair instead of revoking the session.
    const finalAccess =
      rotation?.status === 'grace' && rotation.accessToken ? rotation.accessToken : accessToken;
    const finalRefresh =
      rotation?.status === 'grace' && rotation.refreshToken
        ? rotation.refreshToken
        : newRefreshToken;

    // 设置新的令牌到Cookie
    setTokensToCookies(req, res, finalAccess, finalRefresh);

    ResponseHandler.success(
      res,
      {
        user: {
          id: user.id,
          username: user.username,
          real_name: user.real_name,
          email: user.email,
          ...passwordLifecycle(user),
        },
      },
      '令牌刷新成功'
    );

    logger.info('[Auth] 令牌刷新成功:', {
      userId: user.id,
      rotation: rotation?.status || 'rotated',
    });
    await logAuthenticationEvent(req, 'TOKEN_REFRESH', { outcome: 'success' }, user);
  } catch (error) {
    logger.error('[Auth] 令牌刷新失败:', error);
    await logAuthenticationEvent(req, 'TOKEN_REFRESH', {
      outcome: 'failure', reason: error.code || 'refresh_failed',
    }, req.user);
    // Concurrent tabs lost the race after the winner already Set-Cookie.
    // Tell the client to retry once instead of wiping the session.
    if (error.code === 'REFRESH_TOKEN_BUSY') {
      return ResponseHandler.error(
        res,
        '会话刷新繁忙，请重试',
        'REFRESH_TOKEN_BUSY',
        409
      );
    }
    if (error.code === 'REFRESH_TOKEN_REUSED' || error.code === 'REFRESH_TOKEN_ROTATION_REQUIRED') {
      clearTokenCookies(req, res);
      return ResponseHandler.error(res, '会话已失效，请重新登录', 'INVALID_REFRESH_TOKEN', 401);
    }
    if (error.code === 'INVALID_REFRESH_TOKEN' || error.code === 'TOKEN_REVOKED') {
      clearTokenCookies(req, res);
      return ResponseHandler.error(res, '刷新令牌无效，请重新登录', 'INVALID_REFRESH_TOKEN', 401);
    }
    return ResponseHandler.error(res, '令牌刷新失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取用户菜单（根据权限过滤）
 * ✅ W-07: 菜单树构建逻辑提取为 AuthService.buildMenuTree
 */
const getUserMenus = async (req, res) => {
  try {
    const userId = req.user.id;
    const PermissionService = require('../../services/PermissionService');

    const isAdmin = await PermissionService.isAdmin(userId);
    if (isAdmin) {
      const menus = await AuthService.getAllVisibleMenus();
      if (menus.length > 0) {
        const tree = AuthService.buildMenuTree(menus);
        return ResponseHandler.success(res, tree, '获取菜单成功');
      }
    }

    // 1. 获取用户角色
    const roleIds = await AuthService.getUserRoleIds(userId);

    if (roleIds.length === 0) {
      if (isAdmin) {
        const allMenus = await AuthService.getAllVisibleMenus();
        const fallbackTree = AuthService.buildMenuTree(allMenus);
        return ResponseHandler.success(res, fallbackTree, '获取菜单成功');
      }
      return ResponseHandler.success(res, [], '获取菜单成功');
    }

    // 2. 获取角色拥有的菜单ID
    const menuIds = await AuthService.getMenuIdsByRoles(roleIds);

    if (menuIds.length === 0) {
      if (isAdmin) {
        const allMenus = await AuthService.getAllVisibleMenus();
        const fallbackTree = AuthService.buildMenuTree(allMenus);
        return ResponseHandler.success(res, fallbackTree, '获取菜单成功');
      }
      return ResponseHandler.success(res, [], '获取菜单成功');
    }

    // 3. 使用递归 CTE 一次性获取菜单及其所有祖先节点
    const menus = await AuthService.getMenusWithAncestors(menuIds);

    // 4. 构建菜单树（使用公共函数）
    const tree = AuthService.buildMenuTree(menus);

    return ResponseHandler.success(res, tree, '获取菜单成功');
  } catch (error) {
    logger.error('[Auth] 获取用户菜单失败:', error);
    return ResponseHandler.error(res, '获取用户菜单失败', 'SERVER_ERROR', 500, error);
  }
};

module.exports = {
  login,
  logout,
  refreshToken,
  getUserProfile,
  updateUserProfile,
  changePassword,
  uploadAvatar,
  getUserPermissions,
  updateAvatarFrame,
  getUserMenus,
};
