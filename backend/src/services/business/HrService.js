/**
 * HrService.js
 * @description HR 模块数据库操作服务（员工/考勤/请假/加班/薪资）
 * @date 2026-06-11
 */

const { pool } = require('../../config/db');
const { parsePagination, appendPaginationSQL } = require('../../utils/safePagination');
const DataScopeService = require('../../services/DataScopeService');

function buildHrScopeClause(req, employeeAlias = 'e') {
  const scope = req?.authzScope;
  if (!scope || DataScopeService.isAllScope(scope)) return { sql: '', params: [] };

  if (Number(scope.type) === DataScopeService.DATA_SCOPE.SELF) {
    return scope.userId
      ? { sql: ` AND ${employeeAlias}.user_id = ?`, params: [scope.userId] }
      : { sql: ' AND 1 = 0', params: [] };
  }

  const departmentIds = (scope.departmentIds || []).map(Number).filter(Number.isInteger);
  if (departmentIds.length === 0) return { sql: ' AND 1 = 0', params: [] };
  return {
    sql: ` AND ${employeeAlias}.department_id IN (${departmentIds.map(() => '?').join(',')})`,
    params: departmentIds,
  };
}

function scopeAllowsEmployee(req, employee) {
  const scope = req?.authzScope;
  if (!scope || DataScopeService.isAllScope(scope)) return true;
  if (Number(scope.type) === DataScopeService.DATA_SCOPE.SELF) {
    return Number(employee?.user_id) === Number(scope.userId);
  }
  return (scope.departmentIds || []).map(Number).includes(Number(employee?.department_id));
}

// ========== W-03: 工作流表名白名单映射 ==========
const HR_WORKFLOW_TABLES = new Map([
  ['hr_leave_requests', 'hr_leave_requests'],
  ['hr_overtime_requests', 'hr_overtime_requests'],
]);

/** 员工列表显式列名（排除敏感字段） */
const EMPLOYEE_COLUMNS = `e.id, e.employee_no, e.name, e.id_card, e.department_id,
  e.user_id, e.join_date, e.leave_date, e.employment_status,
  e.base_salary, e.split_base_salary, e.insurance_type,
  e.position_allowance, e.housing_allowance, e.meal_allowance, e.overtime_rate,
  e.created_at, e.updated_at`;

/** 考勤列表显式列名 */
const ATTENDANCE_COLUMNS = `a.id, a.employee_id, a.period, a.days_in_month,
  a.full_work_days, a.actual_work_days, a.absent_from_position,
  a.personal_leave_days, a.sick_leave_days, a.total_leave_days,
  a.public_holiday_days, a.late_count, a.missing_punch_count, a.total_violation_count,
  a.serious_late_overtime, a.normal_overtime, a.saturday_overtime, a.weekend_overtime,
  a.leave_days, a.vacation_days, a.overtime_hours, a.full_attendance,
  a.remark, a.status, a.created_at, a.updated_at`;

/** 薪资记录显式列名 */
const SALARY_COLUMNS = `s.id, s.employee_id, s.period, s.base_salary, s.daily_wage,
  s.overtime_pay, s.position_allowance, s.housing_allowance, s.meal_allowance,
  s.full_attendance_bonus, s.leave_deduction, s.gross_salary,
  s.pension, s.housing_fund, s.net_salary, s.status,
  s.split_details, s.created_at, s.updated_at`;

/** 请假/加班申请的公共显式列名 */
const REQUEST_COMMON_COLUMNS = (alias) => `${alias}.id, ${alias}.request_no,
  ${alias}.applicant_user_id, ${alias}.employee_id, ${alias}.status,
  ${alias}.workflow_instance_id, ${alias}.workflow_status, ${alias}.workflow_error,
  ${alias}.created_by, ${alias}.updated_by, ${alias}.created_at, ${alias}.updated_at`;

const LEAVE_SPECIFIC_COLUMNS = (alias) => `${alias}.leave_type, ${alias}.start_date,
  ${alias}.end_date, ${alias}.duration, ${alias}.reason`;

