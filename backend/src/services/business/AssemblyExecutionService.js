/** Workstation execution is a view of the ordinary production task processes. */
const { pool } = require('../../config/db');
const { mapKeysToSnake } = require('../../utils/fieldMap');
const { jsonArray } = require('../../utils/productProcessDefinition');
const ProductProcessTaskService = require('./ProductProcessTaskService');
const ProductProcessExecutionService = require('./ProductProcessExecutionService');

async function transaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

const projection = `
  SELECT p.*, p.process_name AS step_name, p.template_detail_id AS route_step_id,
    p.actual_start_time AS started_at, p.actual_end_time AS completed_at,
    p.standard_hours * 60 AS standard_minutes,
    p.standard_hours * p.quantity * 60 AS standard_task_minutes,
    TIMESTAMPDIFF(SECOND, p.actual_start_time, p.actual_end_time) / 60 AS actual_minutes,
    ws.name AS station_name, ws.code AS station_code, u.real_name AS operator_name
  FROM production_processes p
  JOIN production_tasks t ON t.id = p.task_id AND t.deleted_at IS NULL
  LEFT JOIN work_stations ws ON ws.id = p.station_id
  LEFT JOIN users u ON u.id = p.operator_id`;

function stepView(row) {
  const snapshot = typeof row.process_snapshot === 'string' ? JSON.parse(row.process_snapshot) : row.process_snapshot || {};
  return {
    ...row, status: row.status === 'cancelled' ? 'skipped' : row.status,
    sop_content: snapshot.sop_content || '', sop_images: jsonArray(snapshot.sop_images),
    instruction_docs: jsonArray(snapshot.instruction_docs), materials: jsonArray(snapshot.materials),
    remark: row.remarks,
  };
}

class AssemblyExecutionService {
  static async generateSteps(taskId) {
    return transaction(async connection => {
      await ProductProcessTaskService.initializeTask(connection, taskId);
      return this.getTaskSteps(taskId, connection);
    });
  }
  static async getTaskSteps(taskId, connection = pool) {
    const [rows] = await connection.query(projection + ' WHERE p.task_id = ? ORDER BY p.sequence, p.id', [taskId]);
    const steps = rows.map(stepView);
    const completedSteps = steps.filter(step => step.status === 'completed').length;
    const skippedSteps = steps.filter(step => step.status === 'skipped').length;
    return { taskId, steps, totalSteps: steps.length, completedSteps, skippedSteps,
      progressPercent: steps.length ? Math.round((completedSteps + skippedSteps) / steps.length * 100) : 0 };
  }
  static async getStepDetail(id, connection = pool) {
    const [rows] = await connection.query(projection + ' WHERE p.id = ?', [id]);
    return rows.length ? stepView(rows[0]) : null;
  }
  static async changeStep(id, data, operator = {}) {
    return transaction(async connection => {
      const result = await ProductProcessExecutionService.update(connection, id, data, operator);
      return { ...result, step: await this.getStepDetail(id, connection) };
    });
  }
  static async startStep(id, operatorId, stationId = null) {
    return this.changeStep(id, { status: 'in_progress', ...(stationId ? { station_id: stationId } : {}) }, { operatorId });
  }
  static async completeStep(id, data = {}, operator = {}) {
    const input = mapKeysToSnake(data);
    return this.changeStep(id, { ...input, remarks: input.remarks ?? input.remark, status: 'completed' }, operator);
  }
  static async skipStep(id, reason, operator = {}) {
    return this.changeStep(id, { status: 'cancelled', remarks: reason }, operator);
  }
  static async getBoardData() {
    const [stations] = await pool.query(`
      SELECT ws.id, ws.code, ws.name, ws.line_code, ws.line_name, ws.station_type,
        p.task_id, p.process_name AS current_step, p.operator_id, u.real_name AS operator_name,
        p.actual_start_time AS started_at, t.code AS task_code, m.name AS product_name,
        CASE WHEN p.id IS NOT NULL THEN 'busy' ELSE 'idle' END AS status
      FROM work_stations ws
      LEFT JOIN production_processes p ON p.station_id = ws.id AND p.status = 'in_progress'
      LEFT JOIN production_tasks t ON t.id = p.task_id AND t.deleted_at IS NULL
      LEFT JOIN materials m ON m.id = t.product_id
      LEFT JOIN users u ON u.id = p.operator_id
      WHERE ws.is_active = 1 ORDER BY ws.line_code, ws.sort_order`);
    const [taskProgress] = await pool.query(`
      SELECT p.task_id, t.code AS task_code, m.name AS product_name, t.process_template_version,
        COUNT(*) AS total_steps,
        SUM(CASE WHEN p.status IN ('completed', 'cancelled') THEN 1 ELSE 0 END) AS completed_steps,
        SUM(CASE WHEN p.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_steps,
        ROUND(SUM(CASE WHEN p.status IN ('completed', 'cancelled') THEN 1 ELSE 0 END) / COUNT(*) * 100) AS progress_percent
      FROM production_processes p JOIN production_tasks t ON t.id = p.task_id
      LEFT JOIN materials m ON m.id = t.product_id
      WHERE t.status IN ('in_progress', 'material_issued', 'material_partial_issued', 'inspection')
        AND t.deleted_at IS NULL GROUP BY p.task_id, t.code, m.name, t.process_template_version ORDER BY t.id DESC`);
    return { stations, taskProgress };
  }
}
module.exports = AssemblyExecutionService;
