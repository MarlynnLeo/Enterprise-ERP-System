async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

function hexLiteral(hex) {
  return `'${hex}'`;
}

function signedTransactionExpression(alias = 't') {
  const column = `${alias}.transaction_type`;
  const amount = `${alias}.amount`;
  const inflowTypes = [
    hexLiteral('E5AD98E6ACBE'), // deposit
    hexLiteral('E8BDACE585A5'), // transfer in
    hexLiteral('E588A9E681AF'), // interest
    hexLiteral('E694B6E585A5'), // income
    hexLiteral('696E636F6D65'),
    hexLiteral('6465706F736974'),
    hexLiteral('7472616E736665725F696E'),
    hexLiteral('696E746572657374'),
  ].join(',');
  const outflowTypes = [
    hexLiteral('E58F96E6ACBE'), // withdrawal
    hexLiteral('E8BDACE587BA'), // transfer out
    hexLiteral('E8B4B9E794A8'), // fee
    hexLiteral('E694AFE587BA'), // expense
    hexLiteral('657870656E7365'),
    hexLiteral('7769746864726177616C'),
    hexLiteral('7472616E736665725F6F7574'),
    hexLiteral('666565'),
  ].join(',');

  return `
    CASE
      WHEN HEX(${column}) IN (${inflowTypes}) THEN COALESCE(${amount}, 0)
      WHEN HEX(${column}) IN (${outflowTypes}) THEN -COALESCE(${amount}, 0)
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
