/**
 * system.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { pool } = require('../config/db');
const logger = require('../utils/logger');
const PasswordSecurity = require('../utils/passwordSecurity');

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

const systemModel = {
  // 用户管理
  async getAllUsers(page = 1, pageSize = 10, filters = {}) {
    const offset = (page - 1) * pageSize;
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
    const [rows] = await pool.execute(
      `SELECT u.*, d.name as departmentName
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE ${whereClause}
       ORDER BY u.id DESC
       LIMIT ${parseInt(pageSize)} OFFSET ${parseInt(offset)}`,
      [...params]
    );

    // ✅ 优化: 使用 IN 查询一次性获取所有用户的角色（避免 N+1 查询）
    if (rows.length > 0) {
      const userIds = rows.map((u) => u.id);
      const [allRoles] = await pool.execute(
        `SELECT ur.user_id, r.*
         FROM roles r
         JOIN user_roles ur ON r.id = ur.role_id
         WHERE ur.user_id IN (?)`,
        [userIds]
      );

      // 按用户ID分组角色
      const rolesByUser = {};
      allRoles.forEach((role) => {
        if (!rolesByUser[role.user_id]) {
          rolesByUser[role.user_id] = [];
        }
        rolesByUser[role.user_id].push(role);
      });

      // 分配角色到用户
      rows.forEach((user) => {
        user.roles = rolesByUser[user.id] || [];
        user.roleNames = user.roles.map((r) => r.name).join(', ');
        // status已包含在查询结果中并通过数据库管理，无需覆盖
      });
    }

    return {
      list: rows,
      total,
      page,
      pageSize,
    };
  },

  async getUserById(id) {
    try {
      // 确保id是数字类型
      const userId = parseInt(id, 10);
      if (isNaN(userId)) {
        throw new Error('无效的用户ID');
      }

      const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
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

      // status已包含在查询结果中并通过数据库管理，无需覆盖

      return user;
    } catch (error) {
      logger.error('获取用户详情失败:', error);
      throw error;
    }
  },

  async createUser(userData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 检查用户名是否已存在
      const [existingUsers] = await connection.execute('SELECT * FROM users WHERE username = ?', [
        userData.username,
      ]);

      if (existingUsers.length > 0) {
        throw new Error('用户名已存在');
      }

      // 验证密码强度
      const passwordValidation = PasswordSecurity.validatePasswordStrength(userData.password);
      if (!passwordValidation.isValid) {
        throw new Error(`密码不符合安全要求: ${passwordValidation.errors.join(', ')}`);
      }

      // 密码加密
      const hashedPassword = await PasswordSecurity.hashPassword(userData.password);

      // 从roleIds获取第一个角色的code作为role字段的值
      let roleCode = 'user'; // 默认值
      if (userData.roleIds && userData.roleIds.length > 0) {
        const [roleResult] = await connection.execute(
          'SELECT code FROM roles WHERE id = ? LIMIT 1',
          [userData.roleIds[0]]
        );
        if (roleResult.length > 0) {
          roleCode = roleResult[0].code;
        }
      }

      // 插入用户基本信息
      const [result] = await connection.execute(
        `INSERT INTO users (username, password, real_name, email, department_id, position, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          userData.username,
          hashedPassword,
          userData.name || userData.real_name, // 支持两种命名方式
          userData.email || null,
          userData.department_id || null,
          userData.position || null,
          roleCode,
        ]
      );

      const userId = result.insertId;

      // 插入用户角色关联
      if (userData.roleIds && userData.roleIds.length > 0) {
        for (const roleId of userData.roleIds) {
          await connection.execute(
            'INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, NOW())',
            [userId, roleId]
          );
        }
      }

      await connection.commit();
      return { id: userId, ...userData };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateUser(id, userData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 从roleIds获取第一个角色的code作为role字段的值
      let roleCode = 'user'; // 默认值
      if (userData.roleIds && userData.roleIds.length > 0) {
        const [roleResult] = await connection.execute(
          'SELECT code FROM roles WHERE id = ? LIMIT 1',
          [userData.roleIds[0]]
        );
        if (roleResult.length > 0) {
          roleCode = roleResult[0].code;
        }
      }

      // 更新用户基本信息
      await connection.execute(
        `UPDATE users SET 
          real_name = ?, 
          email = ?, 
          department_id = ?, 
          position = ?,
          role = ?,
          updated_at = NOW()
         WHERE id = ?`,
        [
          userData.name || userData.real_name, // 支持两种命名方式
          userData.email || null,
          userData.department_id || null,
          userData.position || null,
          roleCode,
          id,
        ]
      );

      // 更新用户角色关联
      if (userData.roleIds) {
        // 先删除现有角色关联
        await connection.execute('DELETE FROM user_roles WHERE user_id = ?', [id]);

        // 添加新的角色关联
        for (const roleId of userData.roleIds) {
          await connection.execute(
            'INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, NOW())',
            [id, roleId]
          );
        }
      }

      await connection.commit();
      return { id, ...userData };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateUserStatus(id, status) {
    const [result] = await pool.execute('UPDATE users SET status = ? WHERE id = ?', [status, id]);
    return result.affectedRows > 0;
  },

  async resetUserPassword(id, password) {
    // ✅ 统一使用 PasswordSecurity 加密，与 createUser 保持一致
    const hashedPassword = await PasswordSecurity.hashPassword(password);

    const [result] = await pool.execute(
      'UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?',
      [hashedPassword, id]
    );
    return result.affectedRows > 0;
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
       LEFT JOIN users eu ON d.id = eu.department_id AND eu.employee_status = 'active'
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
    const [result] = await pool.execute(
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
        departmentData.name,
        departmentData.parent_id || null,
        departmentData.code || '',
        departmentData.manager_id || null,
        departmentData.phone || '',
        departmentData.status !== undefined ? departmentData.status : 1,
        departmentData.remark || '',
      ]
    );
    return {
      id: result.insertId,
      ...departmentData,
      created_at: new Date(),
    };
  },

  async updateDepartment(id, departmentData) {
    const [result] = await pool.execute(
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
        departmentData.name,
        departmentData.parent_id || null,
        departmentData.code || null,
        departmentData.manager_id || null,
        departmentData.phone || null,
        departmentData.status !== undefined ? departmentData.status : 1,
        departmentData.remark || null,
        id,
      ]
    );
    return result.affectedRows > 0;
  },

  async updateDepartmentStatus(id, status) {
    const [result] = await pool.execute('UPDATE departments SET status = ? WHERE id = ?', [
      status,
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
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
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
    const [rows] = await pool.execute(
      `SELECT * FROM roles WHERE ${whereClause} ORDER BY id ASC LIMIT ${parseInt(pageSize)} OFFSET ${parseInt(offset)}`,
      params
    );

    return {
      list: rows,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    };
  },

  async getRoleById(id) {
    const [rows] = await pool.execute('SELECT * FROM roles WHERE id = ?', [id]);

    if (!rows.length) return null;

    const role = rows[0];

    // 获取角色的权限
    const [permissions] = await pool.execute(
      `SELECT m.* FROM menus m
       JOIN role_menus rm ON m.id = rm.menu_id
       WHERE rm.role_id = ?`,
      [id]
    );

    role.permissions = permissions;

    return role;
  },

  async createRole(roleData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 校验角色名称唯一性
      const [existingName] = await connection.execute(
        'SELECT id FROM roles WHERE name = ?',
        [roleData.name]
      );
      if (existingName.length > 0) {
        throw new Error('角色名称已存在，请使用其他名称');
      }

      // 校验角色编码唯一性
      if (roleData.code) {
        const [existingCode] = await connection.execute(
          'SELECT id FROM roles WHERE code = ?',
          [roleData.code]
        );
        if (existingCode.length > 0) {
          throw new Error('角色编码已存在，请使用其他编码');
        }
      }

      // 插入角色基本信息
      const [result] = await connection.execute(
        `INSERT INTO roles (name, code, description, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [roleData.name, roleData.code, roleData.description, roleData.status]
      );

      const roleId = result.insertId;

      // 插入角色菜单权限关联
      if (roleData.menuIds && roleData.menuIds.length > 0) {
        for (const menuId of roleData.menuIds) {
          await connection.execute('INSERT INTO role_menus (role_id, menu_id) VALUES (?, ?)', [
            roleId,
            menuId,
          ]);
        }
      }

      await connection.commit();
      return { id: roleId, ...roleData };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateRole(id, roleData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 如果有基本信息需要更新
      if (roleData.name !== undefined) {
        // 更新角色基本信息
        await connection.execute(
          `UPDATE roles SET
            name = ?,
            code = ?,
            description = ?,
            status = ?,
            updated_at = NOW()
           WHERE id = ?`,
          [roleData.name, roleData.code, roleData.description, roleData.status, id]
        );
      }

      // 更新角色菜单权限关联
      if (roleData.menuIds !== undefined) {
        // 先删除现有权限关联
        await connection.execute('DELETE FROM role_menus WHERE role_id = ?', [id]);

        // 添加新的权限关联
        if (roleData.menuIds && roleData.menuIds.length > 0) {
          for (const menuId of roleData.menuIds) {
            await connection.execute('INSERT INTO role_menus (role_id, menu_id) VALUES (?, ?)', [
              id,
              menuId,
            ]);
          }
        }
      }

      await connection.commit();
      return { id, ...roleData };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateRoleStatus(id, status) {
    const [result] = await pool.execute(
      'UPDATE roles SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );
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

      // 删除角色菜单关联
      await connection.execute('DELETE FROM role_menus WHERE role_id = ?', [id]);

      // 删除角色
      const [result] = await connection.execute('DELETE FROM roles WHERE id = ?', [id]);

      await connection.commit();
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
      `SELECT * FROM menus WHERE ${whereClause} ORDER BY id ASC`,
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
    const [rows] = await pool.execute('SELECT * FROM menus WHERE id = ?', [id]);
    return rows[0];
  },

  async createMenu(menuData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. 插入菜单记录
      const [result] = await connection.execute(
        `INSERT INTO menus (
          parent_id, name, path, component, redirect, icon, permission, type, visible, status, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          menuData.parent_id || null,
          menuData.name || '',
          menuData.path || null,
          menuData.component || null,
          menuData.redirect || null,
          menuData.icon || null,
          menuData.permission || null,
          menuData.type !== undefined ? menuData.type : 1,
          menuData.visible !== undefined ? menuData.visible : 1,
          menuData.status !== undefined ? menuData.status : 1,
          menuData.sort_order || 0,
        ]
      );
      const menuId = result.insertId;

      // 2. 自动继承父菜单的角色权限
      if (menuData.parent_id) {
        // 子菜单：获取拥有父菜单权限的所有角色，并为它们添加新菜单权限
        const [parentRoles] = await connection.execute(
          'SELECT role_id FROM role_menus WHERE menu_id = ?',
          [menuData.parent_id]
        );

        for (const role of parentRoles) {
          await connection.execute('INSERT INTO role_menus (role_id, menu_id) VALUES (?, ?)', [
            role.role_id,
            menuId,
          ]);
        }
        logger.info(
          `新菜单 "${menuData.name}" (ID: ${menuId}) 已自动继承父菜单的 ${parentRoles.length} 个角色权限`
        );
      } else {
        // 顶级菜单：自动分配给所有管理员角色
        const [adminRoles] = await connection.execute(
          "SELECT id FROM roles WHERE name LIKE '%管理员%' OR code = 'admin'"
        );

        for (const role of adminRoles) {
          await connection.execute('INSERT INTO role_menus (role_id, menu_id) VALUES (?, ?)', [
            role.id,
            menuId,
          ]);
        }
        logger.info(
          `新顶级菜单 "${menuData.name}" (ID: ${menuId}) 已自动分配给 ${adminRoles.length} 个管理员角色`
        );
      }

      await connection.commit();
      return { id: menuId, ...menuData };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateMenu(id, menuData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // --- 防死锁/防环路核心检查 ---
      const parentId = menuData.parent_id ? parseInt(menuData.parent_id, 10) : null;
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
          menuData.parent_id || null,
          menuData.name || '',
          menuData.path || null,
          menuData.component || null,
          menuData.redirect || null,
          menuData.icon || null,
          menuData.permission || null,
          menuData.type !== undefined ? menuData.type : 1,
          menuData.visible !== undefined ? menuData.visible : 1,
          menuData.status !== undefined ? menuData.status : 1,
          menuData.sort_order || 0,
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

  async deleteMenu(id) {
    const connection = await pool.getConnection();
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

      // 删除角色菜单关联
      await connection.execute('DELETE FROM role_menus WHERE menu_id = ?', [id]);

      // 删除菜单
      const [result] = await connection.execute('DELETE FROM menus WHERE id = ?', [id]);

      await connection.commit();
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