const OVERTIME_SPECIFIC_COLUMNS = (alias) => `${alias}.overtime_date, ${alias}.start_time,
  ${alias}.end_time, ${alias}.hours, ${alias}.overtime_type, ${alias}.reason`;

class HrService {
  static getEmployeeScopeClause(req, employeeAlias = 'e') {
    return buildHrScopeClause(req, employeeAlias);
  }
  static async assertEmployeeAccess(req, employeeId, connection = pool) {
    const [[employee]] = await connection.query(
      'SELECT id, user_id, department_id FROM hr_employees WHERE id = ? LIMIT 1',
      [employeeId]
    );
    return Boolean(employee && scopeAllowsEmployee(req, employee));
  }
  // ========== W-03: 安全获取工作流表名 ==========
  /**
   * 从白名单获取安全的工作流表名
   * @param {string} table - 请求的表名
   * @returns {string} 安全的表名
   * @throws {Error} 表名不在白名单中
   */
  static getWorkflowTable(table) {
    const safeTable = HR_WORKFLOW_TABLES.get(table);
    if (!safeTable) {
      throw new Error(`[HR] 不支持的工作流表名: ${table}`);
    }
    return safeTable;
  }

  /**
   * 更新工作流状态（使用白名单表名）
   * @param {string} table - 表名键
   * @param {number} businessId
   * @param {Object} fields - 要更新的字段
   */
  static async updateWorkflowStatus(table, businessId, fields) {
    const safeTable = this.getWorkflowTable(table);
    const setClauses = [];
    const values = [];

    if (fields.workflow_status !== undefined) {
      setClauses.push('workflow_status = ?');
      values.push(fields.workflow_status);
    }
    if (fields.workflow_error !== undefined) {
      setClauses.push('workflow_error = ?');
      values.push(fields.workflow_error);
    }
    if (fields.workflow_instance_id !== undefined) {
      setClauses.push('workflow_instance_id = ?');
      values.push(fields.workflow_instance_id);
    }

    if (setClauses.length === 0) return;

    values.push(businessId);
    await pool.query(
      `UPDATE ${safeTable} SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );
  }

  // ========== 员工管理 ==========

  /**
   * 查询员工列表（带分页）
   * @param {Object} options - 查询参数
   * @returns {Promise<{rows: Array, total: number, page: number, pageSize: number}>}
   */
  static async getEmployees({ keyword, status, page, pageSize: rawPageSize, req }) {
    const pagination = parsePagination(page, rawPageSize, { defaultPageSize: 20 });
    const conditions = ['1=1'];
    const params = [];
    const scopeClause = buildHrScopeClause(req, 'e');
    if (scopeClause.sql) conditions.push(scopeClause.sql.replace(/^\s*AND\s*/, ''));
    params.push(...scopeClause.params);

    if (keyword) {
      conditions.push('(e.name LIKE ? OR e.employee_no LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (status) {
      conditions.push('e.employment_status = ?');
      params.push(status);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM hr_employees e ${whereClause}`,
      params
    );

    const listSql = appendPaginationSQL(
      `SELECT ${EMPLOYEE_COLUMNS}, d.name AS department_name, u.username AS system_user
       FROM hr_employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN users u ON e.user_id = u.id
       ${whereClause}
       ORDER BY e.id DESC`,
      pagination.limit,
      pagination.offset
    );

    const [rows] = await pool.query(listSql, params);
    return { rows, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  // ========== 考勤管理 ==========

  /**
   * 查询考勤记录（带分页）
   * @param {Object} options - 查询参数
   * @returns {Promise<{rows: Array, total: number, page: number, pageSize: number}>}
   */
  static async getAttendance({ period, page, pageSize: rawPageSize, req }) {
    const pagination = parsePagination(page, rawPageSize, { defaultPageSize: 50 });
    const scopeClause = buildHrScopeClause(req, 'e');
    const params = [period, ...scopeClause.params];

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM hr_attendance a JOIN hr_employees e ON a.employee_id = e.id WHERE a.period = ?${scopeClause.sql}`,
      params
    );

    const listSql = appendPaginationSQL(
      `SELECT ${ATTENDANCE_COLUMNS}, e.name, e.employee_no, d.name AS department_name
       FROM hr_attendance a
       JOIN hr_employees e ON a.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE a.period = ?${scopeClause.sql}
       ORDER BY d.name, e.name`,
      pagination.limit,
      pagination.offset
    );

    const [rows] = await pool.query(listSql, params);
    return { rows, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  // ========== 薪资管理 ==========

  /**
   * 查询薪资记录
   * @param {Object} options - 查询参数
   * @returns {Promise<Array>}
   */
  static async getSalaryRecords({ period, req }) {
    const scopeClause = buildHrScopeClause(req, 'e');
    let sql = `SELECT ${SALARY_COLUMNS}, e.name AS employee_name, e.employee_no
       FROM hr_salary_records s
       JOIN hr_employees e ON s.employee_id = e.id`;
    const params = [...scopeClause.params];
    if (period) {
      sql += ` WHERE s.period = ?${scopeClause.sql}`;
      params.unshift(period);
    } else {
      sql += ` WHERE 1=1${scopeClause.sql}`;
    }
    const [rows] = await pool.query(sql, params);
    return rows;
  }

  // ========== 请假/加班列表查询构建 ==========

  /**
   * 构建请假/加班申请列表查询
   * @param {string} baseTable - 基础表名
   * @param {string} alias - 表别名
   * @param {string} requestType - 请求类型标识
   * @param {Object} query - 查询参数
   * @param {number} userId - 当前用户 ID
   * @returns {Object} 包含 SQL 和参数的查询对象
   */
  static buildRequestListQuery(baseTable, alias, requestType, query, userId, req) {
    const safeTable = this.getWorkflowTable(baseTable);
    const pagination = parsePagination(query.page, query.pageSize ?? query.limit);
    const { status, search, mine } = query;
    const conditions = ['1=1'];
    const params = [];
    const scopeClause = buildHrScopeClause(req, 'e');
    if (scopeClause.sql) conditions.push(scopeClause.sql.replace(/^\s*AND\s*/, ''));
    params.push(...scopeClause.params);

    // 根据类型选择具体列
    const specificCols = requestType === 'leave'
      ? LEAVE_SPECIFIC_COLUMNS(alias)
      : OVERTIME_SPECIFIC_COLUMNS(alias);

    if (status && status !== 'all') {
      conditions.push(`${alias}.status = ?`);
      params.push(status);
    }

    if (mine === 'true' || mine === true) {
      conditions.push(`${alias}.applicant_user_id = ?`);
      params.push(userId || 0);
    }

    if (search) {
      conditions.push(`(
        ${alias}.request_no LIKE ?
        OR e.name LIKE ?
        OR e.employee_no LIKE ?
        OR d.name LIKE ?
        OR u.real_name LIKE ?
        OR u.username LIKE ?
      )`);
      const keyword = `%${search}%`;
      params.push(keyword, keyword, keyword, keyword, keyword, keyword);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const fromClause = `
      FROM ${safeTable} ${alias}
      LEFT JOIN hr_employees e ON e.id = ${alias}.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN users u ON u.id = ${alias}.applicant_user_id
    `;

    const selectCols = `
      ${REQUEST_COMMON_COLUMNS(alias)},
      ${specificCols},
      ? AS request_type,
      e.name AS employee_name,
      e.employee_no,
      d.name AS department_name,
      COALESCE(u.real_name, u.username) AS applicant_name
    `;

    const listSql = appendPaginationSQL(
      `SELECT ${selectCols} ${fromClause} ${whereClause}
       ORDER BY ${alias}.created_at DESC, ${alias}.id DESC`,
      pagination.limit,
      pagination.offset
    );

    return {
      page: pagination.page,
      pageSize: pagination.pageSize,
      params,
      countSql: `SELECT COUNT(*) AS total ${fromClause} ${whereClause}`,
      listSql,
      listParams: [requestType, ...params],
    };
  }
}

module.exports = HrService;
