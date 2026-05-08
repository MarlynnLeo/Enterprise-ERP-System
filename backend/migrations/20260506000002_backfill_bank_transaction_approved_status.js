async function columnExists(knex, tableName, columnName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS count
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName]
  );
  return Number(rows[0].count) > 0;
}

exports.up = async function up(knex) {
  if (!(await columnExists(knex, 'bank_transactions', 'status'))) {
    return;
  }

  const conditions = ['is_reconciled = 1', "related_invoice_type IN ('AP', 'AR')"];

  if (await columnExists(knex, 'bank_transactions', 'tax_return_id')) {
    conditions.push('tax_return_id IS NOT NULL');
  }

  if (await columnExists(knex, 'bank_transactions', 'gl_entry_id')) {
    conditions.push('gl_entry_id IS NOT NULL');
  }

  conditions.push(
    "description LIKE '%应付账款付款%'",
    "description LIKE '%应收账款收款%'",
    "description LIKE '%费用付款%'",
    "description LIKE '%税款缴纳%'",
    "description LIKE '%资金调拨%'"
  );

  await knex.raw(
    `UPDATE bank_transactions
     SET status = 'approved',
         approved_at = COALESCE(approved_at, updated_at, created_at, NOW())
     WHERE (status IS NULL OR status = '' OR status = 'draft')
       AND (${conditions.join(' OR ')})`
  );
};

exports.down = async function down() {
  // Data backfill only. Do not downgrade approved business/audited rows automatically.
};
