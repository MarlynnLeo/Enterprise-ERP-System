/**
 * DataScopeService — 行级数据范围 SSOT
 *
 * DATA_SCOPE:
 *   1 ALL | 2 DEPT_AND_CHILDREN | 3 DEPT | 4 SELF | 5 CUSTOM
 *
 * 安全约定（根源修复）：
 * - 未解析到 scope 时不得按 ALL 放行
 * - 列表与单记录使用同一套 owner/location 规则
 * - operator 等字符串字段不参与授权
 */

const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const { isSuperAdminRole } = require('../authorization/superAdmin');

const DATA_SCOPE = {
  ALL: 1,
  DEPARTMENT_AND_CHILDREN: 2,
  DEPARTMENT: 3,
  SELF: 4,
  CUSTOM: 5,
};

// 首屏会并发触发多条受保护接口。用极短 TTL + in-flight 合并避免同一用户
// 在一次页面打开过程中反复查询用户、角色和部门树；1 秒后自动重新读取，
// 将权限变更的陈旧窗口限制在最小范围。
const DATA_SCOPE_CACHE_TTL_MS = Math.min(
  5000,
  Math.max(0, Number.parseInt(process.env.DATA_SCOPE_CACHE_TTL_MS || '1000', 10) || 0)
);
const MAX_DATA_SCOPE_CACHE_SIZE = 1000;
const dataScopeCache = new Map();
const dataScopeInflight = new Map();

function cloneScope(scope) {
  if (!scope) return scope;
  return {
    ...scope,
    departmentIds: [...(scope.departmentIds || [])],
    locationIds: [...(scope.locationIds || [])],
  };
}

class DataScopeService {
  static async getUserDataScope(userId, options = {}) {
    if (!userId) return this.loadUserDataScope(userId);

    const cacheKey = String(userId);
    const bypassCache = Boolean(options.bypassCache);
    const now = Date.now();

    if (!bypassCache && DATA_SCOPE_CACHE_TTL_MS > 0) {
      const cached = dataScopeCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cloneScope(cached.scope);
      }
      if (cached) dataScopeCache.delete(cacheKey);
    }

    if (!bypassCache && dataScopeInflight.has(cacheKey)) {
      return cloneScope(await dataScopeInflight.get(cacheKey));
    }

    const loadPromise = this.loadUserDataScope(userId);
    if (!bypassCache) dataScopeInflight.set(cacheKey, loadPromise);

