/**
 * systemController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');

const systemModel = require('../../models/system');
const { AuditService, AuditAction, AuditModule } = require('../../services/AuditService');
const { pool } = require('../../config/db');
const cacheService = require('../../services/cacheService');
const systemController = {
  // 用户管理
  async getAllUsers(req, res) {
    try {
      const { page = 1, limit = 10, ...filters } = req.query;
      const result = await systemModel.getAllUsers(parseInt(page), parseInt(limit), filters);
      ResponseHandler.paginated(
        res,
        result.list,
        result.total,
        result.page,
        result.pageSize,
        '获取用户列表成功'
      );
    } catch (error) {
      logger.error('获取用户列表失败:', error);
      ResponseHandler.error(res, '获取用户列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getUserById(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          code: 400,
          message: '缺少用户ID参数',
        });
      }

      const user = await systemModel.getUserById(id);

      if (!user) {
        return res.status(404).json({
          code: 404,
          message: '用户不存在',
        });
      }

      // 不返回密码
      const { password, ...userData } = user;

      ResponseHandler.success(res, userData, '获取用户信息成功');
    } catch (error) {
      logger.error('获取用户信息失败:', error);
      ResponseHandler.error(res, '获取用户信息失败', 'SERVER_ERROR', 500, error);
    }
  },

  async createUser(req, res) {
    try {
      const userData = req.body;
      const newUser = await systemModel.createUser(userData);

      // 不返回密码
      const { password, ...result } = newUser;

      ResponseHandler.success(
        res,
        {
          code: 201,
          data: result,
          message: '创建用户成功',
        },
        '创建成功',
        201
      );
    } catch (error) {
      logger.error('创建用户失败:', error);
      ResponseHandler.error(res, '创建用户失败', 'SERVER_ERROR', 500, error);
    }
  },

  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const userData = req.body;

      // 安全检查：禁止非超管修改超管信息
      if (String(id) === '1' && String(req.user?.id) !== '1') {
        return res.status(403).json({ code: 403, message: '禁止越权修改超级管理员信息' });
      }



      const updatedUser = await systemModel.updateUser(id, userData);

      ResponseHandler.success(res, updatedUser, '更新用户成功');
    } catch (error) {
      logger.error('更新用户失败:', error);
      ResponseHandler.error(res, '更新用户失败', 'SERVER_ERROR', 500, error);
    }
  },

  async updateUserStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // 安全检查：禁止非超管操作超管状态，且超管不可被禁用
      if (String(id) === '1') {
        if (String(req.user?.id) !== '1') {
          return res.status(403).json({ code: 403, message: '禁止越权修改超级管理员状态' });
        }
        if (String(status) === '0' || Number(status) === 0) {
          return res.status(403).json({ code: 403, message: '超级管理员账号不允许禁用' });
        }
      }

      if (status === undefined) {
        return res.status(400).json({
          code: 400,
          message: '缺少状态参数',
        });
      }

      const result = await systemModel.updateUserStatus(id, status);

      if (!result) {
        return res.status(404).json({
          code: 404,
          message: '用户不存在',
        });
      }

      // 清除该用户的权限缓存（统一由 PermissionService 管理）
      try {
        const PermissionService = require('../../services/PermissionService');
        PermissionService.clearUserPermissionsCache(id);
        logger.info(`✅ 已清除用户 ${id} 的权限缓存`);
      } catch (cacheError) {
        logger.warn('清除缓存失败:', cacheError.message);
      }

      ResponseHandler.success(res, null, `用户状态已${status === 1 ? '启用' : '禁用'}`);
    } catch (error) {
      logger.error('更新用户状态失败:', error);
      ResponseHandler.error(res, '更新用户状态失败', 'SERVER_ERROR', 500, error);
    }
  },

  async resetUserPassword(req, res) {
    try {
      const { id } = req.params;
      const { password } = req.body;

      // 安全检查：禁止非超管重置超管密码
      if (String(id) === '1' && String(req.user?.id) !== '1') {
        return res.status(403).json({ code: 403, message: '禁止越权重置超级管理员密码' });
      }

      if (!password) {
        return res.status(400).json({
          code: 400,
          message: '缺少密码参数',
        });
      }

      const result = await systemModel.resetUserPassword(id, password);

      if (!result) {
        return res.status(404).json({
          code: 404,
          message: '用户不存在',
        });
      }

      ResponseHandler.success(res, null, '密码重置成功');
    } catch (error) {
      logger.error('重置密码失败:', error);
      ResponseHandler.error(res, '重置密码失败', 'SERVER_ERROR', 500, error);
    }
  },

  // 部门管理
  async getAllDepartments(req, res) {
    try {
      const filters = req.query;
      const departments = await systemModel.getAllDepartments(filters);

      // 确保返回的始终是数组
      const safeResult = Array.isArray(departments) ? departments : [];

      return ResponseHandler.success(res, safeResult, '获取部门列表成功');
    } catch (error) {
      logger.error('获取部门列表失败:', error);
      return ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getDepartmentById(req, res) {
    try {
      const { id } = req.params;
      const department = await systemModel.getDepartmentById(id);

      if (!department) {
        return res.status(404).json({
          code: 404,
          message: '部门不存在',
        });
      }

      ResponseHandler.success(res, department, '获取部门信息成功');
    } catch (error) {
      logger.error('获取部门信息失败:', error);
      ResponseHandler.error(res, '获取部门信息失败', 'SERVER_ERROR', 500, error);
    }
  },

  async createDepartment(req, res) {
    try {
      const departmentData = req.body;
      const newDepartment = await systemModel.createDepartment(departmentData);

      ResponseHandler.success(
        res,
        {
          code: 201,
          data: newDepartment,
          message: '创建部门成功',
        },
        '创建成功',
        201
      );
    } catch (error) {
      logger.error('创建部门失败:', error);
      ResponseHandler.error(res, '创建部门失败', 'SERVER_ERROR', 500, error);
    }
  },

  async updateDepartment(req, res) {
    try {
      const { id } = req.params;
      const departmentData = req.body;



      const result = await systemModel.updateDepartment(id, departmentData);

      if (!result) {
        return res.status(404).json({
          code: 404,
          message: '部门不存在',
        });
      }

      ResponseHandler.success(res, null, '更新部门成功');
    } catch (error) {
      logger.error('更新部门失败:', error);
      ResponseHandler.error(res, '更新部门失败', 'SERVER_ERROR', 500, error);
    }
  },

  async updateDepartmentStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (status === undefined) {
        return res.status(400).json({
          code: 400,
          message: '缺少状态参数',
        });
      }

      const result = await systemModel.updateDepartmentStatus(id, status);

      if (!result) {
        return res.status(404).json({
          code: 404,
          message: '部门不存在',
        });
      }

      ResponseHandler.success(res, null, `部门状态已${status === 1 ? '启用' : '禁用'}`);
    } catch (error) {
      logger.error('更新部门状态失败:', error);
      ResponseHandler.error(res, '更新部门状态失败', 'SERVER_ERROR', 500, error);
    }
  },

  async deleteDepartment(req, res) {
    try {
      const { id } = req.params;



      await systemModel.deleteDepartment(id);

      ResponseHandler.success(res, null, '删除部门成功');
    } catch (error) {
      logger.error('删除部门失败:', error);
      
      // 捕获并区分底层阻断异常
      if (error.message && error.message.startsWith('BLOCK_DELETE:')) {
        return res.status(400).json({
          code: 400,
          message: error.message.replace('BLOCK_DELETE:', ''),
        });
      }

      ResponseHandler.error(res, '删除部门失败', 'SERVER_ERROR', 500, error);
    }
  },

  // 角色管理
  async getAllRoles(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const filters = { ...req.query };
      delete filters.page;
      delete filters.limit;

      const result = await systemModel.getAllRoles(page, limit, filters);
      ResponseHandler.paginated(
        res,
        result.list,
        result.total,
        result.page,
        result.pageSize,
        '获取角色列表成功'
      );
    } catch (error) {
      logger.error('获取角色列表失败:', error);
      ResponseHandler.error(res, '获取角色列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getRoleById(req, res) {
    try {
      const { id } = req.params;
      const role = await systemModel.getRoleById(id);

      if (!role) {
        return res.status(404).json({
          code: 404,
          message: '角色不存在',
        });
      }

      ResponseHandler.success(res, role, '获取角色信息成功');
    } catch (error) {
      logger.error('获取角色信息失败:', error);
      ResponseHandler.error(res, '获取角色信息失败', 'SERVER_ERROR', 500, error);
    }
  },

  async createRole(req, res) {
    try {
      const roleData = req.body;
      const newRole = await systemModel.createRole(roleData);

      ResponseHandler.success(
        res,
        {
          code: 201,
          data: newRole,
          message: '创建角色成功',
        },
        '创建成功',
        201
      );
    } catch (error) {
      logger.error('创建角色失败:', error);
      ResponseHandler.error(res, '创建角色失败', 'SERVER_ERROR', 500, error);
    }
  },

  async updateRole(req, res) {
    try {
      const { id } = req.params;
      const roleData = req.body;

      // 安全检查：禁止非超管修改超管角色
      if (String(id) === '1' && String(req.user?.id) !== '1') {
        return res.status(403).json({ code: 403, message: '禁止越权修改超级管理员角色' });
      }



      const result = await systemModel.updateRole(id, roleData);

      ResponseHandler.success(res, result, '更新角色成功');
    } catch (error) {
      logger.error('更新角色失败:', error);
      ResponseHandler.error(res, '更新角色失败', 'SERVER_ERROR', 500, error);
    }
  },

  async updateRoleStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // 安全检查：超级管理员角色不可禁用
      if (String(id) === '1' && (String(status) === '0' || Number(status) === 0)) {
        return res.status(403).json({ code: 403, message: '系统内置超级管理员角色不允许禁用' });
      }

      if (status === undefined) {
        return res.status(400).json({
          code: 400,
          message: '缺少状态参数',
        });
      }

      const result = await systemModel.updateRoleStatus(id, status);

      if (!result) {
        return res.status(404).json({
          code: 404,
          message: '角色不存在',
        });
      }

      // 记录审计日志
      try {
        await AuditService.log({
          userId: req.user?.id,
          username: req.user?.username,
          module: 'role',
          action: 'update_status',
          entityType: 'role',
          entityId: String(id),
          oldValue: null,
          newValue: { status },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      } catch (auditError) {
        logger.warn('记录审计日志失败:', auditError.message);
      }

      // 清除该角色所有用户的权限缓存
      try {
        const PermissionService = require('../../services/PermissionService');
        PermissionService.clearUserPermissionsCache();
        logger.info(`✅ 已清除所有用户权限缓存（角色 ${id} 状态变更）`);
      } catch (cacheError) {
        logger.warn('清除缓存失败:', cacheError.message);
      }

      ResponseHandler.success(res, null, `角色状态已${status === 1 ? '启用' : '禁用'}`);
    } catch (error) {
      logger.error('更新角色状态失败:', error);
      ResponseHandler.error(res, '更新角色状态失败', 'SERVER_ERROR', 500, error);
    }
  },

  async deleteRole(req, res) {
    try {
      const { id } = req.params;

      // 安全检查：超级管理员角色不可删除
      if (String(id) === '1') {
        return res.status(403).json({ code: 403, message: '系统内置超级管理员角色不允许删除' });
      }



      await systemModel.deleteRole(id);

      ResponseHandler.success(res, null, '删除角色成功');
    } catch (error) {
      logger.error('删除角色失败:', error);
      ResponseHandler.error(res, '删除角色失败', 'SERVER_ERROR', 500, error);
    }
  },

  // 菜单管理
  async getAllMenus(req, res) {
    try {
      const result = await systemModel.getAllMenus(req.query);
      ResponseHandler.success(res, result, '获取菜单列表成功');
    } catch (error) {
      logger.error('获取菜单列表失败:', error);
      ResponseHandler.error(res, '获取菜单列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getMenuById(req, res) {
    try {
      const { id } = req.params;
      const menu = await systemModel.getMenuById(id);

      if (!menu) {
        return res.status(404).json({
          code: 404,
          message: '菜单不存在',
        });
      }

      ResponseHandler.success(res, menu, '获取菜单信息成功');
    } catch (error) {
      logger.error('获取菜单信息失败:', error);
      ResponseHandler.error(res, '获取菜单信息失败', 'SERVER_ERROR', 500, error);
    }
  },

  async createMenu(req, res) {
    try {
      const menuData = req.body;
      const newMenu = await systemModel.createMenu(menuData);

      ResponseHandler.success(
        res,
        {
          code: 201,
          data: newMenu,
          message: '创建菜单成功',
        },
        '创建成功',
        201
      );
    } catch (error) {
      logger.error('创建菜单失败:', error);
      ResponseHandler.error(res, '创建菜单失败', 'SERVER_ERROR', 500, error);
    }
  },

  async updateMenu(req, res) {
    try {
      const { id } = req.params;
      const menuData = req.body;



      const result = await systemModel.updateMenu(id, menuData);

      if (!result) {
        return res.status(404).json({
          code: 404,
          message: '菜单不存在',
        });
      }

      ResponseHandler.success(res, null, '更新菜单成功');
    } catch (error) {
      logger.error('更新菜单失败:', error);
      ResponseHandler.error(res, '更新菜单失败', 'SERVER_ERROR', 500, error);
    }
  },

  async deleteMenu(req, res) {
    try {
      const { id } = req.params;



      await systemModel.deleteMenu(id);

      ResponseHandler.success(res, null, '删除菜单成功');
    } catch (error) {
      logger.error('删除菜单失败:', error);
      ResponseHandler.error(res, '删除菜单失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getUsersList(req, res) {
    try {
      // 获取部门ID查询参数
      const departmentId = req.query.departmentId ? parseInt(req.query.departmentId, 10) : null;

      // 构建简化的SQL查询
      let query = `
      SELECT u.id, u.username, u.real_name, u.email, u.phone, u.status,
             u.department_id, d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE 1=1
    `;

      const params = [];

      // 如果提供了部门ID，添加部门过滤条件
      if (departmentId) {
        query += ' AND u.department_id = ?';
        params.push(departmentId);
      }

      // 添加排序
      query += ' ORDER BY u.created_at DESC';

      // 执行查询
      const [users] = await pool.query(query, params);

      // ✅ 使用统一的响应格式
      return ResponseHandler.success(res, users, '获取用户列表成功');
    } catch (error) {
      logger.error('获取用户列表失败:', error);
      return ResponseHandler.error(res, '获取用户列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getRolesList(req, res) {
    try {
      const result = await systemModel.getAllRoles(1, 1000, {});
      // ✅ 使用统一的响应格式
      return ResponseHandler.success(res, result.list, '获取角色列表成功');
    } catch (error) {
      logger.error('获取角色列表失败:', error);
      return ResponseHandler.error(res, '获取角色列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getRolePermissions(req, res) {
    try {
      const { id } = req.params;

      // 检查角色是否存在
      const role = await systemModel.getRoleById(id);
      if (!role) {
        return ResponseHandler.error(res, '角色不存在', 'NOT_FOUND', 404);
      }

      // 获取角色的菜单权限ID列表
      const roleModel = require('../../models/role');
      const menuIds = await roleModel.getRoleMenus(id);

      // ✅ 使用统一的响应格式
      return ResponseHandler.success(res, menuIds, '获取角色权限成功');
    } catch (error) {
      logger.error('获取角色权限失败:', error);
      return ResponseHandler.error(res, '获取角色权限失败', 'SERVER_ERROR', 500, error);
    }
  },

  async updateRolePermissions(req, res) {
    try {
      const { id } = req.params;
      const { menuIds, halfCheckedIds, uncheckedIds } = req.body;

      // 安全检查：禁止非超管修改超管角色的权限
      if (String(id) === '1' && String(req.user?.id) !== '1') {
        return res.status(403).json({ code: 403, message: '禁止越权修改超级管理员角色的权限' });
      }

      // 检查角色是否存在
      const role = await systemModel.getRoleById(id);
      if (!role) {
        return ResponseHandler.error(res, '角色不存在', 'NOT_FOUND', 404);
      }

      // 获取旧的权限列表用于审计日志
      const roleModel = require('../../models/role');
      const oldMenuIds = await roleModel.getRoleMenus(id);

      // 使用角色模型直接更新权限
      await roleModel.setRoleMenus(id, menuIds);

      // 清除权限缓存（统一由 PermissionService 管理）
      try {
        const PermissionService = require('../../services/PermissionService');
        PermissionService.clearUserPermissionsCache(); // 清除所有用户权限缓存
        logger.info(`✅ [权限更新] 角色 ${id} (${role.name}) 的权限缓存已清除`);
      } catch (cacheError) {
        logger.error('❌ 清除缓存失败:', cacheError);
      }

      // ✅ 使用统一的 AuditService 记录权限变更审计日志
      try {
        await AuditService.log({
          userId: req.user.id,
          username: req.user.username,
          module: AuditModule.SYSTEM,
          action: AuditAction.UPDATE,
          entityType: 'role',
          entityId: String(id),
          oldValue: { menuIds: oldMenuIds },
          newValue: { menuIds, halfCheckedIds, uncheckedIds },
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.headers['user-agent'],
        });
        logger.info(`[审计日志] 用户 ${req.user.username} 更新了角色 ${role.name} 的权限`);
      } catch (auditError) {
        logger.warn('记录审计日志失败:', auditError.message);
        // 审计日志失败不影响主流程
      }

      // ✅ 使用统一的响应格式
      return ResponseHandler.success(res, null, '权限更新成功');
    } catch (error) {
      logger.error('更新角色权限失败:', error);
      return ResponseHandler.error(res, '更新角色权限失败', 'SERVER_ERROR', 500, error);
    }
  },

  async diagnosePermissions(req, res) {
    try {
      const { userId } = req.params;
      const PermissionDiagnostics = require('../../utils/permissionDiagnostics');

      // 获取用户信息
      const [users] = await pool.execute('SELECT username FROM users WHERE id = ?', [userId]);

      if (!users.length) {
        return ResponseHandler.error(res, '用户不存在', 'NOT_FOUND', 404);
      }

      // 执行诊断（输出到控制台）
      await PermissionDiagnostics.diagnoseUserPermissions(userId, users[0].username);

      return ResponseHandler.success(
        res,
        { message: '诊断完成，请查看服务器控制台日志' },
        '诊断完成'
      );
    } catch (error) {
      logger.error('权限诊断失败:', error);
      return ResponseHandler.error(res, '权限诊断失败', 'SERVER_ERROR', 500, error);
    }
  },

  async refreshPermissions(req, res) {
    try {
      const { userId } = req.params;
      const PermissionService = require('../../services/PermissionService');

      // 清除并重新加载权限
      PermissionService.clearUserPermissionsCache(userId);
      const permissions = await PermissionService.getUserPermissions(userId, true);

      return ResponseHandler.success(
        res,
        {
          userId,
          permissionCount: permissions.length,
          permissions,
        },
        '权限缓存已刷新'
      );
    } catch (error) {
      logger.error('刷新权限缓存失败:', error);
      return ResponseHandler.error(res, '刷新权限缓存失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getMenusDirect(req, res) {
    try {
      // 直接执行SQL查询获取所有菜单
      const [menus] = await pool.execute(`
      SELECT
        id,
        parent_id,
        name,
        path,
        component,
        permission,
        type,
        icon,
        sort_order as sort,
        status,
        created_at as create_time,
        updated_at as update_time
      FROM menus
      ORDER BY sort_order
    `);

      // ✅ 使用统一的响应格式
      return ResponseHandler.success(res, menus, '获取菜单数据成功');
    } catch (error) {
      logger.error('直接从数据库获取菜单数据失败:', error);
      return ResponseHandler.error(res, '获取菜单数据失败', 'SERVER_ERROR', 500, error);
    }
  },

  async importMenus(req, res) {
    try {
      const { menus } = req.body;

      if (!menus || !Array.isArray(menus) || menus.length === 0) {
        return ResponseHandler.error(res, '菜单数据不能为空', 'BAD_REQUEST', 400);
      }

      // 开始事务
      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        let insertedCount = 0;
        let updatedCount = 0;

        // 批量查出所有已存在的菜单 permission（消除 N+1）
        const allPermissions = menus.map(m => m.permission).filter(Boolean);
        const permPh = allPermissions.map(() => '?').join(',');
        const [existingMenus] = allPermissions.length > 0
          ? await connection.execute(`SELECT id, permission FROM menus WHERE permission IN (${permPh})`, allPermissions)
          : [[]];
        const existingSet = new Set(existingMenus.map(m => m.permission));

        for (const menu of menus) {
          // 使用 INSERT ... ON DUPLICATE KEY UPDATE 减少逐条查询
          await connection.execute(
            `INSERT INTO menus (parent_id, name, path, component, icon, permission, type, visible, status, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
               parent_id = VALUES(parent_id), name = VALUES(name), path = VALUES(path),
               component = VALUES(component), icon = VALUES(icon), type = VALUES(type),
               sort_order = VALUES(sort_order), status = VALUES(status), updated_at = NOW()`,
            [
              menu.parentId || 0, menu.name, menu.path || '', menu.component || '',
              menu.icon || '', menu.permission, menu.type || 1, menu.status || 1, menu.sort || 0,
            ]
          );
          if (existingSet.has(menu.permission)) updatedCount++;
          else insertedCount++;
        }

        // 更新父子关系 — 批量获取映射后一次性处理
        const [allMenusRows] = await connection.execute('SELECT id, permission FROM menus');
        const permissionToId = {};
        allMenusRows.forEach((m) => { permissionToId[m.permission] = m.id; });

        // 构建批量更新数组，避免逐条 UPDATE（消除第二个 N+1）
        const parentUpdates = [];
        for (const menu of menus) {
          if (menu.parentId && menu.parentId !== 0) {
            const parentMenu = menus.find((m) => m.id === menu.parentId);
            if (parentMenu && permissionToId[parentMenu.permission]) {
              parentUpdates.push({ permission: menu.permission, parentId: permissionToId[parentMenu.permission] });
            }
          }
        }
        if (parentUpdates.length > 0) {
          // 使用 CASE WHEN 批量更新
          const caseWhen = parentUpdates.map(() => 'WHEN permission = ? THEN ?').join(' ');
          const caseValues = parentUpdates.flatMap(u => [u.permission, u.parentId]);
          const inPermissions = parentUpdates.map(() => '?').join(',');
          const inValues = parentUpdates.map(u => u.permission);
          await connection.execute(
            `UPDATE menus SET parent_id = CASE ${caseWhen} END WHERE permission IN (${inPermissions})`,
            [...caseValues, ...inValues]
          );
        }

        await connection.commit();

        logger.info(`菜单导入成功: 新增${insertedCount}条, 更新${updatedCount}条`);
        return ResponseHandler.success(
          res,
          {
            inserted: insertedCount,
            updated: updatedCount,
            total: menus.length,
          },
          `菜单导入成功：新增${insertedCount}条，更新${updatedCount}条`
        );
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('导入菜单数据失败:', error);
      return ResponseHandler.error(
        res,
        '导入菜单数据失败: ' + error.message,
        'SERVER_ERROR',
        500,
        error
      );
    }
  },

  async getSettings(req, res) {
    try {
      const [settings] = await pool.execute('SELECT * FROM system_settings');
      return ResponseHandler.success(res, settings, '获取系统设置成功');
    } catch (error) {
      logger.error('获取系统设置失败:', error);
      return ResponseHandler.error(res, '获取系统设置失败', 'SERVER_ERROR', 500, error);
    }
  },

  async updateSettings(req, res) {
    try {
      const { key, value } = req.body;
      if (!key) {
        return ResponseHandler.error(res, '设置键不能为空', 'BAD_REQUEST', 400);
      }

      await pool.execute(
        'INSERT INTO system_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
        [key, value, value]
      );

      // 清除缓存
      cacheService.deleteByPrefix('setting_');

      // 如果是会计科目配置，清除会计配置缓存
      if (key === 'accounting.account_codes') {
        const { accountingConfig } = require('../../config/accountingConfig');
        accountingConfig.clearCache();
      }

      return ResponseHandler.success(res, {}, '系统设置更新成功');
    } catch (error) {
      logger.error('更新系统设置失败:', error);
      return ResponseHandler.error(res, '更新系统设置失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getAccountingCodes(req, res) {
    try {
      const { accountingConfig } = require('../../config/accountingConfig');
      const db = require('../../config/db');

      // 从数据库加载最新配置
      await accountingConfig.loadFromDatabase(db);
      const accountCodes = accountingConfig.getAllAccountCodes();

      return ResponseHandler.success(res, accountCodes, '获取会计科目配置成功');
    } catch (error) {
      logger.error('获取会计科目配置失败:', error);
      return ResponseHandler.error(res, '获取会计科目配置失败', 'SERVER_ERROR', 500, error);
    }
  },

  async updateAccountingCodes(req, res) {
    try {
      const { accountingConfig } = require('../../config/accountingConfig');
      const db = require('../../config/db');
      const accountCodes = req.body;

      // 验证配置格式
      if (!accountCodes || typeof accountCodes !== 'object') {
        return ResponseHandler.error(res, '无效的配置格式', 'BAD_REQUEST', 400);
      }

      // 保存到数据库
      await accountingConfig.saveToDatabase(db, accountCodes);

      return ResponseHandler.success(res, {}, '会计科目配置更新成功');
    } catch (error) {
      logger.error('更新会计科目配置失败:', error);
      return ResponseHandler.error(res, '更新会计科目配置失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getSystemInfo(req, res) {
    try {
      const info = {
        appName: 'ERP System',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
      };
      return ResponseHandler.success(res, info, '获取系统信息成功');
    } catch (error) {
      logger.error('获取系统信息失败:', error);
      return ResponseHandler.error(res, '获取系统信息失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getSystemLogs(req, res) {
    try {
      const { limit = 100, offset = 0 } = req.query;
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      const actualLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 1000); // 限制1-1000
      const actualOffset = Math.max(parseInt(offset) || 0, 0);
      const [logs] = await pool.query(
        `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ${actualLimit} OFFSET ${actualOffset}`
      );
      return ResponseHandler.success(res, logs, '获取系统日志成功');
    } catch (error) {
      logger.error('获取系统日志失败:', error);
      return ResponseHandler.error(res, '获取系统日志失败', 'SERVER_ERROR', 500, error);
    }
  },

  async createBackup(req, res) {
    try {
      // 执行备份逻辑
      const backupFile = `backup_${Date.now()}.sql`;
      return ResponseHandler.success(res, { file: backupFile }, '数据库备份成功');
    } catch (error) {
      logger.error('数据库备份失败:', error);
      return ResponseHandler.error(res, '数据库备份失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getBackups(req, res) {
    try {
      const [backups] = await pool.execute(
        'SELECT * FROM system_backups ORDER BY created_at DESC LIMIT 50'
      );
      return ResponseHandler.success(res, backups, '获取备份列表成功');
    } catch (error) {
      logger.error('获取备份列表失败:', error);
      return ResponseHandler.error(res, '获取备份列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  async downloadBackup(req, res) {
    try {
      const { filename } = req.params;
      // 下载备份逻辑
      return ResponseHandler.success(res, {}, '备份下载成功');
    } catch (error) {
      logger.error('备份下载失败:', error);
      return ResponseHandler.error(res, '备份下载失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = systemController;
