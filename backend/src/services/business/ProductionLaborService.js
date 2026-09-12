/**
 * ProductionLaborService
 *
 * Resolves auditable labor hours for a production task and keeps the
 * automatically-created production report idempotent.
 */

const BusinessError = require('../../utils/BusinessError');
const { CodeGenerators } = require('../../utils/codeGenerator');

const roundHours = (value) => Number((Number(value) || 0).toFixed(6));

class ProductionLaborService {
  static async loadTask(connection, taskId) {
    const [taskRows] = await connection.query(
      `SELECT id, code, product_id, quantity, manager
         FROM production_tasks
        WHERE id = ? AND deleted_at IS NULL
        FOR UPDATE`,
      [taskId]
    );
    const task = taskRows[0];
    if (!task) {
      throw new BusinessError(`生产任务 ${taskId} 不存在`, {
        route: '/production/tasks',
        buttonText: '返回生产任务',
      }, 'PRODUCTION_TASK_NOT_FOUND', 404);
    }
    return task;
  }

  /** Resolve only the task's fixed standards and actual execution times. */
  static async resolveWorkHours(connection, taskId, quantity = null, taskOverride = null) {
    const task = taskOverride || await this.loadTask(connection, taskId);
    const taskQuantity = Number(task.quantity) || 0;
    const reportQuantity = quantity == null ? taskQuantity : Number(quantity);
    if (!Number.isFinite(reportQuantity) || reportQuantity <= 0 || reportQuantity > taskQuantity) {
      throw new BusinessError('报工数量必须大于0且不能超过任务数量', null, 'INVALID_REPORT_QUANTITY', 400);
    }
    const [processes] = await connection.query(
      `SELECT id, process_name, standard_hours, status,
              GREATEST(0, TIMESTAMPDIFF(SECOND, actual_start_time, actual_end_time)) AS actual_seconds
       FROM production_processes WHERE task_id = ? AND status <> 'cancelled' ORDER BY sequence, id`, [taskId]
    );
    let total = 0;
    let hasStandard = false;
    let hasActual = false;
    const missing = [];
    for (const process of processes) {
      if (Number(process.standard_hours) > 0) {
        total += Number(process.standard_hours) * reportQuantity;
        hasStandard = true;
      } else if (process.status === 'completed' && Number(process.actual_seconds) > 0) {
        total += Number(process.actual_seconds) / 3600 * (reportQuantity / taskQuantity);
        hasActual = true;
      } else {
        missing.push(process.process_name || process.id);
      }
    }
    if (!processes.length || missing.length || roundHours(total) <= 0) {
      throw new BusinessError(
        '任务工序缺少有效定额或实际起止时间，请补录实际工时后再完成报工。',
        { route: '/production/process?taskId=' + taskId, buttonText: '补录生产工时' },
        'PRODUCTION_LABOR_REQUIRED', 409
      );
    }
    return { task, workHours: roundHours(total), hoursPerUnit: total / reportQuantity,
      source: hasStandard && hasActual ? 'task_standard_and_actual_hours' : hasStandard ? 'process_standard_hours' : 'completed_process_duration' };
  }

