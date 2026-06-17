/**
 * Data consistency rules for ERP closure audits.
 *
 * The rules are intentionally declarative: tests can validate that every
 * professional closure has a rule, and operators can execute them against a
 * real database to find residual data problems.
 */

const DEFAULT_RULE_TIMEOUT_MS = Number(process.env.DATA_CONSISTENCY_RULE_TIMEOUT_MS || 30000);

const sqlLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;
const sqlList = (values) => values.map(sqlLiteral).join(', ');

const financeInvoicePostedStatuses = [
  '已确认',
  '部分付款',
  '已付款',
  '已逾期',
  'confirmed',
  'partial_paid',
  'paid',
  'overdue',
];

const bankInflowTypes = [
  '存款',
  '转入',
  '利息',
  '收入',
  'income',
  'deposit',
  'transfer_in',
  'interest',
];

const bankOutflowTypes = [
  '取款',
  '转出',
  '费用',
  '支出',
  'expense',
  'withdrawal',
  'transfer_out',
  'fee',
];

const consistencyRules = [
  {
    id: 'gl.posted_entries_balanced',
    severity: 'critical',
    closure: 'recordToReport',
    description: 'Posted GL entries must balance debit and credit.',
    sql: `
      SELECT e.id, e.entry_number,
             ROUND(SUM(COALESCE(i.debit_amount, 0)), 2) AS debit_total,
             ROUND(SUM(COALESCE(i.credit_amount, 0)), 2) AS credit_total
      FROM gl_entries e
      JOIN gl_entry_items i ON i.entry_id = e.id
      WHERE e.status IN ('posted', 'reversed')
      GROUP BY e.id, e.entry_number
      HAVING ABS(debit_total - credit_total) > 0.01
    `,
  },
  {
    id: 'gl.posted_entries_have_items',
    severity: 'critical',
    closure: 'recordToReport',
    description: 'Posted GL entries must have at least two line items.',
    sql: `
      SELECT e.id, e.entry_number, COUNT(i.id) AS item_count
      FROM gl_entries e
      LEFT JOIN gl_entry_items i ON i.entry_id = e.id
      WHERE e.status IN ('posted', 'reversed') OR COALESCE(e.is_posted, 0) = 1
      GROUP BY e.id, e.entry_number
      HAVING item_count < 2
    `,
  },
  {
    id: 'gl.reversed_entries_have_reversal',
    severity: 'critical',
    closure: 'recordToReport',
    description: 'Reversed GL entries must point to an existing balanced reversal entry.',
    sql: `
      SELECT e.id, e.entry_number, e.reversal_entry_id
      FROM gl_entries e
      LEFT JOIN gl_entries r ON r.id = e.reversal_entry_id
      LEFT JOIN (
        SELECT entry_id,
               ROUND(SUM(COALESCE(debit_amount, 0)), 2) AS debit_total,
               ROUND(SUM(COALESCE(credit_amount, 0)), 2) AS credit_total
        FROM gl_entry_items
        GROUP BY entry_id
      ) totals ON totals.entry_id = r.id
      WHERE COALESCE(e.is_reversed, 0) = 1
        AND (
          e.reversal_entry_id IS NULL
          OR r.id IS NULL
          OR ABS(COALESCE(totals.debit_total, 0) - COALESCE(totals.credit_total, 0)) > 0.01
        )
    `,
  },
  {
    id: 'inventory.completed_inbound_has_ledger',
    severity: 'critical',
    closure: 'inventoryControl',
    description: 'Completed inbound documents must have inventory ledger entries.',
    sql: `
      SELECT i.id, i.inbound_no
      FROM inventory_inbound i
      LEFT JOIN inventory_ledger l
        ON l.reference_no = i.inbound_no AND l.reference_type IN ('inbound', 'purchase_receipt', 'purchase_inbound')
      WHERE i.status = 'completed' AND COALESCE(i.is_deleted, 0) = 0
      GROUP BY i.id, i.inbound_no
      HAVING COUNT(l.id) = 0
    `,
  },
  {
    id: 'inventory.completed_outbound_has_ledger',
    severity: 'critical',
    closure: 'inventoryControl',
    description: 'Completed outbound documents must have inventory ledger entries.',
    sql: `
      SELECT o.id, o.outbound_no
      FROM inventory_outbound o
      LEFT JOIN inventory_ledger l
        ON l.reference_no = o.outbound_no AND l.reference_type IN ('outbound', 'sales_outbound', 'production_issue')
      WHERE o.status IN ('completed', 'partial_completed') AND o.deleted_at IS NULL
      GROUP BY o.id, o.outbound_no
      HAVING COUNT(l.id) = 0
    `,
  },
  {
    id: 'inventory.inbound_ledger_has_cost_value',
    severity: 'critical',
    closure: 'inventoryControl',
    description: 'Inbound inventory ledger rows with quantity must carry a positive unit cost and total value.',
    sql: `
      SELECT l.id, l.transaction_no, l.reference_no, l.material_id, l.quantity, l.unit_cost, l.total_value
      FROM inventory_ledger l
      WHERE COALESCE(l.quantity, 0) > 0.000001
        AND (COALESCE(l.unit_cost, 0) <= 0 OR COALESCE(l.total_value, 0) <= 0)
    `,
  },
  {
    id: 'inventory.outbound_ledger_has_cost_value',
    severity: 'critical',
    closure: 'inventoryControl',
    description: 'Outbound inventory ledger rows with quantity must carry a positive unit cost and total value.',
    sql: `
      SELECT l.id, l.transaction_no, l.reference_no, l.material_id, l.quantity, l.unit_cost, l.total_value
      FROM inventory_ledger l
      WHERE COALESCE(l.quantity, 0) < -0.000001
        AND (COALESCE(l.unit_cost, 0) <= 0 OR COALESCE(l.total_value, 0) <= 0)
    `,
  },
  {
    id: 'purchase.completed_orders_not_over_received',
    severity: 'high',
    closure: 'procureToPay',
    description: 'Purchase order received quantities must not exceed ordered quantities.',
    sql: `
      SELECT poi.order_id, poi.material_id, poi.quantity, poi.received_quantity
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.order_id
      WHERE po.deleted_at IS NULL
        AND COALESCE(poi.received_quantity, 0) - COALESCE(poi.quantity, 0) > 0.000001
    `,
  },
  {
    id: 'sales.shipped_orders_not_over_shipped',
    severity: 'high',
    closure: 'orderToCash',
    description: 'Sales order shipped quantities must not exceed ordered quantities.',
    sql: `
      SELECT soi.order_id, soi.material_id, soi.quantity,
             COALESCE(SUM(CASE WHEN sob.id IS NOT NULL THEN sobi.quantity ELSE 0 END), 0) AS shipped_quantity
      FROM sales_order_items soi
      JOIN sales_orders so ON so.id = soi.order_id
      LEFT JOIN sales_outbound_items sobi ON sobi.source_order_id = soi.order_id
        AND sobi.product_id = soi.material_id
      LEFT JOIN sales_outbound sob ON sob.id = sobi.outbound_id
        AND sob.status IN ('processing', 'completed')
      WHERE so.deleted_at IS NULL
      GROUP BY soi.order_id, soi.material_id, soi.quantity
      HAVING shipped_quantity - COALESCE(soi.quantity, 0) > 0.000001
    `,
  },
  {
    id: 'production.reports_not_over_task_quantity',
    severity: 'high',
    closure: 'planToProduce',
    description: 'Production report quantities must not exceed task quantity.',
    sql: `
      SELECT t.id AS task_id, t.quantity, COALESCE(SUM(r.completed_quantity), 0) AS reported_quantity
      FROM production_tasks t
      LEFT JOIN production_reports r ON r.task_id = t.id
      WHERE t.deleted_at IS NULL
      GROUP BY t.id, t.quantity
      HAVING reported_quantity - COALESCE(t.quantity, 0) > 0.000001
    `,
  },
  {
    id: 'finance.ap_confirmed_invoice_has_gl_entry',
    severity: 'critical',
    closure: 'procureToPay',
    description: 'Confirmed or paid AP invoices must link to an active GL entry.',
    sql: `
      SELECT i.id, i.invoice_number, i.status, i.total_amount
      FROM ap_invoices i
      LEFT JOIN document_links dl
        ON dl.source_type = 'ap_invoice'
       AND dl.source_id = i.id
       AND dl.target_type = 'finance_voucher'
      LEFT JOIN gl_entries ge
        ON ge.id = dl.target_id
       AND COALESCE(ge.is_reversed, 0) = 0
      WHERE i.status IN (${sqlList(financeInvoicePostedStatuses)})
      GROUP BY i.id, i.invoice_number, i.status, i.total_amount
      HAVING COUNT(ge.id) = 0
    `,
  },
  {
    id: 'finance.ap_invoice_balance_matches_payments',
    severity: 'critical',
    closure: 'procureToPay',
    description: 'AP invoice balance must equal total minus approved payments.',
    sql: `
      SELECT i.id, i.invoice_number, i.total_amount, i.balance_amount,
             COALESCE(SUM(CASE WHEN p.id IS NOT NULL THEN pi.amount ELSE 0 END), 0) AS paid_amount
      FROM ap_invoices i
      LEFT JOIN ap_payment_items pi ON pi.invoice_id = i.id
      LEFT JOIN ap_payments p ON p.id = pi.payment_id AND p.status <> 'void'
      WHERE i.status NOT IN ('cancelled', 'void')
      GROUP BY i.id, i.invoice_number, i.total_amount, i.balance_amount
      HAVING ABS(COALESCE(i.balance_amount, 0) - (COALESCE(i.total_amount, 0) - paid_amount)) > 0.01
    `,
  },
  {
    id: 'finance.ar_confirmed_invoice_has_gl_entry',
    severity: 'critical',
    closure: 'orderToCash',
    description: 'Confirmed or paid AR invoices must link to an active GL entry.',
    sql: `
      SELECT i.id, i.invoice_number, i.status, i.total_amount
      FROM ar_invoices i
      LEFT JOIN document_links dl
        ON dl.source_type = 'ar_invoice'
       AND dl.source_id = i.id
       AND dl.target_type = 'finance_voucher'
      LEFT JOIN gl_entries ge
        ON ge.id = dl.target_id
       AND COALESCE(ge.is_reversed, 0) = 0
      WHERE i.status IN (${sqlList(financeInvoicePostedStatuses)})
      GROUP BY i.id, i.invoice_number, i.status, i.total_amount
      HAVING COUNT(ge.id) = 0
    `,
  },
  {
    id: 'finance.ar_invoice_balance_matches_receipts',
    severity: 'critical',
    closure: 'orderToCash',
    description: 'AR invoice balance must equal total minus approved receipts.',
    sql: `
      SELECT i.id, i.invoice_number, i.total_amount, i.balance_amount,
             COALESCE(SUM(CASE WHEN r.id IS NOT NULL THEN ri.amount ELSE 0 END), 0) AS received_amount
      FROM ar_invoices i
      LEFT JOIN ar_receipt_items ri ON ri.invoice_id = i.id
      LEFT JOIN ar_receipts r ON r.id = ri.receipt_id AND r.status <> 'void'
      WHERE i.status NOT IN ('cancelled', 'void')
      GROUP BY i.id, i.invoice_number, i.total_amount, i.balance_amount
      HAVING ABS(COALESCE(i.balance_amount, 0) - (COALESCE(i.total_amount, 0) - received_amount)) > 0.01
    `,
  },
  {
    id: 'finance.bank_account_balance_matches_approved_transactions',
    severity: 'critical',
    closure: 'recordToReport',
    description: 'Bank account balance must equal opening balance plus approved or legacy posted bank movement.',
    sql: `
      SELECT a.id, a.account_number, a.account_name,
             ROUND(COALESCE(a.current_balance, 0), 2) AS current_balance,
             ROUND(COALESCE(a.opening_balance, 0) + COALESCE(SUM(CASE
               WHEN bt.transaction_type IN (${sqlList(bankInflowTypes)}) THEN COALESCE(bt.amount, 0)
               WHEN bt.transaction_type IN (${sqlList(bankOutflowTypes)}) THEN -COALESCE(bt.amount, 0)
               ELSE 0
             END), 0), 2) AS expected_balance
      FROM bank_accounts a
      LEFT JOIN bank_transactions bt
        ON bt.bank_account_id = a.id
       AND (bt.status IS NULL OR bt.status = 'approved')
      WHERE COALESCE(a.is_active, 1) = 1
      GROUP BY a.id, a.account_number, a.account_name, a.current_balance, a.opening_balance
      HAVING ABS(current_balance - expected_balance) > 0.01
    `,
  },
  {
    id: 'finance.approved_bank_transactions_have_balanced_gl_entry',
    severity: 'critical',
    closure: 'recordToReport',
    description: 'Approved or legacy posted bank transactions must link to an existing balanced GL entry.',
    sql: `
      SELECT bt.id, bt.transaction_number, bt.gl_entry_id
      FROM bank_transactions bt
      LEFT JOIN gl_entries ge ON ge.id = bt.gl_entry_id
      LEFT JOIN (
        SELECT entry_id,
               ROUND(SUM(COALESCE(debit_amount, 0)), 2) AS debit_total,
               ROUND(SUM(COALESCE(credit_amount, 0)), 2) AS credit_total
        FROM gl_entry_items
        GROUP BY entry_id
      ) totals ON totals.entry_id = ge.id
      WHERE (bt.status IS NULL OR bt.status = 'approved')
        AND (
          bt.gl_entry_id IS NULL
          OR ge.id IS NULL
          OR ABS(COALESCE(totals.debit_total, 0) - COALESCE(totals.credit_total, 0)) > 0.01
        )
    `,
  },
  {
    id: 'finance.reconciled_bank_transactions_have_statement_match',
    severity: 'high',
    closure: 'recordToReport',
    description: 'Reconciled approved bank transactions must have a bank statement match record.',
    sql: `
      SELECT bt.id, bt.transaction_number, bt.reconciliation_date
      FROM bank_transactions bt
      WHERE bt.status = 'approved'
        AND COALESCE(bt.is_reconciled, 0) = 1
        AND NOT EXISTS (
          SELECT 1
          FROM bank_reconciliation_matches m
          WHERE m.bank_transaction_id = bt.id
        )
    `,
  },
  {
    id: 'finance.approved_cash_transactions_have_balanced_gl_entry',
    severity: 'critical',
    closure: 'recordToReport',
    description: 'Approved cash transactions must link to an existing balanced GL entry.',
    sql: `
      SELECT ct.id, ct.transaction_number, ct.gl_entry_id
      FROM cash_transactions ct
      LEFT JOIN gl_entries ge ON ge.id = ct.gl_entry_id
      LEFT JOIN (
        SELECT entry_id,
               ROUND(SUM(COALESCE(debit_amount, 0)), 2) AS debit_total,
               ROUND(SUM(COALESCE(credit_amount, 0)), 2) AS credit_total
        FROM gl_entry_items
        GROUP BY entry_id
      ) totals ON totals.entry_id = ge.id
      WHERE ct.status = 'approved'
        AND (
          ct.gl_entry_id IS NULL
          OR ge.id IS NULL
          OR ABS(COALESCE(totals.debit_total, 0) - COALESCE(totals.credit_total, 0)) > 0.01
        )
    `,
  },
  {
    id: 'finance.tax_invoices_have_gl_entry_after_certification',
    severity: 'critical',
    closure: 'recordToReport',
    description: 'Certified or deducted tax invoices must link to an active GL entry.',
    sql: `
      SELECT ti.id, ti.invoice_number, ti.status, ti.gl_entry_id
      FROM tax_invoices ti
      LEFT JOIN gl_entries ge
        ON ge.id = ti.gl_entry_id
       AND COALESCE(ge.is_reversed, 0) = 0
      WHERE ti.status IN ('已认证', '已抵扣')
        AND (ti.gl_entry_id IS NULL OR ge.id IS NULL)
    `,
  },
  {
    id: 'finance.paid_tax_returns_have_gl_entry',
    severity: 'critical',
    closure: 'recordToReport',
    description: 'Paid tax returns with a payable amount must link to an active GL entry.',
    sql: `
      SELECT tr.id, tr.return_period, tr.return_type, tr.tax_payable, tr.income_tax_payable, tr.gl_entry_id
      FROM tax_returns tr
      LEFT JOIN gl_entries ge
        ON ge.id = tr.gl_entry_id
       AND COALESCE(ge.is_reversed, 0) = 0
      WHERE tr.status = '已缴纳'
        AND COALESCE(NULLIF(tr.income_tax_payable, 0), tr.tax_payable, 0) > 0
        AND (tr.gl_entry_id IS NULL OR ge.id IS NULL)
    `,
  },
  {
    id: 'finance.asset_depreciation_details_have_gl_entry',
    severity: 'critical',
    closure: 'recordToReport',
    description: 'Fixed asset depreciation details must link to an active GL entry.',
    sql: `
      SELECT d.id, d.asset_id, d.depreciation_date, d.depreciation_amount, d.entry_id
      FROM fixed_asset_depreciation_details d
      LEFT JOIN gl_entries ge
        ON ge.id = d.entry_id
       AND COALESCE(ge.is_reversed, 0) = 0
      WHERE COALESCE(d.depreciation_amount, 0) > 0
        AND (d.entry_id IS NULL OR ge.id IS NULL)
    `,
  },
  {
    id: 'quality.closed_8d_has_closed_phase',
    severity: 'high',
    closure: 'qualityClosedLoop',
    description: 'Closed 8D reports must have a closed phase.',
    sql: `
      SELECT id, report_no, status, current_phase
      FROM eight_d_reports
      WHERE status = 'closed'
        AND current_phase <> 'closed'
        AND deleted_at IS NULL
    `,
  },
];

