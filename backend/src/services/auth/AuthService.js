/**
 * AuthService.js
 * @description 认证相关的数据库操作服务
 * @date 2026-06-11
 */

const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');
const { retryTransientDatabaseRead } = require('../../utils/databaseAvailability');
const { normalizeUsername } = require('../../utils/usernameSecurity');
const PasswordSecurity = require('../../utils/passwordSecurity');

/** 用户查询返回的安全字段（不含 password_hash, deleted_at 等敏感字段） */
const USER_PROFILE_FIELDS = `u.id, u.username, u.real_name, u.email, u.department_id,
  u.position, u.role, u.avatar, u.phone, u.avatar_frame, u.bio, u.created_at,
  u.force_password_change, u.password_changed_at, u.password_expires_at`;

const USER_LOGIN_FIELDS = 'id, username, real_name, email, password, status, token_version, force_password_change, password_changed_at, password_expires_at, failed_login_attempts, locked_until';

const USER_REFRESH_FIELDS = 'id, username, role, real_name, email, status, token_version, force_password_change, password_changed_at, password_expires_at';

const MENU_FIELDS = 'id, parent_id, name, path, icon, permission, type, visible, sort_order AS sort';

// These are the only attributes a user may change through the self-service
// profile endpoint.  Organization and authorization attributes (department,
// position, role, status, and admin flags) belong to the privileged user
// management workflow and must never be silently accepted here.
const SELF_SERVICE_PROFILE_FIELDS = Object.freeze([
  'real_name',
  'email',
  'phone',
  'avatar',
  'bio',
]);

class AuthService {
  /**
   * 根据用户名查询用户（登录用）
   * @param {string} username
   * @returns {Promise<Object|null>}
   */
  static async findUserByUsername(username) {
    const canonicalUsername = normalizeUsername(username);
    if (!canonicalUsername) return null;
    const [users] = await retryTransientDatabaseRead(
      () =>
        pool.execute(`SELECT ${USER_LOGIN_FIELDS} FROM users WHERE LOWER(username) = ?`, [canonicalUsername]),
      {
        onRetry: (error, attempt, delayMs) => {
          logger.warn('Authentication user lookup will retry after a transient database error', {
            attempt,
            delayMs,
            code: error.code,
          });
        },
      }
    );
    return users[0] || null;
  }

  /**
   * 根据 ID 查询用户（刷新令牌用）
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  static async findUserForRefresh(userId) {
    const [users] = await retryTransientDatabaseRead(
      () => pool.execute(`SELECT ${USER_REFRESH_FIELDS} FROM users WHERE id = ?`, [userId]),
      {
        onRetry: (error, attempt, delayMs) => {
          logger.warn('Authentication refresh lookup will retry after a transient database error', {
            attempt,
            delayMs,
            code: error.code,
          });
        },
      }
    );
    return users[0] || null;
  }

  /**
   * 获取用户详细信息（含部门名称）
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  static async getUserProfile(userId) {
    const [users] = await pool.execute(
      `SELECT ${USER_PROFILE_FIELDS}, d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ?`,
      [userId]
    );
    const user = users[0] || null;
    if (user) {
      user.password_expired = PasswordSecurity.isPasswordExpired(
        user.password_changed_at,
        user.password_expires_at
      );
      user.password_change_required = PasswordSecurity.isPasswordChangeRequired(user);
      // Password timestamps are internal lifecycle data; expose only booleans
      // at the API boundary.
      delete user.password_changed_at;
      delete user.password_expires_at;
    }
    return user;
  }

  /**
   * 为用户对象附加角色信息
   * @param {Object} user - 用户对象（会被原地修改）
   */
  static async attachUserRoles(user) {
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

  /**
   * 获取用户密码哈希
   * @param {number} userId
   * @returns {Promise<string|null>}
   */
  static async getUserPasswordHash(userId) {
    const [users] = await pool.execute(
      'SELECT password FROM users WHERE id = ?',
      [userId]
    );
    return users[0]?.password || null;
  }

  /**
   * 更新用户密码并递增 token_version
   * @param {number} userId
   * @param {string} hashedPassword
   */
  static async updatePassword(userId, hashedPassword, connection = pool) {
    await connection.execute(
      `UPDATE users
          SET password = ?,
              token_version = token_version + 1,
              force_password_change = 0,
              password_changed_at = NOW(),
              password_expires_at = DATE_ADD(NOW(), INTERVAL 90 DAY),
              updated_at = NOW()
        WHERE id = ?`,
      [hashedPassword, userId]
    );
  }

  /**
   * 更新用户信息
   * @param {number} userId
   * @param {Object} fields - 允许更新的字段
   */
  static async updateUserProfile(userId, fields) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      throw new Error('profile fields must be an object');
    }

