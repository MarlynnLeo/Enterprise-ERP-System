/**
 * reportController.js
 * @description 生产报工控制器
 * @date 2025-10-16
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { pool } = require('../../../config/db');
const { handleError } = require('./shared/errorHandler');
const ExcelJS = require('exceljs');
const businessConfig = require('../../../config/businessConfig');
const { apiStatusToDbStatus } = require('../../../utils/statusMapper');

// 状态常量
const STATUS = {
  PRODUCTION_TASK: businessConfig.status.productionTask,
};

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
      LEFT JOIN production_tasks pt ON pr.task_id = pt.id
      LEFT JOIN materials m ON pt.product_id = m.id
      ${whereClause}
      GROUP BY pr.task_id, pt.code, m.name
    `;

    const [summary] = await pool.query(query, params);
    res.json(summary);
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
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    const conditions = [];
    const params = [];

    if (taskId) {
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
      `SELECT COUNT(*) as count FROM production_reports pr ${whereClause}`,
      params
    );

    const query = `
      SELECT pr.*, pt.code as task_code, m.name as product_name
      FROM production_reports pr
      LEFT JOIN production_tasks pt ON pr.task_id = pt.id
      LEFT JOIN materials m ON pt.product_id = m.id
      ${whereClause}
      ORDER BY pr.report_time DESC, pr.created_at DESC
      LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}
    `;

    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const [reports] = await pool.query(query, params);

    res.json({
      items: reports,
      total: total[0].count,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
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
      LEFT JOIN production_tasks pt ON pr.task_id = pt.id
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
      LEFT JOIN production_tasks pt ON pr.task_id = pt.id
      LEFT JOIN materials m ON pt.product_id = m.id
      WHERE pr.id = ?
    `,
      [id]
    );

    if (reports.length === 0) {
      return ResponseHandler.error(res, '报工记录不存在', 'NOT_FOUND', 404);
    }

    res.json(reports[0]);
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
    } = req.body;

    // 获取任务信息
    const [taskCheck] = await connection.query(
      'SELECT id, status, quantity FROM production_tasks WHERE id = ?',
      [task_id]
    );

    if (taskCheck.length === 0) {
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
    }

    const task = taskCheck[0];
    const planQuantity = parseFloat(task.quantity) || 0;

    // 生成报工单号
    const reportNo = `RPT${Date.now()}`;

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
        report_quantity || completed_quantity || 0,
        completed_quantity || 0,
        qualified_quantity || 0,
        defective_quantity || 0,
        unqualified_quantity || 0,
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
    } = req.body;

    const [reportCheck] = await connection.query('SELECT id, task_id, process_id as old_process_id FROM production_reports WHERE id = ?', [
      id,
    ]);

    if (reportCheck.length === 0) {
      return ResponseHandler.error(res, '报工记录不存在', 'NOT_FOUND', 404);
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
        completed_quantity,
        qualified_quantity,
        defective_quantity,
        unqualified_quantity || 0,
        work_hours || 0,
        remarks || '',
        id,
      ]
    );

    const task_id = reportCheck[0].task_id;
    const old_process_id = reportCheck[0].old_process_id;

    // 如果修改了工序关联，需要将原工序的进度也刷新一下
    if (old_process_id && old_process_id !== process_id) {
      await syncProgressAndStatus(connection, task_id, old_process_id);
    }
    await syncProgressAndStatus(connection, task_id, process_id);

    await connection.commit();

    res.json({ message: '报工记录更新成功' });
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

    const [reportCheck] = await connection.query('SELECT id, task_id, process_id FROM production_reports WHERE id = ?', [
      id,
    ]);

    if (reportCheck.length === 0) {
      return ResponseHandler.error(res, '报工记录不存在', 'NOT_FOUND', 404);
    }

    const task_id = reportCheck[0].task_id;
    const process_id = reportCheck[0].process_id;

    await connection.query('DELETE FROM production_reports WHERE id = ?', [id]);

    await syncProgressAndStatus(connection, task_id, process_id);

    await connection.commit();

    res.json({ message: '报工记录删除成功' });
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

    // 获取任务基本信息
    const [tasks] = await pool.query(
      `
      SELECT pt.*, m.name as product_name, m.code as product_code
      FROM production_tasks pt
      LEFT JOIN materials m ON pt.product_id = m.id
      WHERE pt.id = ?
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

    const [processes] = await pool.query(
      `
      SELECT id, task_id, process_name, sequence, quantity, status, progress
      FROM production_processes
      WHERE task_id = ?
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
      `SELECT COUNT(*) as total FROM production_reports pr ${whereClause}`,
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
      FROM production_reports pr ${whereClause}
    `,
      params
    );

    // 获取有报工记录的任务数量
    const [taskResult] = await pool.query(
      `
      SELECT COUNT(DISTINCT pr.task_id) as task_count FROM production_reports pr ${whereClause}
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
 * 同步任务及工序进度的内部辅助函数
 * @param {Object} connection - 数据库连接实体
 * @param {Number} task_id - 任务ID
 * @param {Number} process_id - 工序ID
 */
