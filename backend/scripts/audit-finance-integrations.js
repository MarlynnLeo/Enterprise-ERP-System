#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../src/config/database-config');

const rootDir = path.resolve(__dirname, '..', '..');
const outDir = path.join(rootDir, 'docs');
const jsonPath = path.join(outDir, 'finance-integration-audit.json');
const mdPath = path.join(outDir, 'finance-integration-audit.md');

const rules = [
  {
    id: 'purchase.receipts_generate_ap_invoice',
    severity: 'critical',
    description: 'Completed purchase receipts with amount must have one active AP invoice.',
    sql: `
      SELECT pr.id, pr.receipt_no, pr.total_amount
      FROM purchase_receipts pr
      WHERE pr.status IN ('confirmed', 'completed')
        AND pr.deleted_at IS NULL
        AND COALESCE(pr.total_amount, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM ap_invoices ai
          WHERE ai.source_type = 'purchase_receipt'
            AND ai.source_id = pr.id
            AND ai.status <> '已取消'
        )
    `,
  },
  {
    id: 'purchase.ap_invoice_has_finance_voucher',
    severity: 'critical',
    description: 'AP invoices generated from purchase receipts must be linked to a finance voucher.',
    sql: `
      SELECT ai.id, ai.invoice_number, ai.source_id
      FROM ap_invoices ai
      WHERE ai.source_type = 'purchase_receipt'
        AND ai.status <> '已取消'
        AND COALESCE(ai.total_amount, 0) <> 0
        AND NOT EXISTS (
          SELECT 1
          FROM document_links dl
          JOIN gl_entries ge ON ge.id = dl.target_id
          WHERE dl.source_type = 'ap_invoice'
            AND dl.source_id = ai.id
            AND dl.target_type = 'finance_voucher'
            AND COALESCE(ge.is_reversed, 0) = 0
        )
    `,
  },
  {
    id: 'purchase.receipts_generate_input_tax_invoice',
    severity: 'high',
    description: 'Completed purchase receipts with amount must have an input tax invoice link.',
    sql: `
      SELECT pr.id, pr.receipt_no, pr.total_amount
      FROM purchase_receipts pr
      WHERE pr.status IN ('confirmed', 'completed')
        AND pr.deleted_at IS NULL
        AND COALESCE(pr.total_amount, 0) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM document_links dl
          JOIN tax_invoices ti ON ti.id = dl.target_id
          WHERE dl.source_type = 'purchase_receipt'
            AND dl.source_id = pr.id
            AND dl.target_type = 'tax_invoice'
            AND ti.invoice_type = '进项'
            AND ti.status <> '已作废'
        )
    `,
  },
  {
    id: 'sales.outbound_orders_generate_ar_invoice',
    severity: 'critical',
    description: 'Completed sales outbound source orders must have active AR invoices.',
    sql: `
      SELECT DISTINCT so.id AS outbound_id, so.outbound_no, ord.id AS order_id, ord.order_no
      FROM sales_outbound so
      LEFT JOIN sales_outbound_items soi ON soi.outbound_id = so.id
      JOIN sales_orders ord ON ord.id = COALESCE(soi.source_order_id, so.order_id)
      WHERE so.status = 'completed'
        AND so.deleted_at IS NULL
        AND ord.deleted_at IS NULL
        AND COALESCE(ord.total_amount, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM ar_invoices ai
          WHERE ai.source_type = 'sales_order'
            AND ai.source_id = ord.id
            AND ai.status <> '已取消'
        )
    `,
  },
  {
    id: 'sales.ar_invoice_has_finance_voucher',
    severity: 'critical',
    description: 'AR invoices generated from sales orders must be linked to a finance voucher.',
    sql: `
      SELECT ai.id, ai.invoice_number, ai.source_id
      FROM ar_invoices ai
      WHERE ai.source_type = 'sales_order'
        AND ai.status <> '已取消'
        AND COALESCE(ai.total_amount, 0) <> 0
        AND NOT EXISTS (
          SELECT 1
          FROM document_links dl
          JOIN gl_entries ge ON ge.id = dl.target_id
          WHERE dl.source_type = 'ar_invoice'
            AND dl.source_id = ai.id
            AND dl.target_type = 'finance_voucher'
            AND COALESCE(ge.is_reversed, 0) = 0
        )
    `,
  },
  {
    id: 'sales.outbound_generates_cost_voucher',
    severity: 'critical',
    description: 'Completed sales outbound documents with amount must have a posted cost voucher.',
    sql: `
      SELECT so.id, so.outbound_no, so.total_amount
      FROM sales_outbound so
      WHERE so.status = 'completed'
        AND so.deleted_at IS NULL
        AND COALESCE(so.total_amount, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM gl_entries ge
          WHERE ge.document_type = 'sales_outbound'
            AND ge.document_number = so.outbound_no
            AND ge.status = 'posted'
            AND COALESCE(ge.is_reversed, 0) = 0
        )
    `,
  },
  {
    id: 'sales.outbound_generates_output_tax_invoice',
    severity: 'high',
    description: 'Completed sales outbound documents with amount must have an output tax invoice link.',
    sql: `
      SELECT so.id, so.outbound_no, so.total_amount
      FROM sales_outbound so
      WHERE so.status = 'completed'
        AND so.deleted_at IS NULL
        AND COALESCE(so.total_amount, 0) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM document_links dl
          JOIN tax_invoices ti ON ti.id = dl.target_id
          WHERE dl.source_type = 'sales_outbound'
            AND dl.source_id = so.id
            AND dl.target_type = 'tax_invoice'
            AND ti.invoice_type = '销项'
            AND ti.status <> '已作废'
        )
    `,
  },
  {
    id: 'production.completed_tasks_have_material_voucher',
    severity: 'critical',
    description: 'Completed production tasks with material cost must have material issue voucher.',
    sql: `
      SELECT pt.id, pt.code, pt.material_cost
      FROM production_tasks pt
      WHERE pt.status = 'completed'
        AND pt.deleted_at IS NULL
        AND COALESCE(pt.material_cost, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM gl_entries ge
          WHERE ge.transaction_id = pt.id
            AND ge.transaction_type IN ('PRODUCTION_MATERIAL', 'PRODUCTION_MATERIAL_ZERO_REPAIR')
            AND ge.status = 'posted'
            AND COALESCE(ge.is_reversed, 0) = 0
        )
    `,
  },
  {
    id: 'production.completed_tasks_have_labor_voucher',
    severity: 'critical',
    description: 'Completed production tasks with labor cost must have labor allocation voucher.',
    sql: `
      SELECT pt.id, pt.code, pt.labor_cost
      FROM production_tasks pt
      WHERE pt.status = 'completed'
        AND pt.deleted_at IS NULL
        AND COALESCE(pt.labor_cost, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM gl_entries ge
          WHERE ge.transaction_id = pt.id
            AND ge.transaction_type = 'PRODUCTION_LABOR'
            AND ge.status = 'posted'
            AND COALESCE(ge.is_reversed, 0) = 0
        )
    `,
  },
  {
    id: 'production.completed_tasks_have_overhead_voucher',
    severity: 'critical',
    description: 'Completed production tasks with overhead cost must have overhead allocation voucher.',
    sql: `
      SELECT pt.id, pt.code, pt.overhead_cost
      FROM production_tasks pt
      WHERE pt.status = 'completed'
        AND pt.deleted_at IS NULL
        AND COALESCE(pt.overhead_cost, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM gl_entries ge
          WHERE ge.transaction_id = pt.id
            AND ge.transaction_type = 'PRODUCTION_OVERHEAD'
            AND ge.status = 'posted'
            AND COALESCE(ge.is_reversed, 0) = 0
        )
    `,
  },
  {
    id: 'production.completed_tasks_have_completion_voucher',
    severity: 'critical',
    description: 'Completed production tasks with actual cost must have finished goods completion voucher.',
    sql: `
      SELECT pt.id, pt.code, pt.actual_cost
      FROM production_tasks pt
      WHERE pt.status = 'completed'
        AND pt.deleted_at IS NULL
        AND COALESCE(pt.actual_cost, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM gl_entries ge
          WHERE ge.transaction_id = pt.id
            AND ge.transaction_type = 'PRODUCTION_COMPLETE'
            AND ge.status = 'posted'
            AND COALESCE(ge.is_reversed, 0) = 0
        )
    `,
  },
  {
    id: 'production.voucher_document_type_clean',
    severity: 'high',
    description: 'Production vouchers must use clean document types, not legacy question-mark placeholders.',
    sql: `
      SELECT id, entry_number, document_type, document_number, transaction_type
      FROM gl_entries
      WHERE transaction_type IN (
          'PRODUCTION_MATERIAL',
          'PRODUCTION_MATERIAL_ZERO_REPAIR',
          'PRODUCTION_LABOR',
          'PRODUCTION_OVERHEAD',
          'PRODUCTION_COMPLETE'
        )
        AND (document_type IS NULL OR document_type LIKE '%?%')
    `,
  },
  {
    id: 'integration.source_links_valid',
    severity: 'critical',
    description: 'Finance integration source references must point to existing source documents.',
    sql: `
      SELECT 'ap_invoice' AS object_type, ai.id, ai.invoice_number AS object_no, ai.source_type, ai.source_id
      FROM ap_invoices ai
      LEFT JOIN purchase_receipts pr ON ai.source_type = 'purchase_receipt' AND ai.source_id = pr.id
      WHERE ai.source_type = 'purchase_receipt' AND pr.id IS NULL
      UNION ALL
      SELECT 'ar_invoice' AS object_type, ai.id, ai.invoice_number AS object_no, ai.source_type, ai.source_id
      FROM ar_invoices ai
      LEFT JOIN sales_orders so ON ai.source_type = 'sales_order' AND ai.source_id = so.id
      WHERE ai.source_type = 'sales_order' AND so.id IS NULL
      UNION ALL
      SELECT 'tax_invoice' AS object_type, ti.id, ti.invoice_number AS object_no, dl.source_type, dl.source_id
      FROM document_links dl
      JOIN tax_invoices ti ON ti.id = dl.target_id
      LEFT JOIN purchase_receipts pr ON dl.source_type = 'purchase_receipt' AND dl.source_id = pr.id
      LEFT JOIN sales_outbound so ON dl.source_type = 'sales_outbound' AND dl.source_id = so.id
      WHERE dl.target_type = 'tax_invoice'
        AND ((dl.source_type = 'purchase_receipt' AND pr.id IS NULL)
          OR (dl.source_type = 'sales_outbound' AND so.id IS NULL))
    `,
  },
  {
    id: 'integration.document_links_targets_exist',
    severity: 'critical',
    description: 'Finance integration document links must point to existing target records.',
    sql: `
      SELECT dl.id, dl.source_type, dl.source_id, dl.target_type, dl.target_id
      FROM document_links dl
      LEFT JOIN gl_entries ge ON dl.target_type = 'finance_voucher' AND ge.id = dl.target_id
      LEFT JOIN ar_invoices ar ON dl.target_type = 'ar_invoice' AND ar.id = dl.target_id
      LEFT JOIN ap_invoices ap ON dl.target_type = 'ap_invoice' AND ap.id = dl.target_id
      LEFT JOIN tax_invoices ti ON dl.target_type = 'tax_invoice' AND ti.id = dl.target_id
      WHERE dl.target_type IN ('finance_voucher', 'ar_invoice', 'ap_invoice', 'tax_invoice')
        AND ge.id IS NULL
        AND ar.id IS NULL
        AND ap.id IS NULL
        AND ti.id IS NULL
    `,
  },
  {
    id: 'integration.gl_entries_balanced',
    severity: 'critical',
    description: 'All GL entries generated by finance integrations must be balanced.',
    sql: `
      SELECT e.id, e.entry_number, e.document_type, e.document_number, e.transaction_type,
             ROUND(SUM(COALESCE(i.debit_amount, 0)), 2) AS debit_total,
             ROUND(SUM(COALESCE(i.credit_amount, 0)), 2) AS credit_total
      FROM gl_entries e
      JOIN gl_entry_items i ON i.entry_id = e.id
      WHERE e.status IN ('posted', 'reversed')
        AND (
          e.document_type IN ('sales_outbound', '发票', '收款单', '付款单', '转账单')
          OR e.transaction_type LIKE 'PRODUCTION_%'
          OR EXISTS (
            SELECT 1 FROM document_links dl
            WHERE dl.target_type = 'finance_voucher'
              AND dl.target_id = e.id
          )
        )
      GROUP BY e.id, e.entry_number, e.document_type, e.document_number, e.transaction_type
      HAVING ABS(debit_total - credit_total) > 0.01
    `,
  },
  {
    id: 'cash.ar_receipts_have_valid_voucher',
    severity: 'critical',
    description: 'AR receipts must have valid finance voucher links.',
    sql: `
      SELECT r.id, r.receipt_number
      FROM ar_receipts r
      WHERE r.status <> 'void'
        AND COALESCE(r.total_amount, 0) <> 0
        AND NOT EXISTS (
          SELECT 1
          FROM document_links dl
          JOIN gl_entries ge ON ge.id = dl.target_id
          WHERE dl.source_type = 'ar_receipt'
            AND dl.source_id = r.id
            AND dl.target_type = 'finance_voucher'
            AND COALESCE(ge.is_reversed, 0) = 0
        )
    `,
  },
  {
    id: 'cash.ap_payments_have_valid_voucher',
    severity: 'critical',
    description: 'AP payments must have valid finance voucher links.',
    sql: `
      SELECT p.id, p.payment_number
      FROM ap_payments p
      WHERE p.status <> 'void'
        AND COALESCE(p.total_amount, 0) <> 0
        AND NOT EXISTS (
          SELECT 1
          FROM document_links dl
          JOIN gl_entries ge ON ge.id = dl.target_id
          WHERE dl.source_type = 'ap_payment'
            AND dl.source_id = p.id
            AND dl.target_type = 'finance_voucher'
            AND COALESCE(ge.is_reversed, 0) = 0
        )
    `,
  },
  {
    id: 'cash.bank_transaction_gl_links_valid',
    severity: 'critical',
    description: 'Bank transaction GL links must point to balanced GL entries.',
    sql: `
      SELECT bt.id, bt.transaction_number, bt.gl_entry_id
      FROM bank_transactions bt
      LEFT JOIN gl_entries ge ON ge.id = bt.gl_entry_id
      WHERE bt.gl_entry_id IS NOT NULL
        AND ge.id IS NULL
    `,
  },
  {
    id: 'expense.paid_expenses_have_bank_and_voucher',
    severity: 'critical',
    description: 'Paid expenses must have a bank transaction and a valid finance voucher.',
    sql: `
      SELECT e.id, e.expense_number, e.amount, e.payment_transaction_id
      FROM expenses e
      LEFT JOIN bank_transactions bt ON bt.id = e.payment_transaction_id
      LEFT JOIN gl_entries ge ON ge.id = bt.gl_entry_id AND COALESCE(ge.is_reversed, 0) = 0
      WHERE e.status = 'paid'
        AND e.deleted_at IS NULL
        AND COALESCE(e.amount, 0) > 0
        AND (bt.id IS NULL OR ge.id IS NULL)
    `,
  },
  {
    id: 'asset.impairments_have_voucher',
    severity: 'critical',
    description: 'Asset impairment records must have a valid finance voucher.',
    sql: `
      SELECT ai.id, ai.asset_id, ai.impairment_amount, ai.gl_entry_id
      FROM asset_impairments ai
      LEFT JOIN gl_entries ge ON ge.id = ai.gl_entry_id AND COALESCE(ge.is_reversed, 0) = 0
      WHERE COALESCE(ai.impairment_amount, 0) > 0
        AND ge.id IS NULL
    `,
  },
  {
    id: 'cash.cash_transactions_have_voucher',
    severity: 'critical',
    description: 'Approved cash income and expense transactions must have a valid finance voucher.',
    sql: `
      SELECT ct.id, ct.transaction_number, ct.amount, ct.status, ct.gl_entry_id
      FROM cash_transactions ct
      LEFT JOIN gl_entries ge ON ge.id = ct.gl_entry_id AND COALESCE(ge.is_reversed, 0) = 0
      WHERE ct.status = 'approved'
        AND COALESCE(ct.amount, 0) > 0
        AND ge.id IS NULL
    `,
  },
  {
    id: 'returns.completed_returns_have_credit_notes',
    severity: 'high',
    description: 'Completed purchase and sales returns must have corresponding credit-note invoices.',
    sql: `
      SELECT 'sales_return' AS source_type, sr.id, sr.return_no AS source_no
      FROM sales_returns sr
      WHERE sr.status = 'completed'
        AND sr.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM ar_invoices ai
          WHERE ai.source_type = 'sales_return'
            AND ai.source_id = sr.id
            AND ai.status <> '已取消'
        )
      UNION ALL
      SELECT 'purchase_return' AS source_type, pr.id, pr.return_no AS source_no
      FROM purchase_returns pr
      WHERE pr.status IN ('completed', 'confirmed', 'approved')
        AND COALESCE(pr.total_amount, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM ap_invoices ai
          WHERE ai.source_type = 'purchase_return'
            AND ai.source_id = pr.id
            AND ai.status <> '已取消'
        )
    `,
  },
  {
    id: 'outsourced.completed_documents_have_vouchers',
    severity: 'critical',
    description: 'Confirmed outsourced issue and receipt documents must have finance vouchers.',
    sql: `
      SELECT 'outsourced_processing' AS source_type, op.id, op.processing_no AS source_no
      FROM outsourced_processings op
      WHERE op.status IN ('confirmed', 'processing', 'completed')
        AND NOT EXISTS (
          SELECT 1 FROM gl_entries ge
          WHERE ge.document_type = 'outsourced_issue'
            AND ge.document_number = op.processing_no
            AND COALESCE(ge.is_reversed, 0) = 0
        )
      UNION ALL
      SELECT 'outsourced_receipt' AS source_type, r.id, r.receipt_no AS source_no
      FROM outsourced_processing_receipts r
      WHERE r.status IN ('confirmed', 'completed')
        AND NOT EXISTS (
          SELECT 1 FROM gl_entries ge
          WHERE ge.document_type = 'outsourced_receipt'
            AND ge.document_number = r.receipt_no
            AND COALESCE(ge.is_reversed, 0) = 0
        )
    `,
  },
  {
    id: 'tax.accounting_documents_have_vouchers',
    severity: 'critical',
    description: 'Certified tax invoices and filed/paid tax returns must have valid finance vouchers.',
    sql: `
      SELECT 'tax_invoice' AS source_type, ti.id, ti.invoice_number AS source_no, ti.gl_entry_id
      FROM tax_invoices ti
      LEFT JOIN gl_entries ge ON ge.id = ti.gl_entry_id AND COALESCE(ge.is_reversed, 0) = 0
      WHERE ti.status IN ('已认证', '已抵扣')
        AND COALESCE(ti.tax_amount, 0) > 0
        AND ge.id IS NULL
      UNION ALL
      SELECT 'tax_return' AS source_type, tr.id, tr.return_period AS source_no, tr.gl_entry_id
      FROM tax_returns tr
      LEFT JOIN gl_entries ge ON ge.id = tr.gl_entry_id AND COALESCE(ge.is_reversed, 0) = 0
      WHERE tr.status IN ('已申报', '已缴纳')
        AND COALESCE(tr.tax_payable, 0) > 0
        AND ge.id IS NULL
    `,
  },
  {
    id: 'integration.no_duplicate_active_gl_document',
    severity: 'high',
    description: 'Active integration GL vouchers must not be duplicated for the same source.',
    sql: `
      SELECT COALESCE(transaction_type, document_type) AS voucher_type,
             COALESCE(CAST(transaction_id AS CHAR), document_number) AS source_key,
             COUNT(*) AS active_count
      FROM gl_entries
      WHERE COALESCE(is_reversed, 0) = 0
        AND status <> 'reversed'
        AND (
          transaction_type LIKE 'PRODUCTION_%'
          OR document_type IN ('sales_outbound', '发票', '收款单', '付款单', '转账单')
        )
        AND COALESCE(CAST(transaction_id AS CHAR), document_number) IS NOT NULL
      GROUP BY COALESCE(transaction_type, document_type), COALESCE(CAST(transaction_id AS CHAR), document_number)
      HAVING active_count > 1
    `,
  },
];

