/**
 * 权限服务 - 统一的权限管理服务
 * 解决权限系统中的缓存不一致和逻辑重复问题
 *
 * 设计原则:
 *   1. 标记为 is_super_admin 的角色拥有超级权限(*通配符)，无需注册每个权限
 *   2. 普通用户权限从 roles → role_permissions → permissions 获取（鉴权 SSOT）
 *   3. menus / role_menus 负责导航可见性；赋权时同步写入 role_permissions
 *   4. 权限结果带缓存(默认5分钟)，服务启动时自动清除旧缓存
 *
 * @date 2025-12-15
 * @updated 2026-02-27 - 管理员权限与menus表解耦，使用通配符机制
 * @updated 2026-07-10 - 鉴权 SSOT 切换到 permissions + role_permissions
 */

const { logger } = require('../utils/logger');
const { pool } = require('../config/db');
const cacheService = require('./cache/CacheManager');

/**
 * 权限别名映射表
 * 解决数据库中菜单权限标识符与前端路由 meta.permission 不一致的问题
 * 双向映射：拥有左侧权限的用户自动获得右侧权限，反之亦然
 *
 * 维护说明：新增路由权限标识时，如果与数据库中的 permission 字段不一致，
 * 在此处添加映射即可，无需修改前端代码
 */
const PERMISSION_ALIASES = {
  'basedata:bom': 'basedata:boms',
  'basedata:process-templates': 'basedata:processtemplates',
  'basedata:product-categories': 'basedata:productcategories',
  'basedata:material-sources': 'basedata:materialsources',
  'basedata:inspection-methods': 'basedata:inspectionmethods',
  'inventory:manualtransaction': 'inventory:manual',
  'inventory:manual-transaction': 'inventory:manual',
  'production:productionreport': 'production:reports',
  'production:productionreport:read': 'production:reports:view',
  'sales:exchanges': 'sales:returns',
  'sales:packinglists': 'sales:packing',
  'sales:packing-lists': 'sales:packing',
  'equipment:list': 'production:equipment',
  'equipment:maintenance': 'production:equipment',
  'equipment:inspection': 'production:equipment',
  'equipment:status': 'production:equipment',
  'quality:incoming': 'quality:inspections',
  'quality:process': 'quality:inspections',
  'quality:final': 'quality:inspections',
  'quality:first-article': 'quality:inspections',
  'system:print:add': 'system:print:create',
  'system:print:edit': 'system:print:update',
  'system:print:template:view': 'system:print:view',
  'system:print:template:add': 'system:print:create',
  'system:print:template:edit': 'system:print:update',
  'system:print:template:delete': 'system:print:delete',
  'finance:ap:invoices:create': 'finance:ap:create',
  'finance:ap:invoices:update': 'finance:ap:update',
  'finance:ap:invoices:delete': 'finance:ap:update',
  'finance:payments:create': 'finance:ap:pay',
  'finance:payments:print': 'finance:ap:view',
  'finance:payments:void': 'finance:ap:update',
};

const EXACT_PERMISSION_ALIASES = {
  'finance:ap:invoices': 'finance:ap:view',
  'finance:payments': 'finance:ap:view',
  'production:plans': 'production:plans:view',
  'production:tasks': 'production:tasks:view',
  'production:process': 'production:process:view',
  'production:reports': 'production:reports:view',
  'production:equipment': 'production:equipment:view',
  'production:calendar': 'production:calendar:view',
  'quality:statistics': 'quality:reports:view',
  'quality:incoming': 'quality:incoming:view',
  'quality:process': 'quality:process:view',
  'quality:final': 'quality:final:view',
  'quality:first-article': 'quality:first-article:view',
  'quality:inspections': 'quality:inspections:view',
  // 系统用户粗粒度 ↔ :view
  'system:users': 'system:users:view',
  'system:departments': 'system:departments:view',
  'system:roles': 'system:roles:view',
  // 协同选人可与用户查看互通
  'todo:collaborate': 'system:users:view',
};

