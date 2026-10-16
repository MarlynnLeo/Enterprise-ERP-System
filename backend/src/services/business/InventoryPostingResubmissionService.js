'use strict';

const InventoryPostingService = require('../InventoryPostingService');
const PeriodValidationService = require('./PeriodValidationService');
const { readPostingSnapshot } = require('../../utils/inventoryPostingSnapshot');
const PurchaseReceiptSource = require('./PurchaseReceiptPostingSourceService');

/** Re-submit the rejected inventory snapshot, without replaying business quantities/events. */
class InventoryPostingResubmissionService {
  static async resubmit(connection, { sourceType, sourceId, sourceNo, actor }) {
    let document;
    let receiptSource = null;
    if (sourceType === 'purchase_receipt') {
      const [candidates] = await connection.execute(
        `SELECT * FROM inventory_posting_documents
          WHERE source_type IN ('purchase_receipt', 'inbound', 'purchase_inbound', 'batch_create')
            AND source_no = ? AND posting_kind = 'movement' ORDER BY id DESC FOR UPDATE`, [sourceNo]
      );
      for (const candidate of candidates) {
        const receipt = await PurchaseReceiptSource.resolve(connection, candidate);
        if (receipt && receipt.receiptId === Number(sourceId) && receipt.receiptNo === sourceNo) {
          document = candidate;
          receiptSource = receipt;
          break;
        }
      }
    } else {
      [[document]] = await connection.execute(
        `SELECT * FROM inventory_posting_documents
          WHERE source_type = ? AND source_no = ? AND posting_kind = 'movement'
          ORDER BY posting_sequence DESC, id DESC LIMIT 1 FOR UPDATE`, [sourceType, sourceNo]
      );
    }
    if (!document || document.finance_status !== 'rejected') return null;
    if (document.source_id != null && Number(document.source_id) !== Number(sourceId)) {
      throw Object.assign(new Error('库存过账来源与业务单据不一致'), { statusCode: 409 });
    }
    const period = await PeriodValidationService.validateInventoryTransaction(
      document.transaction_date,
      connection
    );
    if (!period.allowed) throw Object.assign(new Error(period.message), { statusCode: 400 });
    const [rows] = await connection.execute(
      'SELECT * FROM inventory_posting_lines WHERE posting_document_id = ? ORDER BY line_no FOR UPDATE',
      [document.id]
    );
    if (!rows.length)
      throw Object.assign(new Error('驳回过账缺少原冻结明细，不能重新提交'), { statusCode: 409 });
    const lines = rows.map((row) => {
      const payload = readPostingSnapshot(row);
      const receiptLine = sourceType === 'purchase_receipt' && receiptSource?.receiptId === Number(sourceId) &&
        !receiptSource.readOnly && payload.transactionType === 'purchase_inbound' &&
        (payload.receiptId == null || Number(payload.receiptId) === Number(sourceId)) &&
        (!payload.receiptNo || payload.receiptNo === sourceNo);
      if ((!receiptLine && payload.referenceType !== sourceType) || payload.referenceNo !== sourceNo) {
        throw Object.assign(new Error('驳回过账明细与来源不一致，不能重新提交'), {
          statusCode: 409,
        });
      }
      return { ...payload, ...(receiptLine ? { referenceType: 'purchase_receipt', receiptId: Number(sourceId), receiptNo: sourceNo } : {}), sourceLineKey: row.source_line_key };
    });
    const result = await InventoryPostingService.stageMovement(
      connection,
      {
        sourceType,
        sourceId: Number(sourceId),
        sourceNo,
        transactionDate: document.transaction_date,
        movementDirection: document.movement_direction,
        businessApprovedById: actor.id,
        businessApprovedBy: actor.label,
        operator: actor.label,
        remark: `重新提交已驳回库存过账 ${document.posting_no}`,
      },
      lines
    );
    return { ...result, financeStatus: 'pending', resubmittedFrom: document.id };
  }
}

module.exports = InventoryPostingResubmissionService;
