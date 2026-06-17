async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

function utf8Hex(hex) {
  return `CONVERT(UNHEX('${hex}') USING utf8mb4)`;
}

function signedTransactionExpression(alias = 't') {
  const column = `${alias}.transaction_type`;
  const amount = `${alias}.amount`;
  const inflowTypes = [
    utf8Hex('E5AD98E6ACBE'), // deposit
    utf8Hex('E8BDACE585A5'), // transfer in
    utf8Hex('E588A9E681AF'), // interest
    utf8Hex('E694B6E585A5'), // income
    "'income'",
    "'deposit'",
    "'transfer_in'",
    "'interest'",
  ].join(',');
  const outflowTypes = [
    utf8Hex('E58F96E6ACBE'), // withdrawal
    utf8Hex('E8BDACE587BA'), // transfer out
    utf8Hex('E8B4B9E794A8'), // fee
    utf8Hex('E694AFE587BA'), // expense
    "'expense'",
    "'withdrawal'",
    "'transfer_out'",
    "'fee'",
  ].join(',');

  return `
    CASE
      WHEN ${column} IN (${inflowTypes}) THEN COALESCE(${amount}, 0)
      WHEN ${column} IN (${outflowTypes}) THEN -COALESCE(${amount}, 0)
      ELSE 0
    END
  `;
}

exports.up = async function up(knex) {
  if (!(await hasTable(knex, 'bank_accounts')) || !(await hasTable(knex, 'bank_transactions'))) {
    return;
  }

  const signedExpression = signedTransactionExpression('t');
  await knex.raw(`
    UPDATE bank_accounts a
    LEFT JOIN (
      SELECT bank_account_id,
             ROUND(COALESCE(SUM(${signedExpression}), 0), 2) AS signed_amount,
             MAX(transaction_date) AS last_transaction_date
      FROM bank_transactions t
      WHERE t.status IS NULL OR t.status = 'approved'
      GROUP BY bank_account_id
    ) tx ON tx.bank_account_id = a.id
    SET a.current_balance = ROUND(COALESCE(a.opening_balance, 0) + COALESCE(tx.signed_amount, 0), 2),
        a.last_transaction_date = COALESCE(tx.last_transaction_date, a.last_transaction_date)
    WHERE COALESCE(a.is_active, 1) = 1
      AND ABS(ROUND(
        COALESCE(a.current_balance, 0) -
        (COALESCE(a.opening_balance, 0) + COALESCE(tx.signed_amount, 0)),
        2
      )) >= 0.01
  `);
};

exports.down = async function down() {
  // Balance repair is intentionally not rolled back.
};