async function runRules(connection) {
  const results = [];
  for (const rule of rules) {
    try {
      const [rows] = await connection.query(rule.sql);
      results.push({
        ...rule,
        count: rows.length,
        rows,
        passed: rows.length === 0,
      });
    } catch (error) {
      results.push({
        ...rule,
        count: null,
        rows: [],
        error: error.message,
        passed: false,
      });
    }
  }
  return results;
}

function renderMarkdown(report) {
  const lines = [
    '# ERP Finance Integration Audit',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Overall result: ${report.passed ? 'PASS' : 'FAIL'}`,
    '',
    '| Area | Result | Count |',
    '| --- | --- | --- |',
    `| Integration rules | ${report.failedRules.length === 0 ? 'PASS' : 'FAIL'} | ${report.failedRules.length} failed |`,
    '',
    '## Rules',
    '',
    '| Rule | Severity | Result | Count |',
    '| --- | --- | --- | --- |',
  ];

  for (const result of report.results) {
    const status = result.error ? 'ERROR' : result.passed ? 'PASS' : 'FAIL';
    lines.push(`| \`${result.id}\` | ${result.severity} | ${status} | ${result.count ?? 'n/a'} |`);
  }

  if (report.failedRules.length > 0) {
    lines.push('', '## Failed Rule Samples', '', '```json');
    lines.push(JSON.stringify(
      report.failedRules.map((rule) => ({
        id: rule.id,
        severity: rule.severity,
        description: rule.description,
        error: rule.error,
        rows: rule.rows.slice(0, 30),
      })),
      null,
      2
    ));
    lines.push('```');
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const connection = await mysql.createConnection(getPoolConfig());
  try {
    const results = await runRules(connection);
    const failedRules = results.filter((result) => !result.passed);
    const report = {
      passed: failedRules.length === 0,
      summary: {
        ruleCount: results.length,
        failedRuleCount: failedRules.length,
      },
      results,
      failedRules,
    };

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdPath, renderMarkdown(report));

    console.log(`Finance integration audit complete: ${report.passed ? 'PASS' : 'FAIL'}`);
    console.log(`JSON: ${jsonPath}`);
    console.log(`Markdown: ${mdPath}`);
    process.exit(report.passed ? 0 : 2);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Finance integration audit failed to run:', error.message);
  process.exit(1);
});
