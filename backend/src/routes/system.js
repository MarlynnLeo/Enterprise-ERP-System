/**
 * system.js
 * @description 系统管理路由定义 - 纯路由映射，业务逻辑在 controller 中
 * @date 2025-10-17
 * @version 3.0.0
 */

const express = require('express');
const router = express.Router();
const systemController = require('../controllers/system/systemController');
const businessTypeController = require('../controllers/system/businessTypeController');
const { authenticateToken } = require('../middleware/auth');

const { requirePermission } = require('../middleware/requirePermission');
const {
  validateRolePermissions,
  validateRoleInfo,
  validateMenuInfo,
  validateIdParam,
} = require('../middleware/validateInput');

// 所有路由都需要身份验证
router.use(authenticateToken);

// ========== 用户管理路由 ==========
// ✅ 安全修复：添加权限检查
router.get('/users', requirePermission('system:users'), systemController.getAllUsers);

// 获取用户简单列表（无分页）- 用于下拉选择，仅需登录
router.get('/users/list', systemController.getUsersList);

// ✅ 安全修复：用户管理操作添加权限检查
router.get(
  '/users/:id',
  validateIdParam,
  requirePermission('system:users'),
  systemController.getUserById
);
router.post('/users', requirePermission('system:users:create'), systemController.createUser);
router.put(
  '/users/:id',
  validateIdParam,
  requirePermission('system:users:update'),
  systemController.updateUser
);
router.put(
  '/users/:id/status',
  validateIdParam,
  requirePermission('system:users:update'),
  systemController.updateUserStatus
);
router.put(
  '/users/:id/password/reset',
  validateIdParam,
  requirePermission('system:users:update'),
  systemController.resetUserPassword
);

// ========== 部门管理路由 ==========
// ✅ 安全修复：添加权限检查
// 获取部门列表（无分页，用于下拉选择）- 仅需登录
router.get(
  '/departments/list',
  systemController.getAllDepartments
);
router.get(
  '/departments',
  requirePermission('system:departments'),
  systemController.getAllDepartments
);
router.get(
  '/departments/:id',
  validateIdParam,
  requirePermission('system:departments'),
  systemController.getDepartmentById
);
router.post(
  '/departments',
  requirePermission('system:departments:create'),
  systemController.createDepartment
);
router.put(
  '/departments/:id',
  validateIdParam,
  requirePermission('system:departments:update'),
  systemController.updateDepartment
);
router.put(
  '/departments/:id/status',
  validateIdParam,
  requirePermission('system:departments:update'),
  systemController.updateDepartmentStatus
);
router.delete(
  '/departments/:id',
  validateIdParam,
  requirePermission('system:departments:delete'),
  systemController.deleteDepartment
);

// ========== 角色管理路由 ==========
// ✅ 安全修复：添加权限检查
// 获取角色列表（无分页，用于下拉选择）
router.get('/roles/list', requirePermission('system:permissions'), systemController.getRolesList);

router.get('/roles', requirePermission('system:permissions'), systemController.getAllRoles);
router.get(
  '/roles/:id',
  validateIdParam,
  requirePermission('system:permissions'),
  systemController.getRoleById
);

// ✅ 获取角色权限 - 添加权限检查和参数验证
router.get(
  '/roles/:id/permissions',
  validateIdParam,
  requirePermission('system:permissions'),
  systemController.getRolePermissions
);

// ✅ 更新角色权限 - 添加权限检查、参数验证、缓存清理和审计日志
router.put(
  '/roles/:id/permissions',
  validateIdParam,
  requirePermission('system:permissions:manage'),
  validateRolePermissions,
  systemController.updateRolePermissions
);

// ✅ 创建角色 - 添加权限检查和参数验证
router.post(
  '/roles',
  requirePermission('system:permissions:manage'),
  validateRoleInfo,
  systemController.createRole
);

// ✅ 更新角色 - 添加权限检查、参数验证和ID验证
router.put(
  '/roles/:id',
  validateIdParam,
  requirePermission('system:permissions:manage'),
  validateRoleInfo,
  systemController.updateRole
);

// ✅ 更新角色状态 - 添加权限检查和ID验证
router.put(
  '/roles/:id/status',
  validateIdParam,
  requirePermission('system:permissions:manage'),
  systemController.updateRoleStatus
);

// ✅ 删除角色 - 添加权限检查和ID验证
router.delete(
  '/roles/:id',
  validateIdParam,
  requirePermission('system:permissions:manage'),
  systemController.deleteRole
);

