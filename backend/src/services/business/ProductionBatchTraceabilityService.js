'use strict';

const { logger } = require('../../utils/logger');
const Precision = require('../../utils/precision');
const { resolveActorLabel } = require('../../utils/userUtils');

class ProductionBatchTraceabilityService {
  static async getConsumedBatches(connection, taskId) {
    // Business completion freezes the actual FIFO batches before finance posts
    // them. Read both states in one snapshot, and count each movement only once.
    const [rows] = await connection.query(
      `SELECT movements.material_id,
              movements.batch_number AS raw_batch_number,
              m.code AS raw_material_code,
              ABS(SUM(movements.quantity)) AS consumed_quantity
         FROM (
           SELECT il.material_id,
                  CONVERT(TRIM(il.batch_number) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS batch_number,
                  il.quantity
             FROM inventory_ledger il
             JOIN inventory_outbound o ON BINARY o.outbound_no = BINARY il.reference_no
             LEFT JOIN inventory_posting_documents d ON d.id = il.posting_document_id
            WHERE (o.production_task_id = ? OR (o.reference_type = 'production_task' AND o.reference_id = ?))
              AND o.deleted_at IS NULL AND o.status = 'completed'
              AND il.transaction_type IN ('production_outbound', 'outbound')
              AND il.quantity < 0
              AND (il.posting_document_id IS NULL OR (d.finance_status = 'approved' AND d.posting_kind = 'movement'))
           UNION ALL
           SELECT l.material_id,
                  CONVERT(TRIM(l.batch_number) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS batch_number,
                  l.signed_quantity AS quantity
             FROM inventory_posting_lines l
             JOIN inventory_posting_documents d ON d.id = l.posting_document_id
             JOIN inventory_outbound o ON BINARY o.outbound_no = BINARY l.reference_no
            WHERE (o.production_task_id = ? OR (o.reference_type = 'production_task' AND o.reference_id = ?))
              AND o.deleted_at IS NULL AND o.status = 'completed'
              AND l.transaction_type IN ('production_outbound', 'outbound')
              AND l.signed_quantity < 0
              AND d.finance_status = 'pending' AND d.posting_kind = 'movement'
              AND l.posted_quantity IS NULL
              AND NOT EXISTS (SELECT 1 FROM inventory_ledger posted WHERE posted.posting_line_id = l.id)
         ) movements
         JOIN materials m ON m.id = movements.material_id
        GROUP BY movements.material_id, movements.batch_number, m.code
        ORDER BY movements.material_id, movements.batch_number`,
      [taskId, taskId, taskId, taskId]
    );
    return rows;
  }

