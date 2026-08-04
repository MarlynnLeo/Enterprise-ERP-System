/**
 * 业财四流状态：业务单据上的 AP/AR/税/成本/GL 闭环状态
 */

const db = require('../../config/db');
const {
  INACTIVE_INVOICE_STATUSES,
  TAX_RELATED_DOCUMENT_TYPES,
  taxRelatedDocumentTypeMatchList,
} = require('../../constants/financeConstants');

const inactivePh = () => INACTIVE_INVOICE_STATUSES.map(() => '?').join(', ');

class FinanceDocumentStatusService {
  static async getPurchaseReceiptStatus(receiptId) {
    const [receipts] = await db.pool.execute(
      `SELECT id, receipt_no, status, order_id, total_amount
       FROM purchase_receipts WHERE id = ? AND deleted_at IS NULL`,
      [receiptId]
    );
    if (!receipts.length) return null;
    const receipt = receipts[0];

    const [ap] = await db.pool.execute(
      `SELECT id, invoice_number, status, total_amount, paid_amount, balance_amount
       FROM ap_invoices
       WHERE source_type = 'purchase_receipt' AND source_id = ?
         AND status NOT IN (${inactivePh()})
       ORDER BY id DESC LIMIT 1`,
      [receiptId, ...INACTIVE_INVOICE_STATUSES]
    );

    const taxTypes = taxRelatedDocumentTypeMatchList(
      TAX_RELATED_DOCUMENT_TYPES.PURCHASE_RECEIPT
    );
    const taxPh = taxTypes.map(() => '?').join(', ');
    const [tax] = await db.pool.execute(
      `SELECT id, invoice_number, status, total_amount
       FROM tax_invoices
       WHERE related_document_type IN (${taxPh})
         AND related_document_id = ?
         AND status <> '已作废'
       ORDER BY id DESC LIMIT 1`,
      [...taxTypes, receiptId]
    );

    let match;
    try {
      const [m] = await db.pool.execute(
        `SELECT id, match_no, status, match_result
         FROM ap_match_headers
         WHERE purchase_receipt_id = ?
         ORDER BY id DESC LIMIT 1`,
        [receiptId]
      );
      match = m[0] || null;
    } catch {
      match = null;
    }

    return {
      documentType: 'purchase_receipt',
      documentId: receipt.id,
      documentNo: receipt.receipt_no,
      businessStatus: receipt.status,
      streams: {
        ap: {
          ok: !!ap[0],
          id: ap[0]?.id || null,
          number: ap[0]?.invoice_number || null,
          status: ap[0]?.status || null,
          balance: ap[0] ? Number(ap[0].balance_amount || 0) : null,
        },
        tax: {
          ok: !!tax[0],
          id: tax[0]?.id || null,
          number: tax[0]?.invoice_number || null,
          status: tax[0]?.status || null,
        },
        threeWayMatch: {
          ok: match?.status === 'confirmed',
          id: match?.id || null,
          number: match?.match_no || null,
          status: match?.status || null,
          result: match?.match_result || null,
        },
      },
      closedLoop: !!(ap[0] && tax[0]),
    };
  }

  static async getSalesOutboundStatus(outboundId) {
    const [rows] = await db.pool.execute(
      `SELECT id, outbound_no, status, order_id, total_amount
       FROM sales_outbound WHERE id = ? AND deleted_at IS NULL`,
      [outboundId]
    );
    if (!rows.length) return null;
    const outbound = rows[0];

    const [ar] = await db.pool.execute(
      `SELECT id, invoice_number, status, total_amount, paid_amount, balance_amount
       FROM ar_invoices
       WHERE source_type = 'sales_outbound' AND source_id = ?
         AND status NOT IN (${inactivePh()})
       ORDER BY id DESC LIMIT 1`,
      [outboundId, ...INACTIVE_INVOICE_STATUSES]
    );

    const taxTypes = taxRelatedDocumentTypeMatchList(
      TAX_RELATED_DOCUMENT_TYPES.SALES_OUTBOUND
    );
    const taxPh = taxTypes.map(() => '?').join(', ');
    const [tax] = await db.pool.execute(
      `SELECT id, invoice_number, status
       FROM tax_invoices
       WHERE related_document_type IN (${taxPh})
         AND related_document_id = ?
         AND status <> '已作废'
       ORDER BY id DESC LIMIT 1`,
      [...taxTypes, outboundId]
    );

    const [cost] = await db.pool.execute(
      `SELECT id, entry_number, is_posted
       FROM gl_entries
       WHERE document_type = 'sales_outbound'
         AND document_number = ?
         AND COALESCE(is_reversed, 0) = 0
       ORDER BY id DESC LIMIT 1`,
      [outbound.outbound_no]
    );

    return {
      documentType: 'sales_outbound',
      documentId: outbound.id,
      documentNo: outbound.outbound_no,
      businessStatus: outbound.status,
      streams: {
        ar: {
          ok: !!ar[0],
          id: ar[0]?.id || null,
          number: ar[0]?.invoice_number || null,
          status: ar[0]?.status || null,
          balance: ar[0] ? Number(ar[0].balance_amount || 0) : null,
        },
        tax: {
          ok: !!tax[0],
          id: tax[0]?.id || null,
          number: tax[0]?.invoice_number || null,
          status: tax[0]?.status || null,
        },
        costGl: {
          ok: !!cost[0],
          id: cost[0]?.id || null,
          number: cost[0]?.entry_number || null,
          posted: cost[0] ? !!cost[0].is_posted : false,
        },
      },
      closedLoop: !!(ar[0] && tax[0] && cost[0]),
    };
  }
}

module.exports = FinanceDocumentStatusService;