    const unknownFields = Object.keys(fields).filter(
      (field) => !SELF_SERVICE_PROFILE_FIELDS.includes(field)
    );
    if (unknownFields.length > 0) {
      const error = new Error(`profile field is not editable: ${unknownFields.join(', ')}`);
      error.code = 'PROFILE_FIELD_FORBIDDEN';
      throw error;
    }

    const updateFields = [];
    const updateValues = [];

    for (const field of SELF_SERVICE_PROFILE_FIELDS) {
      if (fields[field] !== undefined) {
        if (fields[field] !== null && typeof fields[field] !== 'string') {
          const error = new Error(`profile field must be a string: ${field}`);
          error.code = 'PROFILE_FIELD_INVALID';
          throw error;
        }
        if (typeof fields[field] === 'string' && fields[field].length > 1000) {
          const error = new Error(`profile field is too long: ${field}`);
          error.code = 'PROFILE_FIELD_INVALID';
          throw error;
        }
        updateFields.push(`${field} = ?`);
        updateValues.push(fields[field] === '' ? null : fields[field]);
      }
    }

    if (updateFields.length === 0) return false;

    updateFields.push('updated_at = NOW()');
    updateValues.push(userId);

    await pool.execute(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );
    return true;
  }

  /**
   * 获取用户头像路径
   * @param {number} userId
   * @returns {Promise<string|null>}
   */
  static async getUserAvatar(userId) {
    const [rows] = await pool.execute(
      'SELECT avatar FROM users WHERE id = ?',
      [userId]
    );
    return rows[0]?.avatar || null;
  }

  /**
   * 更新用户头像
   * @param {number} userId
   * @param {string} avatarUrl
   * @returns {Promise<number>} affectedRows
   */
  static async updateAvatar(userId, avatarUrl) {
    const [result] = await pool.execute(
      'UPDATE users SET avatar = ?, updated_at = NOW() WHERE id = ?',
      [avatarUrl, userId]
    );
    return result.affectedRows;
  }

  /**
   * 更新用户头像特效
   * @param {number} userId
   * @param {string} frameId
   */
  static async updateAvatarFrame(userId, frameId) {
    await pool.execute(
      'UPDATE users SET avatar_frame = ?, updated_at = NOW() WHERE id = ?',
      [frameId, userId]
    );
  }

  /**
   * 递增 token_version（登出时使所有令牌失效）
   * @param {number} userId
   */
  static async incrementTokenVersion(userId) {
    await pool.execute(
      'UPDATE users SET token_version = token_version + 1 WHERE id = ?',
      [userId]
    );
  }

  // ========== 菜单相关 ==========

  /**
   * 获取所有可见菜单（管理员用）
   * @returns {Promise<Array>}
   */
  static async getAllVisibleMenus() {
    const [menus] = await pool.execute(
      `SELECT ${MENU_FIELDS}
       FROM menus
       WHERE status = 1 AND visible = 1 AND type <> 2
       ORDER BY sort_order, id`
    );
    return menus;
  }

  /**
   * 获取用户角色 ID 列表
   * @param {number} userId
   * @returns {Promise<number[]>}
   */
  static async getUserRoleIds(userId) {
    const [userRoles] = await pool.execute(
      'SELECT role_id FROM user_roles WHERE user_id = ?',
      [userId]
    );
    if (userRoles.length > 0) {
      return userRoles.map((r) => r.role_id);
    }

    // 兜底：如果 user_roles 为空但用户本身是 admin，尝试查找 admin 角色的 ID
    const [users] = await pool.execute(
      'SELECT role, username FROM users WHERE id = ?',
      [userId]
    );
    if (users.length > 0) {
      const u = users[0];
      const role = String(u.role || '').toLowerCase();
      const username = String(u.username || '').toLowerCase();
      if (role === 'admin' || role === 'super_admin' || username === 'admin') {
        const [adminRoles] = await pool.execute(
          "SELECT id FROM roles WHERE LOWER(code) IN ('admin', 'super_admin') AND status = 1 LIMIT 1"
        );
        if (adminRoles.length > 0) {
          return [adminRoles[0].id];
        }
      }
    }

    return [];
  }

  /**
   * 根据角色获取菜单 ID
   * @param {number[]} roleIds
   * @returns {Promise<number[]>}
   */
  static async getMenuIdsByRoles(roleIds) {
    if (roleIds.length === 0) return [];
    const placeholders = roleIds.map(() => '?').join(',');
    const [roleMenus] = await pool.execute(
      `SELECT DISTINCT menu_id FROM role_menus WHERE role_id IN (${placeholders})`,
      roleIds
    );
    return roleMenus.map((r) => r.menu_id);
  }

  /**
   * 根据菜单 ID 列表获取菜单详情
   * @param {number[]} menuIds
   * @returns {Promise<Array>}
   */
  static async getMenusByIds(menuIds) {
    if (menuIds.length === 0) return [];
    const placeholders = menuIds.map(() => '?').join(',');
    const [menus] = await pool.execute(
      `SELECT ${MENU_FIELDS}
       FROM menus
       WHERE id IN (${placeholders}) AND status = 1 AND visible = 1 AND type <> 2
       ORDER BY sort_order`,
      menuIds
    );
    return menus;
  }

  /**
   * 根据 ID 列表获取父菜单
   * @param {number[]} parentIds
   * @returns {Promise<Array>}
   */
  static async getParentMenus(parentIds) {
    if (parentIds.length === 0) return [];
    const placeholders = parentIds.map(() => '?').join(',');
    const [parents] = await pool.execute(
      `SELECT ${MENU_FIELDS}
       FROM menus
       WHERE id IN (${placeholders}) AND status = 1 AND visible = 1 AND type <> 2`,
      parentIds
    );
    return parents;
  }

  /**
   * 使用递归 CTE 获取菜单及其所有祖先菜单（MySQL 8.x）
   * 一次查询替代 while 循环多次查父节点
   * @param {number[]} menuIds - 权限菜单 ID 列表
   * @returns {Promise<Array>} 包含所有菜单及其祖先的去重列表
   */
  static async getMenusWithAncestors(menuIds) {
    if (menuIds.length === 0) return [];
    const placeholders = menuIds.map(() => '?').join(',');
    const [menus] = await pool.execute(
      `WITH RECURSIVE menu_tree AS (
         SELECT id, parent_id, name, path, icon, permission, type, visible, sort_order
         FROM menus
         WHERE id IN (${placeholders}) AND status = 1 AND visible = 1 AND type <> 2
         UNION
         SELECT m.id, m.parent_id, m.name, m.path, m.icon, m.permission, m.type, m.visible, m.sort_order
         FROM menus m
         INNER JOIN menu_tree mt ON m.id = mt.parent_id
         WHERE m.status = 1 AND m.visible = 1 AND m.type <> 2
       )
       SELECT DISTINCT id, parent_id, name, path, icon, permission, type, visible, sort_order AS sort
       FROM menu_tree
       ORDER BY sort_order, id`,
      menuIds
    );
    return menus;
  }

  /**
   * 构建菜单树结构
   * @param {Array} menus - 菜单平铺列表
   * @returns {Array} 菜单树
   */
  static buildMenuTree(menus) {
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

    // 递归排序
    const sortMenus = (nodes) => {
      nodes.sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.id - b.id);
      nodes.forEach((n) => {
        if (n.children && n.children.length > 0) {
          sortMenus(n.children);
        }
      });
    };
    sortMenus(tree);

    return tree;
  }
}

module.exports = AuthService;
