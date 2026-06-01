/**
 * Data consistency rules for ERP closure audits.
 *
 * The rules are intentionally declarative: tests can validate that every
 * professional closure has a rule, and operators can execute them against a
 * real database to find residual data problems.
 */

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

async function runDataConsistencyAudit(connection, rules = consistencyRules) {
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
  return {
    passed: results.every((result) => result.passed),
    results,
  };
}

module.exports = {
  consistencyRules,
  runDataConsistencyAudit,
};
