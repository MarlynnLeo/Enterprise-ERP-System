/**
 * dataPermission.js
 * @description 数据权限中间件 — 行级数据范围控制
 * @date 2026-04-21
 *
 * 数据范围:
 *   1 = 全部数据
 *   2 = 本部门及下级部门数据
 *   3 = 本部门数据
 *   4 = 仅本人数据
 *   5 = 自定义部门数据
 */

const { pool } = require('../config/db');
const { logger } = require('../utils/logger');

// 缓存部门树（5分钟刷新）
let deptTreeCache = null;
let deptTreeCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

/**
 * 获取所有部门（含层级关系）
 */
async function getAllDepartments() {
  const now = Date.now();
  if (deptTreeCache && (now - deptTreeCacheTime) < CACHE_TTL) {
    return deptTreeCache;
  }
  const [rows] = await pool.query('SELECT id, parent_id, name FROM departments WHERE status = 1');
  deptTreeCache = rows;
  deptTreeCacheTime = now;
  return rows;
}

/**
 * 获取某部门及其所有下级部门ID
 */
async function getDeptAndChildren(deptId) {
  const allDepts = await getAllDepartments();
  const result = new Set([deptId]);
  const queue = [deptId];

  while (queue.length > 0) {
    const parentId = queue.shift();
    for (const dept of allDepts) {
      if (dept.parent_id === parentId && !result.has(dept.id)) {
        result.add(dept.id);
        queue.push(dept.id);
      }
    }
  }

  return [...result];
}

/**
 * 获取用户的数据权限范围
 * @returns {{ scope: number, departmentIds: number[] }}
 */
async function getUserDataScope(userId) {
  // 获取用户的角色及数据权限范围（取最宽的）
  const [roles] = await pool.query(
    `SELECT r.id, r.data_scope FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = ? AND r.status = 1
     ORDER BY r.data_scope ASC`,
    [userId]
  );

  if (roles.length === 0) {
    return { scope: 4, departmentIds: [] }; // 无角色默认仅本人
  }

  // 取最宽的权限（数值越小权限越大）
  const widestRole = roles[0];
  const scope = widestRole.data_scope || 1;

  // 获取用户部门
  const [[user]] = await pool.query(
    'SELECT department_id FROM users WHERE id = ?', [userId]
  );
  const userDeptId = user?.department_id;

  let departmentIds = [];

  switch (scope) {
    case 1: // 全部
      break;
    case 2: // 本部门及下级
      if (userDeptId) {
        departmentIds = await getDeptAndChildren(userDeptId);
      }
      break;
    case 3: // 本部门
      if (userDeptId) {
        departmentIds = [userDeptId];
      }
      break;
    case 4: // 仅本人（不按部门过滤，按 created_by 过滤）
      break;
    case 5: // 自定义
      {
        const roleIds = roles.filter(r => r.data_scope === 5).map(r => r.id);
        if (roleIds.length > 0) {
          const [customDepts] = await pool.query(
            'SELECT DISTINCT department_id FROM role_data_departments WHERE role_id IN (?)',
            [roleIds]
          );
          departmentIds = customDepts.map(d => d.department_id);
        }
      }
      break;
  }

  return { scope, departmentIds, userDeptId, userId };
}

/**
 * 构建数据权限 WHERE 条件
 * @param {Object} dataScope - getUserDataScope 返回值
 * @param {string} deptColumn - 部门字段名（默认 department_id）
 * @param {string} creatorColumn - 创建人字段名（默认 created_by）
 * @param {string} tableAlias - 表别名
 * @returns {{ where: string, values: Array }}
 */
function buildDataScopeFilter(dataScope, { deptColumn = 'department_id', creatorColumn = 'created_by', tableAlias = '' } = {}) {
  const prefix = tableAlias ? `${tableAlias}.` : '';

  switch (dataScope.scope) {
    case 1: // 全部
      return { where: '', values: [] };
    case 2: // 本部门及下级
    case 3: // 本部门
    case 5: // 自定义
      if (dataScope.departmentIds.length > 0) {
        return {
          where: ` AND ${prefix}${deptColumn} IN (?)`,
          values: [dataScope.departmentIds]
        };
      }
      // 部门为空则降级为仅本人
      return {
        where: ` AND ${prefix}${creatorColumn} = ?`,
        values: [dataScope.userId]
      };
    case 4: // 仅本人
      return {
        where: ` AND ${prefix}${creatorColumn} = ?`,
        values: [dataScope.userId]
      };
    default:
      return { where: '', values: [] };
  }
}

/**
 * Express 中间件 — 将数据权限信息注入 req.dataScope
 */
function dataPermissionMiddleware(req, res, next) {
  const userId = req.user?.userId || req.user?.id;
  if (!userId) return next();

  getUserDataScope(userId)
    .then(scope => {
      req.dataScope = scope;
      next();
    })
    .catch(err => {
      logger.error('获取数据权限失败:', err);
      req.dataScope = { scope: 4, departmentIds: [], userId }; // 降级到仅本人
      next();
    });
}

module.exports = {
  getUserDataScope,
  buildDataScopeFilter,
  getDeptAndChildren,
  dataPermissionMiddleware
};