  /**
   * Ensure reports cover the requested cumulative completed quantity. Preserve
   * positive manual hours, repair each zero-hour batch at its own quantity,
   * and create only the uncovered quantity. The task lock serializes callers.
   */
  static async ensureTaskReport(connection, taskId, options = {}) {
    const task = await this.loadTask(connection, taskId);
    const taskQuantity = Number(task.quantity);
    const targetQuantity = options.quantity == null ? taskQuantity : Number(options.quantity);
    if (!Number.isFinite(targetQuantity) || targetQuantity <= 0 || targetQuantity > taskQuantity) {
      throw new BusinessError('报工数量必须大于0且不能超过任务数量', null, 'INVALID_REPORT_QUANTITY', 400);
    }

    const [reports] = await connection.query(
      `SELECT id, work_hours, report_quantity, completed_quantity
         FROM production_reports
        WHERE task_id = ?
        ORDER BY id
        FOR UPDATE`,
      [taskId]
    );
    let reportedQuantity = 0;
    for (const report of reports) {
      report.quantity = Number(report.completed_quantity ?? report.report_quantity);
      if (!Number.isFinite(report.quantity) || report.quantity <= 0) {
        throw new BusinessError('已有报工数量无效，请先核对报工记录', null, 'REPORT_QUANTITY_CONFLICT', 409);
      }
      reportedQuantity += report.quantity;
    }
    if (reportedQuantity > taskQuantity + 0.000001) {
      throw new BusinessError('累计报工数量超过任务数量，请先核对报工记录', null, 'REPORT_QUANTITY_CONFLICT', 409);
    }
    const remainingQuantity = Math.max(0, roundHours(targetQuantity - reportedQuantity));
    const zeroReports = reports.filter(report => !(Number(report.work_hours) > 0));
    const resolved = remainingQuantity > 0 || zeroReports.length
      ? await this.resolveWorkHours(connection, taskId, taskQuantity, task)
      : null;
    const result = {
      task, created: false, repaired: false,
      reportId: reports[reports.length - 1]?.id,
      workHours: reports.reduce((sum, report) => sum + (Number(report.work_hours) || 0), 0),
      source: resolved?.source || 'existing_report',
    };

    for (const report of zeroReports) {
      const workHours = roundHours(resolved.hoursPerUnit * report.quantity);
      if (workHours <= 0) throw new BusinessError('本批次数量对应的工时小于可记录精度，请补录实际工时', null, 'PRODUCTION_LABOR_REQUIRED', 409);
      await connection.query(
        `UPDATE production_reports
            SET work_hours = ?,
                process_id = COALESCE(process_id, ?),
                process_name = COALESCE(process_name, ?),
                remarks = CASE
                  WHEN remarks IS NULL OR remarks = '' THEN ?
                  WHEN remarks LIKE '%自动补录实际工时%' THEN remarks
                  ELSE CONCAT(remarks, '；自动补录实际工时')
                END
          WHERE id = ? AND task_id = ?`,
        [
          workHours,
          options.processId || null,
          options.processName || null,
          `自动补录实际工时（来源：${resolved.source}）`,
          report.id,
          taskId,
        ]
      );
      result.repaired = true;
      result.reportId = report.id;
      result.workHours += workHours - (Number(report.work_hours) || 0);
    }

    if (remainingQuantity <= 0) return { ...result, workHours: roundHours(result.workHours) };
    const newHours = roundHours(resolved.hoursPerUnit * remainingQuantity);
    if (newHours <= 0) throw new BusinessError('本批次数量对应的工时小于可记录精度，请补录实际工时', null, 'PRODUCTION_LABOR_REQUIRED', 409);
    const reportNo = await CodeGenerators.generateReportCode(connection);
    const operatorId = Number.isInteger(Number(options.operatorId))
      ? Number(options.operatorId)
      : 0;
    const operatorName = options.operatorName || resolved.task.manager || '生产报工';
    const remarks = options.remarks || `自动生成报工（来源：${resolved.source}）`;

    const [insert] = await connection.query(
      `INSERT INTO production_reports
       (report_no, task_id, process_id, process_name, operator_id, operator_name,
        report_time, report_quantity, completed_quantity, qualified_quantity,
        defective_quantity, unqualified_quantity, work_hours, remarks, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, 0, 0, ?, ?, NOW())`,
      [
        reportNo,
        taskId,
        options.processId || null,
        options.processName || null,
        operatorId,
        operatorName,
        remainingQuantity,
        remainingQuantity,
        remainingQuantity,
        newHours,
        remarks,
      ]
    );

    return { ...result, created: true, reportId: insert.insertId, workHours: roundHours(result.workHours + newHours) };
  }
}

module.exports = ProductionLaborService;
