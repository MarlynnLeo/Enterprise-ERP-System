async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

function payableExpression() {
  return `
    CASE
      WHEN return_type IN ('企业所得税', '个人所得税')
        THEN COALESCE(income_tax_payable, tax_payable, 0)
      ELSE COALESCE(tax_payable, 0)
    END
  `;
}

async function logRepair(trx, scope, metric, value) {
  await trx('finance_data_repair_audit').insert({
    repair_key: '20260518000002_repair_finance_sql_integrity',
    scope,
    metric,
    value: String(value ?? 0),
    created_at: trx.fn.now(),
  });
}

exports.up = async function up(knex) {
  if (!(await hasTable(knex, 'finance_data_repair_audit'))) {
    await knex.schema.createTable('finance_data_repair_audit', (table) => {
      table.increments('id').primary();
      table.string('repair_key', 100).notNullable();
      table.string('scope', 50).notNullable();
      table.string('metric', 100).notNullable();
      table.string('value', 100).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['repair_key', 'scope'], 'idx_finance_repair_audit_scope');
    });
  }

  await knex.transaction(async (trx) => {
    if (await hasTable(knex, 'gl_entry_items')) {
      const deletedZeroLines = await trx('gl_entry_items')
        .whereRaw('COALESCE(debit_amount, 0) = 0')
        .whereRaw('COALESCE(credit_amount, 0) = 0')
        .del();
      await logRepair(trx, 'gl', 'deleted_zero_amount_lines', deletedZeroLines);
    }

    if ((await hasTable(knex, 'gl_entries')) && (await hasTable(knex, 'gl_entry_items'))) {
      const [noItemResult] = await trx.raw(`
        UPDATE gl_entries e
        LEFT JOIN gl_entry_items ei ON ei.entry_id = e.id
        SET e.is_posted = 0,
            e.status = 'draft'
        WHERE ei.id IS NULL
          AND COALESCE(e.status, 'draft') <> 'reversed'
      `);
      await logRepair(trx, 'gl', 'unposted_entries_without_items', noItemResult.affectedRows);

      const draftFlagResult = await trx('gl_entries')
        .where('status', 'draft')
        .whereRaw('COALESCE(is_posted, 0) <> 0')
        .update({ is_posted: 0 });
      await logRepair(trx, 'gl', 'normalized_draft_posted_flags', draftFlagResult);

      const [periodResult] = await trx.raw(`
        UPDATE gl_entries e
        JOIN gl_periods p
          ON DATE(e.entry_date) BETWEEN p.start_date AND p.end_date
         AND (e.posting_date IS NULL OR DATE(e.posting_date) BETWEEN p.start_date AND p.end_date)
        SET e.period_id = p.id
        WHERE COALESCE(e.is_posted, 0) = 1
          AND e.status IN ('posted', 'reversed')
          AND (e.period_id IS NULL OR e.period_id <> p.id)
      `);
      await logRepair(trx, 'gl', 'realigned_posted_entry_periods', periodResult.affectedRows);
    }

    if (await hasTable(knex, 'tax_returns')) {
      const payable = payableExpression();
      const [taxResult] = await trx.raw(`
        UPDATE tax_returns
        SET tax_paid = CASE
              WHEN status = '已缴纳' THEN ${payable}
              ELSE COALESCE(tax_paid, 0)
            END,
            tax_balance = CASE
              WHEN status = '已缴纳' THEN 0
              ELSE GREATEST(${payable} - COALESCE(tax_paid, 0), 0)
            END
        WHERE ABS(ROUND(
          COALESCE(tax_balance, 0) -
          (CASE
             WHEN status = '已缴纳' THEN 0
             ELSE GREATEST(${payable} - COALESCE(tax_paid, 0), 0)
           END),
          2
        )) >= 0.01
           OR (status = '已缴纳' AND ABS(ROUND(COALESCE(tax_paid, 0) - ${payable}, 2)) >= 0.01)
      `);
      await logRepair(trx, 'tax', 'normalized_tax_return_balances', taxResult.affectedRows);
    }

    if ((await hasTable(knex, 'ar_invoices')) && (await hasTable(knex, 'ar_invoice_items'))) {
      await trx.raw('ALTER TABLE ar_invoice_items MODIFY COLUMN product_id INT NULL');

      const [arAdjustmentResult] = await trx.raw(`
        INSERT INTO ar_invoice_items (invoice_id, product_id, description, quantity, unit_price, amount)
        SELECT x.invoice_id,
               NULL,
               '历史金额调整（系统修复）',
               1,
               x.diff_amount,
               x.diff_amount
        FROM (
          SELECT inv.id AS invoice_id,
                 ROUND(COALESCE(MAX(inv.total_amount), 0) - COALESCE(SUM(item.amount), 0), 2) AS diff_amount
          FROM ar_invoices inv
          LEFT JOIN ar_invoice_items item ON item.invoice_id = inv.id
          GROUP BY inv.id
        ) x
        WHERE x.diff_amount >= 0.01
      `);
      await logRepair(
        trx,
        'ar',
        'inserted_header_detail_adjustment_items',
        arAdjustmentResult.affectedRows
      );
    }

    if (
      (await hasTable(knex, 'ar_invoices')) &&
      (await hasTable(knex, 'ar_receipts')) &&
      (await hasTable(knex, 'ar_receipt_items'))
    ) {
      const [arPaidResult] = await trx.raw(`
        UPDATE ar_invoices inv
        LEFT JOIN (
          SELECT ri.invoice_id,
                 ROUND(COALESCE(SUM(CASE WHEN r.status = 'normal' THEN ri.amount ELSE 0 END), 0), 2) AS normal_paid
          FROM ar_receipt_items ri
          LEFT JOIN ar_receipts r ON r.id = ri.receipt_id
          GROUP BY ri.invoice_id
        ) paid ON paid.invoice_id = inv.id
        SET inv.paid_amount = COALESCE(paid.normal_paid, 0),
            inv.balance_amount = GREATEST(ROUND(COALESCE(inv.total_amount, 0) - COALESCE(paid.normal_paid, 0), 2), 0),
            inv.status = CASE
              WHEN GREATEST(ROUND(COALESCE(inv.total_amount, 0) - COALESCE(paid.normal_paid, 0), 2), 0) <= 0 THEN '已付款'
              WHEN COALESCE(paid.normal_paid, 0) > 0 THEN '部分付款'
              WHEN inv.due_date < CURDATE() THEN '已逾期'
              ELSE '已确认'
            END
        WHERE COALESCE(inv.status, '') NOT IN ('草稿', '已取消')
          AND ABS(ROUND(COALESCE(inv.paid_amount, 0) - COALESCE(paid.normal_paid, 0), 2)) >= 0.01
      `);
      await logRepair(
        trx,
        'ar',
        'recalculated_paid_amount_from_normal_receipts',
        arPaidResult.affectedRows
      );
    }
  });
};

exports.down = async function down() {
  // Financial data repair is intentionally not rolled back.
};
