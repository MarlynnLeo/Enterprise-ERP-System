#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../src/config/database-config');

const rootDir = path.resolve(__dirname, '..', '..');
const outDir = path.join(rootDir, 'docs');
const jsonPath = path.join(outDir, 'cash-settlement-audit.json');
const mdPath = path.join(outDir, 'cash-settlement-audit.md');

const rules = [
  {
    id: 'ar.receipts_positive_amount',
    severity: 'critical',
    description: 'Active AR receipts must have a positive amount.',
    sql: `
      SELECT id, receipt_number, total_amount
      FROM ar_receipts
      WHERE COALESCE(status, '') <> 'void'
        AND ROUND(COALESCE(total_amount, 0), 2) <= 0
      LIMIT 100
    `,
  },
  {
    id: 'ap.payments_positive_amount',
    severity: 'critical',
    description: 'Active AP payments must have a positive amount.',
    sql: `
      SELECT id, payment_number, total_amount
      FROM ap_payments
      WHERE COALESCE(status, '') <> 'void'
        AND ROUND(COALESCE(total_amount, 0), 2) <= 0
      LIMIT 100
    `,
  },
  {
    id: 'ar.receipt_header_matches_items',
    severity: 'critical',
    description: 'Active AR receipt total must equal the sum of receipt items.',
    sql: `
      SELECT r.id, r.receipt_number, r.total_amount, ROUND(COALESCE(SUM(ri.amount), 0), 2) AS item_total
      FROM ar_receipts r
      LEFT JOIN ar_receipt_items ri ON ri.receipt_id = r.id
      WHERE COALESCE(r.status, '') <> 'void'
      GROUP BY r.id, r.receipt_number, r.total_amount
      HAVING ABS(ROUND(COALESCE(r.total_amount, 0), 2) - item_total) > 0.01
      LIMIT 100
    `,
  },
  {
    id: 'ap.payment_header_matches_items',
    severity: 'critical',
    description: 'Active AP payment total must equal the sum of payment items.',
    sql: `
      SELECT p.id, p.payment_number, p.total_amount, ROUND(COALESCE(SUM(pi.amount), 0), 2) AS item_total
      FROM ap_payments p
      LEFT JOIN ap_payment_items pi ON pi.payment_id = p.id
      WHERE COALESCE(p.status, '') <> 'void'
      GROUP BY p.id, p.payment_number, p.total_amount
      HAVING ABS(ROUND(COALESCE(p.total_amount, 0), 2) - item_total) > 0.01
      LIMIT 100
    `,
  },
  {
    id: 'ar.invoice_paid_balance_matches_receipts',
    severity: 'critical',
    description: 'AR invoice paid and balance amounts must match active receipt allocations.',
    sql: `
      SELECT i.id, i.invoice_number, i.total_amount, i.paid_amount, i.balance_amount,
             ROUND(COALESCE(SUM(CASE WHEN COALESCE(r.status, '') <> 'void' THEN ri.amount ELSE 0 END), 0), 2) AS receipt_total
      FROM ar_invoices i
      LEFT JOIN ar_receipt_items ri ON ri.invoice_id = i.id
      LEFT JOIN ar_receipts r ON r.id = ri.receipt_id
      GROUP BY i.id, i.invoice_number, i.total_amount, i.paid_amount, i.balance_amount
      HAVING ABS(ROUND(COALESCE(i.paid_amount, 0), 2) - receipt_total) > 0.01
          OR ABS(ROUND(COALESCE(i.balance_amount, 0), 2) - ROUND(COALESCE(i.total_amount, 0) - receipt_total, 2)) > 0.01
      LIMIT 100
    `,
  },
  {
    id: 'ap.invoice_paid_balance_matches_payments',
    severity: 'critical',
    description: 'AP invoice paid and balance amounts must match active payment allocations.',
    sql: `
      SELECT i.id, i.invoice_number, i.total_amount, i.paid_amount, i.balance_amount,
             ROUND(COALESCE(SUM(CASE WHEN COALESCE(p.status, '') <> 'void' THEN pi.amount ELSE 0 END), 0), 2) AS payment_total
      FROM ap_invoices i
      LEFT JOIN ap_payment_items pi ON pi.invoice_id = i.id
      LEFT JOIN ap_payments p ON p.id = pi.payment_id
      GROUP BY i.id, i.invoice_number, i.total_amount, i.paid_amount, i.balance_amount
      HAVING ABS(ROUND(COALESCE(i.paid_amount, 0), 2) - payment_total) > 0.01
          OR ABS(ROUND(COALESCE(i.balance_amount, 0), 2) - ROUND(COALESCE(i.total_amount, 0) - payment_total, 2)) > 0.01
      LIMIT 100
    `,
  },
  {
    id: 'ar.bank_backed_receipts_have_bank_transaction',
    severity: 'critical',
    description: 'Bank-backed AR receipts must have one matching approved bank inflow transaction.',
    sql: `
      SELECT r.id, r.receipt_number, r.bank_account_id, r.total_amount
      FROM ar_receipts r
      WHERE COALESCE(r.status, '') <> 'void'
        AND r.payment_method IN ('银行转账', 'bank_transfer', '电子支付', 'credit_card', '信用卡', '支票', 'check', '支付宝', 'alipay', '微信', 'wechat')
        AND NOT EXISTS (
          SELECT 1 FROM bank_transactions bt
          WHERE bt.transaction_number = r.receipt_number
            AND bt.bank_account_id = r.bank_account_id
            AND bt.transaction_type IN ('转入', '存款', '收入', 'income', 'deposit', 'transfer_in')
            AND bt.status = 'approved'
            AND ABS(bt.amount - r.total_amount) <= 0.01
        )
      LIMIT 100
    `,
  },
  {
    id: 'ap.bank_backed_payments_have_bank_transaction',
    severity: 'critical',
    description: 'Bank-backed AP payments must have one matching approved bank outflow transaction.',
    sql: `
      SELECT p.id, p.payment_number, p.bank_account_id, p.total_amount
      FROM ap_payments p
      WHERE COALESCE(p.status, '') <> 'void'
        AND p.payment_method IN ('银行转账', 'bank_transfer', '电子支付', 'credit_card', '信用卡', '支票', 'check', '支付宝', 'alipay', '微信', 'wechat')
        AND NOT EXISTS (
          SELECT 1 FROM bank_transactions bt
          WHERE bt.transaction_number = p.payment_number
            AND bt.bank_account_id = p.bank_account_id
            AND bt.transaction_type IN ('转出', '取款', '支出', 'expense', 'withdrawal', 'transfer_out')
            AND bt.status = 'approved'
            AND ABS(bt.amount - p.total_amount) <= 0.01
        )
      LIMIT 100
    `,
  },
  {
    id: 'ar.receipts_have_finance_voucher',
    severity: 'critical',
    description: 'Active AR receipts must link to a non-reversed finance voucher.',
    sql: `
      SELECT r.id, r.receipt_number
      FROM ar_receipts r
      WHERE COALESCE(r.status, '') <> 'void'
        AND NOT EXISTS (
          SELECT 1
          FROM document_links dl
          JOIN gl_entries ge ON ge.id = dl.target_id
          WHERE dl.source_type = 'ar_receipt'
            AND dl.source_id = r.id
            AND dl.target_type = 'finance_voucher'
            AND COALESCE(ge.is_reversed, 0) = 0
        )
      LIMIT 100
    `,
  },
  {
    id: 'ap.payments_have_finance_voucher',
    severity: 'critical',
    description: 'Active AP payments must link to a non-reversed finance voucher.',
    sql: `
      SELECT p.id, p.payment_number
      FROM ap_payments p
      WHERE COALESCE(p.status, '') <> 'void'
        AND NOT EXISTS (
          SELECT 1
          FROM document_links dl
          JOIN gl_entries ge ON ge.id = dl.target_id
          WHERE dl.source_type = 'ap_payment'
            AND dl.source_id = p.id
            AND dl.target_type = 'finance_voucher'
            AND COALESCE(ge.is_reversed, 0) = 0
        )
      LIMIT 100
    `,
  },
  {
    id: 'bank.business_transactions_have_gl_entry',
    severity: 'high',
    description: 'Approved bank transactions generated by AR/AP documents must point to an existing GL entry.',
    sql: `
      SELECT bt.id, bt.transaction_number, bt.related_invoice_type, bt.gl_entry_id
      FROM bank_transactions bt
      WHERE bt.status = 'approved'
        AND bt.related_invoice_type IN ('AR', 'AP')
        AND (
          bt.gl_entry_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM gl_entries ge WHERE ge.id = bt.gl_entry_id)
        )
      LIMIT 100
    `,
  },
  {
    id: 'bank.account_balance_matches_approved_transactions',
    severity: 'critical',
    description: 'Bank account current balance must equal opening balance plus approved inflows minus approved outflows.',
    sql: `
      SELECT ba.id, ba.account_name, ba.current_balance,
             ROUND(COALESCE(ba.opening_balance, 0) + COALESCE(SUM(
               CASE
                 WHEN bt.status = 'approved' AND bt.transaction_type IN ('存款', '转入', '利息', '收入', 'income', 'deposit', 'transfer_in', 'interest') THEN bt.amount
                 WHEN bt.status = 'approved' AND bt.transaction_type IN ('取款', '转出', '费用', '支出', 'expense', 'withdrawal', 'transfer_out', 'fee') THEN -bt.amount
                 ELSE 0
               END
             ), 0), 2) AS expected_balance
      FROM bank_accounts ba
      LEFT JOIN bank_transactions bt ON bt.bank_account_id = ba.id
      GROUP BY ba.id, ba.account_name, ba.current_balance, ba.opening_balance
      HAVING ABS(ROUND(COALESCE(ba.current_balance, 0), 2) - expected_balance) > 0.01
      LIMIT 100
    `,
  },
  {
    id: 'bank.approved_transactions_have_posted_gl_entry',
    severity: 'critical',
    description: 'Every approved bank transaction must link to an existing, posted, non-reversed GL voucher.',
    sql: `
      SELECT bt.id, bt.transaction_number, bt.transaction_date, bt.transaction_type, bt.amount, bt.gl_entry_id
      FROM bank_transactions bt
      LEFT JOIN gl_entries ge ON ge.id = bt.gl_entry_id
      WHERE bt.status = 'approved'
        AND (
          bt.gl_entry_id IS NULL
          OR ge.id IS NULL
          OR COALESCE(ge.is_reversed, 0) = 1
          OR COALESCE(ge.is_posted, 0) = 0
          OR COALESCE(ge.status, '') <> 'posted'
        )
      LIMIT 100
    `,
  },
  {
    id: 'bank.closed_period_transactions_are_reconciled',
    severity: 'warning',
    nonBlocking: true,
    description: 'Legacy closed accounting periods should not contain approved bank transactions that remain unreconciled with bank statement evidence. Report only; future period closing is blocked by PeriodEndService.',
    sql: `
      SELECT bt.id, bt.transaction_number, bt.bank_account_id, bt.transaction_date, bt.amount, gp.period_name
      FROM bank_transactions bt
      JOIN gl_periods gp ON bt.transaction_date BETWEEN gp.start_date AND gp.end_date
      WHERE bt.status = 'approved'
        AND COALESCE(bt.is_reconciled, 0) = 0
        AND gp.is_closed = 1
      LIMIT 100
    `,
  },
  {
    id: 'bank.reconciliation_matches_have_consistent_status',
    severity: 'high',
    description: 'Reconciliation match rows must connect matched statement items to approved reconciled bank transactions.',
    sql: `
      SELECT m.id, m.statement_item_id, m.bank_transaction_id, bsi.status AS statement_status,
             bt.status AS bank_transaction_status, bt.is_reconciled
      FROM bank_reconciliation_matches m
      JOIN bank_statement_items bsi ON bsi.id = m.statement_item_id
      JOIN bank_transactions bt ON bt.id = m.bank_transaction_id
      WHERE bsi.status <> 'matched'
         OR bt.status <> 'approved'
         OR COALESCE(bt.is_reconciled, 0) <> 1
      LIMIT 100
    `,
  },
  {
    id: 'bank.reconciliation_match_amount_direction_consistent',
    severity: 'critical',
    description: 'The matched bank transaction total and direction must equal the imported bank statement item.',
    sql: `
      SELECT bsi.id, bsi.bank_account_id, bsi.transaction_date, bsi.transaction_type,
             bsi.amount AS statement_amount, ROUND(COALESCE(SUM(bt.amount), 0), 2) AS matched_amount
      FROM bank_statement_items bsi
      JOIN bank_reconciliation_matches m ON m.statement_item_id = bsi.id
      JOIN bank_transactions bt ON bt.id = m.bank_transaction_id
      GROUP BY bsi.id, bsi.bank_account_id, bsi.transaction_date, bsi.transaction_type, bsi.amount
      HAVING ABS(ROUND(COALESCE(bsi.amount, 0), 2) - matched_amount) > 0.01
         OR SUM(
              CASE
                WHEN bsi.transaction_type = 'income'
                 AND bt.transaction_type IN ('存款', '转入', '利息', '收入', 'income', 'deposit', 'transfer_in', 'interest') THEN 0
                WHEN bsi.transaction_type = 'expense'
                 AND bt.transaction_type IN ('取款', '转出', '费用', '支出', 'expense', 'withdrawal', 'transfer_out', 'fee') THEN 0
                ELSE 1
              END
            ) > 0
      LIMIT 100
    `,
  },
  {
    id: 'bank.statement_items_do_not_duplicate_imported_rows',
    severity: 'medium',
    description: 'Imported bank statement rows should not be duplicated within the same bank account.',
    sql: `
      SELECT bank_account_id, transaction_date, transaction_type, amount,
             COALESCE(reference_number, '') AS reference_number,
             COALESCE(counterparty, '') AS counterparty,
             COALESCE(summary, '') AS summary,
             COUNT(*) AS duplicate_count
      FROM bank_statement_items
      GROUP BY bank_account_id, transaction_date, transaction_type, amount,
               COALESCE(reference_number, ''), COALESCE(counterparty, ''), COALESCE(summary, '')
      HAVING COUNT(*) > 1
      LIMIT 100
    `,
  },
  {
    id: 'bank.statement_item_import_account_consistent',
    severity: 'high',
    description: 'Bank statement item account must match its import header account.',
    sql: `
      SELECT bsi.id, bsi.import_id, bsi.bank_account_id, bsi_import.bank_account_id AS import_bank_account_id
      FROM bank_statement_items bsi
      JOIN bank_statement_imports bsi_import ON bsi_import.id = bsi.import_id
      WHERE bsi.bank_account_id <> bsi_import.bank_account_id
      LIMIT 100
    `,
  },
  {
    id: 'bank.matched_statement_items_have_matches',
    severity: 'high',
    description: 'Matched bank statement items must have reconciliation match rows.',
    sql: `
      SELECT bsi.id, bsi.bank_account_id, bsi.transaction_date, bsi.amount, bsi.status
      FROM bank_statement_items bsi
      WHERE bsi.status = 'matched'
        AND NOT EXISTS (
          SELECT 1 FROM bank_reconciliation_matches m WHERE m.statement_item_id = bsi.id
        )
      LIMIT 100
    `,
  },
  {
    id: 'bank.reconciled_transactions_have_statement_match',
    severity: 'medium',
    description: 'Profession-grade reconciliation should match bank transactions to imported bank statement items, not only mark them manually.',
    sql: `
      SELECT bt.id, bt.transaction_number, bt.bank_account_id, bt.transaction_date, bt.amount, bt.is_reconciled
      FROM bank_transactions bt
      WHERE bt.status = 'approved'
        AND bt.is_reconciled = 1
        AND NOT EXISTS (
          SELECT 1 FROM bank_reconciliation_matches m WHERE m.bank_transaction_id = bt.id
        )
      LIMIT 100
    `,
  },
];

