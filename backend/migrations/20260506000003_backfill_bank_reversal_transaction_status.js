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

  await knex.raw(
    `UPDATE bank_transactions
     SET status = 'approved',
         approved_at = COALESCE(approved_at, updated_at, created_at, NOW())
     WHERE (status IS NULL OR status = '' OR status = 'draft')
       AND (
         transaction_number LIKE '%-VOID'
         OR description LIKE '%冲销收款记录%'
         OR description LIKE '%冲销付款记录%'
       )`
  );
};

exports.down = async function down() {
  // Data backfill only. Do not downgrade approved reversal rows automatically.
};
