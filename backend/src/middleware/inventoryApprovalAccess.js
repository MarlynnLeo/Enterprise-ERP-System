/**
 * Inventory approval access policy.
 * Approval visibility and actions are limited to super administrators and
 * users with the corresponding finance approval permission.
 */

const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const PermissionService = require('../services/PermissionService');
const DataScopeService = require('../services/DataScopeService');
const { PermissionUtils } = require('../utils/authUtils');
const { ResponseHandler } = require('../utils/responseHandler');

const ACTION_PERMISSIONS = Object.freeze({
  view: 'finance:inventory:view',
  approve: 'finance:inventory:approve',
  reverse: 'finance:inventory:reverse',
});

function isFinanceDepartment(departmentName) {
  return String(departmentName || '').trim() === '财务部';
}

function canAccessInventoryApproval({
  isAdmin = false,
  permissions = [],
  action = 'view',
} = {}) {
  if (isAdmin) return true;

  const requiredPermission = ACTION_PERMISSIONS[action] || ACTION_PERMISSIONS.view;
  return PermissionUtils.hasPermission(permissions, requiredPermission);
}

function requireInventoryApprovalAccess(action = 'view') {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return ResponseHandler.unauthorized(res, '未授权：用户信息缺失');
      }

      const [[userOrganization]] = await pool.query(
        `SELECT u.department_id, d.name AS department_name
           FROM users u
           LEFT JOIN departments d ON d.id = u.department_id
          WHERE u.id = ?
          LIMIT 1`,
        [req.user.id]
      );
      const [isAdmin, userPermissions] = await Promise.all([
        PermissionService.isAdmin(req.user.id),
        PermissionService.getUserPermissions(req.user.id),
      ]);
      const departmentName = userOrganization?.department_name || '';

      if (
        !canAccessInventoryApproval({
          isAdmin,
          permissions: userPermissions,
          action,
        })
      ) {
        logger.warn(
          `[库存审批权限] 用户 ${req.user.username || req.user.id} 无权执行 ${action}，部门: ${departmentName || '未分配'}`
        );
        return ResponseHandler.forbidden(res, '缺少库存财务审核权限');
      }

      req.userPermissions = userPermissions;
      req.inventoryApprovalAccess = {
        action,
        isAdmin,
        departmentId: userOrganization?.department_id || null,
        departmentName,
      };
      await DataScopeService.attachRequestScope(req);
      return next();
    } catch (error) {
      logger.error('[库存审批权限] 检查失败:', error);
      return ResponseHandler.error(res, '权限检查服务异常，请稍后重试', 'SERVER_ERROR', 500, error);
    }
  };
}

module.exports = {
  ACTION_PERMISSIONS,
  FINANCE_DEPARTMENT_NAME: '财务部',
  canAccessInventoryApproval,
  isFinanceDepartment,
  requireInventoryApprovalAccess,
};
