const { logger } = require('../../../utils/logger');
const { ResponseHandler } = require('../../../utils/responseHandler');
const db = require('../../../config/db');
const pool = db.pool;
const ExcelJS = require('exceljs');
const SalaryService = require('../../../services/business/hr/salaryService');
const DingtalkSyncService = require('../../../services/business/hr/dingtalkSyncService');
const HrService = require('../../../services/business/HrService');

const REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
};

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

const getUserId = (req) => req.user?.id || null;

const sanitizeText = (value) => String(value ?? '').trim();

const parsePositiveNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const buildRequestNo = (prefix) => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  return `${prefix}${date}${seed}`;
};

const getEmployeeByUser = async (userId) => {
  if (!userId) return null;
  const [[employee]] = await pool.query(
    `SELECT id, name, employee_no, department_id
     FROM hr_employees
     WHERE user_id = ? AND employment_status != 'left'
     ORDER BY id DESC
     LIMIT 1`,
    [userId]
  );
  return employee || null;
};

// ========== W-03: 使用 HrService 白名单映射替代动态表名拼接 ==========
const tryStartRequestWorkflow = async ({
  businessType,
  businessId,
  businessCode,
  title,
  userId,
  connection,
}) => {
  const WorkflowService = require('../../../services/business/WorkflowService');
  const result = await WorkflowService.tryStartWorkflow(
    businessType,
    businessId,
    businessCode,
    title,
    userId,
    connection
  );
  return { started: true, ...result };
};

// ---------- 员工管理 ---------- //

