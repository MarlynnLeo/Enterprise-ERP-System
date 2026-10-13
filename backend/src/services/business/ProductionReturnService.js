const BusinessError = require('../../utils/BusinessError');
const Allocation = require('./ProductionIssueAllocationService');
const Precision = require('../../utils/precision');
const ProductionReturnReversalGuard = require('./ProductionReturnReversalGuard');

const validationError = (message) => new BusinessError(message, null, 'VALIDATION_ERROR', 400);
const batchKey = (value) => String(value || '').trim();
const bucketKey = (row) =>
  JSON.stringify([Number(row.material_id), Number(row.location_id), batchKey(row.batch_number)]);

/** Production returns must be backed by an issued material, warehouse and batch. */
class ProductionReturnService {
  static async resolveTaskId(connection, inbound) {
    if (inbound.reference_type === 'production_task') {
      const taskId = Number(inbound.reference_id);
      if (Number.isInteger(taskId) && taskId > 0) return taskId;
    } else if (inbound.reference_type === 'outbound') {
      const [rows] = await connection.execute(
        `SELECT reference_type, reference_id, production_task_id
           FROM inventory_outbound
          WHERE ${inbound.reference_id ? 'id = ?' : 'outbound_no = ?'}
            AND deleted_at IS NULL`,
        [inbound.reference_id || inbound.reference_no || null]
      );
      const source = rows[0];
      const taskId = Number(
        source?.reference_type === 'production_task'
          ? source.reference_id
          : source?.production_task_id
      );
      if (Number.isInteger(taskId) && taskId > 0) return taskId;
    }
    throw validationError('生产退料必须关联有效生产任务或生产出库单');
  }

  static async getAvailableRecords(
    connection,
    taskId,
    { excludeInboundId = 0, lock = false } = {}
  ) {
    // Every mutation for this task takes the same lock before checking the cap.
    const [tasks] = await connection.execute(
      `SELECT t.id, t.code AS task_code, t.product_id, t.quantity, t.status,
              m.code AS product_code, m.name AS product_name
         FROM production_tasks t LEFT JOIN materials m ON m.id = t.product_id
        WHERE t.id = ? AND t.deleted_at IS NULL${lock ? ' FOR UPDATE' : ''}`,
      [taskId]
    );
    if (!tasks.length) throw validationError('关联的生产任务不存在或已删除');
    await ProductionReturnReversalGuard.assertReturnAllowed(connection, [taskId], { lock });

    // Item quantities are planned business data. Ledger/FIFO posting lines are
    // the authority for the actual warehouse, batch and quantity issued.
    const sourcePredicate = `o.deleted_at IS NULL
      AND o.status IN ('completed', 'partial_completed')
      AND ${Allocation.taskSourceSql('o', '?')}`;
    const [issued] = await connection.execute(
      `SELECT movement.material_id, movement.location_id, movement.batch_number,
              movement.outbound_id, movement.reference_type, movement.production_task_id, movement.issue_kind,
              SUM(movement.issued_quantity) AS issued_quantity,
              SUM(movement.issued_value) / NULLIF(SUM(movement.issued_quantity), 0) AS unit_cost,
              m.code AS material_code, m.name AS material_name, m.specs AS material_specs,
              m.unit_id, u.name AS unit_name, l.name AS default_location_name
         FROM (
           SELECT o.id AS outbound_id, o.reference_type, o.production_task_id, il.reference_type AS issue_kind, il.material_id, il.location_id, TRIM(COALESCE(il.batch_number, '')) AS batch_number,
                  -il.quantity AS issued_quantity, -il.quantity * COALESCE(il.unit_cost, 0) AS issued_value
             FROM inventory_ledger il
             LEFT JOIN inventory_posting_documents posted_source ON posted_source.id = il.posting_document_id
             JOIN inventory_outbound o ON (
               (il.reference_type = 'outbound' AND il.reference_no = o.outbound_no COLLATE utf8mb4_unicode_ci)
               OR (il.reference_type = 'outbound_supplement' AND (
                 (posted_source.source_type = 'outbound_supplement' AND posted_source.source_id = o.id)
                 OR (posted_source.source_id IS NULL AND il.reference_no = CONCAT(o.outbound_no, '-补发') COLLATE utf8mb4_unicode_ci)
               ))
             )
            WHERE ${sourcePredicate} AND il.quantity < 0
           UNION ALL
           SELECT o.id AS outbound_id, o.reference_type, o.production_task_id, pd.source_type AS issue_kind, pl.material_id, pl.location_id, TRIM(COALESCE(pl.batch_number, '')) AS batch_number,
                  -pl.signed_quantity AS issued_quantity,
                  -pl.signed_quantity * COALESCE(pl.unit_cost, 0) AS issued_value
             FROM inventory_posting_lines pl
             JOIN inventory_posting_documents pd ON pd.id = pl.posting_document_id
             JOIN inventory_outbound o ON pd.source_type IN ('outbound', 'outbound_supplement')
               AND (pd.source_id = o.id OR (pd.source_id IS NULL AND (
                 (pd.source_type = 'outbound' AND pd.source_no = o.outbound_no COLLATE utf8mb4_unicode_ci)
                 OR (pd.source_type = 'outbound_supplement' AND pd.source_no = CONCAT(o.outbound_no, '-补发') COLLATE utf8mb4_unicode_ci)
               )))
            WHERE ${sourcePredicate} AND pd.posting_kind = 'movement'
              AND pd.finance_status = 'pending' AND pl.signed_quantity < 0
         ) movement
         JOIN materials m ON m.id = movement.material_id
         LEFT JOIN units u ON u.id = m.unit_id
         LEFT JOIN locations l ON l.id = movement.location_id
        GROUP BY movement.outbound_id, movement.reference_type, movement.production_task_id, movement.issue_kind, movement.material_id, movement.location_id, movement.batch_number,
                 m.code, m.name, m.specs, m.unit_id, u.name, l.name
        ORDER BY movement.material_id, movement.location_id, movement.batch_number`,
      [taskId, taskId]
    );

    // Confirmed documents reserve capacity; completed includes pending/rejected
    // finance postings so resubmission cannot compete for already used capacity.
    // Locking reads see the latest committed returns under REPEATABLE READ.
    const [returned] = await connection.execute(
      `SELECT ii.material_id, COALESCE(ii.location_id, i.location_id) AS location_id,
              ii.batch_number, ii.quantity AS returned_quantity
         FROM inventory_inbound i JOIN inventory_inbound_items ii ON ii.inbound_id = i.id
         LEFT JOIN inventory_outbound source_outbound ON i.reference_type = 'outbound'
           AND (source_outbound.id = i.reference_id
             OR (i.reference_id IS NULL AND source_outbound.outbound_no = i.reference_no COLLATE utf8mb4_unicode_ci))
        WHERE i.inbound_type = 'production_return'
          AND COALESCE(i.is_deleted, 0) = 0 AND i.deleted_at IS NULL
          AND i.status IN ('confirmed', 'completed') AND i.id <> ?
          AND ((i.reference_type = 'production_task' AND i.reference_id = ?)
            OR (source_outbound.reference_type = 'production_task' AND source_outbound.reference_id = ?)
            OR source_outbound.production_task_id = ?)
        ORDER BY ii.id${lock ? ' FOR UPDATE' : ''}`,
      [Number(excludeInboundId) || 0, taskId, taskId, taskId]
    );
    return {
      task: tasks[0],
      records: this.subtractReturns(
        await Allocation.allocate(connection, issued, taskId),
        returned
      ),
    };
  }

