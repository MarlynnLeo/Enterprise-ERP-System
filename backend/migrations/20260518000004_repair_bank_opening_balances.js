async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function ensureAuditTable(knex) {
  if (await hasTable(knex, 'finance_data_repair_audit')) return;

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

async function logRepair(trx, metric, value) {
  await trx('finance_data_repair_audit').insert({
    repair_key: '20260518000004_repair_bank_opening_balances',
    scope: 'bank',
    metric,
    value: String(value ?? 0),
    created_at: trx.fn.now(),
  });
}

function utf8Hex(hex) {
  return `CONVERT(UNHEX('${hex}') USING utf8mb4)`;
}

function signedTransactionExpression() {
  const incomeTypes = [
    utf8Hex('E5AD98E6ACBE'), // 存款
    utf8Hex('E8BDACE585A5'), // 转入
    utf8Hex('E588A9E681AF'), // 利息
    utf8Hex('E694B6E585A5'), // 收入
    "'income'",
    "'deposit'",
    "'transfer_in'",
    "'interest'",
  ].join(',');

  const expenseTypes = [
    utf8Hex('E58F96E6ACBE'), // 取款
    utf8Hex('E8BDACE587BA'), // 转出
    utf8Hex('E8B4B9E794A8'), // 费用
    utf8Hex('E694AFE587BA'), // 支出
    "'expense'",
    "'withdrawal'",
    "'transfer_out'",
    "'fee'",
  ].join(',');

  return `
    CASE
      WHEN t.transaction_type IN (${incomeTypes}) THEN t.amount
      WHEN t.transaction_type IN (${expenseTypes}) THEN -t.amount
      ELSE 0
    END
  `;
}

exports.up = async function up(knex) {
  await ensureAuditTable(knex);

  if (!(await hasTable(knex, 'bank_accounts')) || !(await hasTable(knex, 'bank_transactions'))) {
    return;
  }

  const signedExpression = signedTransactionExpression();

  await knex.transaction(async (trx) => {
    const [result] = await trx.raw(`
      UPDATE bank_accounts a
      LEFT JOIN (
        SELECT bank_account_id,
               ROUND(COALESCE(SUM(${signedExpression}), 0), 2) AS signed_amount,
               MAX(transaction_date) AS last_transaction_date
        FROM bank_transactions t
        WHERE t.status IS NULL OR t.status = 'approved'
        GROUP BY bank_account_id
      ) tx ON tx.bank_account_id = a.id
      SET a.opening_balance = ROUND(COALESCE(a.current_balance, 0) - COALESCE(tx.signed_amount, 0), 2),
          a.last_transaction_date = COALESCE(tx.last_transaction_date, a.last_transaction_date)
      WHERE ABS(ROUND(
        COALESCE(a.current_balance, 0) -
        (COALESCE(a.opening_balance, 0) + COALESCE(tx.signed_amount, 0)),
        2
      )) >= 0.01
    `);

    await logRepair(trx, 'realigned_opening_balance_to_current_balance', result.affectedRows);
  });
};

exports.down = async function down() {
  // Bank opening-balance repair is intentionally not rolled back.
};