async function syncProgressAndStatus(connection, task_id, process_id) {
  // 1. 同步工序状态
  if (process_id) {
    const [procCheck] = await connection.query('SELECT id, quantity FROM production_processes WHERE id = ?', [process_id]);
    if (procCheck.length > 0) {
      const procQuantity = parseFloat(procCheck[0].quantity) || 0;
      const [procStats] = await connection.query('SELECT COALESCE(SUM(completed_quantity), 0) as total_proc_reported FROM production_reports WHERE process_id = ?', [process_id]);
      const totalProcReported = parseFloat(procStats[0].total_proc_reported) || 0;

      let procProgress = procQuantity > 0 ? Math.round((totalProcReported / procQuantity) * 100) : (totalProcReported > 0 ? 100 : 0);
      if (procProgress > 100) procProgress = 100;
      let procStatus = procProgress >= 100 ? 'completed' : (totalProcReported > 0 ? 'in_progress' : 'pending');

      await connection.query('UPDATE production_processes SET progress = ?, status = ? WHERE id = ?', [procProgress, procStatus, process_id]);
    }
  }

  // 2. 同步任务状态
  const [taskCheck] = await connection.query('SELECT id, status, quantity FROM production_tasks WHERE id = ?', [task_id]);
  if (taskCheck.length === 0) return null;
  const task = taskCheck[0];
  const planQuantity = parseFloat(task.quantity) || 0;

  const [reportStats] = await connection.query('SELECT COALESCE(SUM(completed_quantity), 0) as total_reported FROM production_reports WHERE task_id = ?', [task_id]);
  const totalReported = parseFloat(reportStats[0].total_reported) || 0;

  const [processes] = await connection.query('SELECT id, status FROM production_processes WHERE task_id = ?', [task_id]);

  let apiStatus = null;
  if (processes.length > 0) {
    const allCompleted = processes.every(p => ['completed', 'qc_passed', 'qc_failed'].includes(p.status));
    const anyInProgress = processes.some(p => ['in_progress', 'completed', 'qc_passed', 'qc_failed'].includes(p.status));

    if (allCompleted) {
      apiStatus = STATUS.PRODUCTION_TASK.INSPECTION;
    } else if (anyInProgress && task.status === STATUS.PRODUCTION_TASK.PENDING) {
      apiStatus = STATUS.PRODUCTION_TASK.IN_PROGRESS;
    }
  } else {
    // 兼容当任务没有配置工序时，沿用老逻辑
    if (totalReported >= planQuantity && planQuantity > 0) {
      apiStatus = STATUS.PRODUCTION_TASK.INSPECTION;
    } else if (totalReported > 0 && task.status === STATUS.PRODUCTION_TASK.PENDING) {
      apiStatus = STATUS.PRODUCTION_TASK.IN_PROGRESS;
    }
  }

  if (apiStatus && apiStatus !== task.status) {
    const dbStatus = apiStatusToDbStatus(apiStatus, 'productionTask');
    if (dbStatus) {
      await connection.query('UPDATE production_tasks SET status = ? WHERE id = ?', [dbStatus, task_id]);
      logger.info(`任务 ${task_id} 状态已根据进度计算同步更新: ${task.status} → ${dbStatus} (API: ${apiStatus})`);
    }
  }
  return { totalReported, apiStatus };
}

