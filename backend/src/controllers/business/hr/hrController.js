const { logger } = require('../../../utils/logger');
const { ResponseHandler } = require('../../../utils/responseHandler');
const db = require('../../../config/db');
const pool = db.pool;
const ExcelJS = require('exceljs');
const SalaryService = require('../../../services/business/hr/salaryService');
const DingtalkSyncService = require('../../../services/business/hr/dingtalkSyncService');

const normalizeExcelCellValue = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value.richText)) {
    return value.richText.map(part => part.text || '').join('');
  }
  if (Object.prototype.hasOwnProperty.call(value, 'result')) {
    return normalizeExcelCellValue(value.result);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'text')) {
    return value.text || '';
  }
  if (Object.prototype.hasOwnProperty.call(value, 'hyperlink')) {
    return value.text || value.hyperlink || '';
  }

  return String(value);
};

const worksheetToRows = (worksheet) => {
  const rows = [];
  const columnCount = worksheet.columnCount;

  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values = [];
    for (let col = 1; col <= columnCount; col++) {
      values.push(normalizeExcelCellValue(row.getCell(col).value));
    }
    rows.push(values);
  });

  return rows;
};

// ---------- 员工管理 ---------- //

const getEmployees = async (req, res) => {
  try {
    const { keyword, status } = req.query;

    let query = `
      SELECT e.*, d.name as department_name, u.username as system_user
      FROM hr_employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (keyword) {
      query += ` AND (e.name LIKE ? OR e.employee_no LIKE ?)`;
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    if (status) {
      query += ` AND e.employment_status = ?`;
      params.push(status);
    }

    query += ` ORDER BY e.id DESC`;

    const [rows] = await pool.query(query, params);
    return ResponseHandler.success(res, rows);
  } catch (error) {
    logger.error('获取员工列表失败:', error);
    return ResponseHandler.error(res, '获取员工列表失败', 'OPERATION_ERROR', 500, error);
  }
};

const createEmployee = async (req, res) => {
  try {
    const data = req.body;
    const insertData = {
      employee_no: data.employee_no,
      name: data.name,
      id_card: data.id_card,
      department_id: data.department_id || null,
      user_id: data.user_id || null,
      join_date: data.join_date || null,
      base_salary: data.base_salary || 0,
      split_base_salary: data.split_base_salary || 0,
      insurance_type: data.insurance_type || '有社有公'
    };

    const [result] = await pool.query('INSERT INTO hr_employees SET ?', insertData);
    return ResponseHandler.success(res, { id: result.insertId }, '添加员工成功');
  } catch (error) {
    logger.error('添加员工失败:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return ResponseHandler.error(res, '员工工号已存在', 'BAD_REQUEST', 400);
    }
    return ResponseHandler.error(res, '添加员工失败', 'OPERATION_ERROR', 500, error);
  }
};

const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const allowedFields = [
      'name', 'department_id', 'id_card', 'user_id', 'join_date', 'leave_date',
      'employment_status', 'base_salary', 'split_base_salary', 'insurance_type',
      'position_allowance', 'housing_allowance', 'meal_allowance', 'overtime_rate'
    ];
    const updateData = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) updateData[field] = data[field];
    }

    await pool.query('UPDATE hr_employees SET ? WHERE id = ?', [updateData, id]);
    return ResponseHandler.success(res, null, '更新员工信息成功');
  } catch (error) {
    logger.error('更新员工信息失败:', error);
    return ResponseHandler.error(res, '更新员工信息失败', 'OPERATION_ERROR', 500, error);
  }
};

// 归档员工（软删除：设置离职状态，不真正删除数据）
const archiveEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE hr_employees SET employment_status = 'left' WHERE id = ?", [id]);
    return ResponseHandler.success(res, null, '员工已设置为离职状态');
  } catch (error) {
    logger.error('归档员工失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};
// 保留旧名称作为兼容别名
const deleteEmployee = archiveEmployee;

const syncDingtalk = async (req, res) => {
  try {
    const result = await DingtalkSyncService.syncAllUsersToDb();
    return ResponseHandler.success(res, result, `钉钉同步成功：全公司共计 ${result.total} 人，新增 ${result.newCount} 人，更新 ${result.upCount} 人`);
  } catch (error) {
    logger.error('钉钉同步花名册失败:', error);
    return ResponseHandler.error(res, '钉钉同步失败: ' + error.message, 'OPERATION_ERROR', 500, error);
  }
};

// ---------- 考勤管理 ---------- //

const syncAttendance = async (req, res) => {
  try {
    const { period } = req.body;
    if (!period) return ResponseHandler.error(res, '请提供考勤周期(period)，格式 YYYY-MM', 'BAD_REQUEST', 400);
    const result = await DingtalkSyncService.syncAttendanceToDb(period);
    return ResponseHandler.success(res, result, `${period} 月考勤同步完成，共获取 ${result.totalRecords} 条打卡记录，处理 ${result.savedCount} 人`);
  } catch (error) {
    logger.error('钉钉考勤同步失败:', error);
    return ResponseHandler.error(res, '钉钉考勤同步失败: ' + error.message, 'OPERATION_ERROR', 500, error);
  }
};

const getAttendance = async (req, res) => {
  try {
    const { period } = req.query;
    if (!period) return ResponseHandler.error(res, '请提供考勤周期(period)', 'BAD_REQUEST', 400);

    const [rows] = await pool.query(`
      SELECT a.*, e.name, e.employee_no, d.name as department_name
      FROM hr_attendance a
      JOIN hr_employees e ON a.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE a.period = ?
      ORDER BY d.name, e.name
    `, [period]);
    return ResponseHandler.success(res, rows);
  } catch (error) {
    return ResponseHandler.error(res, '获取考勤失败', 'OPERATION_ERROR', 500, error);
  }
};

const batchSaveAttendance = async (req, res) => {
  try {
    const { period, records } = req.body;
    if (!period || !records || records.length === 0) {
      return ResponseHandler.error(res, '参数错误', 'BAD_REQUEST', 400);
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const record of records) {
        await connection.query(`
          INSERT INTO hr_attendance (employee_id, period, days_in_month, leave_days, vacation_days, overtime_hours, full_attendance, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
          ON DUPLICATE KEY UPDATE 
            days_in_month = VALUES(days_in_month),
            leave_days = VALUES(leave_days),
            vacation_days = VALUES(vacation_days),
            overtime_hours = VALUES(overtime_hours),
            full_attendance = VALUES(full_attendance),
            status = 'confirmed'
        `, [
          record.employee_id, period, record.days_in_month || 21.75,
          record.leave_days || 0, record.vacation_days || 0,
          record.overtime_hours || 0, record.full_attendance || false
        ]);
      }
      await connection.commit();
      return ResponseHandler.success(res, null, '考勤保存成功');
    } catch (txError) {
      await connection.rollback();
      throw txError;
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('保存考勤失败:', error);
    return ResponseHandler.error(res, '保存考勤失败', 'OPERATION_ERROR', 500, error);
  }
};

// Excel 导入考勤
const importAttendanceExcel = async (req, res) => {
  try {
    if (!req.file) return ResponseHandler.error(res, '请上传 Excel 文件', 'BAD_REQUEST', 400);
    const { period } = req.body;
    if (!period) return ResponseHandler.error(res, '请提供考勤周期(period)', 'BAD_REQUEST', 400);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return ResponseHandler.error(res, 'Excel 中未找到工作表', 'BAD_REQUEST', 400);

    // 先用 header:1 (数组模式) 找到真正的表头行
    const allRows = worksheetToRows(worksheet);
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(20, allRows.length); i++) {
      const row = allRows[i];
      if (row && row.some(cell => String(cell).includes('姓名'))) {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx < 0) return ResponseHandler.error(res, 'Excel 中未找到包含"姓名"的表头行', 'BAD_REQUEST', 400);

    // 从表头行重新解析为对象数组
    const headers = allRows[headerRowIdx].map(h => String(h).replace(/[\s\r\n]/g, ''));
    const dataRows = allRows.slice(headerRowIdx + 1).filter(r => r && r.length > 1);

    if (dataRows.length === 0) return ResponseHandler.error(res, 'Excel 无数据行', 'BAD_REQUEST', 400);
    logger.info(`[Excel导入] 检测到表头在第 ${headerRowIdx + 1} 行，数据行 ${dataRows.length} 条，表头: ${headers.join(',')}`);

    // 获取所有员工做姓名映射
    const [employees] = await pool.query('SELECT id, name FROM hr_employees');
    const empNameMap = {};
    for (const e of employees) empNameMap[e.name.trim()] = e.id;

    // 列名关键字映射（用 includes 模糊匹配）
    const colKeywords = [
      { key: 'name', words: ['姓名'] },
      { key: 'dept', words: ['部门'] },
      { key: 'full_work_days', words: ['全勤天数', '全勤天'] },
      { key: 'actual_work_days', words: ['在职天数', '在勤天数', '在职天', '在勤天'] },
      { key: 'absent_from_position', words: ['不在职天数', '不在职天', '不在职'] },
      { key: 'personal_leave_days', words: ['事假天数', '事假天', '事假'] },
      { key: 'sick_leave_days', words: ['病假天数', '病假天', '病假'] },
      { key: 'total_leave_days', words: ['天数合计'] },
      { key: 'public_holiday_days', words: ['公休天数', '公休'] },
      { key: 'late_count', words: ['迟到次数', '迟到'] },
      { key: 'missing_punch_count', words: ['缺卡次数', '缺卡'] },
      { key: 'total_violation_count', words: ['次数合计'] },
      { key: 'serious_late_overtime', words: ['严重迟到'] },
      { key: 'normal_overtime', words: ['正常晚', '加班'] },
      { key: 'saturday_overtime', words: ['周六'] },
      { key: 'weekend_overtime', words: ['周末'] },
      { key: 'remark', words: ['备注'] },
    ];

    // 建立列索引映射: headerIdx -> fieldKey
    const colIndexMap = {};
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      for (const col of colKeywords) {
        if (col.words.some(w => h.includes(w))) {
          // 避免重复映射（如"次数合计"可能匹配"迟到次数"）
          if (!colIndexMap[i]) colIndexMap[i] = col.key;
          break;
        }
      }
    }
    logger.info(`[Excel导入] 列映射: ${JSON.stringify(colIndexMap)}`);

    let imported = 0, skipped = 0;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const row of dataRows) {
        const parsed = {};
        for (const [idx, key] of Object.entries(colIndexMap)) {
          parsed[key] = row[parseInt(idx)] || '';
        }

        const name = String(parsed.name || '').trim();
        if (!name || !empNameMap[name]) { skipped++; continue; }

        const employeeId = empNameMap[name];
        const fullWorkDays = parseFloat(parsed.full_work_days) || 0;
        const totalOT = (parseFloat(parsed.normal_overtime) || 0) + (parseFloat(parsed.saturday_overtime) || 0) + (parseFloat(parsed.weekend_overtime) || 0);

        // [修复 B1] leave_days 应从 personal + sick 计算，不从"天数合计"取
        const personalLeave = parseFloat(parsed.personal_leave_days) || 0;
        const sickLeave = parseFloat(parsed.sick_leave_days) || 0;
        const leaveDays = personalLeave + sickLeave;

        // [修复 D1] 满勤判断：迟到=0 且 缺卡=0 且 请假=0
        const lateCount = parseInt(parsed.late_count) || 0;
        const missingCount = parseInt(parsed.missing_punch_count) || 0;
        const isFullAtt = (lateCount === 0 && missingCount === 0 && leaveDays === 0) ? 1 : 0;

        // [修复 B2] days_in_month 使用法定月计薪天数 21.75，不从 Excel 全勤天数取
        const standardDaysInMonth = 21.75;

        await connection.query(`
          INSERT INTO hr_attendance (
            employee_id, period, full_work_days, actual_work_days, absent_from_position,
            personal_leave_days, sick_leave_days, total_leave_days, public_holiday_days,
            late_count, missing_punch_count, total_violation_count,
            serious_late_overtime, normal_overtime, saturday_overtime, weekend_overtime,
            days_in_month, leave_days, vacation_days, overtime_hours, full_attendance,
            remark, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')
          ON DUPLICATE KEY UPDATE
            full_work_days=VALUES(full_work_days), actual_work_days=VALUES(actual_work_days),
            absent_from_position=VALUES(absent_from_position),
            personal_leave_days=VALUES(personal_leave_days), sick_leave_days=VALUES(sick_leave_days),
            total_leave_days=VALUES(total_leave_days), public_holiday_days=VALUES(public_holiday_days),
            late_count=VALUES(late_count), missing_punch_count=VALUES(missing_punch_count),
            total_violation_count=VALUES(total_violation_count),
            serious_late_overtime=VALUES(serious_late_overtime), normal_overtime=VALUES(normal_overtime),
            saturday_overtime=VALUES(saturday_overtime), weekend_overtime=VALUES(weekend_overtime),
            days_in_month=VALUES(days_in_month), leave_days=VALUES(leave_days),
            vacation_days=VALUES(vacation_days),
            overtime_hours=VALUES(overtime_hours), full_attendance=VALUES(full_attendance),
            remark=VALUES(remark), status='confirmed'
        `, [
          employeeId, period, fullWorkDays, parseFloat(parsed.actual_work_days) || 0,
          parseFloat(parsed.absent_from_position) || 0,
          personalLeave, sickLeave,
          parseFloat(parsed.total_leave_days) || 0, parseFloat(parsed.public_holiday_days) || 0,
          lateCount, missingCount,
          parseInt(parsed.total_violation_count) || 0,
          parseFloat(parsed.serious_late_overtime) || 0, parseFloat(parsed.normal_overtime) || 0,
          parseFloat(parsed.saturday_overtime) || 0, parseFloat(parsed.weekend_overtime) || 0,
          standardDaysInMonth, leaveDays,
          parseFloat(parsed.public_holiday_days) || 0, totalOT, isFullAtt,
          parsed.remark || null
        ]);
        imported++;
      }

      await connection.commit();
      return ResponseHandler.success(res, { imported, skipped }, `导入完成：成功 ${imported} 条，跳过 ${skipped} 条`);
    } catch (txError) {
      await connection.rollback();
      throw txError;
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('导入考勤Excel失败:', error);
    return ResponseHandler.error(res, '导入失败: ' + error.message, 'OPERATION_ERROR', 500, error);
  }
};

// ---------- 薪酬中心 ---------- //

const getSalaryRecords = async (req, res) => {
  try {
    const { period } = req.query;
    let query = `
      SELECT s.*, e.name as employee_name, e.employee_no 
      FROM hr_salary_records s
      JOIN hr_employees e ON s.employee_id = e.id
    `;
    const params = [];
    if (period) {
      query += ` WHERE s.period = ?`;
      params.push(period);
    }
    const [rows] = await pool.query(query, params);

    // Parse JSON details
    const parsedRows = rows.map(r => {
      if (r.split_details && typeof r.split_details === 'string') {
        try { r.split_details = JSON.parse(r.split_details); } catch { /* 忽略解析失败 */ }
        // 静默忽略该错误
      }
      return r;
    });

    return ResponseHandler.success(res, parsedRows);
  } catch (error) {
    logger.error('获取薪资详情失败:', error);
    return ResponseHandler.error(res, '获取薪资详情失败', 'OPERATION_ERROR', 500, error);
  }
};

const calculateSalary = async (req, res) => {
  try {
    const { period } = req.body;
    if (!period) return ResponseHandler.error(res, '缺少计算周期参数', 'BAD_REQUEST', 400);

    const calcCount = await SalaryService.calculatePeriodSalary(period);

    return ResponseHandler.success(res, { count: calcCount }, `核算完成，共生成 ${calcCount} 条工资单`);
  } catch (error) {
    logger.error('薪资自动核算失败:', error);
    return ResponseHandler.error(res, error.message || '核算失败', 'OPERATION_ERROR', 500, error);
  }
};

const confirmSalary = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE hr_salary_records SET status = 'approved' WHERE id = ?", [id]);
    return ResponseHandler.success(res, null, '工资单确认成功');
  } catch (error) {
    return ResponseHandler.error(res, '确认失败', 'OPERATION_ERROR', 500, error);
  }
};

// 批量确认当月所有草稿工资单
const batchConfirmSalary = async (req, res) => {
  try {
    const { period } = req.body;
    if (!period) return ResponseHandler.error(res, '缺少周期参数', 'BAD_REQUEST', 400);
    const [result] = await pool.query(
      "UPDATE hr_salary_records SET status = 'approved' WHERE period = ? AND status = 'draft'",
      [period]
    );
    return ResponseHandler.success(res, { count: result.affectedRows }, `已批量确认 ${result.affectedRows} 条工资单`);
  } catch (error) {
    return ResponseHandler.error(res, '批量确认失败', 'OPERATION_ERROR', 500, error);
  }
};

// 导出薪酬 Excel
const exportSalary = async (req, res) => {
  try {
    const { period } = req.query;
    if (!period) return ResponseHandler.error(res, '缺少周期参数', 'BAD_REQUEST', 400);

    const [rows] = await pool.query(`
      SELECT e.employee_no AS 工号, e.name AS 姓名, d.name AS 部门,
             s.base_salary AS 基本工资, s.daily_wage AS 日工资,
             s.overtime_pay AS 加班费, s.position_allowance AS 职位补贴,
             s.housing_allowance AS 房补, s.meal_allowance AS 餐补,
             s.full_attendance_bonus AS 满勤奖, s.leave_deduction AS 缺勤扣款,
             s.gross_salary AS 应发工资, s.pension AS 社保扣除,
             s.housing_fund AS 公积金扣除, s.net_salary AS 实发工资, s.status AS 状态
      FROM hr_salary_records s
      JOIN hr_employees e ON s.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE s.period = ?
      ORDER BY d.name, e.name
    `, [period]);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${period}薪酬表`);
    const columns = [
      '工号', '姓名', '部门', '基本工资', '日工资', '加班费', '职位补贴',
      '房补', '餐补', '满勤奖', '缺勤扣款', '应发工资', '社保扣除',
      '公积金扣除', '实发工资', '状态'
    ];
    worksheet.columns = columns.map(header => ({ header, key: header, width: Math.max(header.length * 2, 12) }));
    worksheet.addRows(rows);
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=salary_${period}.xlsx`);
    return res.send(buffer);
  } catch (error) {
    logger.error('导出薪酬Excel失败:', error);
    return ResponseHandler.error(res, '导出失败: ' + error.message, 'OPERATION_ERROR', 500, error);
  }
};

// ---------- 考勤规则配置 ---------- //

const getAttendanceRules = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM hr_attendance_rules ORDER BY sort_order');
    return ResponseHandler.success(res, rows);
  } catch (error) {
    return ResponseHandler.error(res, '获取考勤规则失败', 'OPERATION_ERROR', 500, error);
  }
};

const updateAttendanceRule = async (req, res) => {
  try {
    const { id } = req.params;
    const { rule_value, description } = req.body;
    if (!rule_value) return ResponseHandler.error(res, '规则值不能为空', 'BAD_REQUEST', 400);

    await pool.query(
      'UPDATE hr_attendance_rules SET rule_value = ?, description = ? WHERE id = ?',
      [typeof rule_value === 'string' ? rule_value : JSON.stringify(rule_value), description || '', id]
    );
    return ResponseHandler.success(res, null, '规则更新成功');
  } catch (error) {
    return ResponseHandler.error(res, '更新规则失败', 'OPERATION_ERROR', 500, error);
  }
};

module.exports = {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  syncDingtalk,
  syncAttendance,
  getAttendance,
  batchSaveAttendance,
  importAttendanceExcel,
  getSalaryRecords,
  calculateSalary,
  confirmSalary,
  batchConfirmSalary,
  exportSalary,
  getAttendanceRules,
  updateAttendanceRule
};