  /** Caller owns the transaction; a task lock serializes all of its inbound retries. */
  static async createForInbound(connection, inboundId, operator = null) {
    const [[inbound]] = await connection.query(
      `SELECT id, inbound_no, inbound_type, status, inspection_id, operator, updated_by, created_by
         FROM inventory_inbound WHERE id = ? AND is_deleted = 0 FOR UPDATE`,
      [inboundId]
    );
    if (!inbound) throw new Error(`生产入库单 ${inboundId} 不存在`);
    if (inbound.inbound_type !== 'production' || inbound.status !== 'completed') {
      return { skipped: true, created: 0 };
    }

    const [[task]] = await connection.query(
      `SELECT pt.id, pt.code, pt.product_id
         FROM quality_inspections qi
         JOIN production_tasks pt ON pt.id = COALESCE(qi.task_id, qi.reference_id)
        WHERE qi.id = ? AND qi.inspection_type = 'final'
          AND qi.deleted_at IS NULL AND pt.deleted_at IS NULL FOR UPDATE`,
      [inbound.inspection_id]
    );
    if (!task) {
      throw new Error(`生产入库单 ${inbound.inbound_no} 未关联有效的成品质检和生产任务`);
    }

    // A task's raw issues are shared provenance. Allocate their quantities over
    // all completed output batches, so splitting an inbound cannot multiply use.
    const [items] = await connection.query(
      `SELECT ii.material_id, m.code AS material_code,
              CONVERT(TRIM(ii.batch_number) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS batch_number,
              SUM(ii.quantity) AS quantity
         FROM inventory_inbound_items ii
         JOIN inventory_inbound i ON i.id = ii.inbound_id
         JOIN quality_inspections qi ON qi.id = i.inspection_id
         JOIN materials m ON m.id = ii.material_id
        WHERE COALESCE(qi.task_id, qi.reference_id) = ? AND qi.inspection_type = 'final'
          AND qi.deleted_at IS NULL AND i.inbound_type = 'production'
          AND i.status = 'completed' AND i.is_deleted = 0
        GROUP BY ii.material_id, m.code, batch_number
        ORDER BY ii.material_id, batch_number`,
      [task.id]
    );
    if (!items.length) throw new Error(`生产入库单 ${inbound.inbound_no} 没有入库明细`);
    for (const item of items) {
      if (!item.batch_number || !(Number(item.quantity) > 0) || Number(item.material_id) !== Number(task.product_id)) {
        throw new Error(`生产任务 ${task.code} 的入库产品、批次或数量无效`);
      }
    }
    const totalProduced = Precision.add(...items.map(item => Number(item.quantity)));

    const consumed = await this.getConsumedBatches(connection, task.id);
    if (!consumed.length) {
      throw new Error(
        `生产任务 ${task.id}(${task.code}) 未找到已完成领料单的原料领用记录（含待财务过账明细），不能建立消耗追溯关系`
      );
    }
    const missingBatch = consumed.find((row) => !row.raw_batch_number);
    if (missingBatch) {
      throw new Error(
        `生产任务 ${task.code} 的原料 ${missingBatch.raw_material_code} 领用记录缺少批次号，不能建立消耗追溯关系`
      );
    }

    const actor = await resolveActorLabel(
      connection,
      inbound.updated_by,
      inbound.created_by,
      operator,
      inbound.operator
    );
    const [existing] = await connection.query(
      `SELECT id, parent_batch_number, child_batch_number, parent_material_code, child_material_code
         FROM batch_relationships WHERE reference_type = 'production_task' AND reference_id = ?
          AND relationship_type = 'consume' AND process_type = 'production' ORDER BY id FOR UPDATE`,
      [task.id]
    );
    const keyOf = row => JSON.stringify([row.parent_material_code, row.parent_batch_number, row.child_material_code, row.child_batch_number]);
    const byKey = new Map();
    for (const row of existing) if (!byKey.has(keyOf(row))) byKey.set(keyOf(row), row);
    const retained = new Set();
    let created = 0;
    for (const raw of consumed) {
      const totalConsumed = Precision.round(Number(raw.consumed_quantity), 4);
      let allocated = 0;
      let producedSoFar = 0;
      for (const [index, item] of items.entries()) {
        const producedQuantity = Number(item.quantity);
        producedSoFar = Precision.add(producedSoFar, producedQuantity);
        const cumulativeAllocation = index === items.length - 1 ? totalConsumed
          : Precision.round(Precision.mul(totalConsumed, Precision.div(producedSoFar, totalProduced)), 4);
        const consumedQuantity = Precision.sub(cumulativeAllocation, allocated);
        allocated = cumulativeAllocation;
        const relation = {
          parent_material_code: raw.raw_material_code, parent_batch_number: raw.raw_batch_number,
          child_material_code: item.material_code, child_batch_number: item.batch_number,
        };
        const previous = byKey.get(keyOf(relation));
        if (previous) {
          await connection.execute(
            'UPDATE batch_relationships SET consumed_quantity = ?, produced_quantity = ?, conversion_ratio = ? WHERE id = ?',
            [consumedQuantity, producedQuantity, Precision.div(consumedQuantity, producedQuantity), previous.id]
          );
          retained.add(previous.id);
          continue;
        }
        await connection.execute(
          `INSERT INTO batch_relationships (
             parent_batch_id, child_batch_id, parent_material_code, child_material_code,
             parent_batch_number, child_batch_number, relationship_type,
             consumed_quantity, produced_quantity, conversion_ratio, process_type,
             reference_type, reference_id, reference_no, operator, remarks, created_at
           ) VALUES (NULL, NULL, ?, ?, ?, ?, 'consume', ?, ?, ?, 'production',
                     'production_task', ?, ?, ?, ?, NOW())`,
          [
            raw.raw_material_code, item.material_code, raw.raw_batch_number, item.batch_number,
            consumedQuantity, producedQuantity, Precision.div(consumedQuantity, producedQuantity),
            task.id, task.code, actor, `生产任务 ${task.code} 原料消耗按已入库产量分摊`,
          ]
        );
        created += 1;
      }
    }
    // Remove only superseded/duplicate generated edges belonging to this task.
    const obsolete = existing.filter(row => !retained.has(row.id)).map(row => row.id);
    if (obsolete.length) await connection.query('DELETE FROM batch_relationships WHERE id IN (?)', [obsolete]);

    logger.info(`[追溯] 生产入库单 ${inbound.inbound_no} 已建立 ${created} 条原料消耗关系`);
    return { inboundId, taskId: task.id, consumedBatches: consumed.length, created };
  }
}

module.exports = ProductionBatchTraceabilityService;
