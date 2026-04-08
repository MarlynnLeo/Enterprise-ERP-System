/**
 * 权限验证中间件
 * 用于检查用户是否有特定权限
 * @date 2025-10-17
 */

const { logger } = require('../utils/logger');
const PermissionService = require('../services/PermissionService');
const { PermissionUtils } = require('../utils/authUtils');

/**
 * 权限检查中间件
 * @param {string|Array} permissions - 权限编码 (单个或数组)
 * @param {string} mode - 验证模式: 'any'(任一满足) 或 'all'(全部满足)
 * @returns {Function} Express中间件函数
 */
function requirePermission(permissions, mode = 'any') {
  return async (req, res, next) => {
    try {
      // 1. 检查用户信息是否存在
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          code: 401,
          message: '未授权：用户信息缺失',
          data: null,
          timestamp: new Date().toISOString(),
        });
      }

      // ✅ 修复: 不再基于JWT快速检查管理员
      // 所有用户都需要从数据库获取权限,由PermissionService统一判断

      // 2. 获取用户权限（包含管理员检查）
      const userPermissions = await PermissionService.getUserPermissions(req.user.id);

      // 3. 检查权限（管理员会有 '*' 通配符，自动通过所有检查）
      const permArray = Array.isArray(permissions) ? permissions : [permissions];
      let hasPermission = false;

      if (mode === 'all') {
        // 所有权限都要有
        hasPermission = PermissionUtils.hasAllPermissions(userPermissions, permArray);
      } else {
        // 任一权限即可
        hasPermission = PermissionUtils.hasAnyPermission(userPermissions, permArray);
      }

      if (!hasPermission) {
        logger.warn(`[权限检查] 用户 ${req.user.username} 权限不足，需要: ${permArray.join(', ')}`);
        return res.status(403).json({
          code: 403,
          message: `权限不足，需要权限: ${permArray.join(', ')}`,
          data: null,
          timestamp: new Date().toISOString(),
        });
      }

      // 4. 权限检查通过，将用户权限附加到请求对象
      req.userPermissions = userPermissions;

      next();
    } catch (error) {
      logger.error('[权限检查] 系统错误:', error);
      res.status(500).json({
        code: 500,
        message: '权限检查服务异常，请稍后重试',
        data: null,
        timestamp: new Date().toISOString(),
      });
    }
  };
}

module.exports = {
  requirePermission,
};
