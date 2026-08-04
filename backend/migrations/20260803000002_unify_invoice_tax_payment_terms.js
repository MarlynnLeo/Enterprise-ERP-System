/**
 * 一致性收口：
 * 1) purchase_orders.payment_term_days
 * 2) 回填 AP/AR 未税/税额（明细合计为未税，差额为税；无明细则税率反推）
 * 3) 供应商/客户默认账期 30 天（仅 NULL）
 * 4) customers.phone 与 contact_phone 对齐
 * 5) due_date=invoice_date 且有账期时按账期重算（仅未付款发票，避免扰动已结清）
 */

async function hasTable(knex, table) {
  return knex.schema.hasTable(table);
}

async function hasColumn(knex, table, column) {
  return knex.schema.hasColumn(table, column);
}

async function addColumnIfMissing(knex, table, column, definition) {
  if (!(await hasTable(knex, table))) return;
  if (await hasColumn(knex, table, column)) return;
  await knex.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

exports.up = async function up(knex) {
  await addColumnIfMissing(
    knex,
    'purchase_orders',
    'payment_term_days',
    'INT NULL DEFAULT NULL COMMENT \'付款账期（天）\' AFTER `tax_amount`'
  );

  // --- 默认账期 ---
  if (await hasTable(knex, 'suppliers') && (await hasColumn(knex, 'suppliers', 'payment_term_days'))) {
    await knex.raw(
      `UPDATE suppliers SET payment_term_days = 30
       WHERE payment_term_days IS NULL AND (deleted_at IS NULL OR deleted_at IS NOT NULL)`
    );
  }
  if (await hasTable(knex, 'customers') && (await hasColumn(knex, 'customers', 'payment_term_days'))) {
    await knex.raw(
      `UPDATE customers SET payment_term_days = 30 WHERE payment_term_days IS NULL`
    );
  }

  // --- phone / contact_phone 对齐 ---
  if (
    (await hasTable(knex, 'customers')) &&
    (await hasColumn(knex, 'customers', 'phone')) &&
    (await hasColumn(knex, 'customers', 'contact_phone'))
  ) {
    await knex.raw(
      `UPDATE customers
       SET phone = contact_phone
       WHERE (phone IS NULL OR phone = '')
         AND contact_phone IS NOT NULL AND contact_phone <> ''`
    );
    await knex.raw(
      `UPDATE customers
       SET contact_phone = phone
       WHERE (contact_phone IS NULL OR contact_phone = '')
         AND phone IS NOT NULL AND phone <> ''`
    );
  }

  // --- 回填 AP 价税 ---
  if (
    (await hasTable(knex, 'ap_invoices')) &&
    (await hasColumn(knex, 'ap_invoices', 'amount_excluding_tax')) &&
    (await hasTable(knex, 'ap_invoice_items'))
  ) {
    // 有明细：未税=明细合计，税额=总额-未税（总额为权威价税合计）
    await knex.raw(`
      UPDATE ap_invoices a
      INNER JOIN (
        SELECT invoice_id, ROUND(SUM(amount), 2) AS item_sum
        FROM ap_invoice_items
        GROUP BY invoice_id
      ) s ON s.invoice_id = a.id
      SET
        a.amount_excluding_tax = s.item_sum,
        a.tax_amount = ROUND(a.total_amount - s.item_sum, 2),
        a.tax_rate = CASE
          WHEN s.item_sum > 0.005 AND ABS(a.total_amount - s.item_sum) > 0.005
            THEN ROUND((a.total_amount - s.item_sum) / s.item_sum, 6)
          ELSE COALESCE(a.tax_rate, 0)
        END
      WHERE a.amount_excluding_tax IS NULL OR a.tax_amount IS NULL
    `);

    // 无明细：无法可靠拆税时，未税=总额、税额=0
    await knex.raw(`
      UPDATE ap_invoices a
      LEFT JOIN ap_invoice_items i ON i.invoice_id = a.id
      SET
        a.amount_excluding_tax = COALESCE(a.amount_excluding_tax, a.total_amount),
        a.tax_amount = COALESCE(a.tax_amount, 0),
        a.tax_rate = COALESCE(a.tax_rate, 0)
      WHERE i.id IS NULL
        AND (a.amount_excluding_tax IS NULL OR a.tax_amount IS NULL)
    `);
  }

  // --- 回填 AR 价税 ---
  if (
    (await hasTable(knex, 'ar_invoices')) &&
    (await hasColumn(knex, 'ar_invoices', 'amount_excluding_tax')) &&
    (await hasTable(knex, 'ar_invoice_items'))
  ) {
    await knex.raw(`
      UPDATE ar_invoices a
      INNER JOIN (
        SELECT invoice_id, ROUND(SUM(amount), 2) AS item_sum
        FROM ar_invoice_items
        GROUP BY invoice_id
      ) s ON s.invoice_id = a.id
      SET
        a.amount_excluding_tax = s.item_sum,
        a.tax_amount = ROUND(a.total_amount - s.item_sum, 2),
        a.tax_rate = CASE
          WHEN s.item_sum > 0.005 AND ABS(a.total_amount - s.item_sum) > 0.005
            THEN ROUND((a.total_amount - s.item_sum) / s.item_sum, 6)
          ELSE COALESCE(a.tax_rate, 0)
        END
      WHERE a.amount_excluding_tax IS NULL OR a.tax_amount IS NULL
    `);

    await knex.raw(`
      UPDATE ar_invoices a
      LEFT JOIN ar_invoice_items i ON i.invoice_id = a.id
      SET
        a.amount_excluding_tax = COALESCE(a.amount_excluding_tax, a.total_amount),
        a.tax_amount = COALESCE(a.tax_amount, 0),
        a.tax_rate = COALESCE(a.tax_rate, 0)
      WHERE i.id IS NULL
        AND (a.amount_excluding_tax IS NULL OR a.tax_amount IS NULL)
    `);
  }

  // --- due_date：仅未结清且 due=invoice 的票，按供应商/客户账期重算 ---
  if (
    (await hasTable(knex, 'ap_invoices')) &&
    (await hasTable(knex, 'suppliers')) &&
    (await hasColumn(knex, 'suppliers', 'payment_term_days'))
  ) {
    await knex.raw(`
      UPDATE ap_invoices a
      INNER JOIN suppliers s ON s.id = a.supplier_id
      SET a.due_date = DATE_ADD(a.invoice_date, INTERVAL COALESCE(s.payment_term_days, 30) DAY),
          a.terms = COALESCE(NULLIF(a.terms, ''), CONCAT(COALESCE(s.payment_term_days, 30), '天付款'))
      WHERE a.due_date IS NOT NULL
        AND a.invoice_date IS NOT NULL
        AND a.due_date = a.invoice_date
        AND COALESCE(a.paid_amount, 0) < 0.005
        AND a.status NOT IN ('已取消', '已付款')
        AND COALESCE(s.payment_term_days, 30) > 0
    `);
  }

  if (
    (await hasTable(knex, 'ar_invoices')) &&
    (await hasTable(knex, 'customers')) &&
    (await hasColumn(knex, 'customers', 'payment_term_days'))
  ) {
    await knex.raw(`
      UPDATE ar_invoices a
      INNER JOIN customers c ON c.id = a.customer_id
      SET a.due_date = DATE_ADD(a.invoice_date, INTERVAL COALESCE(c.payment_term_days, 30) DAY),
          a.terms = COALESCE(NULLIF(a.terms, ''), CONCAT(COALESCE(c.payment_term_days, 30), '天付款'))
      WHERE a.due_date IS NOT NULL
        AND a.invoice_date IS NOT NULL
        AND a.due_date = a.invoice_date
        AND COALESCE(a.paid_amount, 0) < 0.005
        AND a.status NOT IN ('已取消', '已付款')
        AND COALESCE(c.payment_term_days, 30) > 0
    `);
  }

  // silence unused
  void round2;
};

exports.down = async function down() {
  // 不回滚回填数据
};
