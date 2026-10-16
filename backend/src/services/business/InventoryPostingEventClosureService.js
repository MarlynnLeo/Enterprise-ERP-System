'use strict';

const db = require('../../config/db');

const SOURCES = {
  outbound: ['inventory_outbound', 'outbound_no', 'reversed'],
  outbound_supplement: ['inventory_outbound', 'outbound_no', 'reversed'],
  production_outbound: ['inventory_outbound', 'outbound_no', 'reversed'],
  inbound: ['inventory_inbound', 'inbound_no', 'reversed'],
  purchase_inbound: ['inventory_inbound', 'inbound_no', 'reversed'],
  sales_outbound: ['sales_outbound', 'outbound_no', 'reversed'],
  transfer: ['inventory_transfers', 'transfer_no', 'reversed'],
  outsourced_processing_material: ['outsourced_processings', 'processing_no', 'cancelled'],
  outsourced_processing_receipt: ['outsourced_processing_receipts', 'receipt_no', 'cancelled'],
};

function incomplete(message) {
  const error = new Error(`库存冲销链不完整：${message}`);
  error.code = 'INVENTORY_REVERSAL_INCOMPLETE';
  error.statusCode = 409;
  return error;
}

class InventoryPostingEventClosureService {
  // Also used by the read-only repair preview. Never accept just a status flag.
  static async inspect(connection, postingId, { lock = true } = {}) {
    const suffix = lock ? ' FOR UPDATE' : '';
    const [[original]] = await connection.execute(
      `SELECT id, source_type, source_id, source_no, posting_kind, finance_status, locked
         FROM inventory_posting_documents WHERE id = ?${suffix}`, [postingId]
    );
    if (!original || original.finance_status !== 'reversed') return null;
    if (original.posting_kind !== 'movement' || Number(original.locked) !== 1) {
      throw incomplete('原过账不是已锁定的业务过账');
    }
    const [reversals] = await connection.execute(
      `SELECT DISTINCT r.id
         FROM inventory_posting_events e
         JOIN inventory_posting_documents r
           ON r.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(e.event_data, '$.reversalDocumentId')) AS UNSIGNED)
        WHERE e.posting_document_id = ? AND e.event_type = 'finance_reversed'
          AND r.posting_kind = 'reversal' AND r.finance_status = 'approved' AND r.locked = 1${suffix}`,
      [postingId]
    );
    if (reversals.length !== 1) throw incomplete('缺少唯一已审核冲销凭据');
    const reversalId = reversals[0].id;
    const [lines] = await connection.execute(
      `SELECT pl.id, pl.signed_quantity, o.id AS ledger_id, o.quantity, o.total_value,
              o.unit_cost, o.material_id, o.location_id, o.batch_number,
              r.id AS reversal_ledger_id, r.quantity AS reversal_quantity,
              r.total_value AS reversal_value, r.unit_cost AS reversal_unit_cost,
              r.material_id AS reversal_material_id, r.location_id AS reversal_location_id,
              r.batch_number AS reversal_batch_number
         FROM inventory_posting_lines pl
         LEFT JOIN inventory_ledger o ON o.posting_line_id = pl.id AND o.posting_document_id = pl.posting_document_id
         LEFT JOIN inventory_ledger r ON r.reversal_of_ledger_id = o.id AND r.posting_document_id = ?
        WHERE pl.posting_document_id = ? ORDER BY pl.id${suffix}`, [reversalId, postingId]
    );
    const seen = new Set();
    if (!lines.length) throw incomplete('缺少原始冻结明细');
    for (const line of lines) {
      const numeric = ['signed_quantity', 'quantity', 'total_value', 'unit_cost', 'reversal_quantity', 'reversal_value', 'reversal_unit_cost'];
      if (!line.ledger_id || !line.reversal_ledger_id || seen.has(String(line.id)) ||
          numeric.some((key) => line[key] == null || !Number.isFinite(Number(line[key]))) ||
          !Number(line.quantity) ||
          Math.abs(Number(line.signed_quantity) - Number(line.quantity)) > 0.000001 ||
          Math.abs(Number(line.quantity) + Number(line.reversal_quantity)) > 0.000001 ||
          Math.abs(Math.abs(Number(line.total_value)) - Math.abs(Number(line.reversal_value))) > 0.000001 ||
          Math.abs(Number(line.unit_cost) - Number(line.reversal_unit_cost)) > 0.000001 ||
          String(line.material_id) !== String(line.reversal_material_id) ||
          String(line.location_id) !== String(line.reversal_location_id) ||
          String(line.batch_number || '') !== String(line.reversal_batch_number || '')) {
        throw incomplete('原台账与冲销台账未逐行等量等值对应');
      }
      seen.add(String(line.id));
    }
    const source = SOURCES[original.source_type];
    if (!source) throw incomplete('来源类型尚无可验证的冲销终态');
    const [table, noColumn, status] = source;
    let sourceColumn = noColumn;
    let sourceValue = original.source_no;
    if (original.source_type === 'outbound_supplement') {
      // Supplements have their own posting numbers but belong to one outbound.
      // Only old records without an ID used the exact '<outbound>-补发' name.
      if (original.source_id != null) {
        sourceValue = Number(original.source_id);
        if (!Number.isSafeInteger(sourceValue) || sourceValue <= 0) {
          throw incomplete('补发缺少有效的原出库单关联');
        }
        sourceColumn = 'id';
      } else {
        const legacy = typeof original.source_no === 'string'
          ? original.source_no.match(/^(.+)-补发$/u)
          : null;
        if (!legacy) throw incomplete('历史补发编号无法唯一关联原出库单');
        sourceValue = legacy[1];
      }
    }
    const [sources] = await connection.execute(
      `SELECT id, status FROM ${table} WHERE ${sourceColumn} = ?${suffix}`, [sourceValue]
    );
    if (sources.length !== 1 || sources[0].status !== status ||
        (original.source_id && Number(sources[0].id) !== Number(original.source_id))) {
      throw incomplete('来源单据未完成冲销收尾');
    }
    return { originalId: original.id, reversalId, verifiedLines: lines.length };
  }

  static async closeReversedPosting(postingId) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const proof = await this.inspect(connection, postingId);
      if (!proof) { await connection.commit(); return false; }
      const note = `[compensated_by_inventory_posting=${proof.reversalId}]`;
      await connection.execute(
        `UPDATE domain_events SET status = 'processed', processed_at = NOW(),
                locked_at = NULL, error_message = ?, updated_at = NOW()
          WHERE event_name = 'INVENTORY_POSTING_APPROVED' AND status <> 'processed'
            AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.postingDocumentId')) = ?`,
        [note, String(postingId)]
      );
      // Keep every historical failure for audit; resolve only this verified source.
      await connection.execute(
        `UPDATE sys_failed_jobs SET status = 'resolved', resolved_at = NOW(),
                locked_at = NULL, next_retry_at = NULL, updated_at = NOW(),
                error_message = CONCAT(COALESCE(error_message, ''), '\\n', ?)
          WHERE status <> 'resolved' AND (
            (task_name = 'EventBus:INVENTORY_POSTING_APPROVED'
             AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.args[0].postingDocumentId')) = ?)
            OR (task_name = 'Finance:InventoryPostingApproved'
             AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.postingDocumentId')) = ?))`,
        [note, String(postingId), String(postingId)]
      );
      await connection.commit();
      return proof;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }
}

module.exports = InventoryPostingEventClosureService;