async function runRules(connection) {
  const results = [];
  for (const rule of rules) {
    try {
      const [rows] = await connection.query(rule.sql);
      results.push({ ...rule, passed: rows.length === 0, count: rows.length, rows });
    } catch (error) {
      results.push({ ...rule, passed: false, count: null, rows: [], error: error.message });
    }
  }
  return results;
}

function renderMarkdown(report) {
  const lines = [
    '# ERP Cash Settlement Audit',
    '',
    `Generated at: ${report.generatedAt}`,
    '',
    `Summary: ${report.summary.passed}/${report.summary.total} rules passed, ${report.summary.warnings} non-blocking warnings.`,
    '',
    '| Rule | Severity | Result | Count | Blocking |',
    '| --- | --- | --- | ---: | --- |',
  ];

  for (const result of report.results) {
    const resultLabel = result.passed ? 'PASS' : result.nonBlocking ? 'WARN' : 'FAIL';
    lines.push(
      `| ${result.id} | ${result.severity} | ${resultLabel} | ${result.count ?? 'ERR'} | ${result.nonBlocking ? 'No' : 'Yes'} |`
    );
  }

  const failed = report.results.filter((result) => !result.passed && !result.nonBlocking);
  if (failed.length > 0) {
    lines.push('', '## Failed Rules');
    for (const result of failed) {
      lines.push('', `### ${result.id}`, '', result.description);
      if (result.error) {
        lines.push('', `Error: ${result.error}`);
      } else {
        lines.push('', 'Sample rows:', '', '```json');
        lines.push(JSON.stringify(result.rows.slice(0, 10), null, 2));
        lines.push('```');
      }
    }
  }

  const warnings = report.results.filter((result) => !result.passed && result.nonBlocking);
  if (warnings.length > 0) {
    lines.push('', '## Non-Blocking Warnings');
    for (const result of warnings) {
      lines.push('', `### ${result.id}`, '', result.description);
      if (result.error) {
        lines.push('', `Error: ${result.error}`);
      } else {
        lines.push('', 'Sample rows:', '', '```json');
        lines.push(JSON.stringify(result.rows.slice(0, 10), null, 2));
        lines.push('```');
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const connection = await mysql.createConnection(getPoolConfig());
  try {
    const results = await runRules(connection);
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        total: results.length,
        passed: results.filter((result) => result.passed).length,
        failed: results.filter((result) => !result.passed && !result.nonBlocking).length,
        warnings: results.filter((result) => !result.passed && result.nonBlocking).length,
      },
      results,
    };

    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(mdPath, renderMarkdown(report));

    for (const result of results) {
      const status = result.passed ? 'PASS' : result.nonBlocking ? 'WARN' : 'FAIL';
      console.log(`${status} ${result.id} (${result.count ?? 'ERR'})`);
      if (result.error) console.log(`  ${result.error}`);
    }
    console.log(`\nReport: ${path.relative(rootDir, mdPath)}`);

    if (report.summary.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
