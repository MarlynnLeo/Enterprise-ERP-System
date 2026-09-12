const BusinessError = require('../../utils/BusinessError');
const { promoteTaskToInProgress, promoteTaskToInspection } = require('./TaskLifecycleService');
const ProductionLaborService = require('./ProductionLaborService');
const FinalInspectionService = require('./FinalInspectionService');
const { ensureTaskQualityInspections } = require('./ProductionQualityInspectionService');
const { jsonArray } = require('../../utils/productProcessDefinition');

const fail = (message, code = 'INVALID_PROCESS_TRANSITION', status = 409) => {
  throw new BusinessError(message, null, code, status);
};
const terminal = new Set(['completed', 'cancelled']);

class ProductProcessExecutionService {
  static async finishIfReady(connection, taskId, operator = {}) {
    const [tasks] = await connection.query('SELECT id, status FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [taskId]);
    if (!tasks.length || !['in_progress', 'inspection'].includes(tasks[0].status)) return { allStepsCompleted: false, warnings: [] };
    const [processes] = await connection.query('SELECT id, status FROM production_processes WHERE task_id = ?', [taskId]);
    const done = processes.filter(row => terminal.has(row.status)).length;
    const allDone = processes.length > 0 && done === processes.length && processes.some(row => row.status === 'completed');
    const progress = processes.length ? Math.min(99, Math.round(done / processes.length * 100)) : 0;
    const result = { allStepsCompleted: allDone, progressPercent: progress, mainChainPromoted: false, warnings: [] };
    await connection.query('UPDATE production_tasks SET progress = ? WHERE id = ?', [progress, taskId]);
    if (!allDone) return result;

    // Report completion even when quality approval is still pending; repeat calls are idempotent.
    result.report = await ProductionLaborService.ensureTaskReport(connection, taskId, operator);
    try {
      const promoted = await promoteTaskToInspection(connection, taskId, {
        setCompletedQuantityToPlan: true, requireOpenInspectionClear: true,
      });
      result.mainChainPromoted = Boolean(promoted.promoted || promoted.status === 'inspection');
    } catch (error) {
      if (error.code !== 'OPEN_INSPECTIONS') throw error;
      result.warnings.push('工序已完成；首件或过程检验尚未关闭，完成检验后将自动进入终检。');
      return result;
    }
    const inspection = await FinalInspectionService.ensureForTask(connection, taskId, { note: '任务工序全部完成后自动创建' });
    result.finalInspectionCreated = inspection.created;
    result.progressPercent = 100;
    await connection.query('UPDATE production_tasks SET progress = 100 WHERE id = ?', [taskId]);
    return result;
  }

  static async update(connection, processId, data, operator = {}) {
    const [refs] = await connection.query('SELECT task_id FROM production_processes WHERE id = ?', [processId]);
    if (!refs.length) fail('生产工序不存在', 'PROCESS_NOT_FOUND', 404);
    const taskId = refs[0].task_id;
    const [tasks] = await connection.query('SELECT * FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [taskId]);
    if (!tasks.length) fail('生产任务不存在', 'PRODUCTION_TASK_NOT_FOUND', 404);
    const task = tasks[0];
    const [[process]] = await connection.query('SELECT * FROM production_processes WHERE id = ? FOR UPDATE', [processId]);
    if (!process) fail('生产工序已更换，请刷新任务', 'PROCESS_NOT_FOUND', 404);
    const next = data.status || process.status;
    if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(next)) fail('工序状态无效', 'INVALID_PROCESS_STATUS', 400);
    const changing = next !== process.status;
    if (changing && !({ pending: ['in_progress', 'cancelled'], in_progress: ['completed', 'cancelled'] }[process.status] || []).includes(next)) {
      fail(`工序不能从「${process.status}」变更为「${next}」`);
    }
    if (!changing && terminal.has(next)) return { taskId, processId, unchanged: true, ...await this.finishIfReady(connection, taskId, operator) };
    if (['inspection', 'warehousing', 'completed', 'cancelled', 'paused'].includes(task.status)) fail('当前任务状态不允许修改工序');
    if (changing && next === 'in_progress' && !['material_issued', 'material_partial_issued', 'in_progress'].includes(task.status)) {
      fail('请先完成发料，再开始工序', 'MATERIAL_ISSUE_REQUIRED');
    }
    if (changing && next === 'completed' && task.status !== 'in_progress') fail('任务未处于生产中，不能完成工序');
    if (changing && next === 'cancelled' && !String(data.remarks || '').trim()) fail('跳过工序必须填写原因', 'PROCESS_SKIP_REASON_REQUIRED', 400);
    if (changing && ['in_progress', 'cancelled'].includes(next)) {
      const [previous] = await connection.query(
        "SELECT id FROM production_processes WHERE task_id = ? AND sequence < ? AND status NOT IN ('completed', 'cancelled') LIMIT 1",
        [taskId, process.sequence]
      );
      if (previous.length) fail('请先完成前序工序', 'PREVIOUS_PROCESS_REQUIRED');
    }

    const patch = {};
    for (const key of ['process_name', 'sequence', 'quantity', 'standard_hours', 'description']) {
      const numeric = ['sequence', 'quantity', 'standard_hours'].includes(key);
      const unchanged = numeric ? Number(data[key]) === Number(process[key]) : String(data[key] ?? '') === String(process[key] ?? '');
      if (data[key] !== undefined && !unchanged) {
        if (task.process_template_id || process.status !== 'pending' || !['pending', 'allocated', 'preparing'].includes(task.status)) {
          fail('任务工序和定额已固定，请在任务执行前更换工艺版本', 'TASK_PROCESS_SNAPSHOT_IMMUTABLE');
        }
        patch[key] = data[key];
      }
    }
    if (data.progress !== undefined) {
      if (!Number.isFinite(Number(data.progress)) || Number(data.progress) < 0 || Number(data.progress) > 100) fail('工序进度必须为0至100', 'INVALID_PROCESS_PROGRESS', 400);
      patch.progress = Number(data.progress);
    }
    if (data.remarks !== undefined) patch.remarks = data.remarks;
    if (changing) patch.status = next;
    const start = data.actual_start_time ?? data.actual_start_date;
    const end = data.actual_end_time ?? data.actual_end_date;
    // DATETIME columns store seconds. Truncate before writing so MySQL cannot
    // round a start into the future and reject an immediate completion.
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    if (start !== undefined) patch.actual_start_time = start || null;
    if (end !== undefined) patch.actual_end_time = end || null;
    if (changing && next === 'in_progress') {
      patch.actual_start_time = patch.actual_start_time || process.actual_start_time || now;
      patch.operator_id = operator.operatorId || null;
    }
    if (changing && terminal.has(next)) {
      patch.actual_end_time = patch.actual_end_time || process.actual_end_time || now;
      patch.progress = 100;
    }
    for (const key of ['actual_start_time', 'actual_end_time']) {
      if (patch[key]) {
        const time = new Date(patch[key]).getTime();
        if (!Number.isFinite(time)) fail('实际生产时间无效', 'INVALID_PROCESS_TIME', 400);
        patch[key] = new Date(Math.floor(time / 1000) * 1000);
      }
    }
    const effectiveStart = patch.actual_start_time === undefined ? process.actual_start_time : patch.actual_start_time;
    const effectiveEnd = patch.actual_end_time === undefined ? process.actual_end_time : patch.actual_end_time;
    if (['in_progress', 'completed'].includes(next) && !effectiveStart) fail('请填写实际开始时间', 'INVALID_PROCESS_TIME', 400);
    for (const value of [effectiveStart, effectiveEnd]) {
      if (value && !Number.isFinite(new Date(value).getTime())) fail('实际生产时间无效', 'INVALID_PROCESS_TIME', 400);
    }
    if (effectiveStart && effectiveEnd && new Date(effectiveEnd) < new Date(effectiveStart)) fail('完成时间不能早于开始时间', 'INVALID_PROCESS_TIME', 400);

    const stationId = data.station_id ?? process.station_id;
    if (stationId && changing && next === 'in_progress') {
      const [stations] = await connection.query('SELECT id, capacity FROM work_stations WHERE id = ? AND is_active = 1 FOR UPDATE', [stationId]);
      if (!stations.length) fail('工位不存在或已停用', 'INVALID_WORK_STATION', 400);
      const [[{ busy }]] = await connection.query("SELECT COUNT(*) AS busy FROM production_processes WHERE station_id = ? AND status = 'in_progress' AND id <> ?", [stationId, processId]);
      if (Number(busy) >= Number(stations[0].capacity || 1)) fail('该工位已达到同时作业容量', 'WORK_STATION_BUSY');
      patch.station_id = stationId;
    }
    if (changing && next === 'completed') {
      const snapshot = typeof process.process_snapshot === 'string' ? JSON.parse(process.process_snapshot) : process.process_snapshot;
      for (const material of jsonArray(snapshot?.materials).filter(row => Number(row.is_scan_required) === 1)) {
        const [verified] = await connection.query(
          "SELECT id FROM assembly_verification_logs WHERE task_id = ? AND process_id = ? AND material_id = ? AND result = 'pass' LIMIT 1", [taskId, processId, material.material_id]
        );
        if (!verified.length) fail(`请先扫码验证物料 ${material.material_code || material.material_id}`, 'PROCESS_MATERIAL_SCAN_REQUIRED');
      }
    }
    if (Object.keys(patch).length) await connection.query('UPDATE production_processes SET ? WHERE id = ?', [patch, processId]);
    if (changing && next === 'in_progress') {
      await promoteTaskToInProgress(connection, taskId);
      await connection.query('UPDATE production_tasks SET actual_start_time = COALESCE(actual_start_time, NOW()) WHERE id = ?', [taskId]);
    }
    if (['in_progress', 'completed'].includes(next)) await ensureTaskQualityInspections(connection, taskId);
    return { taskId, processId, ...await this.finishIfReady(connection, taskId, operator) };
  }
}

module.exports = ProductProcessExecutionService;
