'use strict';

const BusinessError = require('../../utils/BusinessError');
const { getReleasedTaskFirstArticleIds } = require('./ProductionQualityHoldService');
const invalid = (message) =>
  Object.assign(new BusinessError(message, null, 'VALIDATION_ERROR', 400), {
    statusCode: 400,
    code: 'VALIDATION_ERROR',
  });

/** Quality records never manufacture production completion facts. Call inside the caller's transaction. */
class FinalInspectionReadinessService {
  static async validate(connection, inspection) {
    if (inspection.inspection_type !== 'final') return;
    const taskId = Number(inspection.task_id || inspection.reference_id);
    if (!Number.isInteger(taskId) || taskId <= 0) throw invalid('终检必须关联有效生产任务');
    const [[task]] = await connection.query(
      'SELECT id, status, product_id, completed_quantity FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [taskId]
    );
    if (!task) throw invalid('终检必须关联有效生产任务');
    if (!['in_progress', 'inspection', 'warehousing', 'completed'].includes(task.status)) {
      throw invalid('生产任务尚未具备终检条件');
    }
    const quantity = Number(inspection.quantity);
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > Number(task.completed_quantity || 0) + 0.0001
    ) {
      throw invalid('终检数量不能超过生产任务实际完工数量');
    }
    if (Number(inspection.product_id || inspection.material_id) !== Number(task.product_id)) {
      throw invalid('终检产品必须与生产任务一致');
    }
    const [processes] = await connection.query(
      "SELECT id FROM production_processes WHERE task_id = ? AND (status IS NULL OR status NOT IN ('completed', 'cancelled')) FOR UPDATE",
      [taskId]
    );
    if (processes.length) throw invalid('生产工序尚未完成，不能创建、提交或放行终检');
    let [open] = await connection.query(
      `SELECT id, inspection_type FROM quality_inspections WHERE (task_id = ? OR (task_id IS NULL AND reference_id = ?))
        AND inspection_type IN ('first_article', 'process') AND deleted_at IS NULL
        AND (status IS NULL OR status NOT IN ('passed', 'completed', 'cancelled')) FOR UPDATE`,
      [taskId, taskId]
    );
    if (open.some((row) => row.inspection_type === 'first_article')) {
      const releasedIds = await getReleasedTaskFirstArticleIds(connection, taskId);
      open = open.filter(
        (row) => row.inspection_type !== 'first_article' || !releasedIds.has(Number(row.id))
      );
    }
    if (open.length) throw invalid('首检或过程检验尚未关闭，不能进行终检');
  }
}
module.exports = FinalInspectionReadinessService;
