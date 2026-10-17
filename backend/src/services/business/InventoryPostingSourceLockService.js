'use strict';

const PurchaseReceiptSource = require('./PurchaseReceiptPostingSourceService');

const SOURCES = Object.freeze({
  inbound: [
    'inventory_inbound',
    'inbound_no',
    ' AND COALESCE(is_deleted, 0) = 0 AND deleted_at IS NULL',
  ],
  purchase_inbound: [
    'inventory_inbound',
    'inbound_no',
    ' AND COALESCE(is_deleted, 0) = 0 AND deleted_at IS NULL',
  ],
  production_outbound: ['inventory_outbound', 'outbound_no', ' AND deleted_at IS NULL'],
  transfer: ['inventory_transfers', 'transfer_no', ' AND deleted_at IS NULL'],
  outsourced_processing_material: ['outsourced_processings', 'processing_no', ''],
  outsourced_processing_receipt: ['outsourced_processing_receipts', 'receipt_no', ''],
});

function sourceError(message) {
  return Object.assign(new Error(message), { statusCode: 409, code: 'POSTING_SOURCE_CHANGED' });
}

/** Keep the same source -> posting lock order as business document actions. */
class InventoryPostingSourceLockService {
  static async lockSource(connection, posting) {
    // Outbound groups and sales outbounds use their own source lock service.
    // A group reversal may be anchored to an outbound_supplement movement.
    const isGroupReversal =
      posting.source_type === 'outbound' && posting.posting_kind === 'reversal';
    if (
      !isGroupReversal &&
      !SOURCES[posting.source_type] &&
      !['purchase_receipt', 'batch_create'].includes(posting.source_type)
    )
      return null;
    let source = posting;
    if (posting.posting_kind === 'reversal') {
      if (!posting.original_posting_document_id) throw sourceError('冲销过账缺少原始来源');
      const [[original]] = await connection.execute(
        `SELECT id, source_type, source_id, source_no, posting_kind, finance_status, locked, is_legacy
           FROM inventory_posting_documents WHERE id = ?`,
        [posting.original_posting_document_id]
      );
      if (!original || original.posting_kind !== 'movement') {
        throw sourceError('冲销过账与原始来源不一致');
      }
      if (posting.source_type === 'outbound' && original.source_type === 'outbound_supplement') {
        // A whole-outbound reversal may be anchored to its first approved supplement.
        // Resolve the real parent under lock, including legacy supplements without an ID.
        const outbound = await require('./OutboundPostingGroupService').lockSource(
          connection,
          original
        );
        if (
          !Number.isSafeInteger(Number(posting.source_id)) ||
          Number(posting.source_id) <= 0 ||
          Number(posting.source_id) !== Number(outbound.id)
        ) {
          throw sourceError('冲销过账与原始来源不一致');
        }
        return outbound;
      }
      if (original.source_type !== posting.source_type) {
        throw sourceError('冲销过账与原始来源不一致');
      }
      source = original;
    }
    const receiptSource = await PurchaseReceiptSource.resolve(connection, source);
    if (receiptSource) {
      if (posting.posting_kind === 'reversal') {
        throw Object.assign(new Error('采购收货尚不支持原单反审核，请通过采购退货处理已入账收货'), {
          statusCode: 409,
          code: 'REVERSAL_NOT_SUPPORTED',
        });
      }
      const [[identity]] = await connection.execute(
        'SELECT order_id FROM purchase_receipts WHERE id = ? AND deleted_at IS NULL',
        [receiptSource.receiptId]
      );
      if (identity?.order_id)
        await connection.execute('SELECT id FROM purchase_orders WHERE id = ? FOR UPDATE', [
          identity.order_id,
        ]);
      const [[receipt]] = await connection.execute(
        'SELECT id, receipt_no AS source_no, status FROM purchase_receipts WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
        [receiptSource.receiptId]
      );
      if (
        !receipt ||
        receipt.source_no !== receiptSource.receiptNo ||
        receipt.status !== 'completed'
      ) {
        throw sourceError('采购收货单不存在、尚未完成或与过账来源不一致');
      }
      return receipt;
    }
    const definition = SOURCES[source.source_type];
    if (!definition) return null;
    const sourceId = Number(source.source_id);
    const hasSourceId = Number.isSafeInteger(sourceId) && sourceId > 0;
    const sourceNo = String(source.source_no || '').trim();
    if (!hasSourceId && !sourceNo) throw sourceError('库存过账缺少来源单据标识');
    const [table, numberColumn, activeFilter] = definition;
    const [[document]] = await connection.execute(
      `SELECT id, ${numberColumn} AS source_no FROM ${table}
        WHERE ${hasSourceId ? 'id' : numberColumn} = ?${activeFilter}
        LIMIT 1 FOR UPDATE`,
      [hasSourceId ? sourceId : sourceNo]
    );
    if (!document || (sourceNo && document.source_no !== sourceNo)) {
      throw sourceError('库存过账与来源单据不一致或来源已删除');
    }
    return document;
  }
}

module.exports = InventoryPostingSourceLockService;
