/**
 * systemController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');
const { mapKeysToSnake } = require('../../utils/fieldMap');

const systemModel = require('../../models/system');
const { AuditService, AuditAction, AuditModule } = require('../../services/AuditService');
const PermissionChangeService = require('../../services/PermissionChangeService');
const { pool } = require('../../config/db');
const cacheService = require('../../services/cache/CacheManager');
const DLQService = require('../../services/business/DLQService');
const BackupService = require('../../services/system/BackupService');
const AccountLockService = require('../../services/system/AccountLockService');
const { parsePagination } = require('../../utils/safePagination');

// 以下模块原散落于各函数体内，统一移至顶部（P1 治理）
const PermissionService = require('../../services/PermissionService');
const RoleAccessService = require('../../services/RoleAccessService');
const { getRequestActorLabel } = require('../../utils/userUtils');
const { isSuperAdminRole } = require('../../authorization/superAdmin');

function omitUserSecrets(user) {
  if (!user || typeof user !== 'object') return user;
  const safeUser = { ...user };
  delete safeUser.password;
  delete safeUser.password_hash;
  delete safeUser.token;
  delete safeUser.refresh_token;
  delete safeUser.reset_token;
  delete safeUser.audit;
  return safeUser;
}

async function logUserManagementEvent(req, action, userId, oldValue = null, newValue = null) {
  try {
    await AuditService.logFromRequest(
      req,
      AuditModule.USER,
      action,
      'user',
      String(userId),
      oldValue,
      newValue
    );
  } catch (error) {
    logger.warn('记录用户管理审计失败:', error.message);
  }
}

function normalizeBinaryStatus(status) {
  if (status === true || status === 1 || status === '1') return 1;
  if (status === false || status === 0 || status === '0') return 0;
  if (typeof status === 'string') {
    const normalized = status.trim().toLowerCase();
    if (['active', 'enabled', 'enable', 'normal'].includes(normalized)) return 1;
    if (['inactive', 'disabled', 'disable', 'locked'].includes(normalized)) return 0;
  }
  throw new Error('status must be 0 or 1');
}

async function isSuperAdminRequest(req) {
  const userId = req.user?.id || req.user?.userId;
  return userId ? PermissionService.isAdmin(userId) : false;
}

async function targetUserHasAdminRole(userId) {
  const [[result]] = await pool.execute(
    `SELECT COUNT(*) AS count
     FROM user_roles ur
     JOIN roles r ON ur.role_id = r.id
     WHERE ur.user_id = ? AND r.is_super_admin = 1 AND r.status = 1`,
    [userId]
  );
  return Number(result?.count || 0) > 0;
}

async function assertCanManageTargetUser(req, userId) {
  if (await isSuperAdminRequest(req)) return;
  if (await targetUserHasAdminRole(userId)) {
    throw new Error('FORBIDDEN: managing admin users requires super administrator');
  }
}

async function roleIsSuperAdmin(roleId) {
  const [[role]] = await pool.execute(
    'SELECT id, is_super_admin FROM roles WHERE id = ? LIMIT 1',
    [roleId]
  );
  return isSuperAdminRole(role);
}

function sendBusinessError(res, error, fallbackMessage = '操作失败') {
  const message = error?.message || fallbackMessage;
  if (message.startsWith('NOT_FOUND:')) {
    return ResponseHandler.error(res, message.replace('NOT_FOUND:', '').trim(), 'NOT_FOUND', 404);
  }
  if (message.startsWith('FORBIDDEN:')) {
    return ResponseHandler.error(res, message.replace('FORBIDDEN:', '').trim(), 'FORBIDDEN', 403, error);
  }
  if (
    error?.code === 'ER_DUP_ENTRY' ||
    message.includes('已存在') ||
    message.toLowerCase().includes('duplicate')
  ) {
    return ResponseHandler.error(res, message, 'CONFLICT', 409, error);
  }
  if (
    message.includes('不能') ||
    message.includes('不允许') ||
    message.includes('不存在') ||
    message.includes('必须') ||
    message.includes('无效') ||
    message.includes('required') ||
    message.includes('invalid') ||
    message.includes('must be')
  ) {
    return ResponseHandler.error(res, message, 'VALIDATION_ERROR', 400, error);
  }
  return ResponseHandler.error(res, fallbackMessage, 'SERVER_ERROR', 500, error);
}

const systemController = {
  // 用户管理
  async getAllUsers(req, res) {
    try {
      const { page = 1, limit, pageSize, ...filters } = req.query;
      const effectiveLimit = limit || pageSize || 10;
      const result = await systemModel.getAllUsers(parseInt(page), parseInt(effectiveLimit), mapKeysToSnake(filters));
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
        return ResponseHandler.error(res, '缺少用户ID参数', 'VALIDATION_ERROR', 400);
      }

      const user = await systemModel.getUserById(id);

      if (!user) {
        return ResponseHandler.error(res, '用户不存在', 'NOT_FOUND', 404);
      }

      const userData = omitUserSecrets(user);

      ResponseHandler.success(res, userData, '获取用户信息成功');
    } catch (error) {
      logger.error('获取用户信息失败:', error);
      ResponseHandler.error(res, '获取用户信息失败', 'SERVER_ERROR', 500, error);
    }
  },

  async createUser(req, res) {
    try {
      const userData = mapKeysToSnake(req.body || {});
      // model 使用 roleIds（非 DB 列）；snake 化后需回填
      if (req.body?.roleIds !== undefined) userData.roleIds = req.body.roleIds;
      else if (userData.role_ids !== undefined) userData.roleIds = userData.role_ids;
      const newUser = await systemModel.createUser(userData, {
        allowAdminRole: await isSuperAdminRequest(req),
      });

      // 写入 user_roles 后清缓存，避免后续立刻登录读到脏缓存
      if (newUser?.id) {
        await PermissionService.clearUserPermissionsCache(newUser.id);
        if (Array.isArray(newUser.roleIds) && newUser.roleIds.length > 0) {
          await PermissionChangeService.auditUserRoles(req, newUser.id, [], newUser.roleIds, {
            username: newUser.username,
          });
        }
        await logUserManagementEvent(req, AuditAction.CREATE, newUser.id, null, {
          id: newUser.id,
          username: newUser.username,
          real_name: newUser.real_name,
          email: newUser.email,
          department_id: newUser.department_id,
          position: newUser.position,
          role: newUser.role,
          roleIds: newUser.roleIds,
          status: newUser.status,
        });
      }

      const result = omitUserSecrets(newUser);

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
      return sendBusinessError(res, error, '创建用户失败');
    }
  },

  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const userData = mapKeysToSnake(req.body || {});
      if (req.body?.roleIds !== undefined) userData.roleIds = req.body.roleIds;
      else if (userData.role_ids !== undefined) userData.roleIds = userData.role_ids;

      await assertCanManageTargetUser(req, id);

      const updatedUser = await systemModel.updateUser(id, userData, {
        allowAdminRole: await isSuperAdminRequest(req),
      });
      await PermissionService.clearUserPermissionsCache(id);

      if (updatedUser?.audit) {
        await logUserManagementEvent(
          req,
          AuditAction.UPDATE,
          id,
          updatedUser.audit.before,
          updatedUser.audit.after
        );
        if (updatedUser.audit.before.roleIds && updatedUser.audit.after.roleIds &&
            JSON.stringify(updatedUser.audit.before.roleIds) !== JSON.stringify(updatedUser.audit.after.roleIds)) {
          await PermissionChangeService.auditUserRoles(
            req,
            id,
            updatedUser.audit.before.roleIds,
            updatedUser.audit.after.roleIds,
            { username: updatedUser.username }
          );
        }
      }

      if (updatedUser?.audit?.securityAttributesChanged) {
        logger.info('User authorization attributes changed; sessions revoked', {
          userId: id,
        });
      }

      ResponseHandler.success(res, omitUserSecrets(updatedUser), '更新用户成功');
    } catch (error) {
      logger.error('更新用户失败:', error);
      return sendBusinessError(res, error, '更新用户失败');
    }
  },

  async updateUserStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      await assertCanManageTargetUser(req, id);

      if (await targetUserHasAdminRole(id) && (String(status) === '0' || Number(status) === 0)) {
        return ResponseHandler.error(res, '超级管理员账号不允许禁用', 'FORBIDDEN', 403);
      }

      if (status === undefined) {
        return ResponseHandler.error(res, '缺少状态参数', 'VALIDATION_ERROR', 400);
      }

      const normalizedStatus = normalizeBinaryStatus(status);
      const result = await systemModel.updateUserStatus(id, normalizedStatus);

      if (!result) {
        return ResponseHandler.error(res, '用户不存在', 'NOT_FOUND', 404);
      }

      await logUserManagementEvent(
        req,
        AuditAction.UPDATE,
        id,
        result.audit?.before || null,
        result.audit?.after || { id: Number(id), status: normalizedStatus }
      );

      // 清除该用户的权限缓存（统一由 PermissionService 管理）
      try {
        const PermissionService = require('../../services/PermissionService');
        await PermissionService.clearUserPermissionsCache(id);
        logger.info(`User permission cache cleared: userId=${id}`);
      } catch (cacheError) {
        logger.warn('清除缓存失败:', cacheError.message);
      }

      ResponseHandler.success(res, null, `用户状态已${normalizedStatus === 1 ? '启用' : '禁用'}`);
    } catch (error) {
      logger.error('更新用户状态失败:', error);
      return sendBusinessError(res, error, '更新用户状态失败');
    }
  },

  async resetUserPassword(req, res) {
    try {
      const { id } = req.params;
      const { password } = req.body;

      await assertCanManageTargetUser(req, id);

      if (!password) {
        return ResponseHandler.error(res, '缺少密码参数', 'VALIDATION_ERROR', 400);
      }

      const result = await systemModel.resetUserPassword(id, password);

      if (!result) {
        return ResponseHandler.error(res, '用户不存在', 'NOT_FOUND', 404);
      }

      await logUserManagementEvent(req, 'password_reset', id, null, {
        outcome: 'success',
        username: result.audit?.username,
        force_password_change: true,
      });

      ResponseHandler.success(res, null, '密码重置成功');
    } catch (error) {
      logger.error('重置密码失败:', error);
      return sendBusinessError(res, error, '重置密码失败');
    }
  },

  async unlockUserLogin(req, res) {
    try {
      const { id } = req.params;
      await assertCanManageTargetUser(req, id);

      const user = await systemModel.getUserById(id);
      if (!user) {
        return ResponseHandler.error(res, '用户不存在', 'NOT_FOUND', 404);
      }

      const previousState = {
        username: user.username,
        login_locked: Boolean(user.login_locked),
        failed_login_attempts: Number(user.failed_login_attempts || 0),
        locked_until: user.locked_until || null,
      };
      await AccountLockService.unlock(user.username);
      await logUserManagementEvent(req, 'login_unlock', id, previousState, {
        username: user.username,
        login_locked: false,
        failed_login_attempts: 0,
        locked_until: null,
      });

      return ResponseHandler.success(res, null, '登录限制已解除');
    } catch (error) {
      logger.error('解除用户登录限制失败:', error);
      return sendBusinessError(res, error, '解除登录限制失败');
    }
  },

  // 部门管理
  async getAllDepartments(req, res) {
    try {
      const filters = mapKeysToSnake(req.query || {});
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
        return ResponseHandler.error(res, '部门不存在', 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, department, '获取部门信息成功');
    } catch (error) {
      logger.error('获取部门信息失败:', error);
      ResponseHandler.error(res, '获取部门信息失败', 'SERVER_ERROR', 500, error);
    }
  },

  async createDepartment(req, res) {
    try {
      const departmentData = mapKeysToSnake(req.body || {});
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
      return sendBusinessError(res, error, '创建部门失败');
    }
  },

  async updateDepartment(req, res) {
    try {
      const { id } = req.params;
      const departmentData = mapKeysToSnake(req.body || {});


      const result = await systemModel.updateDepartment(id, departmentData);

      if (!result) {
        return ResponseHandler.error(res, '部门不存在', 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, null, '更新部门成功');
    } catch (error) {
      logger.error('更新部门失败:', error);
      return sendBusinessError(res, error, '更新部门失败');
    }
  },

  async updateDepartmentStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (status === undefined) {
        return ResponseHandler.error(res, '缺少状态参数', 'VALIDATION_ERROR', 400);
      }

      const normalizedStatus = normalizeBinaryStatus(status);
      const result = await systemModel.updateDepartmentStatus(id, normalizedStatus);

      if (!result) {
        return ResponseHandler.error(res, '部门不存在', 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, null, `部门状态已${normalizedStatus === 1 ? '启用' : '禁用'}`);
    } catch (error) {
      logger.error('更新部门状态失败:', error);
      return sendBusinessError(res, error, '更新部门状态失败');
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
        return ResponseHandler.error(res, error.message.replace('BLOCK_DELETE:', ''), 'VALIDATION_ERROR', 400);
      }

      return sendBusinessError(res, error, '删除部门失败');
    }
  },

  // 角色管理
  async getAllRoles(req, res) {
    try {
      const pagination = parsePagination(req.query.page, req.query.limit || req.query.pageSize, {
        defaultPageSize: 10,
        maxPageSize: 100,
      });
      const filters = { ...req.query };
      delete filters.page;
      delete filters.limit;
      delete filters.pageSize;

      const result = await systemModel.getAllRoles(pagination.page, pagination.pageSize, mapKeysToSnake(filters));
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
        return ResponseHandler.error(res, '角色不存在', 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, role, '获取角色信息成功');
    } catch (error) {
      logger.error('获取角色信息失败:', error);
      ResponseHandler.error(res, '获取角色信息失败', 'SERVER_ERROR', 500, error);
    }
  },

  async createRole(req, res) {
    try {
      const roleData = mapKeysToSnake(req.body || {});
      // model 使用 menuIds（非 DB 列）；snake 化后需回填
      if (req.body?.menuIds !== undefined) roleData.menuIds = req.body.menuIds;
      else if (roleData.menu_ids !== undefined) roleData.menuIds = roleData.menu_ids;
      // 行级数据范围已停用；角色只控制功能/动作权限。
      roleData.data_scope = 1;
      const newRole = await systemModel.createRole(roleData);

      try {
        await PermissionChangeService.auditRoleProfile(req, newRole.id, null, {
          id: newRole.id,
          name: newRole.name,
          code: newRole.code,
          data_scope: newRole.data_scope,
          menuIds: newRole.menuIds || [],
        });
      } catch {
        // 审计失败不阻断
      }

      ResponseHandler.success(res, newRole, '创建角色成功', 201);
    } catch (error) {
      logger.error('创建角色失败:', error);
      return sendBusinessError(res, error, '创建角色失败');
    }
  },

  async updateRole(req, res) {
    try {
      const { id } = req.params;
      const roleData = mapKeysToSnake(req.body || {});
      if (req.body?.menuIds !== undefined) roleData.menuIds = req.body.menuIds;
      else if (roleData.menu_ids !== undefined) roleData.menuIds = roleData.menu_ids;

      const targetIsSuperAdmin = await roleIsSuperAdmin(id);
      if (targetIsSuperAdmin && !(await isSuperAdminRequest(req))) {
        return ResponseHandler.error(res, '禁止越权修改超级管理员角色', 'FORBIDDEN', 403);
      }

      if (targetIsSuperAdmin) {
        roleData.status = 1;
      }
      // 忽略客户端遗留的 SELF/部门/自定义范围值。
      roleData.data_scope = 1;

      const before = await PermissionChangeService.getRoleSnapshot(id);
      const result = await systemModel.updateRole(id, roleData);

      await PermissionService.clearUserPermissionsCache();

      const after = await PermissionChangeService.getRoleSnapshot(id);
      if (before && after) {
        await PermissionChangeService.auditRoleProfile(req, id, before, after);
        if (roleData.menuIds !== undefined) {
          await PermissionChangeService.auditRoleMenus(
            req,
            id,
            before.menuIds,
            after.menuIds,
            { roleName: after.name }
          );
        }
      }

      ResponseHandler.success(res, result, '更新角色成功');
    } catch (error) {
      logger.error('更新角色失败:', error);
      return sendBusinessError(res, error, '更新角色失败');
    }
  },

  async updateRoleStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (await roleIsSuperAdmin(id) && (String(status) === '0' || Number(status) === 0)) {
        return ResponseHandler.error(res, '系统内置超级管理员角色不允许禁用', 'FORBIDDEN', 403);
      }

      if (status === undefined) {
        return ResponseHandler.error(res, '缺少状态参数', 'VALIDATION_ERROR', 400);
      }

      const normalizedStatus = normalizeBinaryStatus(status);
      const result = await systemModel.updateRoleStatus(id, normalizedStatus);

      if (!result) {
        return ResponseHandler.error(res, '角色不存在', 'NOT_FOUND', 404);
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
          newValue: { status: normalizedStatus },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      } catch (auditError) {
        logger.warn('记录审计日志失败:', auditError.message);
      }

      // 清除该角色所有用户的权限缓存
      try {
        const PermissionService = require('../../services/PermissionService');
        await PermissionService.clearUserPermissionsCache();
        logger.info(`All user permission caches cleared after role status change: roleId=${id}`);
      } catch (cacheError) {
        logger.warn('清除缓存失败:', cacheError.message);
      }

      ResponseHandler.success(res, null, `角色状态已${normalizedStatus === 1 ? '启用' : '禁用'}`);
    } catch (error) {
      logger.error('更新角色状态失败:', error);
      return sendBusinessError(res, error, '更新角色状态失败');
    }
  },

  async deleteRole(req, res) {
    try {
      const { id } = req.params;

      if (await roleIsSuperAdmin(id)) {
        return ResponseHandler.error(res, '系统内置超级管理员角色不允许删除', 'FORBIDDEN', 403);
      }


      await systemModel.deleteRole(id);

      await PermissionService.clearUserPermissionsCache();

      ResponseHandler.success(res, null, '删除角色成功');
    } catch (error) {
      logger.error('删除角色失败:', error);
      return sendBusinessError(res, error, '删除角色失败');
    }
  },

  // 菜单管理
  async getAllMenus(req, res) {
    try {
      const result = await systemModel.getAllMenus(mapKeysToSnake(req.query || {}));
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
        return ResponseHandler.error(res, '菜单不存在', 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, menu, '获取菜单信息成功');
    } catch (error) {
      logger.error('获取菜单信息失败:', error);
      ResponseHandler.error(res, '获取菜单信息失败', 'SERVER_ERROR', 500, error);
    }
  },

  async createMenu(req, res) {
    try {
      const menuData = mapKeysToSnake(req.body || {});
      const newMenu = await systemModel.createMenu(menuData);
      await PermissionService.clearUserPermissionsCache();

      ResponseHandler.success(res, newMenu, '创建菜单成功', 201);
    } catch (error) {
      logger.error('创建菜单失败:', error);
      return sendBusinessError(res, error, '创建菜单失败');
    }
  },

  async updateMenu(req, res) {
    try {
      const { id } = req.params;
      const menuData = mapKeysToSnake(req.body || {});


      const result = await systemModel.updateMenu(id, menuData);
      if (result) {
        await PermissionService.clearUserPermissionsCache();
      }

      if (!result) {
        return ResponseHandler.error(res, '菜单不存在', 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, null, '更新菜单成功');
    } catch (error) {
      logger.error('更新菜单失败:', error);
      return sendBusinessError(res, error, '更新菜单失败');
    }
  },

  async updateMenuStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (status === undefined) {
        return ResponseHandler.error(res, '缺少状态参数', 'VALIDATION_ERROR', 400);
      }

      const normalizedStatus = normalizeBinaryStatus(status);
      const result = await systemModel.updateMenuStatus(id, normalizedStatus);
      if (result) {
        await PermissionService.clearUserPermissionsCache();
      }

      if (!result) {
        return ResponseHandler.error(res, '菜单不存在', 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, null, `菜单状态已${normalizedStatus === 1 ? '显示' : '隐藏'}`);
    } catch (error) {
      logger.error('更新菜单状态失败:', error);
      return sendBusinessError(res, error, '更新菜单状态失败');
    }
  },

  async deleteMenu(req, res) {
    try {
      const { id } = req.params;


      await systemModel.deleteMenu(id);
      await PermissionService.clearUserPermissionsCache();

      ResponseHandler.success(res, null, '删除菜单成功');
    } catch (error) {
      logger.error('删除菜单失败:', error);
      return sendBusinessError(res, error, '删除菜单失败');
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

      // 添加排序和安全 LIMIT（防止大数据量下内存溢出）
      query += ' ORDER BY u.created_at DESC LIMIT 1000';

      // 执行查询
      const [users] = await pool.query(query, params);

      // ✅ 使用统一的响应格式
      return ResponseHandler.success(res, users, '获取用户列表成功');
    } catch (error) {
      logger.error('获取用户列表失败:', error);
      return ResponseHandler.error(res, '获取用户列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 权限码注册表列表（permissions SSOT）
   */
  async getPermissionCodes(req, res) {
    try {
      const { module: moduleFilter, keyword, page = 1, pageSize = 50 } = req.query;
      const pagination = parsePagination(page, pageSize, {
        defaultPageSize: 50,
        maxPageSize: 500,
      });
      let where = 'WHERE status = 1';
      const params = [];
      if (moduleFilter) {
        where += ' AND module = ?';
        params.push(moduleFilter);
      }
      if (keyword) {
        where += ' AND (code LIKE ? OR name LIKE ?)';
        const kw = `%${keyword}%`;
        params.push(kw, kw);
      }
      const [[{ total }]] = await pool.execute(
        `SELECT COUNT(*) AS total FROM permissions ${where}`,
        params
      );
      const [rows] = await pool.query(
        `SELECT id, code, name, module, description, source, status, created_at, updated_at
           FROM permissions ${where}
          ORDER BY module, code
          LIMIT ${pagination.limit} OFFSET ${pagination.offset}`,
        params
      );
      return ResponseHandler.paginated(
        res,
        rows,
        total,
        pagination.page,
        pagination.pageSize,
        '获取权限码列表成功'
      );
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        const list = await PermissionService.getAllSystemPermissions();
        return ResponseHandler.success(
          res,
          list.map((code) => ({ code })),
          '获取权限码列表成功（兼容 menus）'
        );
      }
      logger.error('获取权限码列表失败:', error);
      return ResponseHandler.error(res, '获取权限码列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getRolesList(req, res) {
    try {
      const pageSize = Math.min(Math.max(parseInt(req.query.limit || req.query.pageSize, 10) || 100, 1), 100);
      const result = await systemModel.getAllRoles(1, pageSize, {});
      // ✅ 使用统一的响应格式
      return ResponseHandler.success(res, result.list, '获取角色列表成功');
    } catch (error) {
      logger.error('获取角色列表失败:', error);
      return ResponseHandler.error(res, '获取角色列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getRoleAccessProfiles(req, res) {
    try {
      return ResponseHandler.success(
        res,
        RoleAccessService.listProfiles(),
        '获取岗位权限模板成功'
      );
    } catch (error) {
      logger.error('获取岗位权限模板失败:', error);
      return ResponseHandler.error(res, '获取岗位权限模板失败', 'SERVER_ERROR', 500, error);
    }
  },

  async applyRoleAccessProfile(req, res) {
    try {
      const { id } = req.params;
      if (await roleIsSuperAdmin(id) && !(await isSuperAdminRequest(req))) {
        return ResponseHandler.error(res, '禁止越权修改超级管理员角色的权限', 'FORBIDDEN', 403);
      }

      const role = await systemModel.getRoleById(id);
      if (!role) {
        return ResponseHandler.error(res, '角色不存在', 'NOT_FOUND', 404);
      }

      const connection = await pool.getConnection();
      let result;
      try {
        await connection.beginTransaction();
        result = await RoleAccessService.applyRole(connection, {
          id: role.id,
          code: role.code,
          name: role.name,
          is_super_admin: role.is_super_admin,
        });
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

      await PermissionService.clearUserPermissionsCache();
      return ResponseHandler.success(res, result, '已按岗位模板重置角色权限');
    } catch (error) {
      logger.error('按岗位模板重置角色权限失败:', error);
      return ResponseHandler.error(res, '按岗位模板重置角色权限失败', 'SERVER_ERROR', 500, error);
    }
  },

  async applyAllRoleAccessProfiles(req, res) {
    try {
      const connection = await pool.getConnection();
      let summary;
      try {
        await connection.beginTransaction();
        summary = await RoleAccessService.applyAllProfiles(connection);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

      await PermissionService.clearUserPermissionsCache();
      return ResponseHandler.success(res, { summary }, '已按岗位模板重置全部系统角色');
    } catch (error) {
      logger.error('批量重置系统角色权限失败:', error);
      return ResponseHandler.error(res, '批量重置系统角色权限失败', 'SERVER_ERROR', 500, error);
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

      if (await roleIsSuperAdmin(id) && !(await isSuperAdminRequest(req))) {
        return ResponseHandler.error(res, '禁止越权修改超级管理员角色的权限', 'FORBIDDEN', 403);
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
        await PermissionService.clearUserPermissionsCache(); // 清除所有用户权限缓存
        logger.info(`Role permission cache cleared after permission update: roleId=${id}, roleName=${role.name}`);
      } catch (cacheError) {
        logger.error('Permission cache clear failed:', cacheError);
      }

      // 权限变更审计：菜单差集 + permission 码差集
      try {
        await PermissionChangeService.auditRoleMenus(req, id, oldMenuIds, menuIds, {
          roleName: role.name,
          halfCheckedIds,
          uncheckedIds,
        });
        logger.info(`[审计日志] 用户 ${req.user.username} 更新了角色 ${role.name} 的权限`);
      } catch (auditError) {
        await DLQService.recordSideEffectFailure(
          'AuditLog:rolePermissionUpdate',
          { roleId: id, operator: req.user?.username },
          auditError
        );
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
      const { id: userId } = req.params;
      const PermissionService = require('../../services/PermissionService');

      // 清除并重新加载权限
      await PermissionService.clearUserPermissionsCache(userId);
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
        return ResponseHandler.error(res, '菜单数据不能为空', 'VALIDATION_ERROR', 400);
      }

      // 开始事务
      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        let insertedCount = 0;
        let updatedCount = 0;
        const { bindMenuPermission } = require('../../services/PermissionRegistry');

        const { normalizePermissionCode } = require('../../services/PermissionRegistry');
        // 批量查出所有已存在的菜单 permission（消除 N+1）
        const allPermissions = [
          ...new Set(
            menus
              .map((m) => (m.permission ? normalizePermissionCode(String(m.permission).trim()) : null))
              .filter(Boolean)
          ),
        ];
        const permPh = allPermissions.map(() => '?').join(',');
        const [existingMenus] = allPermissions.length > 0
          ? await connection.execute(`SELECT id, permission FROM menus WHERE permission IN (${permPh})`, allPermissions)
          : [[]];
        const existingSet = new Set(existingMenus.map(m => m.permission));
        const existingIdByPerm = new Map(existingMenus.map((m) => [m.permission, m.id]));

        for (const menu of menus) {
          // 使用 INSERT ... ON DUPLICATE KEY UPDATE 减少逐条查询
          const visible = menu.visible !== undefined ? normalizeBinaryStatus(menu.visible) : 1;
          const status = menu.status !== undefined ? normalizeBinaryStatus(menu.status) : 1;
          const permission = menu.permission
            ? normalizePermissionCode(String(menu.permission).trim())
            : null;
          const params = [
            menu.parentId || 0, menu.name, menu.path || '', menu.component || '',
            menu.icon || '', menu.type || 1, visible, status, menu.sort || 0,
          ];
          let menuId = null;
          if (permission && existingSet.has(permission)) {
            await connection.execute(
              `UPDATE menus SET parent_id = ?, name = ?, path = ?, component = ?, icon = ?,
               type = ?, visible = ?, status = ?, sort_order = ?, permission = ?, updated_at = NOW()
               WHERE permission = ? OR id = ?`,
              [...params, permission, permission, existingIdByPerm.get(permission)]
            );
            menuId = existingIdByPerm.get(permission);
            updatedCount++;
          } else {
            const [ins] = await connection.execute(
              `INSERT INTO menus (parent_id, name, path, component, icon, permission, type, visible, status, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [
                menu.parentId || 0, menu.name, menu.path || '', menu.component || '',
                menu.icon || '', permission, menu.type || 1, visible, status, menu.sort || 0,
              ]
            );
            menuId = ins.insertId;
            if (permission) {
              existingSet.add(permission);
              existingIdByPerm.set(permission, menuId);
            }
            insertedCount++;
          }
          // 同步 permissions SSOT + permission_id
          if (menuId && permission) {
            await bindMenuPermission(connection, menuId, permission, menu.name);
          }
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
        await PermissionService.clearUserPermissionsCache();

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
        '导入菜单数据失败',
        'SERVER_ERROR',
        500,
        error
      );
    }
  },

  async getSettings(req, res) {
    try {
      const [settings] = await pool.execute('SELECT id, `key`, value, description, created_at, updated_at FROM system_settings');
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
        return ResponseHandler.error(res, '设置键不能为空', 'VALIDATION_ERROR', 400);
      }

      await pool.execute(
        'INSERT INTO system_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
        [key, value, value]
      );

      // 清除缓存
      await cacheService.deleteByPrefix('setting_');

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
        return ResponseHandler.error(res, '无效的配置格式', 'VALIDATION_ERROR', 400);
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
      const [databaseVersion] = await pool.query('SELECT VERSION() AS version');
      const info = {
        appName: 'ERP System',
        version: process.env.npm_package_version || '1.0.0',
        nodeVersion: process.versions.node,
        databaseVersion: databaseVersion[0]?.version || null,
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
      // MySQL 的 LIMIT/OFFSET 不支持 prepared statement 参数绑定，
      // 因此直接拼入 SQL，但已通过 parseInt + Math.min/Math.max 做了安全校验
      const actualLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 100);
      const actualOffset = Math.max(parseInt(offset) || 0, 0);
      const [logs] = await pool.query(
        `SELECT id, user_id, username, module, action, entity_type, entity_id,
                ip_address, created_at
         FROM audit_logs ORDER BY created_at DESC LIMIT ${actualLimit} OFFSET ${actualOffset}`
      );
      return ResponseHandler.success(res, logs, '获取系统日志成功');
    } catch (error) {
      logger.error('获取系统日志失败:', error);
      return ResponseHandler.error(res, '获取系统日志失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getFailedJobs(req, res) {
    try {
      const { status = 'pending', page = 1, pageSize = 50 } = req.query;
      const result = await DLQService.listFailedJobs({ status, page, pageSize });
      
      return ResponseHandler.paginated(
        res,
        result.list,
        result.total,
        result.page,
        result.pageSize,
        '获取失败任务列表成功'
      );
    } catch (error) {
      logger.error('获取失败任务列表失败:', error);
      return ResponseHandler.error(res, '获取失败任务列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  async resolveFailedJob(req, res) {
    try {
      const { id } = req.params;
      const operator = getRequestActorLabel(req);
      await DLQService.markResolved(id, operator);
      return ResponseHandler.success(res, { id: Number(id) }, '失败任务已标记为已处理');
    } catch (error) {
      logger.error('标记失败任务失败:', error);
      return ResponseHandler.error(res, '标记失败任务失败', 'SERVER_ERROR', 500, error);
    }
  },

  async retryFailedJobs(req, res) {
    try {
      const limit = req.body?.limit || req.query?.limit || 20;
      const ids = req.body?.ids;
      const requeued = ids ? await DLQService.requeueFailedJobs(ids) : 0;
      const result = await DLQService.retryPendingJobs({ limit });
      return ResponseHandler.success(res, { ...result, requeued }, '失败任务重试已执行');
    } catch (error) {
      logger.error('重试失败任务失败:', error);
      return ResponseHandler.error(res, '重试失败任务失败', 'SERVER_ERROR', 500, error);
    }
  },

  async createBackup(req, res) {
    try {
      const backup = await BackupService.createBackup(req.user?.id);
      return ResponseHandler.success(res, backup, '数据库备份成功');
    } catch (error) {
      logger.error('数据库备份失败:', error);
      return sendBusinessError(res, error, '数据库备份失败');
    }
  },

  async getBackups(req, res) {
    try {
      const backups = await BackupService.listBackups();
      return ResponseHandler.success(res, backups, '获取备份列表成功');
    } catch (error) {
      logger.error('获取备份列表失败:', error);
      return sendBusinessError(res, error, '获取备份列表失败');
    }
  },

  async downloadBackup(req, res) {
    try {
      const { filename } = req.params;
      const backup = await BackupService.getBackupFile(filename);
      res.download(backup.file_path, backup.filename);
    } catch (error) {
      logger.error('备份下载失败:', error);
      return sendBusinessError(res, error, '备份下载失败');
    }
  },

  async verifyBackup(req, res) {
    try {
      const { filename } = req.params;
      const result = await BackupService.verifyBackup(filename);
      return ResponseHandler.success(
        res,
        result,
        result.valid ? 'backup verification passed' : 'backup verification failed'
      );
    } catch (error) {
      logger.error('Backup verification failed:', error);
      return sendBusinessError(res, error, 'backup verification failed');
    }
  },

  /**
   * 接收前端客户端错误上报
   * POST /api/system/client-errors
   */
  async receiveClientError(req, res) {
    try {
      const { type, message, stack, name, componentName, lifecycleHook, url, source, lineno, colno } = req.body;

      // 基本校验
      if (!type || !message) {
        return ResponseHandler.error(res, '缺少必要参数', 'VALIDATION_ERROR', 400);
      }

      // 记录到安全日志
      logger.warn(`🖥️ 前端错误 [${type}]`, {
        type: 'client_error',
        errorType: type,
        errorName: name || 'Unknown',
        message: String(message).substring(0, 500),
        stack: stack ? String(stack).substring(0, 1000) : undefined,
        componentName,
        lifecycleHook,
        url: url ? String(url).substring(0, 200) : undefined,
        source: source ? String(source).substring(0, 200) : undefined,
        lineno,
        colno,
        userId: req.user?.id,
        username: req.user?.username,
      });

      return ResponseHandler.success(res, null, '错误已记录');
    } catch (error) {
      // 错误上报接口本身不应抛出异常给客户端
      logger.error('记录前端错误失败:', error);
      return ResponseHandler.success(res, null, 'ok');
    }
  },
};

module.exports = systemController;
