/**
 * system.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const PasswordSecurity = require('../utils/passwordSecurity');
const { normalizeUsername } = require('../utils/usernameSecurity');
const { isSuperAdminRole } = require('../authorization/superAdmin');
const {
  disconnectUserSessions,
  revokeRoleSessionsInTransaction,
  revokeUserSockets,
} = require('../utils/sessionRevocation');
const RefreshTokenService = require('../services/auth/RefreshTokenService');
const { parsePagination, appendPaginationSQL } = require('../utils/safePagination');

// 系统管理模块模型

/** 部门字段标准化（消除 getAllDepartments / getDepartmentById 重复映射） */
function _normalizeDept(dept) {
  return {
    ...dept,
    parent_id: dept.parent_id !== undefined ? dept.parent_id : null,
    code: dept.code || '',
    manager_id: dept.manager_id || null,
    manager_name: dept.manager_name || '',
    phone: dept.phone || '',
    status: dept.status !== undefined ? dept.status : 1,
    remark: dept.remark || '',
  };
}

function normalizeBinaryStatus(value, fieldName = 'status') {
  if (value === true || value === 1 || value === '1') return 1;
  if (value === false || value === 0 || value === '0') return 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['active', 'enabled', 'enable', 'normal'].includes(normalized)) return 1;
    if (['inactive', 'disabled', 'disable', 'locked'].includes(normalized)) return 0;
  }
  throw new Error(`${fieldName} must be 0 or 1`);
}

function normalizeNullableId(value) {
  if (value === undefined || value === null || value === '' || Number(value) === 0) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('id must be a positive integer');
  }
  return parsed;
}

function normalizeIdList(value, fieldName) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  return [...new Set(value.map((id) => {
    const parsed = Number(id);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`${fieldName} contains invalid id`);
    }
    return parsed;
  }))];
}

async function assertAssignableRoleIds(connection, roleIds, options = {}) {
  if (roleIds.length === 0) return [];

  const placeholders = roleIds.map(() => '?').join(',');
  const [roles] = await connection.execute(
    `SELECT id, code, name, status, is_super_admin FROM roles WHERE id IN (${placeholders})`,
    roleIds
  );

  const existingIds = new Set(roles.map((role) => Number(role.id)));
  const missingIds = roleIds.filter((roleId) => !existingIds.has(roleId));
  if (missingIds.length > 0) {
    throw new Error(`invalid roleIds: ${missingIds.join(',')}`);
  }

  const disabledIds = roles
    .filter((role) => Number(role.status) !== 1)
    .map((role) => Number(role.id));
  if (disabledIds.length > 0) {
    throw new Error(`invalid roleIds: disabled roles ${disabledIds.join(',')}`);
  }

  const adminIds = roles
    .filter((role) => Number(role.is_super_admin || 0) === 1)
    .map((role) => Number(role.id));
  if (adminIds.length > 0 && !options.allowAdminRole) {
    throw new Error('FORBIDDEN: assigning admin role requires super administrator');
  }

  return roles;
}

async function assertExistingMenuIds(connection, menuIds) {
  if (menuIds.length === 0) return [];

  const placeholders = menuIds.map(() => '?').join(',');
  const [menus] = await connection.execute(
    `SELECT id FROM menus WHERE id IN (${placeholders})`,
    menuIds
  );
  const existingIds = new Set(menus.map((menu) => Number(menu.id)));
  const missingIds = menuIds.filter((menuId) => !existingIds.has(menuId));
  if (missingIds.length > 0) {
    throw new Error(`invalid menuIds: ${missingIds.join(',')}`);
  }

  return menus;
}

function normalizeMenuData(menuData = {}) {
  const { normalizePermissionCode } = require('../services/PermissionRegistry');
  const rawPermission = menuData.permission ? String(menuData.permission).trim() : null;
  return {
    parent_id: normalizeNullableId(menuData.parent_id ?? menuData.parentId),
    name: String(menuData.name || '').trim(),
    path: menuData.path || null,
    component: menuData.component || null,
    redirect: menuData.redirect || null,
    icon: menuData.icon || null,
    permission: rawPermission ? normalizePermissionCode(rawPermission) : null,
    type: menuData.type !== undefined ? Number(menuData.type) : 1,
    visible: menuData.visible !== undefined ? normalizeBinaryStatus(menuData.visible, 'visible') : 1,
    status: menuData.status !== undefined ? normalizeBinaryStatus(menuData.status) : 1,
    sort_order: Number(menuData.sort_order ?? menuData.sort ?? 0) || 0,
  };
}

async function assertDepartmentIsValid(connection, departmentData, id = null) {
  const name = String(departmentData.name || '').trim();
  const code = String(departmentData.code || '').trim();
  const parentId = normalizeNullableId(departmentData.parent_id);
  const targetId = id ? Number(id) : null;

  if (!name) throw new Error('department name is required');
  if (!code) throw new Error('department code is required');
  if (targetId && parentId === targetId) {
    throw new Error('部门不能挂到自身下级');
  }

  if (parentId) {
    const [[parent]] = await connection.execute('SELECT id, parent_id FROM departments WHERE id = ?', [parentId]);
    if (!parent) throw new Error('上级部门不存在');

    let currentParent = parent.parent_id;
    let depth = 0;
    while (targetId && currentParent && depth < 50) {
      if (Number(currentParent) === targetId) {
        throw new Error('部门不能挂到自己的下级部门下面');
      }
      const [[nextParent]] = await connection.execute(
        'SELECT parent_id FROM departments WHERE id = ?',
        [currentParent]
      );
      currentParent = nextParent?.parent_id;
      depth++;
    }
  }

  const idClause = targetId ? ' AND id <> ?' : '';
  const idParams = targetId ? [targetId] : [];
  const [sameCode] = await connection.execute(
    `SELECT id FROM departments WHERE code = ?${idClause} LIMIT 1`,
    [code, ...idParams]
  );
  if (sameCode.length > 0) {
    throw new Error('部门编码已存在');
  }

  const parentNameParams = parentId === null
    ? [name, ...idParams]
    : [name, parentId, ...idParams];
  const parentNameWhere = parentId === null ? 'parent_id IS NULL' : 'parent_id = ?';
  const [sameName] = await connection.execute(
    `SELECT id FROM departments WHERE name = ? AND ${parentNameWhere}${idClause} LIMIT 1`,
    parentNameParams
  );
  if (sameName.length > 0) {
    throw new Error('同一上级部门下部门名称已存在');
  }

  return {
    ...departmentData,
    name,
    code,
    parent_id: parentId,
    status: departmentData.status !== undefined ? normalizeBinaryStatus(departmentData.status) : 1,
  };
}

