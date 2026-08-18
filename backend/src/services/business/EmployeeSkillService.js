/**
 * EmployeeSkillService.js
 * @description 员工技能矩阵服务 — CRUD + 矩阵查询 + 到期提醒
 */

const { pool } = require('../../config/db');
const DataScopeService = require('../DataScopeService');

async function buildEmployeeScopeClause(req, alias = 'u') {
  if (!req) return { sql: '', params: [] };
  const scope = await DataScopeService.getRequestScope(req);
  if (DataScopeService.isAllScope(scope)) return { sql: '', params: [] };
  if (Number(scope.type) === DataScopeService.DATA_SCOPE.SELF) {
    return scope.userId
      ? { sql: ` AND ${alias}.id = ?`, params: [scope.userId] }
      : { sql: ' AND 1 = 0', params: [] };
  }
  const departmentIds = (scope.departmentIds || []).map(Number).filter(Number.isInteger);
  if (!departmentIds.length) return { sql: ' AND 1 = 0', params: [] };
  return {
    sql: ` AND ${alias}.department_id IN (${departmentIds.map(() => '?').join(',')})`,
    params: departmentIds,
  };
}

async function assertEmployeeAccess(req, employeeId) {
  const [[employee]] = await pool.query('SELECT id, department_id FROM users WHERE id = ? AND status = 1', [employeeId]);
  if (!employee) return false;
  const scope = await DataScopeService.getRequestScope(req);
  if (DataScopeService.isAllScope(scope)) return true;
  if (Number(scope.type) === DataScopeService.DATA_SCOPE.SELF) return Number(employee.id) === Number(scope.userId);
  return (scope.departmentIds || []).map(Number).includes(Number(employee.department_id));
}