// ========== W-06 + S-05: 员工列表添加分页 + 显式列名 ==========
const getEmployees = async (req, res) => {
  try {
    const { keyword, status } = req.query;
    const result = await HrService.getEmployees({
      keyword,
      status,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    return ResponseHandler.paginated(res, result.rows, result.total, result.page, result.pageSize);
  } catch (error) {
    logger.error('[HR] 获取员工列表失败:', error);
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
    logger.error('[HR] 添加员工失败:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return ResponseHandler.error(res, '员工工号已存在', 'VALIDATION_ERROR', 400);
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
    logger.error('[HR] 更新员工信息失败:', error);
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
    logger.error('[HR] 归档员工失败:', error);
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
    logger.error('[HR] 钉钉同步花名册失败:', error);
    return ResponseHandler.error(res, '钉钉同步失败: ' + error.message, 'OPERATION_ERROR', 500, error);
  }
};

// ---------- 考勤管理 ---------- //

const syncAttendance = async (req, res) => {
  try {
    const { period } = req.body;
    if (!period) return ResponseHandler.error(res, '请提供考勤周期(period)，格式 YYYY-MM', 'VALIDATION_ERROR', 400);
    const result = await DingtalkSyncService.syncAttendanceToDb(period);
    return ResponseHandler.success(res, result, `${period} 月考勤同步完成，共获取 ${result.totalRecords} 条打卡记录，处理 ${result.savedCount} 人`);
  } catch (error) {
    logger.error('[HR] 钉钉考勤同步失败:', error);
    return ResponseHandler.error(res, '钉钉考勤同步失败: ' + error.message, 'OPERATION_ERROR', 500, error);
  }
};

// ========== S-05 + W-04: 请假/加班列表使用 HrService.buildRequestListQuery ==========
const getLeaveRequests = async (req, res) => {
  try {
    const query = HrService.buildRequestListQuery(
      'hr_leave_requests',
      'lr',
      'leave',
      req.query,
      getUserId(req)
    );
    const [[{ total }]] = await pool.query(query.countSql, query.params);
    const [rows] = await pool.query(query.listSql, query.listParams);
    return ResponseHandler.paginated(res, rows, total, query.page, query.pageSize);
  } catch (error) {
    logger.error('[HR] 获取请假申请失败:', error);
    return ResponseHandler.error(res, '获取请假申请失败', 'OPERATION_ERROR', 500, error);
  }
};

const createLeaveRequest = async (req, res) => {
  try {
    const userId = getUserId(req);
    const employee = await getEmployeeByUser(userId);
    const leaveType = sanitizeText(req.body.type || req.body.leave_type);
    const startDate = sanitizeText(req.body.start_date);
    const endDate = sanitizeText(req.body.end_date);
    const duration = parsePositiveNumber(req.body.duration);
    const reason = sanitizeText(req.body.reason);

    if (!leaveType) return ResponseHandler.error(res, '请选择请假类型', 'VALIDATION_ERROR', 400);
    if (!startDate) return ResponseHandler.error(res, '请选择开始日期', 'VALIDATION_ERROR', 400);
    if (!endDate) return ResponseHandler.error(res, '请选择结束日期', 'VALIDATION_ERROR', 400);
    if (new Date(startDate) > new Date(endDate)) {
      return ResponseHandler.error(res, '结束日期不能早于开始日期', 'VALIDATION_ERROR', 400);
    }
    if (!duration) return ResponseHandler.error(res, '请填写有效的请假天数', 'VALIDATION_ERROR', 400);
    if (!reason) return ResponseHandler.error(res, '请填写请假事由', 'VALIDATION_ERROR', 400);

    const requestNo = buildRequestNo('QJ');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query(
        `INSERT INTO hr_leave_requests
         (request_no, applicant_user_id, employee_id, leave_type, start_date, end_date, duration, reason, status, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [requestNo, userId, employee?.id || null, leaveType, startDate, endDate, duration,
         reason, REQUEST_STATUS.PENDING, userId, userId]
      );
      const workflow = await tryStartRequestWorkflow({
        businessType: 'hr_leave', businessId: result.insertId, businessCode: requestNo,
        title: `请假申请 ${requestNo}`, userId, connection,
      });
      await connection.commit();
      return ResponseHandler.success(
        res,
        { id: result.insertId, request_no: requestNo, workflow },
        '请假申请已提交审批',
        201
      );
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('[HR] 提交请假申请失败:', error);
    return ResponseHandler.error(res, '提交请假申请失败: ' + error.message, 'OPERATION_ERROR', 500, error);
  }
};

const getOvertimeRequests = async (req, res) => {
  try {
    const query = HrService.buildRequestListQuery(
      'hr_overtime_requests',
      'ot',
      'overtime',
      req.query,
      getUserId(req)
    );
    const [[{ total }]] = await pool.query(query.countSql, query.params);
    const [rows] = await pool.query(query.listSql, query.listParams);
    return ResponseHandler.paginated(res, rows, total, query.page, query.pageSize);
  } catch (error) {
    logger.error('[HR] 获取加班申请失败:', error);
    return ResponseHandler.error(res, '获取加班申请失败', 'OPERATION_ERROR', 500, error);
  }
};

const createOvertimeRequest = async (req, res) => {
  try {
    const userId = getUserId(req);
    const employee = await getEmployeeByUser(userId);
    const overtimeDate = sanitizeText(req.body.date || req.body.overtime_date);
    const startTime = sanitizeText(req.body.start_time);
    const endTime = sanitizeText(req.body.end_time);
    const hours = parsePositiveNumber(req.body.hours);
    const overtimeType = sanitizeText(req.body.type || req.body.overtime_type);
    const reason = sanitizeText(req.body.reason);

    if (!overtimeDate) return ResponseHandler.error(res, '请选择加班日期', 'VALIDATION_ERROR', 400);
    if (!hours) return ResponseHandler.error(res, '请填写有效的加班时长', 'VALIDATION_ERROR', 400);
    if (!overtimeType) return ResponseHandler.error(res, '请选择加班类型', 'VALIDATION_ERROR', 400);
    if (!reason) return ResponseHandler.error(res, '请填写加班原因', 'VALIDATION_ERROR', 400);

    const requestNo = buildRequestNo('JB');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query(
        `INSERT INTO hr_overtime_requests
         (request_no, applicant_user_id, employee_id, overtime_date, start_time, end_time, hours, overtime_type, reason, status, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [requestNo, userId, employee?.id || null, overtimeDate, startTime || null,
         endTime || null, hours, overtimeType, reason, REQUEST_STATUS.PENDING, userId, userId]
      );
      const workflow = await tryStartRequestWorkflow({
        businessType: 'hr_overtime', businessId: result.insertId, businessCode: requestNo,
        title: `加班申请 ${requestNo}`, userId, connection,
      });
      await connection.commit();
      return ResponseHandler.success(
        res,
        { id: result.insertId, request_no: requestNo, workflow },
        '加班申请已提交审批',
        201
      );
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('[HR] 提交加班申请失败:', error);
    return ResponseHandler.error(res, '提交加班申请失败: ' + error.message, 'OPERATION_ERROR', 500, error);
  }
};

// ========== W-06 + S-05: 考勤列表添加分页 + 显式列名 ==========
const getAttendance = async (req, res) => {
  try {
    const { period } = req.query;
    if (!period) return ResponseHandler.error(res, '请提供考勤周期(period)', 'VALIDATION_ERROR', 400);

    const result = await HrService.getAttendance({
      period,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    return ResponseHandler.paginated(res, result.rows, result.total, result.page, result.pageSize);
  } catch (error) {
    logger.error('[HR] 获取考勤失败:', error);
    return ResponseHandler.error(res, '获取考勤失败', 'OPERATION_ERROR', 500, error);
  }
};

const batchSaveAttendance = async (req, res) => {
  try {
    const { period, records } = req.body;
    if (!period || !records || records.length === 0) {
      return ResponseHandler.error(res, '参数错误', 'VALIDATION_ERROR', 400);
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
    logger.error('[HR] 保存考勤失败:', error);
    return ResponseHandler.error(res, '保存考勤失败', 'OPERATION_ERROR', 500, error);
  }
};

// Excel 导入考勤
const importAttendanceExcel = async (req, res) => {
  try {
    if (!req.file) return ResponseHandler.error(res, '请上传 Excel 文件', 'VALIDATION_ERROR', 400);
    const { period } = req.body;
    if (!period) return ResponseHandler.error(res, '请提供考勤周期(period)', 'VALIDATION_ERROR', 400);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return ResponseHandler.error(res, 'Excel 中未找到工作表', 'VALIDATION_ERROR', 400);

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
    if (headerRowIdx < 0) return ResponseHandler.error(res, 'Excel 中未找到包含"姓名"的表头行', 'VALIDATION_ERROR', 400);

    // 从表头行重新解析为对象数组
    const headers = allRows[headerRowIdx].map(h => String(h).replace(/[\s\r\n]/g, ''));
    const dataRows = allRows.slice(headerRowIdx + 1).filter(r => r && r.length > 1);

    if (dataRows.length === 0) return ResponseHandler.error(res, 'Excel 无数据行', 'VALIDATION_ERROR', 400);
    logger.info(`[HR] [Excel导入] 检测到表头在第 ${headerRowIdx + 1} 行，数据行 ${dataRows.length} 条，表头: ${headers.join(',')}`);

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
    logger.debug('[HR] Excel import column mapping resolved', {
      mappedColumnCount: Object.keys(colIndexMap).length,
      mappedFields: Object.values(colIndexMap),
    });

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
    logger.error('[HR] 导入考勤Excel失败:', error);
    return ResponseHandler.error(res, '导入失败: ' + error.message, 'OPERATION_ERROR', 500, error);
  }
};

// ---------- 薪酬中心 ---------- //

// ========== S-05: 薪资记录使用 HrService 显式列名 ==========
const getSalaryRecords = async (req, res) => {
  try {
    const { period } = req.query;
    const rows = await HrService.getSalaryRecords({ period });

    // Parse JSON details
    const parsedRows = rows.map(r => {
      if (r.split_details && typeof r.split_details === 'string') {
        try { r.split_details = JSON.parse(r.split_details); } catch { logger.debug('[HR] split_details JSON 解析失败'); }
      }
      return r;
    });

    return ResponseHandler.success(res, parsedRows);
  } catch (error) {
    logger.error('[HR] 获取薪资详情失败:', error);
    return ResponseHandler.error(res, '获取薪资详情失败', 'OPERATION_ERROR', 500, error);
  }
};

const calculateSalary = async (req, res) => {
  try {
    const { period } = req.body;
    if (!period) return ResponseHandler.error(res, '缺少计算周期参数', 'VALIDATION_ERROR', 400);

    const calcCount = await SalaryService.calculatePeriodSalary(period);

    return ResponseHandler.success(res, { count: calcCount }, `核算完成，共生成 ${calcCount} 条工资单`);
  } catch (error) {
    logger.error('[HR] 薪资自动核算失败:', error);
    return ResponseHandler.error(res, error.message || '核算失败', 'OPERATION_ERROR', 500, error);
  }
};

const confirmSalary = async (req, res) => {
  try {
    const { id } = req.params;
    const SalaryService = require('../../../services/business/hr/salaryService');
    const result = await SalaryService.confirmAndPostSalary(id, req.user?.id || null);
    return ResponseHandler.success(res, result, result.skipped ? result.message : '工资单确认成功，已生成计提凭证');
  } catch (error) {
    logger.error('[HR] 确认工资单失败:', error);
    return ResponseHandler.error(res, error.message || '确认失败', 'OPERATION_ERROR', 500, error);
  }
};

// 批量确认当月所有草稿工资单（并生成计提凭证）
const batchConfirmSalary = async (req, res) => {
  try {
    const { period } = req.body;
    if (!period) return ResponseHandler.error(res, '缺少周期参数', 'VALIDATION_ERROR', 400);
    const SalaryService = require('../../../services/business/hr/salaryService');
    const result = await SalaryService.batchConfirmAndPost(period, req.user?.id || null);
    return ResponseHandler.success(
      res,
      { count: result.count },
      `已批量确认 ${result.count} 条工资单并生成计提凭证`
    );
  } catch (error) {
    logger.error('[HR] 批量确认失败:', error);
    return ResponseHandler.error(res, error.message || '批量确认失败', 'OPERATION_ERROR', 500, error);
  }
};

// 导出薪酬 Excel
const exportSalary = async (req, res) => {
  try {
    const { period } = req.query;
    if (!period) return ResponseHandler.error(res, '缺少周期参数', 'VALIDATION_ERROR', 400);

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
    logger.error('[HR] 导出薪酬Excel失败:', error);
    return ResponseHandler.error(res, '导出失败: ' + error.message, 'OPERATION_ERROR', 500, error);
  }
};

// ---------- 考勤规则配置 ---------- //

const getAttendanceRules = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, rule_key, rule_name, rule_value, rule_group, description, sort_order, updated_at FROM hr_attendance_rules ORDER BY sort_order');
    return ResponseHandler.success(res, rows);
  } catch (error) {
    logger.error('[HR] 获取考勤规则失败:', error);
    return ResponseHandler.error(res, '获取考勤规则失败', 'OPERATION_ERROR', 500, error);
  }
};

const updateAttendanceRule = async (req, res) => {
  try {
    const { id } = req.params;
    const { rule_value, description } = req.body;
    if (!rule_value) return ResponseHandler.error(res, '规则值不能为空', 'VALIDATION_ERROR', 400);

    await pool.query(
      'UPDATE hr_attendance_rules SET rule_value = ?, description = ? WHERE id = ?',
      [typeof rule_value === 'string' ? rule_value : JSON.stringify(rule_value), description || '', id]
    );
    return ResponseHandler.success(res, null, '规则更新成功');
  } catch (error) {
    logger.error('[HR] 更新规则失败:', error);
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
  getLeaveRequests,
  createLeaveRequest,
  getOvertimeRequests,
  createOvertimeRequest,
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
