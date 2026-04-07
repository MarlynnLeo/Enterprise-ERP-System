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

const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    // 1. 检查账号是否被锁定
    const lockStatus = AccountLockService.isLocked(username);
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
      const result = AccountLockService.recordFailedAttempt(username, req.ip);
      const msg = result.locked
        ? `账号已被锁定，请 ${result.lockDurationMinutes} 分钟后再试`
        : `用户名或密码错误，剩余 ${result.remainingAttempts} 次机会`;
      return ResponseHandler.error(res, msg, 'CLIENT_ERROR', 401);
    }

    // 3. 检查用户状态是否禁用
    if (user.status === 0) {
      return ResponseHandler.error(res, '账号已被禁用，请联系管理员', 'CLIENT_ERROR', 403);
    }

    // 4. 验证密码
    const isMatch = await PasswordSecurity.verifyPassword(password, user.password);

    if (!isMatch) {
      const result = AccountLockService.recordFailedAttempt(username, req.ip);
      const msg = result.locked
        ? `账号已被锁定，请 ${result.lockDurationMinutes} 分钟后再试`
        : `用户名或密码错误，剩余 ${result.remainingAttempts} 次机会`;
      return ResponseHandler.error(res, msg, 'CLIENT_ERROR', 401);
    }

    // 5. 登录成功，清除失败记录
    AccountLockService.clearFailedAttempts(username);

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
        refreshToken, // 新增：返回refreshToken供前端fallback使用
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

    // 获取用户的角色信息
    const [roles] = await pool.execute(
      `SELECT r.id, r.name, r.code FROM roles r
       JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = ?`,
      [userId]
    );

    // 添加角色信息到用户对象
    user.roles = roles;
    user.role_name = roles.length > 0 ? roles[0].name : ''; // 第一个角色的名称
    user.role_names = roles.map((r) => r.name).join(', '); // 所有角色名称

    ResponseHandler.success(res, user, '获取用户信息成功');
  } catch (error) {
    logger.error('Get user profile error:', error);
    ResponseHandler.error(res, 'Server error', 'SERVER_ERROR', 500, error);
  }
};

// 更新用户信息
const updateUserProfile = async (req, res) => {
  try {
    logger.info('🔍 更新用户资料请求:', {
      userId: req.user.id,
      body: req.body,
    });

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

    logger.info('🔍 SQL参数:', updateValues);

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

    // 获取用户的角色信息
    const [roles] = await pool.execute(
      `SELECT r.id, r.name, r.code FROM roles r
       JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = ?`,
      [userId]
    );

    // 添加角色信息到用户对象
    user.roles = roles;
    user.role_name = roles.length > 0 ? roles[0].name : '';
    user.role_names = roles.map((r) => r.name).join(', ');

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

    // 更新密码
    await pool.execute('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', [
      hashedNewPassword,
      userId,
    ]);

    ResponseHandler.success(res, null, '密码修改成功');
  } catch (error) {
    logger.error('Change password error:', error);
    ResponseHandler.error(res, 'Server error', 'SERVER_ERROR', 500, error);
  }
};

// 上传用户头像
const uploadAvatar = async (req, res) => {
  try {
    const userId = req.user.id;

    logger.info('上传的文件信息:', req.file);

    // 检查请求中是否有文件
    if (!req.file) {
      return ResponseHandler.error(res, 'No avatar file provided', 'BAD_REQUEST', 400);
    }

    // 获取文件内容并转换为Base64
    const avatarBuffer = req.file.buffer;
    const avatarBase64 = `data:${req.file.mimetype};base64,${avatarBuffer.toString('base64')}`;

    // 更新用户信息，添加头像数据
    const [result] = await pool.execute('UPDATE users SET avatar = ?, updated_at = NOW() WHERE id = ?', [avatarBase64, userId]);

    if (result.affectedRows === 0) {
      return ResponseHandler.error(res, 'User not found', 'NOT_FOUND', 404);
    }

    // 确保avatar字段返回给客户端

    // 返回结果，包含完整的头像URL
    ResponseHandler.success(res, { avatarUrl: avatarBase64 }, '头像上传成功');
  } catch (error) {
    logger.error('Upload avatar error:', error);
    ResponseHandler.error(
      res,
      'Server error during avatar upload: ' + error.message,
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

    // ✅ 统一使用 authUtils 中的权限获取逻辑
    // 这样确保前端和后端使用完全相同的权限数据
    const { PermissionUtils } = require('../../utils/authUtils');
    const permissions = await PermissionUtils.getUserPermissions(userId);

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


    // 验证frameId - 支持frame1到frame41（新增11个3D光环特效）
    const validFrames = [
      'frame1',
      'frame2',
      'frame3',
      'frame4',
      'frame5',
      'frame6',
      'frame7',
      'frame8',
      'frame9',
      'frame10',
      'frame11',
      'frame12',
      'frame13',
      'frame14',
      'frame15',
      'frame16',
      'frame17',
      'frame18',
      'frame19',
      'frame20',
      'frame21',
      'frame22',
      'frame23',
      'frame24',
      'frame25',
      'frame26',
      'frame27',
      'frame28',
      'frame29',
      'frame30',
      'frame31',
      'frame32',
      'frame33',
      'frame34',
      'frame35',
      'frame36',
      'frame37',
      'frame38',
      'frame39',
      'frame40',
      'frame41',
      'lottie-golden',
      'lottie-cyber',
      'lottie-nature',
      'lottie-hexagon',
      'lottie-diamond',
      'lottie-star',
      'lottie-ripple',
      'none'
    ];
    if (!validFrames.includes(frameId)) {
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
    // 清除Cookie中的令牌
    clearTokenCookies(res);

    ResponseHandler.success(res, null, '登出成功');

    logger.info('用户登出:', { userId: req.user?.id });
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
        refreshToken: newRefreshToken, // 新增：返回新的refreshToken
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
