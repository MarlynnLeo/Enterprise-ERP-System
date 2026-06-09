const { pool } = require('../config/db');
const { logger } = require('../utils/logger');

const DATA_SCOPE = {
  ALL: 1,
  DEPARTMENT_AND_CHILDREN: 2,
  DEPARTMENT: 3,
  SELF: 4,
  CUSTOM: 5,
};

class DataScopeService {
  static async getUserDataScope(userId) {
    if (!userId) {
      return { type: DATA_SCOPE.SELF, userId: null, departmentId: null, departmentIds: [], locationIds: [] };
    }

    const [users] = await pool.execute(
      'SELECT id, username, department_id FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const user = users[0] || { id: userId, department_id: null };

    const [roles] = await pool.execute(
      `SELECT r.id, r.code, COALESCE(r.data_scope, ?) AS data_scope
         FROM roles r
         JOIN user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = ? AND r.status = 1`,
      [DATA_SCOPE.SELF, userId]
    );

    if (roles.some((role) => role.code === 'admin')) {
      return { type: DATA_SCOPE.ALL, userId, departmentId: user.department_id, departmentIds: [], locationIds: [] };
    }

    const roleScopes = roles.map((role) => Number(role.data_scope || DATA_SCOPE.SELF));
    const type = roleScopes.length ? Math.min(...roleScopes) : DATA_SCOPE.SELF;
    if (type === DATA_SCOPE.ALL) {
      return { type, userId, departmentId: user.department_id, departmentIds: [], locationIds: [] };
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

  static isAllScope(scope) {
    return !scope || Number(scope.type) === DATA_SCOPE.ALL;
  }

  static getUserId(req) {
    return req?.user?.id || req?.user?.userId || null;
  }

  static async attachRequestScope(req) {
    const userId = this.getUserId(req);
    if (!userId) return null;
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

  static buildOwnerScopeClause(scope, options = {}) {
    if (this.isAllScope(scope)) {
      return { join: '', where: '', params: [] };
    }

    const tableAlias = options.tableAlias || 't';
    const ownerColumn = options.ownerColumn || 'created_by';
    const ownerAlias = options.ownerAlias || `${tableAlias}_owner_scope`;
    const q = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;
    const ownerExpr = `${tableAlias}.${q(ownerColumn)}`;

    if (Number(scope.type) === DATA_SCOPE.SELF) {
      return {
        join: '',
        where: ` AND ${ownerExpr} = ?`,
        params: [scope.userId],
      };
    }

    if (scope.departmentIds.length > 0) {
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
      return scope.locationIds.includes(Number(locationId));
    }

    return true;
  }

  static async assertRecordAccess(connection, req, tableName, recordId, options = {}) {
    const scope = await this.getRequestScope(req);
    if (this.isAllScope(scope)) return true;

    const idColumn = options.idColumn || 'id';
    const ownerColumn = options.ownerColumn || null;
    const locationColumn = options.locationColumn || null;
    const deletedAtColumn = options.deletedAtColumn === false ? null : (options.deletedAtColumn || 'deleted_at');
    const q = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;
    const selectParts = [`t.${q(idColumn)} AS id`];

    if (ownerColumn) selectParts.push(`t.${q(ownerColumn)} AS owner_id`);
    if (locationColumn) selectParts.push(`t.${q(locationColumn)} AS location_id`);

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
    sql += ' LIMIT 1';

    const [rows] = await connection.execute(sql, [recordId]);
    const row = rows[0];
    if (!row) return false;

    if (Number(scope.type) === DATA_SCOPE.SELF) {
      return ownerColumn ? Number(row.owner_id) === Number(scope.userId) : true;
    }

    if (ownerColumn && scope.departmentIds.length > 0) {
      if (scope.departmentIds.includes(Number(row.owner_department_id))) {
        return true;
      }
    }

    if (locationColumn && scope.locationIds.length > 0) {
      if (scope.locationIds.includes(Number(row.location_id))) {
        return true;
      }
    }

    return !(ownerColumn || locationColumn);
  }
}

DataScopeService.DATA_SCOPE = DATA_SCOPE;

module.exports = DataScopeService;
