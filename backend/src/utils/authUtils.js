/**
 * 认证和权限验证工具类
 * 统一处理JWT验证和权限检查逻辑
 *
 * ✅ v2.0 重构: 移除了废弃的 isAdmin/isAdminAsync 方法和重复的 AuthMiddleware 类
 * - 管理员检查请使用 PermissionService.isAdmin(userId)
 * - 权限中间件请使用 requirePermission.js
 */

const jwt = require('jsonwebtoken');

/**
 * JWT工具类
 */
class JWTUtils {
  /**
   * 验证JWT token
   * @param {string} token - JWT token
   * @returns {Object} 解码后的用户信息
   */
  static verifyToken(token) {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    return jwt.verify(token, process.env.JWT_SECRET);
  }

  /**
   * 生成JWT token
   * @param {Object} payload - 用户信息
   * @param {string} expiresIn - 过期时间
   * @returns {string} JWT token
   */
  static generateToken(payload, expiresIn = '24h') {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
  }
}

/**
 * 权限验证工具类
 */
class PermissionUtils {
  /**
   * 检查用户是否有指定权限
   * @param {Array} userPermissions - 用户权限列表
   * @param {string} requiredPermission - 需要的权限
   * @returns {boolean} 是否有权限
   */
  static hasPermission(userPermissions, requiredPermission) {
    if (!Array.isArray(userPermissions) || !requiredPermission) {
      return false;
    }

    // 检查通配符权限
    if (userPermissions.includes('*')) {
      return true;
    }

    // 精确匹配
    if (userPermissions.includes(requiredPermission)) {
      return true;
    }

    // 层级权限匹配：仅支持显式的通配符匹配
    // 例如：用户拥有 `system:users:*` 可以访问 `system:users:create`
    return userPermissions.some(p => {
      if (typeof p === 'string' && p.endsWith(':*')) {
        const prefix = p.slice(0, -2); // 移除 :*
        return requiredPermission.startsWith(prefix + ':');
      }
      return false;
    });
  }

  /**
   * 检查用户是否有任一权限
   * @param {Array} userPermissions - 用户权限列表
   * @param {Array} requiredPermissions - 需要的权限列表
   * @returns {boolean} 是否有任一权限
   */
  static hasAnyPermission(userPermissions, requiredPermissions) {
    if (!Array.isArray(requiredPermissions)) {
      return false;
    }
    return requiredPermissions.some((permission) =>
      this.hasPermission(userPermissions, permission)
    );
  }

  /**
   * 检查用户是否有所有权限
   * @param {Array} userPermissions - 用户权限列表
   * @param {Array} requiredPermissions - 需要的权限列表
   * @returns {boolean} 是否有所有权限
   */
  static hasAllPermissions(userPermissions, requiredPermissions) {
    if (!Array.isArray(requiredPermissions)) {
      return false;
    }
    return requiredPermissions.every((permission) =>
      this.hasPermission(userPermissions, permission)
    );
  }
}

module.exports = {
  JWTUtils,
  PermissionUtils,
};
