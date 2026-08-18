/**
 * reportController.js
 * @description 生产报工控制器
 * @date 2025-10-16
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { mapKeysToSnake } = require('../../../utils/fieldMap');
const { logger } = require('../../../utils/logger');
const { pool } = require('../../../config/db');
const { handleError } = require('./shared/errorHandler');
const ExcelJS = require('exceljs');
const businessConfig = require('../../../config/businessConfig');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const { parsePagination } = require('../../../utils/safePagination');
const {
  promoteTaskToInspection,
  promoteTaskToInProgress,
} = require('../../../services/business/TaskLifecycleService');
const ScopeGuard = require('../../../authorization/ScopeGuard');

// 状态常量（统一引用 businessConfig，消除硬编码）
const TASK_STATUS = businessConfig.status.productionTask;
const PROC_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};

const PROCESS_STATE_MACHINE = {
  pending: ['in_progress', 'completed'],
  in_progress: ['completed'],
  completed: [],
};

function canTransitionProcess(current, target) {
  if (current === target) return true;
  return (PROCESS_STATE_MACHINE[current] || []).includes(target);
}

/**
 * 获取报工汇总
 */
exports.getReportSummary = async (req, res) => {
  try {
    const { startDate, endDate, taskId } = req.query;

    const conditions = [];
    const params = [];

    if (startDate) {
      conditions.push('DATE(pr.report_time) >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('DATE(pr.report_time) <= ?');
      params.push(endDate);
    }

    if (taskId) {
      if (!(await ScopeGuard.assertAccess(pool, req, 'production_task', taskId, { accessMode: 'read' }))) {
        return ResponseHandler.forbidden(res, '无权访问该生产任务');
      }
      conditions.push('pr.task_id = ?');
      params.push(taskId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        pr.task_id,
        pt.code as task_code,
        m.name as product_name,
        SUM(pr.completed_quantity) as total_quantity,
        SUM(pr.qualified_quantity) as total_qualified,
        SUM(pr.defective_quantity) as total_defective,
        COUNT(DISTINCT pr.operator_name) as operator_count
      FROM production_reports pr
      JOIN production_tasks pt ON pr.task_id = pt.id AND pt.deleted_at IS NULL
      LEFT JOIN materials m ON pt.product_id = m.id
      ${whereClause}
      GROUP BY pr.task_id, pt.code, m.name
    `;

    const [summary] = await pool.query(query, params);
    return ResponseHandler.success(res, summary);
  } catch (error) {
    logger.error('获取报工汇总失败:', error);
    handleError(res, error);
  }
};

/**
 * 获取报工明细
 */
exports.getReportDetail = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, taskId, operator, startDate, endDate } = req.query;
    const pagination = parsePagination(page, pageSize, {
      defaultPageSize: 10,
      maxPageSize: 100,
    });

    const conditions = [];
    const params = [];

    if (taskId) {
      if (!(await ScopeGuard.assertAccess(pool, req, 'production_task', taskId, { accessMode: 'read' }))) {
        return ResponseHandler.forbidden(res, '无权访问该生产任务');
      }
      conditions.push('pr.task_id = ?');
      params.push(taskId);
    }

    if (operator) {
      conditions.push('pr.operator_name LIKE ?');
      params.push(`%${operator}%`);
    }

    if (startDate) {
      conditions.push('DATE(pr.report_time) >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('DATE(pr.report_time) <= ?');
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [total] = await pool.query(
      `SELECT COUNT(*) as count
       FROM production_reports pr
       JOIN production_tasks pt ON pr.task_id = pt.id AND pt.deleted_at IS NULL
       ${whereClause}`,
      params
    );

    const query = `
      SELECT pr.*, pt.code as task_code, m.name as product_name
      FROM production_reports pr
      JOIN production_tasks pt ON pr.task_id = pt.id AND pt.deleted_at IS NULL
      LEFT JOIN materials m ON pt.product_id = m.id
      ${whereClause}
      ORDER BY pr.report_time DESC, pr.created_at DESC
      LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}
    `;

    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const [reports] = await pool.query(query, params);

    return ResponseHandler.paginated(res, reports, total[0].count, pagination.page, pagination.pageSize, undefined, {
      items: reports,
    });
  } catch (error) {
    logger.error('获取报工明细失败:', error);
    handleError(res, error);
  }
};

/**
 * 导出报工数据
 */
exports.exportReport = async (req, res) => {
  try {
    const { taskId, startDate, endDate } = req.query;

    const conditions = [];
    const params = [];

    if (taskId) {
      if (!(await ScopeGuard.assertAccess(pool, req, 'production_task', taskId, { accessMode: 'read' }))) {
        return ResponseHandler.forbidden(res, '无权访问该生产任务');
      }
      conditions.push('pr.task_id = ?');
      params.push(taskId);
    }

    if (startDate) {
      conditions.push('DATE(pr.report_time) >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('DATE(pr.report_time) <= ?');
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        pr.id,
        pt.code as task_code,
        m.name as product_name,
        pr.process_name,
        pr.operator_name as operator,
        DATE(pr.report_time) as report_date,
        pr.completed_quantity,
        pr.qualified_quantity,
        pr.defective_quantity,
        pr.remarks,
        pr.created_at
      FROM production_reports pr
      JOIN production_tasks pt ON pr.task_id = pt.id AND pt.deleted_at IS NULL
      LEFT JOIN materials m ON pt.product_id = m.id
      ${whereClause}
      ORDER BY pr.report_time DESC
    `;

    const [reports] = await pool.query(query, params);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('生产报工');

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: '任务编号', key: 'task_code', width: 15 },
      { header: '产品名称', key: 'product_name', width: 20 },
      { header: '工序名称', key: 'process_name', width: 15 },
      { header: '操作员', key: 'operator', width: 15 },
      { header: '报工日期', key: 'report_date', width: 15 },
      { header: '完成数量', key: 'completed_quantity', width: 12 },
      { header: '合格数量', key: 'qualified_quantity', width: 12 },
      { header: '不良数量', key: 'defective_quantity', width: 12 },
      { header: '备注', key: 'remarks', width: 30 },
      { header: '创建时间', key: 'created_at', width: 20 },
    ];

    worksheet.addRows(reports);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=production_reports.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('导出报工数据失败:', error);
    handleError(res, error);
  }
};

