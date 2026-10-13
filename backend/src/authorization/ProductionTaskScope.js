/**
 * Production workshop visibility is independent of role data_scope (currently ALL).
 * The department is loaded from the authenticated user's current database record.
 * Requests from production subdepartments are limited to that exact department;
 * production management, other departments and super administrators keep their scope.
 */
const { pool } = require('../config/db');
const { getAuthenticatedUserId } = require('../utils/authContext');
const { isSuperAdminRole } = require('./superAdmin');

const requestScopes = new WeakMap();
const unrestricted = () => ({ restricted: false, departmentId: null });
const denied = () => ({ restricted: true, departmentId: null });

async function loadScope(req, connection) {
  const userId = getAuthenticatedUserId(req);
  const [users] = await connection.query(
    `SELECT u.id, u.department_id,
            EXISTS (SELECT 1 FROM user_roles ur
                    JOIN roles r ON r.id = ur.role_id
                    WHERE ur.user_id = u.id AND r.status = 1
                      AND r.is_super_admin = 1) AS is_super_admin
       FROM users u WHERE u.id = ? AND u.status = 1 LIMIT 1`,
    [userId]
  );
  const user = users[0];
  if (!user) return denied();
  if (isSuperAdminRole(user) || !user.department_id) return unrestricted();

  const [departments] = await connection.query('SELECT id, name, code, parent_id FROM departments');
  const byId = new Map(departments.map((department) => [Number(department.id), department]));
  const departmentId = Number(user.department_id);
  let department = byId.get(departmentId);
  const visited = new Set();
  while (department) {
    const id = Number(department.id);
    if (visited.has(id)) return denied();
    visited.add(id);
    if (department.code === '10005' || department.name === '生产部') {
      return id === departmentId ? unrestricted() : { restricted: true, departmentId };
    }
    if (!department.parent_id) return unrestricted();
    department = byId.get(Number(department.parent_id));
  }
  return denied();
}

async function getRequestScope(req, connection = pool) {
  if (!requestScopes.has(req)) {
    requestScopes.set(req, loadScope(req, connection));
  }
  return requestScopes.get(req);
}

async function buildRequestClause(req, { tableAlias = 'pt' } = {}, connection = pool) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableAlias)) {
    throw new Error('Invalid production task table alias');
  }
  const scope = await getRequestScope(req, connection);
  if (!scope.restricted) return { join: '', where: '', params: [] };
  if (!scope.departmentId) return { join: '', where: ' AND 1 = 0', params: [] };

  // manager is the existing task assignment field. A recognized current group
  // overrides the original plan/product group after reassignment. Older tasks
  // with a personal manager or 未分配 fall back to the plan, then the product.
  // Ambiguous department names resolve to 0, never to multiple workshops.
  return {
    join: '',
    where: ` AND COALESCE(
      (SELECT CASE WHEN COUNT(*) = 1 THEN MIN(task_scope_department.id)
                   WHEN COUNT(*) > 1 THEN 0 ELSE NULL END
         FROM departments task_scope_department
        WHERE task_scope_department.name = TRIM(${tableAlias}.manager)),
      (SELECT task_scope_plan.department_id FROM production_plans task_scope_plan
        WHERE task_scope_plan.id = ${tableAlias}.plan_id AND task_scope_plan.deleted_at IS NULL),
      (SELECT task_scope_product.production_group_id FROM materials task_scope_product
        WHERE task_scope_product.id = ${tableAlias}.product_id),
      0) = ?`,
    params: [scope.departmentId],
  };
}

async function assertAccess(connection, req, recordId) {
  const clause = await buildRequestClause(req, { tableAlias: 'pt' }, connection);
  if (!clause.where) return true;
  const id = Number(recordId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const [rows] = await connection.query(
    `SELECT pt.id FROM production_tasks pt
      WHERE pt.id = ? AND pt.deleted_at IS NULL${clause.where} LIMIT 1`,
    [id, ...clause.params]
  );
  return rows.length > 0;
}

module.exports = { buildRequestClause, assertAccess };