// ========== 权限诊断工具 ==========
// ✅ 诊断用户权限（仅管理员可用）
router.get(
  '/permissions/diagnose/:userId',
  validateIdParam,
  requirePermission('system:permissions'),
  systemController.diagnosePermissions
);

// ✅ 刷新用户权限缓存（仅管理员可用）
router.post(
  '/permissions/refresh/:userId',
  validateIdParam,
  requirePermission('system:permissions'),
  systemController.refreshPermissions
);

// ========== 菜单管理路由 ==========
// ✅ 安全修复：添加权限检查
router.get('/menus', requirePermission('system:permissions'), systemController.getAllMenus);

// 直接从数据库获取菜单数据 - 需要权限管理权限
router.get('/menus/direct', requirePermission('system:permissions'), systemController.getMenusDirect);

// ✅ 获取菜单详情 - 添加权限检查和ID验证
router.get(
  '/menus/:id',
  validateIdParam,
  requirePermission('system:permissions'),
  systemController.getMenuById
);

// ✅ 创建菜单 - 添加权限检查和参数验证
router.post(
  '/menus',
  requirePermission('system:permissions:manage'),
  validateMenuInfo,
  systemController.createMenu
);

// ✅ 更新菜单 - 添加权限检查、参数验证和ID验证
router.put(
  '/menus/:id',
  validateIdParam,
  requirePermission('system:permissions:manage'),
  validateMenuInfo,
  systemController.updateMenu
);

// ✅ 删除菜单 - 添加权限检查和ID验证
router.delete(
  '/menus/:id',
  validateIdParam,
  requirePermission('system:permissions:manage'),
  systemController.deleteMenu
);

// ✅ 导入菜单数据 - 批量导入菜单权限配置
router.post('/menus/import', requirePermission('system:permissions:manage'), systemController.importMenus);

// ✅ 新增: 系统设置相关端点（来自 systemRoutes.js）
router.get('/settings', systemController.getSettings);

router.put('/settings', requirePermission('system:settings:write'), systemController.updateSettings);

// ✅ 新增: 会计科目配置管理端点
router.get(
  '/accounting/account-codes',
  requirePermission('system:settings:read'),
  systemController.getAccountingCodes
);

router.put(
  '/accounting/account-codes',
  requirePermission('system:settings:write'),
  systemController.updateAccountingCodes
);

// ✅ 新增: 系统信息端点
router.get('/info', systemController.getSystemInfo);

// ✅ 新增: 系统日志端点
router.get('/logs', requirePermission('system:logs'), systemController.getSystemLogs);

// 异步副作用失败任务（死信队列）运维入口
router.get('/failed-jobs', requirePermission('system:monitor'), systemController.getFailedJobs);
router.put(
  '/failed-jobs/:id/resolve',
  validateIdParam,
  requirePermission('system:admin'),
  systemController.resolveFailedJob
);

// ✅ 新增: 数据库备份端点
router.post('/backup', requirePermission('system:backup:create'), systemController.createBackup);

router.get('/backups', requirePermission('system:backup:view'), systemController.getBackups);

router.get('/backups/:filename', requirePermission('system:backup:download'), systemController.downloadBackup);

// ⚠️ SQL执行端点已移除（安全原因）
// 如需执行SQL查询，请使用数据库管理工具或创建专门的API端点
// 原端点: POST /exec-sql (已禁用)

// ========== 业务类型管理路由 ==========
router.get('/business-types', businessTypeController.getAllBusinessTypes);
router.get('/business-types/groups', businessTypeController.getBusinessTypeGroups);
router.get('/business-types/category/:category', businessTypeController.getBusinessTypesByCategory);
router.get('/business-types/:id', validateIdParam, businessTypeController.getBusinessTypeById);
router.post(
  '/business-types',
  requirePermission('system:business-types:create'),
  businessTypeController.createBusinessType
);
router.put(
  '/business-types/:id',
  validateIdParam,
  requirePermission('system:business-types:update'),
  businessTypeController.updateBusinessType
);
router.delete(
  '/business-types/:id',
  validateIdParam,
  requirePermission('system:business-types:delete'),
  businessTypeController.deleteBusinessType
);
router.put(
  '/business-types/sort',
  requirePermission('system:business-types:update'),
  businessTypeController.updateSortOrder
);

module.exports = router;