/**
 * 获取报工详情
 */
exports.getReportById = async (req, res) => {
  try {
    const { id } = req.params;

    const [reports] = await pool.query(
      `
      SELECT pr.*, pt.code as task_code, m.name as product_name
      FROM production_reports pr
      JOIN production_tasks pt ON pr.task_id = pt.id AND pt.deleted_at IS NULL
      LEFT JOIN materials m ON pt.product_id = m.id
      WHERE pr.id = ?
    `,
      [id]
    );

    if (reports.length === 0) {
      return ResponseHandler.error(res, '报工记录不存在', 'NOT_FOUND', 404);
    }

    if (!(await ScopeGuard.assertAccess(pool, req, 'production_task', reports[0].task_id, { accessMode: 'read' }))) {
      return ResponseHandler.forbidden(res, '无权访问该生产任务');
    }

    return ResponseHandler.success(res, reports[0]);
  } catch (error) {
    logger.error('获取报工详情失败:', error);
    handleError(res, error);
  }
};

/**
 * 创建报工记录
 */
exports.createReport = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      task_id,
      process_id,
      process_name,
      operator_id,
      operator_name,
      report_time,
      report_quantity,
      completed_quantity,
      qualified_quantity,
      defective_quantity,
      unqualified_quantity,
      work_hours,
      remarks,
    } = mapKeysToSnake(req.body || {});

    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'production_task', task_id, '无权为该生产任务报工'))) {
      await connection.rollback();
      return;
    }

    // 获取任务信息
    const [taskCheck] = await connection.query(
      'SELECT id, status, quantity FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [task_id]
    );

    if (taskCheck.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
    }

    const task = taskCheck[0];
    const reportableStatuses = [TASK_STATUS.IN_PROGRESS];
    if (!reportableStatuses.includes(task.status)) {
      await connection.rollback();
      return ResponseHandler.error(res, '生产报工必须在生产中状态下进行，请先从生产过程页开始任务', 'INVALID_STATUS', 400);
    }

    const planQuantity = parseFloat(task.quantity) || 0;
    const completedQty = Number(completed_quantity ?? report_quantity ?? 0);
    const qualifiedQty = Number(qualified_quantity || 0);
    const defectiveQty = Number(defective_quantity ?? unqualified_quantity ?? 0);
    const unqualifiedQty = Number(unqualified_quantity ?? defectiveQty ?? 0);

    if (!Number.isFinite(completedQty) || completedQty <= 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '报工完成数量必须大于0', 'VALIDATION_ERROR', 400);
    }

    if (process_id) {
      const [processRows] = await connection.query(
        'SELECT id FROM production_processes WHERE id = ? AND task_id = ? FOR UPDATE',
        [process_id, task_id]
      );
      if (processRows.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '报工工序不属于当前生产任务', 'VALIDATION_ERROR', 400);
      }
    }

    if (qualifiedQty > completedQty) {
      await connection.rollback();
      return ResponseHandler.error(res, '合格数量不能超过完成数量', 'VALIDATION_ERROR', 400);
    }

    const [reportedRows] = await connection.query(
      'SELECT COALESCE(SUM(completed_quantity), 0) as total_reported FROM production_reports WHERE task_id = ?',
      [task_id]
    );
    const alreadyReported = Number(reportedRows[0]?.total_reported || 0);
    if (alreadyReported + completedQty > planQuantity) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        `累计报工数量不能超过任务数量，剩余可报工 ${Math.max(0, planQuantity - alreadyReported)}`,
        'VALIDATION_ERROR',
        400
      );
    }

    // 生成报工单号
    const reportNo = await CodeGenerators.generateReportCode(connection);

    const [result] = await connection.query(
      `
      INSERT INTO production_reports
      (report_no, task_id, process_id, process_name, operator_id, operator_name, report_time, report_quantity,
       completed_quantity, qualified_quantity, defective_quantity, unqualified_quantity,
       work_hours, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        reportNo,
        task_id,
        process_id || null,
        process_name || null,
        operator_id || 0,
        operator_name || '未知',
        report_time || new Date(),
        report_quantity || completedQty,
        completedQty,
        qualifiedQty,
        defectiveQty,
        unqualifiedQty,
        work_hours || 0,
        remarks || '',
      ]
    );

    // 调用封装的状态同步函数更新进度和任务状态
    const syncResult = await syncProgressAndStatus(connection, task_id, process_id);
    const totalReported = syncResult?.totalReported || 0;
    const newStatus = syncResult?.apiStatus || task.status;

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        id: result.insertId,
        report_no: reportNo,
        task_status: newStatus,
        total_reported: totalReported,
        plan_quantity: planQuantity,
        message: '报工记录创建成功',
      },
      '创建成功',
      201
    );
  } catch (error) {
    await connection.rollback();
    logger.error('创建报工记录失败:', error);
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新报工记录
 */
exports.updateReport = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      process_id,
      process_name,
      operator_name,
      report_time,
      completed_quantity,
      qualified_quantity,
      defective_quantity,
      unqualified_quantity,
      work_hours,
      remarks,
    } = mapKeysToSnake(req.body || {});

    const [reportCheck] = await connection.query('SELECT id, task_id, process_id as old_process_id FROM production_reports WHERE id = ? FOR UPDATE', [
      id,
    ]);

    if (reportCheck.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '报工记录不存在', 'NOT_FOUND', 404);
    }

    const task_id = reportCheck[0].task_id;
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'production_task', task_id, '无权修改该生产任务报工'))) {
      await connection.rollback();
      return;
    }
    const newCompletedQty = Number(completed_quantity || 0);
    const newQualifiedQty = Number(qualified_quantity || 0);

    if (!Number.isFinite(newCompletedQty) || newCompletedQty <= 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '报工完成数量必须大于0', 'VALIDATION_ERROR', 400);
    }

    if (newQualifiedQty > newCompletedQty) {
      await connection.rollback();
      return ResponseHandler.error(res, '合格数量不能超过完成数量', 'VALIDATION_ERROR', 400);
    }

    if (process_id) {
      const [processRows] = await connection.query(
        'SELECT id FROM production_processes WHERE id = ? AND task_id = ? FOR UPDATE',
        [process_id, task_id]
      );
      if (processRows.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '报工工序不属于当前生产任务', 'VALIDATION_ERROR', 400);
      }
    }

    const [taskRows] = await connection.query(
      'SELECT status, quantity FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [task_id]
    );
    if (taskRows.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
    }
    if (taskRows[0].status !== TASK_STATUS.IN_PROGRESS) {
      await connection.rollback();
      return ResponseHandler.error(res, '只能修改生产中任务的报工记录', 'INVALID_STATUS', 400);
    }

    const [otherReportRows] = await connection.query(
      'SELECT COALESCE(SUM(completed_quantity), 0) as total_reported FROM production_reports WHERE task_id = ? AND id != ?',
      [task_id, id]
    );
    const planQuantity = Number(taskRows[0].quantity || 0);
    const otherReported = Number(otherReportRows[0]?.total_reported || 0);
    if (otherReported + newCompletedQty > planQuantity) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        `累计报工数量不能超过任务数量，剩余可报工 ${Math.max(0, planQuantity - otherReported)}`,
        'VALIDATION_ERROR',
        400
      );
    }

    await connection.query(
      `
      UPDATE production_reports
      SET process_id = ?, process_name = ?, operator_name = ?, report_time = ?, completed_quantity = ?,
          qualified_quantity = ?, defective_quantity = ?, unqualified_quantity = ?,
          work_hours = ?, remarks = ?
      WHERE id = ?
    `,
      [
        process_id || null,
        process_name || null,
        operator_name,
        report_time,
        newCompletedQty,
        newQualifiedQty,
        defective_quantity,
        unqualified_quantity || 0,
        work_hours || 0,
        remarks || '',
        id,
      ]
    );

    const old_process_id = reportCheck[0].old_process_id;

    // 如果修改了工序关联，需要将原工序的进度也刷新一下
    if (old_process_id && old_process_id !== process_id) {
      await syncProgressAndStatus(connection, task_id, old_process_id);
    }
    await syncProgressAndStatus(connection, task_id, process_id);

    await connection.commit();

    return ResponseHandler.success(res, null, '报工记录更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新报工记录失败:', error);
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 删除报工记录
 */
exports.deleteReport = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const [reportCheck] = await connection.query('SELECT id, task_id, process_id FROM production_reports WHERE id = ? FOR UPDATE', [
      id,
    ]);

    if (reportCheck.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '报工记录不存在', 'NOT_FOUND', 404);
    }

    const task_id = reportCheck[0].task_id;
    const process_id = reportCheck[0].process_id;
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'production_task', task_id, '无权删除该生产任务报工'))) {
      await connection.rollback();
      return;
    }

    const [taskRows] = await connection.query(
      'SELECT status FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [task_id]
    );
    if (taskRows.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
    }
    if (taskRows[0].status !== TASK_STATUS.IN_PROGRESS) {
      await connection.rollback();
      return ResponseHandler.error(res, '只能删除生产中任务的报工记录', 'INVALID_STATUS', 400);
    }

    await connection.query('DELETE FROM production_reports WHERE id = ?', [id]);

    await syncProgressAndStatus(connection, task_id, process_id);

    await connection.commit();

    return ResponseHandler.success(res, null, '报工记录删除成功');
  } catch (error) {
    await connection.rollback();
    logger.error('删除报工记录失败:', error);
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 获取任务的报工统计（用于报工时显示）
 */
exports.getTaskReportStats = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!(await ScopeGuard.assertAccess(pool, req, 'production_task', taskId, { accessMode: 'read' }))) {
      return ResponseHandler.forbidden(res, '无权访问该生产任务');
    }

    // 获取任务基本信息
    const [tasks] = await pool.query(
      `
      SELECT pt.*, m.name as product_name, m.code as product_code
      FROM production_tasks pt
      LEFT JOIN materials m ON pt.product_id = m.id
      WHERE pt.id = ? AND pt.deleted_at IS NULL
    `,
      [taskId]
    );

    if (tasks.length === 0) {
      return ResponseHandler.error(res, '任务不存在', 'NOT_FOUND', 404);
    }

    const task = tasks[0];

    // 获取该任务的报工汇总
    const [reportStats] = await pool.query(
      `
      SELECT
        COALESCE(SUM(completed_quantity), 0) as reported_quantity,
        COALESCE(SUM(qualified_quantity), 0) as qualified_quantity,
        COALESCE(SUM(defective_quantity), 0) as defective_quantity,
        COALESCE(SUM(work_hours), 0) as total_work_hours,
        COUNT(*) as report_count
      FROM production_reports
      WHERE task_id = ?
    `,
      [taskId]
    );

    const stats = reportStats[0];
    const planQuantity = parseFloat(task.quantity) || 0;
    const reportedQuantity = parseFloat(stats.reported_quantity) || 0;
    const remainingQuantity = Math.max(0, planQuantity - reportedQuantity);

    ResponseHandler.success(
      res,
      {
        task_id: task.id,
        task_code: task.code,
        product_id: task.product_id,
        product_name: task.product_name,
        product_code: task.product_code,
        plan_quantity: planQuantity,
        reported_quantity: reportedQuantity,
        remaining_quantity: remainingQuantity,
        qualified_quantity: parseFloat(stats.qualified_quantity) || 0,
        defective_quantity: parseFloat(stats.defective_quantity) || 0,
        total_work_hours: parseFloat(stats.total_work_hours) || 0,
        report_count: parseInt(stats.report_count) || 0,
        completion_rate:
          planQuantity > 0 ? ((reportedQuantity / planQuantity) * 100).toFixed(2) + '%' : '0%',
        qualification_rate:
          reportedQuantity > 0
            ? ((parseFloat(stats.qualified_quantity) / reportedQuantity) * 100).toFixed(2) + '%'
            : '0%',
      },
      '获取成功'
    );
  } catch (error) {
    logger.error('获取任务报工统计失败:', error);
    handleError(res, error);
  }
};

/**
 * 获取任务的工序列表
 */
exports.getTaskProcesses = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!(await ScopeGuard.assertAccess(pool, req, 'production_task', taskId, { accessMode: 'read' }))) {
      return ResponseHandler.forbidden(res, '无权访问该生产任务');
    }

    const [processes] = await pool.query(
      `
      SELECT pp.id, pp.task_id, pp.process_name, pp.sequence, pp.quantity, pp.status, pp.progress
      FROM production_processes pp
      JOIN production_tasks pt ON pp.task_id = pt.id AND pt.deleted_at IS NULL
      WHERE pp.task_id = ?
      ORDER BY sequence ASC
    `,
      [taskId]
    );

    ResponseHandler.success(res, processes, '获取成功');
  } catch (error) {
    logger.error('获取任务工序列表失败:', error);
    handleError(res, error);
  }
};

/**
 * 获取报工统计数据
 */
exports.getReportStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const conditions = [];
    const params = [];

    if (startDate) {
      conditions.push('DATE(pr.report_time) >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('DATE(pr.report_time) <= ?');
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 获取总报工数
    const [totalResult] = await pool.query(
      `SELECT COUNT(*) as total
       FROM production_reports pr
       JOIN production_tasks pt ON pr.task_id = pt.id AND pt.deleted_at IS NULL
       ${whereClause}`,
      params
    );

    // 获取完成数量和合格数量
    const [quantityResult] = await pool.query(
      `
      SELECT
        COALESCE(SUM(pr.completed_quantity), 0) as total_completed,
        COALESCE(SUM(pr.qualified_quantity), 0) as total_qualified,
        COALESCE(SUM(pr.defective_quantity), 0) as total_defective,
        COALESCE(SUM(pr.work_hours), 0) as total_work_hours
      FROM production_reports pr
      JOIN production_tasks pt ON pr.task_id = pt.id AND pt.deleted_at IS NULL
      ${whereClause}
    `,
      params
    );

    // 获取有报工记录的任务数量
    const [taskResult] = await pool.query(
      `
      SELECT COUNT(DISTINCT pr.task_id) as task_count
      FROM production_reports pr
      JOIN production_tasks pt ON pr.task_id = pt.id AND pt.deleted_at IS NULL
      ${whereClause}
    `,
      params
    );

    const totalCompleted = parseFloat(quantityResult[0].total_completed) || 0;
    const totalQualified = parseFloat(quantityResult[0].total_qualified) || 0;

    ResponseHandler.success(
      res,
      {
        total: parseInt(totalResult[0].total) || 0,
        taskCount: parseInt(taskResult[0].task_count) || 0,
        totalCompleted: totalCompleted,
        totalQualified: totalQualified,
        totalDefective: parseFloat(quantityResult[0].total_defective) || 0,
        totalWorkHours: parseFloat(quantityResult[0].total_work_hours) || 0,
        qualifiedRate:
          totalCompleted > 0 ? ((totalQualified / totalCompleted) * 100).toFixed(2) + '%' : '0%',
      },
      '获取成功'
    );
  } catch (error) {
    logger.error('获取报工统计失败:', error);
    handleError(res, error);
  }
};

/**
 * 同步任务及工序进度。
 * 报工只维护数量/进度；任务状态推进必须走 TaskLifecycleService（禁止旁路跳过状态机）。
 */
async function syncProgressAndStatus(connection, task_id, process_id) {
  // 1. 同步工序进度（状态机合法才切换）
  if (process_id) {
    const [procCheck] = await connection.query(
      'SELECT id, quantity, status FROM production_processes WHERE id = ? FOR UPDATE',
      [process_id]
    );
    if (procCheck.length > 0) {
      const procQuantity = parseFloat(procCheck[0].quantity) || 0;
      const currentProcStatus = procCheck[0].status;
      const [procStats] = await connection.query(
        'SELECT COALESCE(SUM(completed_quantity), 0) as total_proc_reported FROM production_reports WHERE process_id = ?',
        [process_id]
      );
      const totalProcReported = parseFloat(procStats[0].total_proc_reported) || 0;

      let procProgress =
        procQuantity > 0
          ? Math.round((totalProcReported / procQuantity) * 100)
          : totalProcReported > 0
            ? 100
            : 0;
      if (procProgress > 100) procProgress = 100;

      let desiredProcStatus =
        procProgress >= 100
          ? PROC_STATUS.COMPLETED
          : totalProcReported > 0
            ? PROC_STATUS.IN_PROGRESS
            : PROC_STATUS.PENDING;

      if (!canTransitionProcess(currentProcStatus, desiredProcStatus)) {
        // 终态或非法跳转：只更新进度，不改状态
        desiredProcStatus = currentProcStatus;
      }

      await connection.query(
        'UPDATE production_processes SET progress = ?, status = ? WHERE id = ?',
        [procProgress, desiredProcStatus, process_id]
      );
    }
  }

  // 2. 只写数量与进度，不直接 UPDATE status
  const [taskCheck] = await connection.query(
    'SELECT id, status, quantity FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
    [task_id]
  );
  if (taskCheck.length === 0) return null;
  const task = taskCheck[0];
  const planQuantity = parseFloat(task.quantity) || 0;

  const [reportStats] = await connection.query(
    'SELECT COALESCE(SUM(completed_quantity), 0) as total_reported FROM production_reports WHERE task_id = ?',
    [task_id]
  );
  const totalReported = parseFloat(reportStats[0].total_reported) || 0;
  const taskProgress =
    planQuantity > 0
      ? Math.min(100, Math.round((totalReported / planQuantity) * 100))
      : totalReported > 0
        ? 100
        : 0;

  await connection.query(
    'UPDATE production_tasks SET completed_quantity = ?, progress = ? WHERE id = ? AND deleted_at IS NULL',
    [Math.min(totalReported, planQuantity || totalReported), taskProgress, task_id]
  );

  // 3. 状态推进：仅通过生命周期服务
  let apiStatus = null;
  const [processes] = await connection.query(
    'SELECT id, status FROM production_processes WHERE task_id = ?',
    [task_id]
  );

  const hasProcesses = processes.length > 0;
  const allProcessesCompleted =
    hasProcesses &&
    processes.every((p) =>
      [PROC_STATUS.COMPLETED, 'qc_passed', 'qc_failed'].includes(p.status)
    );
  const anyProcessStarted = hasProcesses
    ? processes.some((p) =>
        [PROC_STATUS.IN_PROGRESS, PROC_STATUS.COMPLETED, 'qc_passed', 'qc_failed'].includes(
          p.status
        )
      )
    : totalReported > 0;
  const fullyReported = planQuantity > 0 && totalReported >= planQuantity;

  try {
    if (
      anyProcessStarted &&
      [
        TASK_STATUS.MATERIAL_ISSUED,
        TASK_STATUS.MATERIAL_PARTIAL_ISSUED,
      ].includes(task.status)
    ) {
      await promoteTaskToInProgress(connection, task_id);
      apiStatus = TASK_STATUS.IN_PROGRESS;
    }

    // 报工满产且工序全完（或无工序）→ 进入待检；首检/过程检未关闭时不推进
    if (
      (allProcessesCompleted || (!hasProcesses && fullyReported)) &&
      (task.status === TASK_STATUS.IN_PROGRESS || apiStatus === TASK_STATUS.IN_PROGRESS)
    ) {
      const result = await promoteTaskToInspection(connection, task_id, {
        setCompletedQuantityToPlan: fullyReported || allProcessesCompleted,
        requireOpenInspectionClear: true,
      });
      if (result.promoted || result.status === 'inspection') {
        apiStatus = TASK_STATUS.INSPECTION;
      }
    }
  } catch (lifecycleError) {
    // 未关闭检验等：进度已写，状态保持，不阻断报工提交
    if (lifecycleError.code === 'OPEN_INSPECTIONS') {
      logger.warn(
        `任务 ${task_id} 报工后未推进状态: ${lifecycleError.message}`
      );
    } else if (/不允许从/.test(lifecycleError.message || '')) {
      logger.warn(
        `任务 ${task_id} 报工后状态转移被状态机拒绝: ${lifecycleError.message}`
      );
    } else {
      throw lifecycleError;
    }
  }

  return { totalReported, apiStatus };
}
