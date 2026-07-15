/**
 * FinalInspectionService
 * 生产任务终检单统一创建入口（过程完成 / 装配完成 / 完工共用）
 */

const QualityInspection = require('../../models/qualityInspection');
const { generateBatchNo } = require('./TaskLifecycleService');
const { QUALITY_INSPECTION_TYPES } = require('../../constants/documentReferences');

class FinalInspectionService {
  /**
   * 确保任务存在终检单；已存在则返回已有 ID
   * @param {object} connection
   * @param {number} taskId
   * @param {object} [options]
   * @param {string} [options.note]
   * @returns {Promise<{ created: boolean, inspectionId: number|null }>}
   */
  static async ensureForTask(connection, taskId, options = {}) {
    if (!connection) {
      throw new Error('ensureForTask 必须在事务中调用');
    }
    if (!taskId) {
      return { created: false, inspectionId: null };
    }

    const [existing] = await connection.query(
      `SELECT id FROM quality_inspections
       WHERE inspection_type = ?
         AND reference_id = ?
         AND deleted_at IS NULL
       ORDER BY id DESC
       LIMIT 1`,
      [QUALITY_INSPECTION_TYPES.FINAL, taskId]
    );
    if (existing.length > 0) {
      return { created: false, inspectionId: existing[0].id };
    }

    const [tasks] = await connection.query(
      `SELECT pt.id, pt.code, pt.product_id, pt.quantity, m.unit_id, u.name AS unit_name
       FROM production_tasks pt
       LEFT JOIN materials m ON m.id = pt.product_id
       LEFT JOIN units u ON u.id = m.unit_id
       WHERE pt.id = ? AND pt.deleted_at IS NULL`,
      [taskId]
    );
    if (tasks.length === 0) {
      throw new Error(`生产任务不存在: ${taskId}`);
    }
    const task = tasks[0];

    const created = await QualityInspection.createInspection(
      {
        inspection_type: QUALITY_INSPECTION_TYPES.FINAL,
        reference_id: taskId,
        reference_no: task.code,
        task_id: taskId,
        product_id: task.product_id,
        batch_no: await generateBatchNo(task.code, connection),
        quantity: task.quantity || 0,
        unit_id: task.unit_id || null,
        unit: task.unit_name || null,
        planned_date: new Date(),
        status: 'pending',
        note: options.note || null,
      },
      connection
    );

    const inspectionId = created?.id || created?.insertId || null;
    return { created: true, inspectionId };
  }
}

module.exports = FinalInspectionService;
