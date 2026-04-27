/**
 * authController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');


const {
  generateToken,
  generateTokens,
  setTokensToCookies,
  clearTokenCookies,
} = require('../../config/jwtEnhanced');
const db = require('../../config/db');
const { pool } = require('../../config/db');
const PasswordSecurity = require('../../utils/passwordSecurity');
const AccountLockService = require('../../services/system/AccountLockService');

/**
 * 为用户对象附加角色信息（消除重复查询）
 * @param {Object} user - 用户对象（会被原地修改）
 * @returns {Promise<void>}
 */
async function attachUserRoles(user) {
  const [roles] = await pool.execute(
    `SELECT r.id, r.name, r.code FROM roles r
     JOIN user_roles ur ON r.id = ur.role_id
     WHERE ur.user_id = ?`,
    [user.id]
  );
  user.roles = roles;
  user.role_name = roles.length > 0 ? roles[0].name : '';
  user.role_names = roles.map((r) => r.name).join(', ');
}

const login = async (req, res) => {
  const { username, password } = req.body;

  // 0. 输入校验：用户名和密码不能为空
  if (!username || !password) {
    return ResponseHandler.error(res, '用户名和密码不能为空', 'BAD_REQUEST', 400);
  }

  try {
    // 1. 检查账号是否被锁定
    const lockStatus = await AccountLockService.isLocked(username);
    if (lockStatus.locked) {
      logger.warn(`🔒 [登录拒绝] 账号 ${username} 处于锁定状态，剩余 ${lockStatus.remainingMinutes} 分钟`);
      return ResponseHandler.error(
        res,
        `账号已被锁定，请 ${lockStatus.remainingMinutes} 分钟后再试`,
        'ACCOUNT_LOCKED',
        423
      );
    }

    // 2. 查询用户
    const [users] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
    const user = users[0];

    if (!user) {
      // 用户不存在也记录失败（防止用户名枚举）
      const result = await AccountLockService.recordFailedAttempt(username, req.ip);
      const msg = result.locked
        ? `账号已被锁定，请 ${result.lockDurationMinutes} 分钟后再试`
        : `用户名或密码错误，剩余 ${result.remainingAttempts} 次机会`;
      return ResponseHandler.error(res, msg, 'CLIENT_ERROR', 401);
    }

    // 3. 检查用户状态是否禁用
    if (user.status === 0) {
      return ResponseHandler.error(res, '账号已被禁用，请联系管理员', 'CLIENT_ERROR', 403);
    }

    // 4. 验证密码（防御性检查：确保密码哈希存在）
    if (!user.password) {
      logger.error(`⚠️ 用户 ${username}(ID:${user.id}) 的密码哈希字段为空，拒绝登录`);
      return ResponseHandler.error(res, '账户数据异常，请联系管理员', 'SERVER_ERROR', 500);
    }
    const isMatch = await PasswordSecurity.verifyPassword(password, user.password);

    if (!isMatch) {
      const result = await AccountLockService.recordFailedAttempt(username, req.ip);
      const msg = result.locked
        ? `账号已被锁定，请 ${result.lockDurationMinutes} 分钟后再试`
        : `用户名或密码错误，剩余 ${result.remainingAttempts} 次机会`;
      return ResponseHandler.error(res, msg, 'CLIENT_ERROR', 401);
    }

    // 5. 登录成功，清除失败记录
    await AccountLockService.clearFailedAttempts(username);

    // 6. 生成访问令牌和刷新令牌
    const { accessToken, refreshToken } = generateTokens(user);

    // 设置令牌到HttpOnly Cookie
    setTokensToCookies(res, accessToken, refreshToken);

    // 返回用户信息（向后兼容，也返回token）
    ResponseHandler.success(
      res,
      {
        token: accessToken, // 兼容旧版前端
        accessToken, // 新增：明确返回accessToken
        // ✅ 安全修复: refreshToken 不再通过响应体返回，仅通过 HttpOnly Cookie 传递
        user: {
          id: user.id,
          username: user.username,
          real_name: user.real_name,
          email: user.email,
        },
      },
      '登录成功'
    );

    logger.info('用户登录成功:', { userId: user.id, username: user.username });
  } catch (error) {
    logger.error('Login error:', error);
    ResponseHandler.error(res, 'Server error', 'SERVER_ERROR', 500, error);
  }
};

