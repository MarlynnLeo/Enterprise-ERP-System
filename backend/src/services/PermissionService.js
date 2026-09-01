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
 * 权限别名映射表（双向，前缀匹配）
 * 解决数据库中菜单权限标识符与前端路由 meta.permission 不一致的问题
 * 双向映射：拥有左侧权限的用户自动获得右侧权限，反之亦然
 *
 * ⚠️ 只有「同一资源 + 同一动作级别」的命名变体才能放进这里。
 * 双向展开等于把两个权限码合并成一个，因此反向也必须成立：
 *   ✅ basedata:bom ↔ basedata:boms          （同资源，单复数写法）
 *   ✅ system:print:add ↔ system:print:create（同动作，新旧命名）
 *   ❌ finance:ap:update → finance:ap:invoices:delete（改 → 删，动作放大）
 *   ❌ todo:collaborate → system:users:view      （选人按钮 → 用户名录，跨资源）
 * 反向不成立的映射请写进 PERMISSION_IMPLICATIONS。
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
  'finance:payments:create': 'finance:ap:pay',
};

/**
 * 单向权限蕴含表：持有左侧权限即视为持有右侧权限，反向不成立。
 *
 * 用于「细粒度动作码 → 所依赖的粗粒度码」这类不对称关系。
 * 从这里拿到的码不会再反向展开，因此不会把 view 放大成 delete，
 * 也不会让一个按钮级权限反推出整个资源的读权限。
 *
 * 历史背景：这三条原先写在 PERMISSION_ALIASES 里做双向展开，导致
 *   finance:ap:update  →（反向）→ finance:ap:invoices:delete / finance:payments:void
 *   system:users:view  →（反向）→ todo:collaborate
 *   todo:collaborate   →（正向）→ system:users:view
 * 即「改」自动获得「删/作废」、「协同选人」自动获得用户名录读权限。
 */
const PERMISSION_IMPLICATIONS = {
  // 发票删除/付款作废各自依赖 AP 修改权，但持有修改权不等于可以删除或作废。
  'finance:ap:invoices:delete': 'finance:ap:update',
  'finance:payments:void': 'finance:ap:update',
  // 打印付款单依赖 AP 查看权；持有查看权不自动获得打印按钮。
  'finance:payments:print': 'finance:ap:view',
  // 协同选人需要读取用户名录；持有用户查看权不反向获得协同选人按钮。
  'todo:collaborate': 'system:users:view',
};

/**
 * 精确别名（双向，全等匹配）
 * 主要解决「粗粒度菜单码 ↔ :view 细粒度码」的历史分裂。
 * 同样只允许同资源、同动作级别的等价关系，跨资源关系请用 PERMISSION_IMPLICATIONS。
 */
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
};

/**
 * 双向别名展开（同资源、同动作级别的命名变体）
 */
function applyBidirectionalAliases(permissions) {
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

  return expanded;
}

/**
 * 展开权限列表，添加所有别名变体
 *
 * 两段式：
 *   1. 双向别名（PERMISSION_ALIASES / EXACT_PERMISSION_ALIASES）——命名变体互通
 *   2. 单向蕴含（PERMISSION_IMPLICATIONS）——细粒度码补上所依赖的粗粒度码，
 *      结果不再回到第 1 步，避免反向放大动作或跨资源提权
 *
 * @param {Array<string>} permissions - 原始权限列表
 * @returns {Array<string>} 展开后的完整权限列表
 */
function expandPermissionsWithAliases(permissions) {
  const source = Array.isArray(permissions) ? permissions : [];
  const expanded = applyBidirectionalAliases(source);

  // 单向蕴含：只从 held → implied，且 implied 再走一次双向别名以覆盖命名变体，
  // 但不会反向推回 held，因此 finance:ap:update 不会得到 :delete / :void。
  const implied = new Set();
  for (const perm of expanded) {
    const target = PERMISSION_IMPLICATIONS[perm];
    if (target) implied.add(target);
  }
  if (implied.size > 0) {
    for (const code of applyBidirectionalAliases([...implied])) {
      expanded.add(code);
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
          logger.debug(
            `Permission cache hit: cacheKey=${cacheKey}, permissionCount=${cachedPermissions.length}`
          );
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
        logger.debug(
          `User permissions loaded: userId=${userId}, permissionCount=${permissions.length}`
        );
      }

      // 缓存结果
      await cacheService.set(cacheKey, permissions, this.CACHE_CONFIG.TTL);
      logger.debug(
        `Permission cache stored: cacheKey=${cacheKey}, permissionCount=${permissions.length}`
      );

      return permissions;
    } catch (error) {
      logger.error('获取用户权限失败:', error);
      throw error;
    }
  }

  /**
   * 检查用户是否为管理员
   * 通过 user_roles + roles.is_super_admin 判断用户是否拥有超级管理员角色
   *
   * ⚠️ 只认 roles.is_super_admin 这个受保护标记（见 authorization/superAdmin.js）。
   * 角色 code/name 是可变元数据，任何持 system:permissions:manage 的用户都能改，
   * 一旦参与提权判断就等于把提权入口开放给角色管理员，因此绝不能作为兜底条件。
   *
   * @param {number} userId - 用户ID
   * @returns {Promise<boolean>}
   */
  static async isAdmin(userId) {
    try {
      if (!userId) return false;

      const [result] = await pool.execute(
        `SELECT COUNT(*) as count FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = ? AND r.status = 1 AND r.is_super_admin = 1`,
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
    const [rows] = await pool.execute(
      `SELECT code FROM permissions
        WHERE status = 1
        ORDER BY code`
    );
    return rows.map((permission) => permission.code).filter(Boolean);
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

    const [permissions] = await pool.execute(
      `SELECT DISTINCT p.code AS permission
         FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
        WHERE rp.role_id IN (${placeholders})
          AND p.status = 1
        ORDER BY p.code`,
      roleIds
    );
    const rawPermissions = permissions.map((permission) => permission.permission).filter(Boolean);

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