async function assertRoleIsValid(connection, roleData, id = null) {
  const name = String(roleData.name || '').trim();
  const code = String(roleData.code || '').trim();
  const targetId = id ? Number(id) : null;

  if (!name) throw new Error('role name is required');
  if (!code) throw new Error('role code is required');

  const idClause = targetId ? ' AND id <> ?' : '';
  const idParams = targetId ? [targetId] : [];
  const [sameName] = await connection.execute(
    `SELECT id FROM roles WHERE name = ?${idClause} LIMIT 1`,
    [name, ...idParams]
  );
  if (sameName.length > 0) {
    throw new Error('角色名称已存在');
  }

  const [sameCode] = await connection.execute(
    `SELECT id FROM roles WHERE code = ?${idClause} LIMIT 1`,
    [code, ...idParams]
  );
  if (sameCode.length > 0) {
    throw new Error('角色编码已存在');
  }

  // data_scope: 1 ALL | 2 DEPT+子 | 3 DEPT | 4 SELF | 5 CUSTOM
  const dataScope = roleData.data_scope !== undefined && roleData.data_scope !== null
    ? Number(roleData.data_scope)
    : undefined;
  if (dataScope !== undefined) {
    if (![1, 2, 3, 4, 5].includes(dataScope)) {
      throw new Error('data_scope 必须是 1-5');
    }
  }

  return {
    ...roleData,
    name,
    code,
    status: roleData.status !== undefined ? normalizeBinaryStatus(roleData.status) : 1,
    data_scope: dataScope,
  };
}

async function assertMenuIsValid(connection, menuData, id = null) {
  const data = normalizeMenuData(menuData);
  const targetId = id ? Number(id) : null;

  if (!data.name) throw new Error('menu name is required');
  if (![0, 1, 2].includes(data.type)) throw new Error('menu type must be 0, 1 or 2');
  if (data.parent_id) {
    const [[parent]] = await connection.execute('SELECT id, parent_id FROM menus WHERE id = ?', [data.parent_id]);
    if (!parent) throw new Error('上级菜单不存在');
    if (targetId && data.parent_id === targetId) {
      throw new Error('菜单不能挂到自身下面');
    }

    let currentParent = parent.parent_id;
    let depth = 0;
    while (targetId && currentParent && depth < 50) {
      if (Number(currentParent) === targetId) {
        throw new Error('菜单不能挂到自己的子菜单下面');
      }
      const [[nextParent]] = await connection.execute(
        'SELECT parent_id FROM menus WHERE id = ?',
        [currentParent]
      );
      currentParent = nextParent?.parent_id;
      depth++;
    }
  }

  const idClause = targetId ? ' AND id <> ?' : '';
  const idParams = targetId ? [targetId] : [];
  // 权限码允许多菜单共享（同一 view 挂多个页面/按钮是 ERP 常态）
  // 仅对「按钮 type=2 + 相同 path」做重复校验无意义；路径唯一性见下方

  if (data.path && data.type < 2) {
    const [samePath] = await connection.execute(
      `SELECT id FROM menus WHERE path = ?${idClause} LIMIT 1`,
      [data.path, ...idParams]
    );
    if (samePath.length > 0) {
      throw new Error('菜单路由路径已存在');
    }
  }

  return data;
}