/**
 * 展开权限列表，添加所有别名变体
 * @param {Array<string>} permissions - 原始权限列表
 * @returns {Array<string>} 展开后的完整权限列表
 */
function expandPermissionsWithAliases(permissions) {
  const expanded = new Set(permissions);

  for (const perm of permissions) {
    for (const [alias, canonical] of Object.entries(EXACT_PERMISSION_ALIASES)) {
      if (perm === alias) {
        expanded.add(canonical);
      }
      if (perm === canonical) {
        expanded.add(alias);
      }
    }

    for (const [alias, canonical] of Object.entries(PERMISSION_ALIASES)) {
      if (perm === alias || perm.startsWith(`${alias}:`)) {
        expanded.add(perm.replace(alias, canonical));
      }
      if (perm === canonical || perm.startsWith(`${canonical}:`)) {
        expanded.add(perm.replace(canonical, alias));
      }
    }
  }

  return [...expanded];
}

/**
 * 权限服务类
 * 提供统一的权限获取、验证和缓存管理
 */
class PermissionService {
  /**
   * 展开权限别名，供鉴权与通知收件人解析共享同一套权限语义。
   */
  static expandPermissionsWithAliases(permissions) {
    return expandPermissionsWithAliases(permissions);
  }

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
   * 管理员: 直接返回 ['*'] 通配符
   * 普通用户: 从 role_permissions → permissions.code 获取（SSOT）
   *
   * @param {number} userId - 用户ID
   * @param {boolean} forceRefresh - 是否强制刷新缓存
   * @returns {Promise<Array<string>>} 权限列表
   */
  static async getUserPermissions(userId, forceRefresh = false) {
    try {
      const cacheKey = `${this.CACHE_CONFIG.PREFIX.USER_PERMISSIONS}${userId}`;

      // 如果不是强制刷新，尝试从缓存获取
      if (!forceRefresh) {
        const cachedPermissions = await cacheService.get(cacheKey);
        if (cachedPermissions !== null) {
          logger.debug(`Permission cache hit: cacheKey=${cacheKey}, permissionCount=${cachedPermissions.length}`);
          return cachedPermissions;
        }
      }

      logger.debug(`Permission cache miss: cacheKey=${cacheKey}`);

      // 检查是否是管理员
      const isAdmin = await this.isAdmin(userId);
      let permissions = [];

      if (isAdmin) {
        // 管理员通配符，不依赖 permissions 表全量注册
        permissions = ['*'];
        logger.debug(`Admin wildcard permissions loaded: userId=${userId}`);
      } else {
        permissions = await this.getUserRolePermissions(userId);
        logger.debug(`User permissions loaded: userId=${userId}, permissionCount=${permissions.length}`);
      }

      // 缓存结果
      await cacheService.set(cacheKey, permissions, this.CACHE_CONFIG.TTL);
      logger.debug(`Permission cache stored: cacheKey=${cacheKey}, permissionCount=${permissions.length}`);

      return permissions;
    } catch (error) {
      logger.error('获取用户权限失败:', error);
      throw error;
    }
  }

  /**
   * 检查用户是否为管理员
   * 通过 user_roles + roles.is_super_admin 判断用户是否拥有超级管理员角色
   * @param {number} userId - 用户ID
   * @returns {Promise<boolean>}
   */
  static async isAdmin(userId) {
    try {
      if (!userId) return false;

      const [result] = await pool.execute(
        `SELECT COUNT(*) as count FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = ? AND r.status = 1 AND (r.is_super_admin = 1 OR LOWER(r.code) IN ('admin', 'super_admin', 'system_admin'))`,
        [userId]
      );
      return (result?.[0]?.count || 0) > 0;
    } catch (error) {
      logger.error('检查管理员权限失败:', error);
      throw error;
    }
  }

