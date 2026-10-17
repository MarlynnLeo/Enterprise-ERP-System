'use strict';

const BusinessError = require('../../utils/BusinessError');
const invalid = (message) => new BusinessError(message, null, 'VALIDATION_ERROR', 400);
const scopeId = (value) => (value == null || value === '' ? null : Number(value));

/** Task output and the quantities processed at each step are different facts. */
class ProductionReportQuantityService {
  static async read(connection, taskId, { excludeReportId = null, lock = true } = {}) {
    const locking = lock ? ' FOR UPDATE' : '';
    const [processes] = await connection.query(
      `SELECT id, quantity, status, sequence, progress FROM production_processes
        WHERE task_id = ? ORDER BY sequence, id${locking}`,
      [taskId]
    );
    const [rows] = await connection.query(
      `SELECT process_id, COALESCE(SUM(completed_quantity), 0) as total_reported,
              COALESCE(SUM(qualified_quantity), 0) AS qualified_quantity,
              COALESCE(SUM(defective_quantity), 0) AS defective_quantity,
              COALESCE(SUM(work_hours), 0) AS total_work_hours, COUNT(*) AS report_count
         FROM production_reports WHERE task_id = ?${excludeReportId == null ? '' : ' AND id != ?'}
         GROUP BY process_id${locking}`,
      excludeReportId == null ? [taskId] : [taskId, excludeReportId]
    );
    const scopes = new Map(rows.map((row) => [scopeId(row.process_id), row]));
    const hasTaskReports = Number(scopes.get(null)?.total_reported || 0) > 0;
    const hasProcessReports = rows.some(
      (row) => scopeId(row.process_id) !== null && Number(row.total_reported) > 0
    );
    if (hasTaskReports && hasProcessReports) {
      throw invalid('任务报工与工序报工已混用，请先核对并统一已有报工的工序归属');
    }
    return { processes, scopes, hasTaskReports, hasProcessReports };
  }

  static assertCanReport(context, task, processId, quantity) {
    const id = scopeId(processId);
    if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) throw invalid('报工工序无效');
    const process = id === null ? null : context.processes.find((row) => Number(row.id) === id);
    if (id !== null && (!process || process.status === 'cancelled')) {
      throw invalid('报工工序不属于当前生产任务或已取消');
    }
    if ((id === null && context.hasProcessReports) || (id !== null && context.hasTaskReports)) {
      throw invalid('同一任务不能混用任务报工和工序报工，请保持已有报工的计量方式');
    }
    const limit = Number(process?.quantity ?? task.quantity);
    const used = Number(context.scopes.get(id)?.total_reported || 0);
    if (!(limit > 0) || used + quantity > limit + 0.000001) {
      throw invalid(
        `累计报工数量不能超过${process ? '工序' : '任务'}数量，剩余可报工 ${Math.max(0, limit - used)}`
      );
    }
  }

  static assertCorrection(context, oldProcessId, oldQuantity, nextProcessId, nextQuantity) {
    const oldId = scopeId(oldProcessId);
    if (oldId === null) return;
    const process = context.processes.find((row) => Number(row.id) === oldId);
    if (
      process?.status === 'completed' &&
      (oldId !== scopeId(nextProcessId) || Number(nextQuantity) < Number(oldQuantity) - 0.000001)
    ) {
      throw invalid('已完成工序的报工不能减少产量、删除或更换工序，避免破坏后续工序依据');
    }
  }

  static summarize(context, task, selectedProcessId) {
    const active = context.processes.filter((row) => row.status !== 'cancelled');
    const last = active[active.length - 1];
    const outputId = context.hasProcessReports ? scopeId(last?.id) : null;
    const output = context.scopes.get(outputId) || {};
    const totalReported = Number(output.total_reported || 0);
    const selectedId = selectedProcessId === undefined ? outputId : scopeId(selectedProcessId);
    const selected = context.scopes.get(selectedId) || {};
    const process = active.find((row) => Number(row.id) === selectedId);
    const planQuantity = Number(process?.quantity ?? task.quantity) || 0;
    const reportedQuantity = Number(selected.total_reported || 0);
    const progress =
      context.hasProcessReports && active.length
        ? Math.round(
            (active.reduce(
              (sum, row) =>
                sum +
                (row.status === 'completed'
                  ? 1
                  : Math.min(
                      1,
                      Number(context.scopes.get(Number(row.id))?.total_reported || 0) /
                        (Number(row.quantity) || Number(task.quantity) || 1)
                    )),
              0
            ) /
              active.length) *
              100
          )
        : Math.min(100, Math.round((totalReported / (Number(task.quantity) || 1)) * 100));
    return {
      totalReported,
      progress,
      planQuantity,
      reportedQuantity,
      selected,
      outputProcessId: outputId,
      reportingMode: context.hasProcessReports ? 'process' : 'task',
      totalWorkHours: [...context.scopes.values()].reduce(
        (sum, row) => sum + Number(row.total_work_hours || 0),
        0
      ),
      reportCount: [...context.scopes.values()].reduce(
        (sum, row) => sum + Number(row.report_count || 0),
        0
      ),
    };
  }
}

module.exports = ProductionReportQuantityService;