const systemModel = {
  // 用户管理
  async getAllUsers(page = 1, pageSize = 10, filters = {}) {
    const pagination = parsePagination(page, pageSize, { defaultPageSize: 10, maxPageSize: 100 });
    let whereClause = '1=1';
    const params = [];

    if (filters.username) {
      whereClause += ' AND u.username LIKE ?';
      params.push(`%${filters.username}%`);
    }
    if (filters.name) {
      whereClause += ' AND u.real_name LIKE ?';
      params.push(`%${filters.name}%`);
    }
    if (filters.keyword) {
      whereClause += ' AND (u.username LIKE ? OR u.real_name LIKE ? OR u.email LIKE ?)';
      params.push(`%${filters.keyword}%`, `%${filters.keyword}%`, `%${filters.keyword}%`);
    }
    if (filters.departmentId) {
      whereClause += ' AND u.department_id = ?';
      params.push(filters.departmentId);
    }
    if (filters.status !== undefined && filters.status !== '') {
      whereClause += ' AND u.status = ?';
      params.push(parseInt(filters.status));
    }

    // 获取总记录数
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM users u WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // 获取分页数据，包括关联的部门信息
    const listSql = appendPaginationSQL(
      `SELECT u.id, u.username, u.real_name, u.email, u.phone,
              u.department_id, u.position, u.role, u.avatar, u.bio,
              u.status, u.created_at, u.updated_at,
              d.name as departmentName
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE ${whereClause}
       ORDER BY u.id DESC`,
      pagination.limit,
      pagination.offset
    );
    const [rows] = await pool.execute(listSql, [...params]);

    // ✅ 优化: 使用 IN 查询一次性获取所有用户的角色（避免 N+1 查询）
    if (rows.length > 0) {
      const userIds = rows.map((u) => u.id);
      const userIdPlaceholders = userIds.map(() => '?').join(',');
      const [allRoles] = await pool.execute(
        `SELECT ur.user_id, r.*
         FROM roles r
         JOIN user_roles ur ON r.id = ur.role_id
         WHERE ur.user_id IN (${userIdPlaceholders})`,
        userIds
      );

      // 按用户ID分组角色
      const rolesByUser = {};
      allRoles.forEach((role) => {
        if (!rolesByUser[role.user_id]) {
          rolesByUser[role.user_id] = [];
        }
        rolesByUser[role.user_id].push(role);
      });

      rows.forEach((user) => {
        user.roles = rolesByUser[user.id] || [];
        user.roleNames = user.roles.map((r) => r.name).join(', ');
      });
    }

    return {
      list: rows,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  },

  async getUserById(id) {
    try {
      // 确保id是数字类型
      const userId = parseInt(id, 10);
      if (isNaN(userId)) {
        throw new Error('无效的用户ID');
      }

      const [rows] = await pool.execute(
        `SELECT id, username, real_name, email, phone, department_id,
                position, role, avatar, bio, status, created_at, updated_at
         FROM users WHERE id = ?`,
        [userId]
      );
      if (!rows.length) return null;

      const user = rows[0];

      // 获取用户角色
      const [roles] = await pool.execute(
        `SELECT r.* FROM roles r
         JOIN user_roles ur ON r.id = ur.role_id
         WHERE ur.user_id = ?`,
        [userId]
      );
      user.roles = roles;

      return user;
    } catch (error) {
      logger.error('获取用户详情失败:', error);
      throw error;
    }
  },

  async createUser(userData, options = {}) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const username = normalizeUsername(userData.username);
      const password = userData.password;
      const roleIds = normalizeIdList(userData.roleIds, 'roleIds');
      const roleRows = await assertAssignableRoleIds(connection, roleIds, {
        allowAdminRole: options.allowAdminRole === true,
      });

      if (!username) {
        throw new Error('用户名长度需在2到50个字符之间');
      }
      const status = userData.status !== undefined ? normalizeBinaryStatus(userData.status) : 1;
      const departmentId = normalizeNullableId(userData.department_id);

      // 检查用户名是否已存在
      const [existingUsers] = await connection.execute('SELECT id, username, password, token_version, email, phone, role, department_id, status, created_at, updated_at, avatar, real_name, department, position, last_login_at, employee_no, hire_date, birthday, gender, id_card, address, emergency_contact, emergency_phone, salary, employee_status, notes, password_changed_at, password_expires_at, failed_login_attempts, locked_until, last_login_ip, force_password_change, two_factor_enabled, two_factor_secret, avatar_frame, bio, theme_settings FROM users WHERE username = ?', [
        username,
      ]);

      if (existingUsers.length > 0) {
        throw new Error('用户名已存在');
      }

      // 验证密码强度
      const passwordValidation = PasswordSecurity.validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        throw new Error(`密码不符合安全要求: ${passwordValidation.errors.join(', ')}`);
      }

      // 密码加密
      const hashedPassword = await PasswordSecurity.hashPassword(password);

      // 从roleIds获取第一个角色的code作为role字段的值
      let roleCode = 'user'; // 默认值
      if (roleIds.length > 0) {
        const firstRole = roleRows.find((role) => Number(role.id) === roleIds[0]);
        if (firstRole) {
          roleCode = firstRole.code;
        }
      }

      // 插入用户基本信息
      const [result] = await connection.execute(
        `INSERT INTO users (username, password, real_name, email, department_id, position, role, status, force_password_change, password_changed_at, password_expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), DATE_ADD(NOW(), INTERVAL 90 DAY), NOW(), NOW())`,
        [
          username,
          hashedPassword,
          userData.name || userData.real_name, // 支持两种命名方式
          userData.email || null,
          departmentId,
          userData.position || null,
          roleCode,
          status,
        ]
      );

      const userId = result.insertId;

      await PasswordSecurity.savePasswordHistory(userId, hashedPassword, connection);

      // 插入用户角色关联
      if (roleIds.length > 0) {
        for (const roleId of roleIds) {
          await connection.execute(
            'INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, NOW())',
            [userId, roleId]
          );
        }
      }

      await connection.commit();

      // user_roles 变更：模型层清缓存（控制器再清亦可幂等）
      try {
        const PermissionService = require('../services/PermissionService');
        await PermissionService.clearUserPermissionsCache(userId);
      } catch {
        // 不阻断主流程
      }

      return {
        id: userId,
        username,
        real_name: userData.name || userData.real_name || null,
        email: userData.email || null,
        department_id: departmentId,
        position: userData.position || null,
        role: roleCode,
        status,
        roleIds,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateUser(id, userData, options = {}) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const userId = Number(id);
      if (!Number.isInteger(userId) || userId <= 0) {
        throw new Error('invalid user id');
      }
      const [[existingUser]] = await connection.execute(
        'SELECT id, username, real_name, email, phone, role, status, department_id, position, token_version FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (!existingUser) {
        throw new Error('NOT_FOUND: user not found');
      }
      const roleIds =
        userData.roleIds !== undefined ? normalizeIdList(userData.roleIds, 'roleIds') : null;
      const [existingRoleRows] = await connection.execute(
        'SELECT role_id FROM user_roles WHERE user_id = ? ORDER BY role_id FOR UPDATE',
        [userId]
      );
      const existingRoleIds = existingRoleRows.map((row) => Number(row.role_id));
      const roleRows = roleIds
        ? await assertAssignableRoleIds(connection, roleIds, {
            allowAdminRole: options.allowAdminRole === true,
          })
        : [];
      const status =
        userData.status !== undefined
          ? normalizeBinaryStatus(userData.status)
          : existingUser.status;
      const nextDepartmentId = userData.department_id !== undefined
        ? normalizeNullableId(userData.department_id)
        : existingUser.department_id;
      const nextPosition = userData.position !== undefined
        ? (userData.position === null || userData.position === '' ? null : String(userData.position).trim())
        : existingUser.position;
      const nextRealName = userData.name !== undefined
        ? userData.name
        : (userData.real_name !== undefined ? userData.real_name : existingUser.real_name);
      const nextEmail = userData.email !== undefined ? userData.email : existingUser.email;
      const nextPhone = userData.phone !== undefined ? userData.phone : existingUser.phone;
      const rolesChanged = roleIds !== null && (() => {
        const before = new Set(existingRoleIds);
        const after = new Set(roleIds);
        return before.size !== after.size || [...before].some((roleId) => !after.has(roleId));
      })();
      const securityAttributesChanged =
        rolesChanged ||
        Number(nextDepartmentId ?? 0) !== Number(existingUser.department_id ?? 0) ||
        String(nextPosition ?? '') !== String(existingUser.position ?? '') ||
        Number(status) !== Number(existingUser.status);

      // 从roleIds获取第一个角色的code作为role字段的值
      let roleCode = existingUser.role || 'user';
      if (roleIds && roleIds.length > 0) {
        const firstRole = roleRows.find((role) => Number(role.id) === roleIds[0]);
        if (firstRole) {
          roleCode = firstRole.code;
        }
      }

      // 更新用户基本信息
      await connection.execute(
        `UPDATE users SET
          real_name = ?,
          email = ?,
          phone = ?,
          department_id = ?,
          position = ?,
          role = ?,
          status = ?,
           token_version = CASE
             WHEN ? = 1 THEN COALESCE(token_version, 0) + 1
             ELSE COALESCE(token_version, 0)
          END,
          updated_at = NOW()
         WHERE id = ?`,
        [
          nextRealName,
          nextEmail || null,
          nextPhone || null,
          nextDepartmentId,
          nextPosition,
          roleCode,
          status,
          securityAttributesChanged ? 1 : 0,
          userId,
        ]
      );

      // 更新用户角色关联
      if (roleIds) {
        // 先删除现有角色关联
        await connection.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);

        // 添加新的角色关联
        for (const roleId of roleIds) {
          await connection.execute(
            'INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, NOW())',
            [userId, roleId]
          );
        }
      }

      if (securityAttributesChanged) {
        await RefreshTokenService.revokeUserTokens(userId, connection);
      }

      await connection.commit();

      try {
        const PermissionService = require('../services/PermissionService');
        await PermissionService.clearUserPermissionsCache(userId);
      } catch {
        // 不阻断主流程
      }

      if (securityAttributesChanged) {
        revokeUserSockets(userId, 'user_authorization_changed');
      }

      return {
        id: userId,
        username: existingUser.username,
        real_name: nextRealName,
        email: nextEmail,
        phone: nextPhone,
        department_id: nextDepartmentId,
        position: nextPosition,
        role: roleCode,
        status,
        roleIds: roleIds || existingRoleIds,
        audit: {
          before: {
            username: existingUser.username,
            real_name: existingUser.real_name,
            email: existingUser.email,
            phone: existingUser.phone,
            department_id: existingUser.department_id,
            position: existingUser.position,
            role: existingUser.role,
            roleIds: existingRoleIds,
            status: existingUser.status,
          },
          after: {
            username: existingUser.username,
            real_name: nextRealName,
            email: nextEmail,
            phone: nextPhone,
            department_id: nextDepartmentId,
            position: nextPosition,
            role: roleCode,
            roleIds: roleIds || existingRoleIds,
            status,
          },
          securityAttributesChanged,
        },
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateUserStatus(id, status) {
    const normalizedStatus = normalizeBinaryStatus(status);
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) throw new Error('invalid user id');
    const connection = await pool.getConnection();
    let result;
    let changed;
    let before;
    try {
      await connection.beginTransaction();
      const [[existingUser]] = await connection.execute(
        'SELECT id, username, status, token_version FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (!existingUser) {
        await connection.rollback();
        return false;
      }
      before = { id: userId, username: existingUser.username, status: Number(existingUser.status) };
      changed = Number(existingUser.status) !== normalizedStatus;
      [result] = await connection.execute(
        `UPDATE users SET
           status = ?,
           token_version = CASE WHEN ? = 1 THEN COALESCE(token_version, 0) + 1 ELSE token_version END,
           updated_at = NOW()
         WHERE id = ?`,
        [normalizedStatus, changed ? 1 : 0, userId]
      );
      if (changed) await RefreshTokenService.revokeUserTokens(userId, connection);
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch { /* preserve original error */ }
      throw error;
    } finally {
      connection.release();
    }
    if (changed) revokeUserSockets(userId, 'account_status_changed');
    return {
      changed,
      affectedRows: result.affectedRows,
      audit: {
        before,
        after: { ...before, status: normalizedStatus },
      },
    };
  },

  async resetUserPassword(id, password) {
    const passwordValidation = PasswordSecurity.validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      throw new Error(`密码不符合安全要求: ${passwordValidation.errors.join(', ')}`);
    }
    const hashedPassword = await PasswordSecurity.hashPassword(password);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [[existingUser]] = await connection.execute(
        'SELECT id, username, password FROM users WHERE id = ? FOR UPDATE',
        [id]
      );
      if (!existingUser) {
        await connection.rollback();
        return false;
      }
      if (await PasswordSecurity.verifyPassword(password, existingUser.password)) {
        throw new Error('新密码不能与当前密码相同');
      }
      if (!(await PasswordSecurity.checkPasswordHistory(id, password, connection))) {
        throw new Error('新密码不能与最近使用过的密码相同');
      }
      const [result] = await connection.execute(
        `UPDATE users
            SET password = ?,
                token_version = COALESCE(token_version, 0) + 1,
                force_password_change = 1,
                password_changed_at = NOW(),
                password_expires_at = DATE_ADD(NOW(), INTERVAL 90 DAY),
                updated_at = NOW()
          WHERE id = ?`,
        [hashedPassword, id]
      );
      await PasswordSecurity.savePasswordHistory(id, hashedPassword, connection);
      await RefreshTokenService.revokeUserTokens(id, connection);
      await connection.commit();
      revokeUserSockets(id, 'password_reset');
      return {
        changed: result.affectedRows > 0,
        audit: { userId: Number(id), username: existingUser.username },
      };
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original validation/database error.
      }
      throw error;
    } finally {
      connection.release();
    }
  },

  // 部门管理
  async getAllDepartments(filters = {}) {
    let whereClause = '1=1';
    const params = [];

    if (filters.name) {
      whereClause += ' AND d.name LIKE ?';
      params.push(`%${filters.name}%`);
    }
    if (filters.code) {
      whereClause += ' AND d.code LIKE ?';
      params.push(`%${filters.code}%`);
    }
    if (filters.status !== undefined && filters.status !== '') {
      whereClause += ' AND d.status = ?';
      params.push(parseInt(filters.status));
    }

    // 查询部门并统计用户数量
    const [rows] = await pool.execute(
      `SELECT d.*,
              u.real_name as manager_name,
              COUNT(DISTINCT eu.id) as user_count
       FROM departments d
       LEFT JOIN users u ON d.manager_id = u.id
       LEFT JOIN users eu ON d.id = eu.department_id AND eu.status = 1
       WHERE ${whereClause}
       GROUP BY d.id
       ORDER BY d.id ASC`,
      params
    );

    const departments = rows.map((dept) => ({
      ..._normalizeDept(dept),
      user_count: dept.user_count || 0,
      children: [],
    }));

    return departments;
  },

  async getDepartmentById(id) {
    const [rows] = await pool.execute(
      `SELECT d.*, u.real_name as manager_name
       FROM departments d
       LEFT JOIN users u ON d.manager_id = u.id
       WHERE d.id = ?`,
      [id]
    );
    if (!rows.length) return null;
    return _normalizeDept(rows[0]);
  },

  async createDepartment(departmentData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const data = await assertDepartmentIsValid(connection, departmentData);
      const [result] = await connection.execute(
        `INSERT INTO departments (
          name,
          parent_id,
          code,
          manager_id,
          phone,
          status,
          remark,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          data.name,
          data.parent_id,
          data.code,
          data.manager_id || null,
          data.phone || '',
          data.status,
          data.remark || '',
        ]
      );
      await connection.commit();
      return {
        id: result.insertId,
        ...data,
        created_at: new Date(),
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateDepartment(id, departmentData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [[existing]] = await connection.execute('SELECT id FROM departments WHERE id = ?', [id]);
      if (!existing) return false;
      const data = await assertDepartmentIsValid(connection, departmentData, id);
      const [result] = await connection.execute(
        `UPDATE departments SET
          name = ?,
          parent_id = ?,
          code = ?,
          manager_id = ?,
          phone = ?,
          status = ?,
          remark = ?
        WHERE id = ?`,
        [
          data.name,
          data.parent_id,
          data.code,
          data.manager_id || null,
          data.phone || null,
          data.status,
          data.remark || null,
          id,
        ]
      );
      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateDepartmentStatus(id, status) {
    const normalizedStatus = normalizeBinaryStatus(status);
    const [result] = await pool.execute('UPDATE departments SET status = ? WHERE id = ?', [
      normalizedStatus,
      id,
    ]);
    return result.affectedRows > 0;
  },

  async deleteDepartment(id) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 防幽灵孤儿：1. 检查是否存在子部门
      const [children] = await connection.execute(
        'SELECT COUNT(*) as count FROM departments WHERE parent_id = ?',
        [id]
      );
      if (children[0].count > 0) {
        throw new Error('BLOCK_DELETE:存在下属子部门，请先解散或转移子部门');
      }

      // 防幽灵孤儿：2. 检查是否有用户归属于该部门
      const [users] = await connection.execute(
        'SELECT COUNT(*) as count FROM users WHERE department_id = ?',
        [id]
      );
      if (users[0].count > 0) {
        throw new Error(`BLOCK_DELETE:该部门下还挂载着 ${users[0].count} 名用户，无法直接删除`);
      }

      const [result] = await connection.execute('DELETE FROM departments WHERE id = ?', [id]);
      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // 角色管理
  async getAllRoles(page = 1, pageSize = 10, filters = {}) {
    const pagination = parsePagination(page, pageSize, { defaultPageSize: 10, maxPageSize: 100 });
    let whereClause = '1=1';
    const params = [];

    if (filters.name) {
      whereClause += ' AND name LIKE ?';
      params.push(`%${filters.name}%`);
    }
    if (filters.code) {
      whereClause += ' AND code LIKE ?';
      params.push(`%${filters.code}%`);
    }
    if (filters.status !== undefined && filters.status !== '') {
      whereClause += ' AND status = ?';
      params.push(parseInt(filters.status));
    }

    // 获取总记录数
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM roles WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // 获取分页数据
    const roleSql = appendPaginationSQL(
      `SELECT id, name, code, description, status, created_at, updated_at, data_scope, is_super_admin FROM roles WHERE ${whereClause} ORDER BY id ASC`,
      pagination.limit,
      pagination.offset
    );
    const [rows] = await pool.execute(roleSql, params);
    const RoleAccessService = require('../services/RoleAccessService');

    return {
      list: rows.map((role) => ({
        ...role,
        access_profile: RoleAccessService.describe(role.code, role.is_super_admin),
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  },

  async getRoleById(id) {
    const [rows] = await pool.execute('SELECT id, name, code, description, status, created_at, updated_at, data_scope, is_super_admin FROM roles WHERE id = ?', [id]);

    if (!rows.length) return null;

    const role = rows[0];
    const RoleAccessService = require('../services/RoleAccessService');
    role.access_profile = RoleAccessService.describe(role.code, role.is_super_admin);

    // 角色菜单（导航）
    const [menus] = await pool.execute(
      `SELECT m.* FROM menus m
       JOIN role_menus rm ON m.id = rm.menu_id
       WHERE rm.role_id = ?`,
      [id]
    );
    role.menus = menus;
    role.permissions = menus; // 兼容旧前端字段

    // 鉴权权限码 SSOT
    try {
      const [permCodes] = await pool.execute(
        `SELECT p.id, p.code, p.name, p.module
           FROM permissions p
           JOIN role_permissions rp ON rp.permission_id = p.id
          WHERE rp.role_id = ? AND p.status = 1
          ORDER BY p.code`,
        [id]
      );
      role.permissionCodes = permCodes.map((p) => p.code);
      role.permissionRecords = permCodes;
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
      role.permissionCodes = [
        ...new Set(menus.map((m) => m.permission).filter(Boolean)),
      ];
    }

    return role;
  },

  async createRole(roleData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const data = await assertRoleIsValid(connection, roleData);

      // 校验角色名称唯一性
      const [existingName] = await connection.execute(
        'SELECT id FROM roles WHERE name = ?',
        [data.name]
      );
      if (existingName.length > 0) {
        throw new Error('角色名称已存在，请使用其他名称');
      }

      // 校验角色编码唯一性
      if (data.code) {
        const [existingCode] = await connection.execute(
          'SELECT id FROM roles WHERE code = ?',
          [data.code]
        );
        if (existingCode.length > 0) {
          throw new Error('角色编码已存在，请使用其他编码');
        }
      }

      // 插入角色基本信息（含 data_scope，默认 SELF=4 更安全）
      const dataScope = data.data_scope !== undefined ? data.data_scope : 4;
      const [result] = await connection.execute(
        `INSERT INTO roles (name, code, description, status, data_scope, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [data.name, data.code, data.description, data.status, dataScope]
      );

      const roleId = result.insertId;

      // 插入角色菜单 + 同步 role_permissions（鉴权 SSOT）
      const menuIds = normalizeIdList(data.menuIds, 'menuIds');
      await assertExistingMenuIds(connection, menuIds);
      if (menuIds.length > 0) {
        for (const menuId of menuIds) {
          await connection.execute('INSERT INTO role_menus (role_id, menu_id) VALUES (?, ?)', [
            roleId,
            menuId,
          ]);
        }
      }
      const { syncRolePermissionsFromMenus } = require('../services/PermissionRegistry');
      const RoleAccessService = require('../services/RoleAccessService');
      if (menuIds.length === 0 && data.code) {
        await RoleAccessService.applyRole(connection, {
          id: roleId,
          code: data.code,
          name: data.name,
          is_super_admin: 0,
        });
      } else {
        const scopedMenuIds = await RoleAccessService.clampMenuIds(
          connection,
          { id: roleId, code: data.code, is_super_admin: 0 },
          menuIds
        );
        if (scopedMenuIds.length !== menuIds.length) {
          await connection.execute('DELETE FROM role_menus WHERE role_id = ?', [roleId]);
          for (const menuId of scopedMenuIds) {
            await connection.execute('INSERT INTO role_menus (role_id, menu_id) VALUES (?, ?)', [
              roleId,
              menuId,
            ]);
          }
        }
        await syncRolePermissionsFromMenus(connection, roleId, scopedMenuIds.length ? scopedMenuIds : menuIds);
      }

      await connection.commit();

      try {
        const PermissionService = require('../services/PermissionService');
        await PermissionService.clearUserPermissionsCache();
      } catch {
        // ignore
      }

      return { id: roleId, ...data, data_scope: dataScope, menuIds };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateRole(id, roleData) {
    const connection = await pool.getConnection();
    let revokedUserIds = [];
    try {
      await connection.beginTransaction();
      const [[existing]] = await connection.execute(
        'SELECT id, name, code, description, status, data_scope, is_super_admin FROM roles WHERE id = ?',
        [id]
      );
      if (!existing) throw new Error('NOT_FOUND: role not found');
      const data = await assertRoleIsValid(
        connection,
        { ...existing, ...(roleData || {}) },
        id
      );
      const roleSecurityChanged =
        data.code !== existing.code ||
        Number(data.status) !== Number(existing.status) ||
        Number(data.data_scope ?? existing.data_scope) !== Number(existing.data_scope);

      // 基本信息 + data_scope
      {
        await connection.execute(
          `UPDATE roles SET
            name = ?,
            code = ?,
            description = ?,
            status = ?,
            data_scope = ?,
            updated_at = NOW()
           WHERE id = ?`,
          [data.name, data.code, data.description, data.status, data.data_scope, id]
        );
      }

      // 更新角色菜单 + 同步 role_permissions
      if (data.menuIds !== undefined) {
        const [[roleRow]] = await connection.execute(
          'SELECT id, code, is_super_admin FROM roles WHERE id = ? LIMIT 1',
          [id]
        );
        const RoleAccessService = require('../services/RoleAccessService');
        if (isSuperAdminRole(roleRow)) {
          await RoleAccessService.grantAllAccess(connection, id);
          revokedUserIds = await revokeRoleSessionsInTransaction(connection, [id]);
          await connection.commit();
          try {
            const PermissionService = require('../services/PermissionService');
            await PermissionService.clearUserPermissionsCache();
          } catch {
            // ignore
          }
          disconnectUserSessions(revokedUserIds, 'role_permissions_changed');
          return { id, ...data };
        }
        const menuIds = await RoleAccessService.clampMenuIds(
          connection,
          roleRow || { id },
          normalizeIdList(data.menuIds, 'menuIds')
        );
        await assertExistingMenuIds(connection, menuIds);
        await connection.execute('DELETE FROM role_menus WHERE role_id = ?', [id]);
        if (menuIds.length > 0) {
          for (const menuId of menuIds) {
            await connection.execute('INSERT INTO role_menus (role_id, menu_id) VALUES (?, ?)', [
              id,
              menuId,
            ]);
          }
        }
        const { syncRolePermissionsFromMenus } = require('../services/PermissionRegistry');
        await syncRolePermissionsFromMenus(connection, id, menuIds);
      }

      if (roleSecurityChanged || data.menuIds !== undefined) {
        revokedUserIds = await revokeRoleSessionsInTransaction(connection, [id]);
      }

      await connection.commit();

      try {
        const PermissionService = require('../services/PermissionService');
        await PermissionService.clearUserPermissionsCache();
      } catch {
        // ignore
      }

      disconnectUserSessions(revokedUserIds, 'role_permissions_changed');

      return { id, ...data };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateRoleStatus(id, status) {
    const normalizedStatus = normalizeBinaryStatus(status);
    const roleId = Number(id);
    if (!Number.isInteger(roleId) || roleId <= 0) throw new Error('invalid role id');
    const connection = await pool.getConnection();
    let result;
    let revokedUserIds = [];
    try {
      await connection.beginTransaction();
      [result] = await connection.execute(
        'UPDATE roles SET status = ?, updated_at = NOW() WHERE id = ?',
        [normalizedStatus, roleId]
      );
      if (result.affectedRows > 0) {
        revokedUserIds = await revokeRoleSessionsInTransaction(connection, [roleId]);
      }
      await connection.commit();
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original update error.
      }
      throw error;
    } finally {
      connection.release();
    }
    if (result.affectedRows > 0) {
      try {
        const PermissionService = require('../services/PermissionService');
        await PermissionService.clearUserPermissionsCache();
      } catch {
        // Cache invalidation is best effort; token version revocation remains authoritative.
      }
      disconnectUserSessions(revokedUserIds, 'role_status_changed');
    }
    return result.affectedRows > 0;
  },

  async deleteRole(id) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 检查该角色是否被用户使用
      const [userRoles] = await connection.execute(
        'SELECT COUNT(*) as count FROM user_roles WHERE role_id = ?',
        [id]
      );

      if (userRoles[0].count > 0) {
        throw new Error('该角色已被用户使用，不能删除');
      }

      // 删除角色菜单 / 权限关联
      await connection.execute('DELETE FROM role_menus WHERE role_id = ?', [id]);
      try {
        await connection.execute('DELETE FROM role_permissions WHERE role_id = ?', [id]);
      } catch (e) {
        if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
      }

      // 删除角色
      const [result] = await connection.execute('DELETE FROM roles WHERE id = ?', [id]);

      await connection.commit();
      try {
        const PermissionService = require('../services/PermissionService');
        await PermissionService.clearUserPermissionsCache();
      } catch {
        // ignore
      }
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // 菜单管理
  async getAllMenus(filters = {}) {
    let whereClause = '1=1';
    const params = [];

    if (filters.name) {
      whereClause += ' AND name LIKE ?';
      params.push(`%${filters.name}%`);
    }
    if (filters.status !== undefined && filters.status !== '') {
      whereClause += ' AND status = ?';
      params.push(parseInt(filters.status));
    }

    const [rows] = await pool.execute(
      `SELECT id, parent_id, name, path, component, redirect, icon, permission, type, visible, status, sort_order, created_at, updated_at FROM menus WHERE ${whereClause} ORDER BY id ASC`,
      params
    );

    // 将菜单列表转换为树形结构
    const menus = rows.map((menu) => ({
      ...menu,
      children: [],
    }));

    const menuMap = {};
    menus.forEach((menu) => {
      menuMap[menu.id] = menu;
    });

    const tree = [];
    menus.forEach((menu) => {
      if (menu.parent_id) {
        const parent = menuMap[menu.parent_id];
        if (parent) {
          parent.children.push(menu);
        } else {
          tree.push(menu);
        }
      } else {
        tree.push(menu);
      }
    });

    return tree;
  },

  async getMenuById(id) {
    const [rows] = await pool.execute('SELECT id, parent_id, name, path, component, redirect, icon, permission, type, visible, status, sort_order, created_at, updated_at FROM menus WHERE id = ?', [id]);
    return rows[0];
  },

  async createMenu(menuData) {
    const connection = await pool.getConnection();
    let revokedUserIds = [];
    try {
      await connection.beginTransaction();
      const data = await assertMenuIsValid(connection, menuData);

      // 1. 插入菜单记录
      const [result] = await connection.execute(
        `INSERT INTO menus (
          parent_id, name, path, component, redirect, icon, permission, type, visible, status, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          data.parent_id,
          data.name,
          data.path,
          data.component,
          data.redirect,
          data.icon,
          data.permission,
          data.type,
          data.visible,
          data.status,
          data.sort_order,
        ]
      );
      const menuId = result.insertId;

      // 绑定 permissions SSOT + permission_id
      const {
        bindMenuPermission,
        grantMenuPermissionToRoles,
      } = require('../services/PermissionRegistry');
      await bindMenuPermission(connection, menuId, data.permission, data.name);

      // 2. 按岗位模板决定谁能继承新菜单，禁止“父目录有权限就铺全站”
      const RoleAccessService = require('../services/RoleAccessService');
      const grantedRoleIds = [];
      const [activeRoles] = await connection.execute(
        'SELECT id, code, is_super_admin FROM roles WHERE status = 1'
      );
      const parentRoleIds = new Set();
      if (data.parent_id) {
        const [parentRoles] = await connection.execute(
          'SELECT role_id FROM role_menus WHERE menu_id = ?',
          [data.parent_id]
        );
        for (const row of parentRoles) parentRoleIds.add(Number(row.role_id));
      }

      const newMenu = {
        id: menuId,
        path: data.path,
        permission: data.permission,
        type: data.type,
        parent_id: data.parent_id,
        status: data.status,
      };

      for (const role of activeRoles) {
        const shouldGrant = RoleAccessService.shouldGrantNewMenu(role, newMenu, {
          parentAssigned: parentRoleIds.has(Number(role.id)),
        });
        if (!shouldGrant) continue;
        await connection.execute('INSERT INTO role_menus (role_id, menu_id) VALUES (?, ?)', [
          role.id,
          menuId,
        ]);
        grantedRoleIds.push(role.id);
      }
      logger.info(
        `新菜单 "${menuData.name}" (ID: ${menuId}) 已按岗位模板分配给 ${grantedRoleIds.length} 个角色`
      );

      if (grantedRoleIds.length > 0) {
        await grantMenuPermissionToRoles(connection, menuId, grantedRoleIds);
        revokedUserIds = await revokeRoleSessionsInTransaction(connection, grantedRoleIds);
      }

      await connection.commit();

      try {
        const PermissionService = require('../services/PermissionService');
        await PermissionService.clearUserPermissionsCache();
      } catch {
        // ignore
      }

      disconnectUserSessions(revokedUserIds, 'menu_created');

      return { id: menuId, ...data };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateMenu(id, menuData) {
    const connection = await pool.getConnection();
    let revokedUserIds;
    try {
      await connection.beginTransaction();
      const data = await assertMenuIsValid(connection, menuData, id);

      // --- 防死锁/防环路核心检查 ---
      const parentId = data.parent_id;
      const targetId = parseInt(id, 10);

      if (parentId !== null) {
        // 1. 绝对不能将自己设为自己的父节点
        if (parentId === targetId) {
          throw new Error('操作非法：不能将菜单挂载在其自身之下');
        }

        // 2. 爬溯校验：绝对不能将父节点设置为自己的任何一个子孙节点
        let currentParent = parentId;
        const maxDepth = 20; // 设置最大遍历深度以防止意外的隐藏死循环击穿
        let depth = 0;

        while (currentParent !== null && currentParent !== 0 && depth < maxDepth) {
          if (currentParent === targetId) {
             throw new Error('操作非法：不能将菜单挂载到它的子级菜单下，这会引发系统死循环');
          }
          const [parentRecord] = await connection.execute(
            'SELECT parent_id FROM menus WHERE id = ?',
            [currentParent]
          );
          if (!parentRecord.length) break;
          currentParent = parentRecord[0].parent_id;
          depth++;
        }
      }

      // 执行更新操作
      const [result] = await connection.execute(
        `UPDATE menus SET
          parent_id = ?,
          name = ?,
          path = ?,
          component = ?,
          redirect = ?,
          icon = ?,
          permission = ?,
          type = ?,
          visible = ?,
          status = ?,
          sort_order = ?,
          updated_at = NOW()
         WHERE id = ?`,
        [
          data.parent_id,
          data.name,
          data.path,
          data.component,
          data.redirect,
          data.icon,
          data.permission,
          data.type,
          data.visible,
          data.status,
          data.sort_order,
          id,
        ]
      );

      // 同步 permissions SSOT + permission_id
      const {
        bindMenuPermission,
        syncRolePermissionsFromMenus,
      } = require('../services/PermissionRegistry');
      await bindMenuPermission(connection, id, data.permission, data.name);

      const [affectedRoles] = await connection.execute(
        'SELECT DISTINCT role_id FROM role_menus WHERE menu_id = ?',
        [id]
      );
      for (const row of affectedRoles) {
        const [menuRows] = await connection.execute(
          'SELECT menu_id FROM role_menus WHERE role_id = ?',
          [row.role_id]
        );
        await syncRolePermissionsFromMenus(
          connection,
          row.role_id,
          menuRows.map((menu) => menu.menu_id)
        );
      }

      revokedUserIds = await revokeRoleSessionsInTransaction(
        connection,
        affectedRoles.map((row) => row.role_id)
      );

      await connection.commit();

      try {
        const PermissionService = require('../services/PermissionService');
        await PermissionService.clearUserPermissionsCache();
      } catch {
        // ignore
      }

      disconnectUserSessions(revokedUserIds, 'menu_updated');

      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateMenuStatus(id, status) {
    const normalizedStatus = normalizeBinaryStatus(status);
    const menuId = Number(id);
    if (!Number.isInteger(menuId) || menuId <= 0) throw new Error('invalid menu id');
    const connection = await pool.getConnection();
    let result;
    let revokedUserIds = [];
    try {
      await connection.beginTransaction();
      [result] = await connection.execute(
        'UPDATE menus SET status = ?, updated_at = NOW() WHERE id = ?',
        [normalizedStatus, menuId]
      );
      if (result.affectedRows > 0) {
        const [affectedRoles] = await connection.execute(
          'SELECT DISTINCT role_id FROM role_menus WHERE menu_id = ?',
          [menuId]
        );
        const { syncRolePermissionsFromMenus } = require('../services/PermissionRegistry');
        for (const row of affectedRoles) {
          const [menuRows] = await connection.execute(
            'SELECT menu_id FROM role_menus WHERE role_id = ?',
            [row.role_id]
          );
          await syncRolePermissionsFromMenus(
            connection,
            row.role_id,
            menuRows.map((menu) => menu.menu_id)
          );
        }
        revokedUserIds = await revokeRoleSessionsInTransaction(
          connection,
          affectedRoles.map((row) => row.role_id)
        );
      }
      await connection.commit();
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original update error.
      }
      throw error;
    } finally {
      connection.release();
    }
    if (result.affectedRows > 0) {
      try {
        const PermissionService = require('../services/PermissionService');
        await PermissionService.clearUserPermissionsCache();
      } catch {
        // ignore
      }
      disconnectUserSessions(revokedUserIds, 'menu_status_changed');
    }
    return result.affectedRows > 0;
  },

  async deleteMenu(id) {
    const connection = await pool.getConnection();
    let revokedUserIds;
    try {
      await connection.beginTransaction();

      // 检查是否是系统核心根菜单（parent_id 为 NULL/0 且 type 为 0-目录），禁止删除
      const [menuInfo] = await connection.execute(
        'SELECT parent_id, type, name FROM menus WHERE id = ?',
        [id]
      );
      if (menuInfo.length > 0) {
        const menu = menuInfo[0];
        if ((!menu.parent_id || menu.parent_id === 0) && menu.type === 0) {
          throw new Error(`系统顶级目录「${menu.name}」为核心菜单，不允许删除。如需隐藏请修改其状态`);
        }
      }

      // 检查是否有子菜单
      const [children] = await connection.execute(
        'SELECT COUNT(*) as count FROM menus WHERE parent_id = ?',
        [id]
      );

      if (children[0].count > 0) {
        throw new Error('该菜单下有子菜单，不能删除');
      }

      // 受影响角色：删菜单后须重算 role_permissions
      const [affectedRoles] = await connection.execute(
        'SELECT DISTINCT role_id FROM role_menus WHERE menu_id = ?',
        [id]
      );

      // 删除角色菜单关联
      await connection.execute('DELETE FROM role_menus WHERE menu_id = ?', [id]);

      // 删除菜单
      const [result] = await connection.execute('DELETE FROM menus WHERE id = ?', [id]);

      // 同步鉴权 SSOT：按剩余菜单重建 role_permissions
      const { syncRolePermissionsFromMenus } = require('../services/PermissionRegistry');
      for (const row of affectedRoles) {
        const [remain] = await connection.execute(
          'SELECT menu_id FROM role_menus WHERE role_id = ?',
          [row.role_id]
        );
        await syncRolePermissionsFromMenus(
          connection,
          row.role_id,
          remain.map((m) => m.menu_id)
        );
      }

      revokedUserIds = await revokeRoleSessionsInTransaction(
        connection,
        affectedRoles.map((row) => row.role_id)
      );

      await connection.commit();

      try {
        const PermissionService = require('../services/PermissionService');
        await PermissionService.clearUserPermissionsCache();
      } catch {
        // ignore
      }

      disconnectUserSessions(revokedUserIds, 'menu_deleted');

      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },
};

module.exports = systemModel;
