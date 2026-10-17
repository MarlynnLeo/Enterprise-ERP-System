'use strict';

// Read-only evidence collection. Never approve, repair, replay, or migrate data.
const mysql = require('mysql2/promise');
const { getBasicConfig } = require('../src/config/database-config');
const { buildCostDocumentNumber } = require('../src/utils/inventoryCostDocumentIdentity');
const { readPostingSnapshot } = require('../src/utils/inventoryPostingSnapshot');
const PurchaseReceiptSource = require('../src/services/business/PurchaseReceiptPostingSourceService');

async function audit() {
  const connection = await mysql.createConnection({ ...getBasicConfig(), connectTimeout: 10000 });
  const report = { capturedAt: new Date().toISOString(), readOnly: true, checks: {} };
  const read = async (name, sql, params = []) => {
    const [rows] = await connection.execute(sql, params);
    report.checks[name] = rows;
    return rows;
  };
  try {
    await connection.query('SET TRANSACTION READ ONLY');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    await read('postingSummary', `SELECT source_type, posting_kind, finance_status, is_legacy, COUNT(*) count
      FROM inventory_posting_documents GROUP BY source_type, posting_kind, finance_status, is_legacy`);
    await read('headerLineMismatches', `SELECT d.id, d.source_type, d.finance_status,
      d.total_quantity, d.total_value, SUM(ABS(l.signed_quantity)) line_quantity,
      SUM(ABS(l.total_value)) line_value FROM inventory_posting_documents d
      LEFT JOIN inventory_posting_lines l ON l.posting_document_id=d.id
      GROUP BY d.id HAVING COUNT(l.id)=0 OR ABS(d.total_quantity-SUM(ABS(l.signed_quantity)))>0.000001
      OR ABS(d.total_value-SUM(ABS(l.total_value)))>0.01`);
    await read('nonLegacyLedgerMismatches', `SELECT d.id, d.source_type, d.finance_status, l.id line_id
      FROM inventory_posting_documents d JOIN inventory_posting_lines l ON l.posting_document_id=d.id
      LEFT JOIN (SELECT posting_line_id,COUNT(*) n,SUM(quantity) qty FROM inventory_ledger
        GROUP BY posting_line_id) il ON il.posting_line_id=l.id
      WHERE d.is_legacy=0 AND ((d.finance_status IN ('approved','reversed')
        AND (COALESCE(il.n,0)<>1 OR ABS(il.qty-l.signed_quantity)>0.000001))
        OR (d.finance_status IN ('pending','rejected') AND COALESCE(il.n,0)>0))`);
    await read('nonLegacyLedgerIdentityMismatches', `SELECT d.id,l.id line_id,il.id ledger_id
      FROM inventory_posting_documents d JOIN inventory_posting_lines l ON l.posting_document_id=d.id
      JOIN inventory_ledger il ON il.posting_line_id=l.id
      WHERE d.is_legacy=0 AND (il.posting_document_id<>d.id OR il.material_id<>l.material_id
        OR il.location_id<>l.location_id OR COALESCE(il.batch_number,'')<>COALESCE(l.batch_number,'')
        OR ABS(il.quantity-l.posted_quantity)>0.000001
        OR ABS(il.total_value-ROUND(l.posted_value,2))>0.000001
        OR ABS(il.unit_cost-l.unit_cost)>0.000001)`);
    await read('newMovementFinanceEvents', `SELECT d.id, d.source_type, d.finance_status,
      COALESCE(e.status,'missing') event_status, e.error_message
      FROM inventory_posting_documents d LEFT JOIN domain_events e
      ON e.event_name='INVENTORY_POSTING_APPROVED'
      AND JSON_UNQUOTE(JSON_EXTRACT(e.payload,'$.postingDocumentId'))=CAST(d.id AS CHAR)
      WHERE d.is_legacy=0 AND d.finance_status IN ('approved','reversed') AND d.posting_kind='movement'`);
    await read('purchaseProvenance', `SELECT d.id, d.source_type, d.source_no, d.finance_status, d.is_legacy,
      d.source_id, COUNT(l.id) line_count,
      SUM(JSON_UNQUOTE(JSON_EXTRACT(l.payload_json,'$.receiptId')) IS NOT NULL) lines_with_receipt_id
      FROM inventory_posting_documents d JOIN inventory_posting_lines l ON l.posting_document_id=d.id
      WHERE l.transaction_type='purchase_inbound' GROUP BY d.id`);
    const [snapshots] = await connection.execute(`SELECT l.*,d.source_no,d.finance_status
      FROM inventory_posting_lines l JOIN inventory_posting_documents d ON d.id=l.posting_document_id
      WHERE d.is_legacy=0 ORDER BY d.id,l.line_no`);
    report.checks.nonLegacySnapshotFailures = [];
    for (const line of snapshots) {
      try { readPostingSnapshot(line); } catch (error) {
        report.checks.nonLegacySnapshotFailures.push({ postingId: line.posting_document_id,
          sourceNo: line.source_no, status: line.finance_status, lineId: line.id,
          code: error.code, message: error.message });
      }
    }
    const [purchaseDocuments] = await connection.execute(`SELECT d.* FROM inventory_posting_documents d
      WHERE d.posting_kind='movement' AND EXISTS (SELECT 1 FROM inventory_posting_lines l
        WHERE l.posting_document_id=d.id AND l.transaction_type='purchase_inbound')`);
    report.checks.purchaseSourceVerification = [];
    for (const document of purchaseDocuments) {
      try {
        report.checks.purchaseSourceVerification.push({ postingId: document.id,
          source: await PurchaseReceiptSource.resolve(connection, document) });
      } catch (error) {
        report.checks.purchaseSourceVerification.push({ postingId: document.id,
          code: error.code, message: error.message });
      }
    }
    await read('completedReceiptWithoutPosting', `SELECT COUNT(*) count,
      SUM(pr.receipt_no LIKE 'NG-%') ng_prefixed, MIN(pr.receipt_date) earliest,MAX(pr.receipt_date) latest
      FROM purchase_receipts pr WHERE pr.deleted_at IS NULL AND pr.status='completed'
      AND NOT EXISTS(SELECT 1 FROM inventory_posting_documents d WHERE d.source_no=pr.receipt_no
        AND d.source_type IN ('purchase_receipt','inbound','purchase_inbound','batch_create'))`);
    await read('completedWarehouseWithoutPosting', `SELECT 'warehouse_inbound' type, COUNT(*) count,
      SUM(inbound_no LIKE 'NG-%') ng_prefixed, MIN(inbound_date) earliest,MAX(inbound_date) latest
      FROM inventory_inbound ib WHERE ib.status='completed' AND ib.deleted_at IS NULL AND COALESCE(ib.is_deleted,0)=0
      AND NOT EXISTS(SELECT 1 FROM inventory_posting_documents d WHERE d.posting_kind='movement'
        AND d.source_type IN ('inbound','purchase_inbound','production_inbound') AND d.source_no=ib.inbound_no)
      UNION ALL SELECT 'warehouse_outbound',COUNT(*),SUM(outbound_no LIKE 'NG-%'),MIN(outbound_date),MAX(outbound_date)
      FROM inventory_outbound ob WHERE ob.status IN ('completed','partial_completed') AND ob.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM inventory_posting_documents d WHERE d.posting_kind='movement'
        AND d.source_type IN ('outbound','production_outbound','outbound_supplement')
        AND (d.source_id=ob.id OR d.source_no=ob.outbound_no))`);
    await read('completedSalesWithoutPosting', `SELECT COUNT(*) count FROM sales_outbound so
      WHERE so.status='completed' AND so.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM inventory_posting_documents d
        WHERE d.posting_kind='movement' AND d.source_type='sales_outbound' AND d.source_no=so.outbound_no)`);
    const lines = await read('newApprovedMovementLines', `SELECT d.id, d.source_no, d.finance_status,
      l.id posting_line_id,l.material_id,l.reference_no,l.transaction_type
      FROM inventory_posting_documents d JOIN inventory_posting_lines l ON l.posting_document_id=d.id
      WHERE d.is_legacy=0 AND d.finance_status IN ('approved','reversed') AND d.posting_kind='movement'`);
    const candidates = [...new Set(lines.flatMap(line => [line.source_no, buildCostDocumentNumber(line),
      buildCostDocumentNumber({ ...line, posting_line_id: null })]))];
    if (candidates.length) {
      // Candidates are evidence for manual reconciliation, not proof that every
      // production/outsourcing posting requires an immediate generic voucher.
      await read('relatedVoucherCandidates', `SELECT e.id,e.document_type,e.document_number,e.status,
        e.is_posted,e.is_reversed,e.reversal_entry_id,COUNT(i.id) item_count,
        SUM(i.debit_amount) debit,SUM(i.credit_amount) credit
        FROM gl_entries e LEFT JOIN gl_entry_items i ON i.entry_id=e.id
        WHERE e.document_number IN (${candidates.map(() => '?').join(',')}) GROUP BY e.id`, candidates);
    }
    return report;
  } finally {
    try { await connection.rollback(); } finally { await connection.end(); }
  }
}

if (require.main === module) {
  audit().then(report => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)).catch(error => {
    process.stderr.write(`Inventory finance audit failed: ${error.code || error.message}\n`);
    process.exitCode = 1;
  });
}
module.exports = { audit };