// 获取用户信息
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // 获取用户基本信息和部门信息
    const [users] = await pool.execute(
      `SELECT u.id, u.username, u.real_name, u.email, u.department_id, u.position, u.role, u.avatar, u.phone, u.avatar_frame, u.bio, u.created_at,
              d.name as department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return ResponseHandler.error(res, 'User not found', 'NOT_FOUND', 404);
    }

    const user = users[0];

    // 附加角色信息到用户对象
    await attachUserRoles(user);

    ResponseHandler.success(res, user, '获取用户信息成功');
  } catch (error) {
    logger.error('Get user profile error:', error);
    ResponseHandler.error(res, 'Server error', 'SERVER_ERROR', 500, error);
  }
};

// 更新用户信息
const updateUserProfile = async (req, res) => {
  try {

    const userId = req.user.id;
    const { real_name, name, email, phone, department_id, position, avatar, bio } = req.body;

    // 构建动态更新字段
    const updateFields = [];
    const updateValues = [];

    if (real_name !== undefined || name !== undefined) {
      updateFields.push('real_name = ?');
      updateValues.push(real_name || name);
    }
    if (email !== undefined) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      updateValues.push(phone);
    }
    if (department_id !== undefined) {
      updateFields.push('department_id = ?');
      updateValues.push(department_id);
    }
    if (position !== undefined) {
      updateFields.push('position = ?');
      updateValues.push(position);
    }
    if (avatar !== undefined) {
      updateFields.push('avatar = ?');
      updateValues.push(avatar);
    }
    if (bio !== undefined) {
      updateFields.push('bio = ?');
      updateValues.push(bio);
    }

    if (updateFields.length === 0) {
      return ResponseHandler.error(res, 'No fields to update', 'BAD_REQUEST', 400);
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(userId);


    await pool.execute(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);

    // 返回更新后的用户信息，包括部门和角色
    const [users] = await pool.execute(
      `SELECT u.id, u.username, u.real_name, u.email, u.department_id, u.position, u.role, u.avatar, u.phone, u.avatar_frame, u.bio, u.created_at,
              d.name as department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ?`,
      [userId]
    );

    const user = users[0];

    // 附加角色信息到用户对象
    await attachUserRoles(user);

    ResponseHandler.success(res, user, '更新用户信息成功');
  } catch (error) {
    logger.error('Update user profile error:', error);
    logger.error('Error stack:', error.stack);
    ResponseHandler.error(res, 'Server error', 'SERVER_ERROR', 500, error);
  }
};

// 更改密码
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    // 获取当前用户信息
    const [users] = await pool.execute('SELECT password FROM users WHERE id = ?', [userId]);

    if (users.length === 0) {
      return ResponseHandler.error(res, 'User not found', 'NOT_FOUND', 404);
    }

    // 验证当前密码
    const isCurrentPasswordValid = await PasswordSecurity.verifyPassword(
      currentPassword,
      users[0].password
    );
    if (!isCurrentPasswordValid) {
      return ResponseHandler.error(res, 'Current password is incorrect', 'BAD_REQUEST', 400);
    }

    // 验证新密码强度
    const passwordValidation = PasswordSecurity.validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      return ResponseHandler.error(
        res,
        'Password does not meet security requirements',
        'BAD_REQUEST',
        400
      );
    }

    // 加密新密码
    const hashedNewPassword = await PasswordSecurity.hashPassword(newPassword);

    // ✅ 安全修复: 更新密码时同时递增 token_version，强制所有设备重新登录
    await pool.execute(
      'UPDATE users SET password = ?, token_version = token_version + 1, updated_at = NOW() WHERE id = ?',
      [hashedNewPassword, userId]
    );

    // 清除当前设备的 Cookie，迫使重新登录
    clearTokenCookies(res);

    ResponseHandler.success(res, null, '密码修改成功，请重新登录');
  } catch (error) {
    logger.error('Change password error:', error);
    ResponseHandler.error(res, 'Server error', 'SERVER_ERROR', 500, error);
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
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);

  const signatures = MAGIC_BYTES[mimetype];
  if (!signatures) return false;
  return signatures.some((sig) => buf.subarray(0, sig.length).equals(sig));
}

// 上传用户头像（文件系统存储）
const uploadAvatar = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return ResponseHandler.error(res, 'No avatar file provided', 'BAD_REQUEST', 400);
    }

    // Magic bytes 校验 — 确保文件内容与声明的 MIME 类型一致
    if (!validateMagicBytes(req.file.path, req.file.mimetype)) {
      // 删除不合格的文件
      const fs = require('fs');
      fs.unlinkSync(req.file.path);
      return ResponseHandler.error(res, '文件内容与声明的类型不一致', 'BAD_REQUEST', 400);
    }

    // 构建相对URL（前端通过 /uploads/avatars/xxx.png 访问）
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    // 删除旧头像文件（如果是文件系统路径）
    const [oldUser] = await pool.execute('SELECT avatar FROM users WHERE id = ?', [userId]);
    if (oldUser[0]?.avatar && oldUser[0].avatar.startsWith('/uploads/avatars/')) {
      const fs = require('fs');
      const path = require('path');
      const oldPath = path.join(process.cwd(), oldUser[0].avatar);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
        logger.info('已删除旧头像文件:', oldPath);
      }
    }

    // 更新数据库：存文件路径而非 Base64
    const [result] = await pool.execute(
      'UPDATE users SET avatar = ?, updated_at = NOW() WHERE id = ?',
      [avatarUrl, userId]
    );

    if (result.affectedRows === 0) {
      return ResponseHandler.error(res, 'User not found', 'NOT_FOUND', 404);
    }

    ResponseHandler.success(res, { avatarUrl }, '头像上传成功');
  } catch (error) {
    logger.error('Upload avatar error:', error);
    ResponseHandler.error(
      res,
      'Server error during avatar upload',
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
      `📋 [获取权限] 用户 ${req.user.username}(ID:${userId}) 权限数: ${permissions.length}`
    );

    return ResponseHandler.success(res, permissions, '获取用户权限成功');
  } catch (error) {
    logger.error('获取用户权限失败:', error);
    return ResponseHandler.error(res, '获取用户权限失败', 'SERVER_ERROR', 500, error);
  }
};

// 更新用户头像特效
const updateAvatarFrame = async (req, res) => {
  try {
    const userId = req.user.id;
    const { frameId } = req.body;

    // 验证主题preset - 支持7种主题


    // ✅ 审计修复(D-6): 使用正则模式替代50行硬编码 frame ID 列表
    // 支持 frame1~frame999 + lottie-* 主题 + none
    const framePattern = /^(frame\d+|lottie-[a-z]+|none)$/;
    if (!framePattern.test(frameId)) {
      return ResponseHandler.error(res, '无效的头像特效ID', 'BAD_REQUEST', 400);
    }

    // 更新用户的头像特效设置
    await pool.execute('UPDATE users SET avatar_frame = ?, updated_at = NOW() WHERE id = ?', [
      frameId,
      userId,
    ]);

    logger.info('✅ 头像特效更新成功:', { userId, frameId });

    ResponseHandler.success(res, { frameId }, '头像特效已更新');
  } catch (error) {
    logger.error('更新头像特效失败:', error);
    ResponseHandler.error(res, '更新头像特效失败', 'SERVER_ERROR', 500, error);
  }
};

// 登出
const logout = async (req, res) => {
  try {
    // ✅ 安全修复: 递增 token_version 使所有已发出的 refresh token 失效
    if (req.user?.id) {
      await pool.execute(
        'UPDATE users SET token_version = token_version + 1 WHERE id = ?',
        [req.user.id]
      );
    }

    // 清除Cookie中的令牌
    clearTokenCookies(res);

    ResponseHandler.success(res, null, '登出成功');

    logger.info('用户登出(已吊销Token):', { userId: req.user?.id });
  } catch (error) {
    logger.error('Logout error:', error);
    ResponseHandler.error(res, 'Server error', 'SERVER_ERROR', 500, error);
  }
};

// 刷新访问令牌
const refreshToken = async (req, res) => {
  try {
    const userId = req.user.id;

    // 从数据库重新获取用户信息
    const [users] = await pool.execute(
      'SELECT id, username, role, real_name, email, token_version FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return ResponseHandler.error(res, 'User not found', 'NOT_FOUND', 404);
    }

    const user = users[0];

    // 检查token版本（用于token撤销）
    if (req.user.tokenVersion !== undefined && user.token_version !== req.user.tokenVersion) {
      clearTokenCookies(res);
      return ResponseHandler.error(res, 'Token has been revoked', 'UNAUTHORIZED', 401);
    }

    // 生成新的令牌对
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    // 设置新的令牌到Cookie
    setTokensToCookies(res, accessToken, newRefreshToken);

    ResponseHandler.success(
      res,
      {
        token: accessToken, // 兼容旧版前端
        accessToken, // 新增：明确返回accessToken
        // ✅ 安全修复: refreshToken 不再通过响应体返回，仅通过 HttpOnly Cookie 传递
        user: {
          id: user.id,
          username: user.username,
          real_name: user.real_name,
          email: user.email,
        },
      },
      '令牌刷新成功'
    );

    logger.info('令牌刷新成功:', { userId: user.id });
  } catch (error) {
    logger.error('Refresh token error:', error);
    ResponseHandler.error(res, 'Failed to refresh token', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取用户菜单（根据权限过滤）
 * 从 auth 路由中抽取的业务逻辑
 */
const getUserMenus = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. 获取用户角色
    const [userRoles] = await pool.execute('SELECT role_id FROM user_roles WHERE user_id = ?', [
      userId,
    ]);

    if (userRoles.length === 0) {
      return ResponseHandler.success(res, [], '获取菜单成功');
    }

    const roleIds = userRoles.map((r) => r.role_id);

    // 2. 获取角色拥有的菜单ID
    const [roleMenus] = await pool.execute(
      `SELECT DISTINCT menu_id FROM role_menus WHERE role_id IN (${roleIds.map(() => '?').join(',')})`,
      roleIds
    );

    if (roleMenus.length === 0) {
      return ResponseHandler.success(res, [], '获取菜单成功');
    }

    const menuIds = roleMenus.map((r) => r.menu_id);

    // 3. 获取菜单详情
    const [menus] = await pool.execute(
      `SELECT id, parent_id, name, path, icon, permission, type, sort_order as sort
       FROM menus 
       WHERE id IN (${menuIds.map(() => '?').join(',')}) AND status = 1
       ORDER BY sort_order`,
      menuIds
    );

    // 4. 递归获取所有父菜单
    const allMenuIds = new Set(menuIds);
    let currentParentIds = [...new Set(menus.filter(m => m.parent_id && m.parent_id !== 0).map(m => m.parent_id))];

    while (currentParentIds.length > 0) {
      const [parents] = await pool.execute(
        `SELECT id, parent_id, name, path, icon, permission, type, sort_order as sort
         FROM menus 
         WHERE id IN (${currentParentIds.map(() => '?').join(',')}) AND status = 1`,
        currentParentIds
      );

      const newParentIds = [];
      parents.forEach((p) => {
        if (!allMenuIds.has(p.id)) {
          allMenuIds.add(p.id);
          menus.push(p);
          if (p.parent_id && p.parent_id !== 0) {
            newParentIds.push(p.parent_id);
          }
        }
      });
      currentParentIds = newParentIds;
    }

    // 5. 构建菜单树
    const menuMap = {};
    menus.forEach((m) => {
      menuMap[m.id] = { ...m, children: [] };
    });

    const tree = [];
    menus.forEach((m) => {
      if (m.parent_id && m.parent_id !== 0 && menuMap[m.parent_id]) {
        menuMap[m.parent_id].children.push(menuMap[m.id]);
      } else if (!m.parent_id || m.parent_id === 0) {
        tree.push(menuMap[m.id]);
      }
    });

    // 6. 按 sort 排序
    const sortMenus = (nodes) => {
      nodes.sort((a, b) => (a.sort || 0) - (b.sort || 0));
      nodes.forEach((n) => {
        if (n.children && n.children.length > 0) {
          sortMenus(n.children);
        }
      });
    };
    sortMenus(tree);

    return ResponseHandler.success(res, tree, '获取菜单成功');
  } catch (error) {
    logger.error('获取用户菜单失败:', error);
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
