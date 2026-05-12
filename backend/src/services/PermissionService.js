/**
 * 权限服务 - 统一的权限管理服务
 * 解决权限系统中的缓存不一致和逻辑重复问题
 *
 * 设计原则:
 *   1. 管理员(admin角色)拥有超级权限(*通配符)，无需在menus表中注册每个权限
 *   2. 普通用户权限从 roles -> role_menus -> menus 三表关联获取
 *   3. 权限结果带缓存(默认5分钟)，服务启动时自动清除旧缓存
 *
 * @date 2025-12-15
 * @updated 2026-02-27 - 管理员权限与menus表解耦，使用通配符机制
 */

const { logger } = require('../utils/logger');
const { pool } = require('../config/db');
const cacheService = require('./cacheService');

/**
 * 权限服务类
 * 提供统一的权限获取、验证和缓存管理
 */
class PermissionService {
  /**
   * 缓存配置
   */
  static CACHE_CONFIG = {
    TTL: 300, // 5分钟
    PREFIX: {
      USER_PERMISSIONS: 'user_permissions:',
      USER_MENUS: 'user_menus:',
    },
  };

  /**
   * 获取用户权限列表（带缓存）
   *
   * 管理员: 直接返回 ['*'] 通配符，不查询menus表
   * 普通用户: 从角色关联的menus中获取permission字段
   *
   * @param {number} userId - 用户ID
   * @param {boolean} forceRefresh - 是否强制刷新缓存
   * @returns {Promise<Array<string>>} 权限列表
   */
  static async getUserPermissions(userId, forceRefresh = false) {
    try {
      const cacheKey = `${this.CACHE_CONFIG.PREFIX.USER_PERMISSIONS}${userId}`;

      // 如果不是强制刷新，尝试从缓存获取
      if (!forceRefresh && cacheService.has(cacheKey)) {
        const cachedPermissions = cacheService.get(cacheKey);
        logger.debug(`✅ [缓存命中] 用户权限: ${cacheKey}, 权限数: ${cachedPermissions.length}`);
        return cachedPermissions;
      }

      logger.debug(`❌ [缓存未命中] 用户权限: ${cacheKey}, 将从数据库查询`);

      // 检查是否是管理员
      const isAdmin = await this.isAdmin(userId);
      let permissions = [];

      if (isAdmin) {
        // ✅ 根本修复: 管理员直接返回通配符，不依赖menus表注册
        // 通配符 '*' 会被 PermissionUtils.hasPermission() 识别，自动通过所有权限检查
        // 这样新增路由权限标识时无需同步更新menus表
        permissions = ['*'];
        logger.debug(`👑 [管理员权限] 用户 ${userId} 拥有超级权限(通配符*)`);
      } else {
        // 普通用户获取角色权限
        permissions = await this.getUserRolePermissions(userId);
        logger.debug(`👤 [用户权限] 用户 ${userId} 权限数: ${permissions.length}`);
      }

      // 缓存结果
      cacheService.set(cacheKey, permissions, this.CACHE_CONFIG.TTL);
      logger.debug(`💾 [缓存设置] 用户权限已缓存: ${cacheKey}, 权限数: ${permissions.length}`);

      return permissions;
    } catch (error) {
      logger.error('获取用户权限失败:', error);
      return [];
    }
  }

  /**
   * 检查用户是否为管理员
   * 通过 user_roles + roles 表判断用户是否拥有 admin 角色
   * @param {number} userId - 用户ID
   * @returns {Promise<boolean>}
   */
  static async isAdmin(userId) {
    try {
      const [result] = await pool.execute(
        `SELECT COUNT(*) as count FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = ? AND r.code = 'admin' AND r.status = 1`,
        [userId]
      );
      return result[0].count > 0;
    } catch (error) {
      logger.error('检查管理员权限失败:', error);
      return false;
    }
  }

  /**
   * 获取系统中所有已注册的权限（用于前端权限管理页面展示）
   * 注意: 此方法不再用于管理员权限判断，仅供UI展示和权限分配使用
   * @returns {Promise<Array<string>>}
   */
  static async getAllSystemPermissions() {
    const [permissions] = await pool.execute(
      `SELECT DISTINCT permission FROM menus
       WHERE permission IS NOT NULL
       AND permission != ''
       AND status = 1
       ORDER BY permission`
    );
    return permissions.map((p) => p.permission).filter(Boolean);
  }

  /**
   * 获取用户的角色权限
   * @param {number} userId - 用户ID
   * @returns {Promise<Array<string>>}
   */
  static async getUserRolePermissions(userId) {
    // 1. 获取用户的角色
    const [userRoles] = await pool.execute(
      `SELECT r.id, r.code, r.name FROM roles r
       JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.status = 1`,
      [userId]
    );

    if (!userRoles.length) {
      logger.warn(`⚠️ 用户 ${userId} 没有分配任何角色`);
      return [];
    }

    // 2. 获取角色的权限
    const roleIds = userRoles.map((role) => role.id);
    const placeholders = roleIds.map(() => '?').join(',');

    const [permissions] = await pool.execute(
      `SELECT DISTINCT m.permission
       FROM menus m
       JOIN role_menus rm ON m.id = rm.menu_id
       WHERE rm.role_id IN (${placeholders})
       AND m.permission IS NOT NULL
       AND m.permission != ''
       AND m.status = 1
       ORDER BY m.permission`,
      roleIds
    );

    return permissions.map((p) => p.permission).filter(Boolean);
  }

  /**
   * 清除用户权限缓存
   * @param {number} userId - 用户ID，如果不传则清除所有用户
   */
  static clearUserPermissionsCache(userId = null) {
    if (userId) {
      const cacheKey = `${this.CACHE_CONFIG.PREFIX.USER_PERMISSIONS}${userId}`;
      cacheService.delete(cacheKey);
      logger.info(`🗑️ [清除缓存] 已清除用户 ${userId} 的权限缓存`);
    } else {
      const count = cacheService.deleteByPrefix(this.CACHE_CONFIG.PREFIX.USER_PERMISSIONS);
      logger.info(`🗑️ [批量清除缓存] 已清除所有用户权限缓存: ${count} 个`);
    }
  }

  /**
   * 服务启动时清除所有权限缓存
   * 确保代码变更后不会因为旧缓存导致权限不一致
   */
  static initOnStartup() {
    this.clearUserPermissionsCache();
    logger.info('🔄 [权限服务] 启动初始化完成，已清除所有权限缓存');
  }
}

module.exports = PermissionService;