class EmployeeSkillService {
  /** 列表查询（支持筛选） */
  static async getList(params = {}, req = null) {
    const page = parseInt(params.page, 10) || 1;
    const pageSize = parseInt(params.pageSize, 10) || 20;
    const { userId, skillCategory, level, keyword } = params;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE es.deleted_at IS NULL';
    const values = [];
    const scopeClause = await buildEmployeeScopeClause(req, 'u');
    where += scopeClause.sql;
    values.push(...scopeClause.params);

    if (userId) {
      where += ' AND es.user_id = ?';
      values.push(userId);
    }
    if (skillCategory) {
      where += ' AND es.skill_category = ?';
      values.push(skillCategory);
    }
    if (level) {
      where += ' AND es.level = ?';
      values.push(level);
    }
    if (keyword) {
      where += ' AND (es.skill_name LIKE ? OR u.real_name LIKE ?)';
      values.push(`%${keyword}%`, `%${keyword}%`);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM employee_skills es LEFT JOIN users u ON es.user_id = u.id ${where}`,
      values
    );

    const [list] = await pool.query(
      `SELECT es.id, es.user_id, es.skill_name, es.skill_category, es.level,
              es.certified_date, es.expiry_date, es.certificate_no,
              es.certified_by, es.remark, es.created_at,
              u.real_name AS employee_name, u.username,
              u2.real_name AS certifier_name,
              d.name AS department_name
       FROM employee_skills es
       LEFT JOIN users u ON es.user_id = u.id
       LEFT JOIN users u2 ON es.certified_by = u2.id
       LEFT JOIN departments d ON u.department_id = d.id
       ${where}
       ORDER BY es.user_id, es.skill_category, es.skill_name
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return { list, total, page, pageSize };
  }

  /** 详情 */
  static async getById(id, req = null) {
    const scopeClause = await buildEmployeeScopeClause(req, 'u');
    const [rows] = await pool.query(
      `SELECT es.*, u.real_name AS employee_name
       FROM employee_skills es
       LEFT JOIN users u ON es.user_id = u.id
       WHERE es.id = ? AND es.deleted_at IS NULL${scopeClause.sql}`,
      [id, ...scopeClause.params]
    );
    return rows[0] || null;
  }

  /** 创建技能记录 */
  static async create(data, req = null) {
    if (req && !(await assertEmployeeAccess(req, data.user_id))) {
      const error = new Error('无权为该员工维护技能记录');
      error.statusCode = 403;
      throw error;
    }
    const [result] = await pool.query(
      `INSERT INTO employee_skills (user_id, skill_name, skill_category, level, certified_date, expiry_date, certificate_no, certified_by, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.user_id,
        data.skill_name,
        data.skill_category,
        data.level || 'beginner',
        data.certified_date || null,
        data.expiry_date || null,
        data.certificate_no || null,
        data.certified_by || null,
        data.remark || null,
      ]
    );
    return this.getById(result.insertId, req);
  }

  /** 更新技能记录 */
  static async update(id, data, req = null) {
    if (req) {
      const [[row]] = await pool.query('SELECT user_id FROM employee_skills WHERE id = ? AND deleted_at IS NULL', [id]);
      if (!row || !(await assertEmployeeAccess(req, row.user_id))) {
        const error = new Error('无权修改该技能记录');
        error.statusCode = 403;
        throw error;
      }
    }
    const fields = [];
    const values = [];
    const updatable = [
      'skill_name',
      'skill_category',
      'level',
      'certified_date',
      'expiry_date',
      'certificate_no',
      'certified_by',
      'remark',
    ];

    for (const key of updatable) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    if (fields.length === 0) return this.getById(id, req);

    fields.push('updated_at = NOW()');
    values.push(id);

    await pool.query(
      `UPDATE employee_skills SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
      values
    );
    return this.getById(id, req);
  }

  /** 软删除 */
  static async delete(id, req = null) {
    if (req) {
      const [[row]] = await pool.query('SELECT user_id FROM employee_skills WHERE id = ? AND deleted_at IS NULL', [id]);
      if (!row || !(await assertEmployeeAccess(req, row.user_id))) {
        const error = new Error('无权删除该技能记录');
        error.statusCode = 403;
        throw error;
      }
    }
    await pool.query('UPDATE employee_skills SET deleted_at = NOW() WHERE id = ?', [id]);
  }

  /**
   * 获取技能矩阵（员工 × 技能 交叉表）
   * @param {Object} params - { departmentId, skillCategory }
   */
  static async getMatrix(params = {}, req = null) {
    const { departmentId, skillCategory } = params;
    let where = 'WHERE es.deleted_at IS NULL';
    const values = [];
    const scopeClause = await buildEmployeeScopeClause(req, 'u');
    where += scopeClause.sql;
    values.push(...scopeClause.params);

    if (departmentId) {
      where += ' AND u.department_id = ?';
      values.push(departmentId);
    }
    if (skillCategory) {
      where += ' AND es.skill_category = ?';
      values.push(skillCategory);
    }

    const [rows] = await pool.query(
      `SELECT es.user_id, u.real_name AS employee_name, d.name AS department_name,
              es.skill_name, es.skill_category, es.level, es.expiry_date
       FROM employee_skills es
       LEFT JOIN users u ON es.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       ${where}
       ORDER BY u.real_name, es.skill_category`,
      values
    );

    // 按员工分组
    const matrix = {};
    const allSkills = new Set();
    for (const row of rows) {
      if (!matrix[row.user_id]) {
        matrix[row.user_id] = {
          user_id: row.user_id,
          employee_name: row.employee_name,
          department_name: row.department_name,
          skills: {},
        };
      }
      matrix[row.user_id].skills[row.skill_name] = {
        level: row.level,
        expiry_date: row.expiry_date,
        expired: row.expiry_date && new Date(row.expiry_date) < new Date(),
      };
      allSkills.add(row.skill_name);
    }

    return {
      employees: Object.values(matrix),
      skills: Array.from(allSkills).sort(),
    };
  }

  /** 获取技能类别列表 */
  static async getCategories() {
    const [rows] = await pool.query(
      'SELECT DISTINCT skill_category FROM employee_skills WHERE deleted_at IS NULL ORDER BY skill_category'
    );
    return rows.map((r) => r.skill_category);
  }

  /** 获取即将到期的技能证书（30天内） */
  static async getExpiringSkills(days = 30, req = null) {
    const scopeClause = await buildEmployeeScopeClause(req, 'u');
    const [rows] = await pool.query(
      `SELECT es.*, u.real_name AS employee_name
       FROM employee_skills es
       LEFT JOIN users u ON es.user_id = u.id
       WHERE es.deleted_at IS NULL${scopeClause.sql}
         AND es.expiry_date IS NOT NULL
         AND es.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
       ORDER BY es.expiry_date`,
      [...scopeClause.params, days]
    );
    return rows;
  }
}

module.exports = EmployeeSkillService;
