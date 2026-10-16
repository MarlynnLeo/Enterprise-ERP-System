const BusinessError = require('../../utils/BusinessError');

const taskIdsOf = (ids) =>
  [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))].sort(
    (a, b) => a - b
  );

/** Both mutation callers hold the production-task row locks before these current reads. */
class ProductionReturnReversalGuard {
  static taskSourceSql(alias, placeholders) {
    return `EXISTS (SELECT 1 FROM production_tasks guard_task
      WHERE guard_task.id IN (${placeholders}) AND (
        (${alias}.reference_type = 'production_task' AND ${alias}.reference_id = guard_task.id)
        OR ${alias}.production_task_id = guard_task.id
        OR (${alias}.reference_type = 'production_plan' AND ${alias}.reference_id = guard_task.plan_id)
        OR (${alias}.reference_type = 'batch_production_tasks' AND (
          JSON_CONTAINS(COALESCE(${alias}.source_task_ids, '[]'), CAST(guard_task.id AS JSON))
          OR JSON_CONTAINS(COALESCE(${alias}.source_task_ids, '[]'), JSON_QUOTE(CAST(guard_task.id AS CHAR)))
        ))
      ))`;
  }

  static async assertReversalAllowed(connection, inputTaskIds) {
    const taskIds = taskIdsOf(inputTaskIds);
    if (!taskIds.length) return;
    const placeholders = taskIds.map(() => '?').join(',');
    const [returns] = await connection.execute(
      `SELECT i.id, i.inbound_no FROM inventory_inbound i
        WHERE i.inbound_type = 'production_return'
          AND i.status IN ('confirmed', 'completed')
          AND COALESCE(i.is_deleted, 0) = 0 AND i.deleted_at IS NULL
          AND ((i.reference_type = 'production_task' AND i.reference_id IN (${placeholders}))
            OR (i.reference_type = 'outbound' AND EXISTS (
              SELECT 1 FROM inventory_outbound return_source
                WHERE (return_source.id = i.reference_id OR
                  (i.reference_id IS NULL AND return_source.outbound_no = i.reference_no COLLATE utf8mb4_unicode_ci))
                  AND ${this.taskSourceSql('return_source', placeholders)}
            )))
        ORDER BY i.id LIMIT 1 FOR UPDATE`,
      [...taskIds, ...taskIds]
    );
    if (returns.length) {
      throw new BusinessError(
        `该生产任务存在已确认或已完成的退料单 ${returns[0].inbound_no}，请先取消或反审核相关退料，再撤销出库`,
        null,
        'PRODUCTION_RETURN_BLOCKS_REVERSAL',
        409
      );
    }
  }

  static async assertReturnAllowed(connection, inputTaskIds, { lock = true } = {}) {
    const taskIds = taskIdsOf(inputTaskIds);
    if (!taskIds.length) return;
    const placeholders = taskIds.map(() => '?').join(',');
    const [reversals] = await connection.execute(
      `SELECT reversal.id FROM inventory_posting_documents reversal
        WHERE reversal.posting_kind = 'reversal' AND reversal.finance_status = 'pending'
          AND reversal.source_type IN ('outbound', 'outbound_supplement')
          AND EXISTS (SELECT 1 FROM inventory_outbound return_source
            WHERE (return_source.id = reversal.source_id OR
              (reversal.source_id IS NULL AND EXISTS (
                SELECT 1 FROM inventory_posting_documents original_movement
                  WHERE original_movement.id = reversal.original_posting_document_id
                    AND (original_movement.source_id = return_source.id OR
                      (original_movement.source_id IS NULL AND (
                        original_movement.source_no = return_source.outbound_no COLLATE utf8mb4_unicode_ci
                        OR original_movement.source_no = CONCAT(return_source.outbound_no, '-补发') COLLATE utf8mb4_unicode_ci
                      )))
              ))) AND ${this.taskSourceSql('return_source', placeholders)}
          )
        ORDER BY reversal.id LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
      taskIds
    );
    if (reversals.length) {
      throw new BusinessError(
        '该生产任务的出库单正在反审核，请先完成或驳回出库反审核，再办理生产退料',
        null,
        'OUTBOUND_REVERSAL_BLOCKS_RETURN',
        409
      );
    }
  }
}

module.exports = ProductionReturnReversalGuard;
