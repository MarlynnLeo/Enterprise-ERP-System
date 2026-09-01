/**
 * DataScopeService — 行级数据范围 SSOT
 *
 * DATA_SCOPE:
 *   1 ALL | 2 DEPT_AND_CHILDREN | 3 DEPT | 4 SELF | 5 CUSTOM
 *
 * ⚠️ 当前状态：行级隔离处于「休眠」，本服务实际不产生任何过滤条件。
 *
 *   migrations/20260820000003_disable_row_level_data_scopes.js 把所有角色的
 *   roles.data_scope 固定为 ALL，并清空 role_data_departments / role_data_locations；
 *   models/system.js::assertRoleIsValid 忽略入参、恒写 data_scope = 1；
 *   RoleAccessService.forceAllDataScope 在每次 applyRole 时再刷一遍。
 *   因此 isAllScope() 恒为真，buildOwnerScopeClause 恒返回空 where，
 *   assertRecordAccess 退化为 assertRecordExists（只判存在与软删）。
 *
 *   产品决策是「业务数据授权只保留功能/动作权限」，所以这是预期行为，
 *   不是缺陷。代码保留是为了随时可重新启用，而不是当前的安全保障：
 *   排查越权问题时不要把本服务当成生效中的隔离层，
 *   ScopeGuard 的 sharedRead / financeShared 区分同样因此不产生差异。
 *
 *   若要重新启用行级隔离，至少需要：
 *     1. 去掉 assertRoleIsValid 里 data_scope 的硬编码，让角色管理能存值；
 *     2. 停用 RoleAccessService.forceAllDataScope 的无条件刷写；
 *     3. 重新灌入 role_data_departments / role_data_locations；
 *     4. 复核 resourcePolicies 里各资源的 sharedRead 是否仍符合预期。
 *
 * 安全约定（启用后同样适用，且现在也已满足）：
 * - 未解析到 scope 时不得按 ALL 放行
 * - 列表与单记录使用同一套 owner/location 规则
 * - operator 等字符串字段不参与授权
 * - 首屏并发用短 TTL 缓存 + in-flight 合并，避免重复查库
 */

const { pool } = require('../config/db');
const { logger } = require('../utils/logger');

const DATA_SCOPE = {
  ALL: 1,
  DEPARTMENT_AND_CHILDREN: 2,
  DEPARTMENT: 3,
  SELF: 4,
  CUSTOM: 5,
};

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

    if (roles.some((role) => Number(role.is_super_admin || 0) === 1)) {
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
   *  - locationColumn/locationColumns + includeLocation：CUSTOM 时叠加库位过滤
   *  - requireAllLocations：多库位字段必须全部命中授权范围
   */
  static buildOwnerScopeClause(scope, options = {}) {
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
    ].filter((column, index, list) => column && list.indexOf(column) === index);
    const includeLocation = Boolean(options.includeLocation && locationColumns.length);
    const requireAllLocations = Boolean(options.requireAllLocations);
    const q = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;
    const ownerExpr = `${tableAlias}.${q(ownerColumn)}`;

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

      if (includeLocation && scope.locationIds.length > 0) {
        const locationParts = locationColumns.map(
          (column) =>
            `${tableAlias}.${q(column)} IN (${scope.locationIds.map(() => '?').join(',')})`
        );
        parts.push(`(${locationParts.join(requireAllLocations ? ' AND ' : ' OR ')})`);
        for (let i = 0; i < locationColumns.length; i += 1) {
          params.push(...scope.locationIds);
        }
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
    const scope = await this.getRequestScope(req);
    if (this.isAllScope(scope)) {
      return this.assertRecordExists(connection, tableName, recordId, options);
    }

    const normalizedRecordId = Number(recordId);
    if (!Number.isInteger(normalizedRecordId) || normalizedRecordId <= 0) return false;

    const idColumn = options.idColumn || 'id';
    const ownerColumn = options.ownerColumn || null;
    const departmentColumn = options.departmentColumn || null;
    const locationColumns = [
      ...(Array.isArray(options.locationColumns) ? options.locationColumns : []),
      ...(options.locationColumn ? [options.locationColumn] : []),
    ].filter((column, index, list) => column && list.indexOf(column) === index);
    const requireAllLocations = Boolean(options.requireAllLocations);
    const deletedAtColumn =
      options.deletedAtColumn === false
        ? null
        : options.deletedAtColumn || 'deleted_at';
    const extraSoftDelete = options.extraSoftDelete || null;

    if (Number(scope.type) === DATA_SCOPE.SELF) {
      if (!ownerColumn || !scope.userId) return false;
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

    if (Number(scope.type) === DATA_SCOPE.CUSTOM) {
      if (
        departmentColumn &&
        scope.departmentIds.length > 0 &&
        scope.departmentIds.includes(Number(row.resource_department_id))
      ) {
        return true;
      }
      if (
        ownerColumn &&
        scope.departmentIds.length > 0 &&
        scope.departmentIds.includes(Number(row.owner_department_id))
      ) {
        return true;
      }
      if (locationColumns.length > 0 && scope.locationIds.length > 0) {
        const matches = locationColumns.map((_, index) =>
          scope.locationIds.includes(Number(row[`location_id_${index}`]))
        );
        if (requireAllLocations ? matches.every(Boolean) : matches.some(Boolean)) return true;
      }
      return false;
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
      const matches = locationColumns.map((_, index) =>
        scope.locationIds.includes(Number(row[`location_id_${index}`]))
      );
      if (requireAllLocations ? matches.every(Boolean) : matches.some(Boolean)) return true;
    }

    return false;
  }
}

DataScopeService.DATA_SCOPE = DATA_SCOPE;

module.exports = DataScopeService;