    try {
      const scope = await loadPromise;
      if (!bypassCache && DATA_SCOPE_CACHE_TTL_MS > 0) {
        dataScopeCache.delete(cacheKey);
        dataScopeCache.set(cacheKey, {
          scope: cloneScope(scope),
          expiresAt: Date.now() + DATA_SCOPE_CACHE_TTL_MS,
        });
        while (dataScopeCache.size > MAX_DATA_SCOPE_CACHE_SIZE) {
          dataScopeCache.delete(dataScopeCache.keys().next().value);
        }
      }
      return cloneScope(scope);
    } finally {
      if (dataScopeInflight.get(cacheKey) === loadPromise) {
        dataScopeInflight.delete(cacheKey);
      }
    }
  }

  static invalidateUserDataScope(userId) {
    if (!userId) return;
    const cacheKey = String(userId);
    dataScopeCache.delete(cacheKey);
    dataScopeInflight.delete(cacheKey);
  }

  static clearDataScopeCache() {
    dataScopeCache.clear();
    dataScopeInflight.clear();
  }

  static async loadUserDataScope(userId) {
    if (!userId) {
      return {
        type: DATA_SCOPE.SELF,
        userId: null,
        departmentId: null,
        departmentIds: [],
        locationIds: [],
      };
    }

    const [users] = await pool.execute(
      'SELECT id, username, department_id FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const user = users[0] || { id: userId, department_id: null };

    const [roles] = await pool.execute(
      `SELECT r.id, r.is_super_admin, COALESCE(r.data_scope, ?) AS data_scope
         FROM roles r
         JOIN user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = ? AND r.status = 1`,
      [DATA_SCOPE.SELF, userId]
    );

    if (roles.some((role) => isSuperAdminRole(role))) {
      return {
        type: DATA_SCOPE.ALL,
        userId,
        departmentId: user.department_id,
        departmentIds: [],
        locationIds: [],
      };
    }

    const roleScopes = roles.map((role) => Number(role.data_scope || DATA_SCOPE.SELF));
    // 多角色取最宽（数值最小）
    const type = roleScopes.length ? Math.min(...roleScopes) : DATA_SCOPE.SELF;
    if (type === DATA_SCOPE.ALL) {
      return {
        type,
        userId,
        departmentId: user.department_id,
        departmentIds: [],
        locationIds: [],
      };
    }

    const roleIds = roles.map((role) => role.id);
    const departmentIds = await this.resolveDepartmentIds(type, user.department_id, roleIds);
    const locationIds = await this.resolveLocationIds(type, roleIds);

    return {
      type,
      userId,
      departmentId: user.department_id || null,
      departmentIds,
      locationIds,
    };
  }

  static async resolveDepartmentIds(type, departmentId, roleIds) {
    if (type === DATA_SCOPE.SELF) return [];
    if (type === DATA_SCOPE.DEPARTMENT && departmentId) return [Number(departmentId)];

    if (type === DATA_SCOPE.CUSTOM && roleIds.length) {
      try {
        const placeholders = roleIds.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT DISTINCT department_id
             FROM role_data_departments
            WHERE role_id IN (${placeholders})`,
          roleIds
        );
        return rows.map((row) => Number(row.department_id)).filter(Boolean);
      } catch (error) {
        if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
        logger.warn('role_data_departments table is missing; custom department scope is empty');
      }
    }

    if (type === DATA_SCOPE.DEPARTMENT_AND_CHILDREN && departmentId) {
      try {
        const [rows] = await pool.execute(
          `WITH RECURSIVE dept_tree AS (
             SELECT id FROM departments WHERE id = ?
             UNION ALL
             SELECT d.id
               FROM departments d
               JOIN dept_tree dt ON d.parent_id = dt.id
           )
           SELECT id FROM dept_tree`,
          [departmentId]
        );
        return rows.map((row) => Number(row.id)).filter(Boolean);
      } catch (error) {
        logger.warn(`Failed to resolve child departments for data scope: ${error.message}`);
        return [Number(departmentId)];
      }
    }

    return [];
  }

  static async resolveLocationIds(type, roleIds) {
    if (type !== DATA_SCOPE.CUSTOM || !roleIds.length) return [];

    try {
      const placeholders = roleIds.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT DISTINCT location_id
           FROM role_data_locations
          WHERE role_id IN (${placeholders})`,
        roleIds
      );
      return rows.map((row) => Number(row.location_id)).filter(Boolean);
    } catch (error) {
      if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
      logger.warn('role_data_locations table is missing; custom location scope is empty');
      return [];
    }
  }

  /** 仅显式 ALL 才放行；null/undefined 视为非 ALL（失败关闭） */
  static isAllScope(scope) {
    return Boolean(scope) && Number(scope.type) === DATA_SCOPE.ALL;
  }

  static getUserId(req) {
    return req?.user?.id || req?.user?.userId || null;
  }

  static async attachRequestScope(req) {
    const userId = this.getUserId(req);
    if (!userId) {
      req.authzScope = {
        type: DATA_SCOPE.SELF,
        userId: null,
        departmentId: null,
        departmentIds: [],
        locationIds: [],
      };
      return req.authzScope;
    }
    const scope = await this.getUserDataScope(userId);
    req.authzScope = scope;
    return scope;
  }

  static async getRequestScope(req) {
    if (req.authzScope) return req.authzScope;
    const scope = await this.getUserDataScope(this.getUserId(req));
    req.authzScope = scope;
    return scope;
  }

  /**
   * 构建列表 SQL 作用域
   * options:
   *  - tableAlias, ownerColumn, ownerAlias, departmentColumn
   *  - locationColumn + includeLocation：CUSTOM 时叠加库位过滤
   */
  static buildOwnerScopeClause(scope, options = {}) {
    // 无 scope → 拒绝（失败关闭）
    if (!scope) {
      return { join: '', where: ' AND 1 = 0', params: [] };
    }

    if (this.isAllScope(scope)) {
      return { join: '', where: '', params: [] };
    }

    const tableAlias = options.tableAlias || 't';
    const ownerColumn = options.ownerColumn || 'created_by';
    const ownerAlias = options.ownerAlias || `${tableAlias}_owner_scope`;
    const departmentColumn = options.departmentColumn || null;
    const locationColumns = [
      ...(Array.isArray(options.locationColumns) ? options.locationColumns : []),
      ...(options.locationColumn ? [options.locationColumn] : []),
    ].filter((column, index, values) => column && values.indexOf(column) === index);
    const includeLocation = Boolean(options.includeLocation && locationColumns.length);
    const requireAllLocations = Boolean(options.requireAllLocations);
    const q = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;
    const ownerExpr = `${tableAlias}.${q(ownerColumn)}`;

    // SELF：仅本人
    if (Number(scope.type) === DATA_SCOPE.SELF) {
      if (!scope.userId) {
        return { join: '', where: ' AND 1 = 0', params: [] };
      }
      return {
        join: '',
        where: ` AND ${ownerExpr} = ?`,
        params: [scope.userId],
      };
    }

    // CUSTOM：部门 或 库位（任一命中）
    if (Number(scope.type) === DATA_SCOPE.CUSTOM) {
      const parts = [];
      const params = [];
      let join = '';

      if (departmentColumn && scope.departmentIds.length > 0) {
        parts.push(
          `${tableAlias}.${q(departmentColumn)} IN (${scope.departmentIds.map(() => '?').join(',')})`
        );
        params.push(...scope.departmentIds);
      } else if (scope.departmentIds.length > 0) {
        join = ` LEFT JOIN users ${ownerAlias} ON ${ownerAlias}.id = ${ownerExpr}`;
        parts.push(
          `${ownerAlias}.department_id IN (${scope.departmentIds.map(() => '?').join(',')})`
        );
        params.push(...scope.departmentIds);
      }

      let locationPart = '';
      const locationParams = [];
      if (includeLocation && scope.locationIds.length > 0) {
        locationPart = locationColumns
          .map(
            (column) =>
              `${tableAlias}.${q(column)} IN (${scope.locationIds.map(() => '?').join(',')})`
          )
          .join(requireAllLocations ? ' AND ' : ' OR ');
        for (let index = 0; index < locationColumns.length; index += 1) {
          locationParams.push(...scope.locationIds);
        }
      }

      if (requireAllLocations) {
        if (!locationPart) {
          return { join: '', where: ' AND 1 = 0', params: [] };
        }
        const basePart = parts.length ? `(${parts.join(' OR ')}) AND ` : '';
        return {
          join,
          where: ` AND (${basePart}(${locationPart}))`,
          params: [...params, ...locationParams],
        };
      }

      if (locationPart) {
        parts.push(`(${locationPart})`);
        params.push(...locationParams);
      }

      if (parts.length === 0) {
        return { join: '', where: ' AND 1 = 0', params: [] };
      }

      return {
        join,
        where: ` AND (${parts.join(' OR ')})`,
        params,
      };
    }

    // 部门 / 部门及下级
    if (scope.departmentIds.length > 0) {
      if (departmentColumn) {
        return {
          join: '',
          where: ` AND ${tableAlias}.${q(departmentColumn)} IN (${scope.departmentIds.map(() => '?').join(',')})`,
          params: scope.departmentIds,
        };
      }
      return {
        join: ` LEFT JOIN users ${ownerAlias} ON ${ownerAlias}.id = ${ownerExpr}`,
        where: ` AND ${ownerAlias}.department_id IN (${scope.departmentIds.map(() => '?').join(',')})`,
        params: scope.departmentIds,
      };
    }

    return { join: '', where: ' AND 1 = 0', params: [] };
  }

  static async buildRequestOwnerScopeClause(req, options = {}) {
    const scope = await this.getRequestScope(req);
    return this.buildOwnerScopeClause(scope, options);
  }

  static async canAccessLocation(req, locationId) {
    const scope = await this.getRequestScope(req);
    if (this.isAllScope(scope)) return true;

    // CUSTOM：必须在授权库位内
    if (Number(scope.type) === DATA_SCOPE.CUSTOM) {
      if (!scope.locationIds.length) return false;
      return scope.locationIds.includes(Number(locationId));
    }

    // 非 CUSTOM 文档级用 owner；库位本身不按部门拦截（库存物理共享）
    return true;
  }

  static async assertRecordExists(connection, tableName, recordId, options = {}) {
    const normalizedRecordId = Number(recordId);
    if (!Number.isInteger(normalizedRecordId) || normalizedRecordId <= 0) return false;

    const idColumn = options.idColumn || 'id';
    const deletedAtColumn =
      options.deletedAtColumn === false
        ? null
        : options.deletedAtColumn || 'deleted_at';
    const extraSoftDelete = options.extraSoftDelete || null;
    const q = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;

    let sql = `SELECT ${q(idColumn)} AS id FROM ${q(tableName)} WHERE ${q(idColumn)} = ?`;
    if (deletedAtColumn) {
      sql += ` AND ${q(deletedAtColumn)} IS NULL`;
    }
    if (extraSoftDelete?.column) {
      sql += ` AND ${q(extraSoftDelete.column)} = ?`;
    }
    sql += ' LIMIT 1';

    const params = [normalizedRecordId];
    if (extraSoftDelete?.column) {
      params.push(extraSoftDelete.value ?? 0);
    }

    const [rows] = await connection.execute(sql, params);
    return rows.length === 1;
  }

  static async assertRecordAccess(connection, req, tableName, recordId, options = {}) {
    const normalizedRecordId = Number(recordId);
    if (!Number.isInteger(normalizedRecordId) || normalizedRecordId <= 0) return false;

    const scope = await this.getRequestScope(req);
    if (this.isAllScope(scope)) {
      return this.assertRecordExists(connection, tableName, normalizedRecordId, options);
    }

    const idColumn = options.idColumn || 'id';
    const ownerColumn = options.ownerColumn || null;
    const departmentColumn = options.departmentColumn || null;
    const locationColumns = [
      ...(Array.isArray(options.locationColumns) ? options.locationColumns : []),
      ...(options.locationColumn ? [options.locationColumn] : []),
    ].filter((column, index, values) => column && values.indexOf(column) === index);
    const requireAllLocations = Boolean(options.requireAllLocations);
    const deletedAtColumn =
      options.deletedAtColumn === false
        ? null
        : options.deletedAtColumn || 'deleted_at';
    const extraSoftDelete = options.extraSoftDelete || null;

    if (Number(scope.type) === DATA_SCOPE.SELF && !ownerColumn) {
      return false;
    }

    if (!ownerColumn && locationColumns.length === 0) {
      return false;
    }

    const q = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;
    const selectParts = [`t.${q(idColumn)} AS id`];

    if (ownerColumn) selectParts.push(`t.${q(ownerColumn)} AS owner_id`);
    if (departmentColumn) selectParts.push(`t.${q(departmentColumn)} AS resource_department_id`);
    locationColumns.forEach((column, index) => {
      selectParts.push(`t.${q(column)} AS location_id_${index}`);
    });

    let sql = `SELECT ${selectParts.join(', ')}`;
    if (ownerColumn) {
      sql += ', owner.department_id AS owner_department_id';
    }
    sql += ` FROM ${q(tableName)} t`;
    if (ownerColumn) {
      sql += ` LEFT JOIN users owner ON owner.id = t.${q(ownerColumn)}`;
    }
    sql += ` WHERE t.${q(idColumn)} = ?`;
    if (deletedAtColumn) {
      sql += ` AND t.${q(deletedAtColumn)} IS NULL`;
    }
    if (extraSoftDelete?.column) {
      sql += ` AND t.${q(extraSoftDelete.column)} = ?`;
    }
    sql += ' LIMIT 1';

    const params = [normalizedRecordId];
    if (extraSoftDelete?.column) {
      params.push(extraSoftDelete.value ?? 0);
    }

    const [rows] = await connection.execute(sql, params);
    const row = rows[0];
    if (!row) return false;

    if (Number(scope.type) === DATA_SCOPE.SELF) {
      return Number(row.owner_id) === Number(scope.userId);
    }

    // CUSTOM：默认部门或库位任一命中；对于调拨等双端资源，可声明
    // requireAllLocations，要求所有相关库位都在授权集合内。
    if (Number(scope.type) === DATA_SCOPE.CUSTOM) {
      let organizationMatched = false;
      let hasOrganizationConstraint = false;
      if (
        departmentColumn &&
        scope.departmentIds.length > 0 &&
        scope.departmentIds.includes(Number(row.resource_department_id))
      ) {
        organizationMatched = true;
      }
      if (departmentColumn && scope.departmentIds.length > 0) hasOrganizationConstraint = true;
      if (
        ownerColumn &&
        scope.departmentIds.length > 0 &&
        scope.departmentIds.includes(Number(row.owner_department_id))
      ) {
        organizationMatched = true;
      }
      if (ownerColumn && scope.departmentIds.length > 0) hasOrganizationConstraint = true;

      const locationMatched =
        locationColumns.length > 0 &&
        scope.locationIds.length > 0 &&
        (requireAllLocations
          ? locationColumns.every((_, index) =>
              scope.locationIds.includes(Number(row[`location_id_${index}`]))
            )
          : locationColumns.some((_, index) =>
              scope.locationIds.includes(Number(row[`location_id_${index}`]))
            ));

      if (requireAllLocations) {
        return locationMatched && (!hasOrganizationConstraint || organizationMatched);
      }
      return organizationMatched || locationMatched;
    }

    if (departmentColumn && scope.departmentIds.length > 0) {
      if (scope.departmentIds.includes(Number(row.resource_department_id))) {
        return true;
      }
    }

    if (ownerColumn && scope.departmentIds.length > 0) {
      if (scope.departmentIds.includes(Number(row.owner_department_id))) {
        return true;
      }
    }

    if (locationColumns.length > 0 && scope.locationIds.length > 0) {
      const matches = requireAllLocations
        ? locationColumns.every((_, index) =>
            scope.locationIds.includes(Number(row[`location_id_${index}`]))
          )
        : locationColumns.some((_, index) =>
            scope.locationIds.includes(Number(row[`location_id_${index}`]))
          );
      if (matches) {
        return true;
      }
    }

    return false;
  }
}

DataScopeService.DATA_SCOPE = DATA_SCOPE;

module.exports = DataScopeService;