  /**
   * 获取系统中所有已注册的权限（permissions 表 SSOT）
   * 用于 UI 展示与 production-readiness 注册校验
   * @returns {Promise<Array<string>>}
   */
  static async getAllSystemPermissions() {
    try {
      const [rows] = await pool.execute(
        `SELECT code FROM permissions
          WHERE status = 1
          ORDER BY code`
      );
      if (rows.length > 0) {
        return rows.map((p) => p.code).filter(Boolean);
      }
    } catch (error) {
      // 表未迁移时回退 menus（兼容旧库）
      if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
      logger.warn('permissions 表不存在，回退 menus 注册表');
    }

    const [legacy] = await pool.execute(
      `SELECT DISTINCT permission AS code FROM menus
        WHERE permission IS NOT NULL AND permission != '' AND status = 1
        ORDER BY permission`
    );
    return legacy.map((p) => p.code).filter(Boolean);
  }

  /**
   * 获取用户的角色权限（role_permissions SSOT）
   * @param {number} userId - 用户ID
   * @returns {Promise<Array<string>>}
   */
  static async getUserRolePermissions(userId) {
    const [userRoles] = await pool.execute(
      `SELECT r.id, r.code, r.name FROM roles r
       JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.status = 1`,
      [userId]
    );

    if (!userRoles.length) {
      logger.warn(`User ${userId} has no assigned roles`);
      return [];
    }

    const roleIds = userRoles.map((role) => role.id);
    const placeholders = roleIds.map(() => '?').join(',');

    let rawPermissions;
    try {
      const [permissions] = await pool.execute(
        `SELECT DISTINCT p.code AS permission
           FROM permissions p
           JOIN role_permissions rp ON rp.permission_id = p.id
          WHERE rp.role_id IN (${placeholders})
            AND p.status = 1
          ORDER BY p.code`,
        roleIds
      );
      rawPermissions = permissions.map((p) => p.permission).filter(Boolean);

      // 兼容：role_permissions 尚未回填时回退 role_menus（过渡期）
      if (rawPermissions.length === 0) {
        const [legacy] = await pool.execute(
          `SELECT DISTINCT m.permission
             FROM menus m
             JOIN role_menus rm ON m.id = rm.menu_id
            WHERE rm.role_id IN (${placeholders})
              AND m.permission IS NOT NULL AND m.permission != ''
              AND m.status = 1
            ORDER BY m.permission`,
          roleIds
        );
        rawPermissions = legacy.map((p) => p.permission).filter(Boolean);
        if (rawPermissions.length > 0) {
          logger.warn(
            `User ${userId} role_permissions empty; fallback role_menus (${rawPermissions.length} codes)`
          );
        }
      }
    } catch (error) {
      if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
      const [legacy] = await pool.execute(
        `SELECT DISTINCT m.permission
           FROM menus m
           JOIN role_menus rm ON m.id = rm.menu_id
          WHERE rm.role_id IN (${placeholders})
            AND m.permission IS NOT NULL AND m.permission != ''
            AND m.status = 1
          ORDER BY m.permission`,
        roleIds
      );
      rawPermissions = legacy.map((p) => p.permission).filter(Boolean);
    }

    return expandPermissionsWithAliases(rawPermissions);
  }

  /**
   * 清除用户权限缓存
   * @param {number} userId - 用户ID，如果不传则清除所有用户
   */
  static async clearUserPermissionsCache(userId = null) {
    if (userId) {
      const cacheKey = `${this.CACHE_CONFIG.PREFIX.USER_PERMISSIONS}${userId}`;
      await cacheService.delete(cacheKey);
      logger.info(`User permission cache cleared: userId=${userId}`);
    } else {
      const count = await cacheService.deleteByPrefix(this.CACHE_CONFIG.PREFIX.USER_PERMISSIONS);
      logger.info(`All user permission caches cleared: count=${count}`);
    }
  }

  /**
   * 服务启动时清除所有权限缓存
   * 确保代码变更后不会因为旧缓存导致权限不一致
   */
  static async initOnStartup() {
    await this.clearUserPermissionsCache();
    logger.info('Permission service startup initialized; all permission caches cleared');
  }
}

module.exports = PermissionService;