  static subtractReturns(issued, returned) {
    const records = issued.map((row) => ({
      ...row,
      item_id: bucketKey(row),
      default_location_id: row.location_id,
      returnable_quantity: Number(row.issued_quantity) || 0,
      returned_quantity: 0,
      max_returnable_quantity: Number(row.issued_quantity) || 0,
    }));
    // Exact batch reservations first. Legacy blank-batch reservations consume
    // each matching bucket once, never once per outbound detail.
    const orderedReturns = [...returned].sort(
      (a, b) => Number(!!batchKey(b.batch_number)) - Number(!!batchKey(a.batch_number))
    );
    for (const row of orderedReturns) {
      let remaining = Number(row.returned_quantity) || 0;
      for (const record of records) {
        if (
          Number(record.material_id) !== Number(row.material_id) ||
          Number(record.location_id) !== Number(row.location_id) ||
          (batchKey(row.batch_number) &&
            batchKey(row.batch_number) !== batchKey(record.batch_number))
        )
          continue;
        const allocated = Math.min(remaining, record.max_returnable_quantity);
        record.returned_quantity = Precision.add(record.returned_quantity, allocated);
        record.max_returnable_quantity = Precision.sub(record.max_returnable_quantity, allocated);
        remaining = Precision.sub(remaining, allocated);
        if (remaining <= 0) break;
      }
    }
    return records;
  }

  static async validate(connection, inbound, items, options = {}) {
    if (inbound.inbound_type !== 'production_return') return null;
    const taskId = await this.resolveTaskId(connection, inbound);
    const result = await this.getAvailableRecords(connection, taskId, {
      excludeInboundId: inbound.id,
      lock: true,
      ...options,
    });
    const records = new Map(result.records.map((row) => [bucketKey(row), { ...row }]));
    for (const item of items) {
      const quantity = Number(item.quantity);
      const locationId = item.location_id || inbound.location_id;
      if (!Number.isFinite(quantity) || quantity <= 0) throw validationError('退料数量必须大于零');
      const batch = batchKey(item.batch_number);
      if (!batch) throw validationError('生产退料必须选择原领料批次，不能自动猜测批次');
      const source = records.get(
        bucketKey({ ...item, location_id: locationId, batch_number: batch })
      );
      if (!source || quantity > source.max_returnable_quantity + 0.000001) {
        throw validationError(
          `物料 ${item.material_code || item.material_id} 批次 ${batch} 的退料数量超过该任务、仓库可退上限 ${source?.max_returnable_quantity || 0}`
        );
      }
      source.max_returnable_quantity = Precision.sub(source.max_returnable_quantity, quantity);
      item.batch_number = batch;
      item.location_id = locationId;
    }
    return result;
  }
}

module.exports = ProductionReturnService;