async function executeRuleQuery(connection, rule, timeoutMs) {
  if (typeof connection.query === 'function') {
    const [rows] = await connection.query({ sql: rule.sql, timeout: timeoutMs });
    return rows;
  }

  const [rows] = await connection.execute(rule.sql);
  return rows;
}

async function runDataConsistencyAudit(connection, rules = consistencyRules, options = {}) {
  const results = [];
  const timeoutMs = Number(options.timeoutMs || DEFAULT_RULE_TIMEOUT_MS);
  for (const rule of rules) {
    const startedAt = Date.now();
    options.onRuleStart?.(rule);
    try {
      const rows = await executeRuleQuery(connection, rule, timeoutMs);
      const result = {
        ...rule,
        count: rows.length,
        rows,
        passed: rows.length === 0,
        durationMs: Date.now() - startedAt,
      };
      results.push(result);
      options.onRuleEnd?.(result);
    } catch (error) {
      const result = {
        ...rule,
        count: null,
        rows: [],
        error: error.message,
        passed: false,
        durationMs: Date.now() - startedAt,
      };
      results.push(result);
      options.onRuleEnd?.(result);
    }
  }
  return {
    passed: results.every((result) => result.passed),
    results,
  };
}

module.exports = {
  consistencyRules,
  runDataConsistencyAudit,
};
