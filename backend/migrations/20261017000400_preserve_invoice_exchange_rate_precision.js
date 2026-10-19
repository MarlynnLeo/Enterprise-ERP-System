// Invoice, voucher and settlement evidence must retain the same confirmed rate.
exports.up = async function up(knex) {
  for (const table of ['ar_invoices', 'ap_invoices']) {
    await knex.raw(`ALTER TABLE \`${table}\` MODIFY COLUMN exchange_rate DECIMAL(18,8) NULL DEFAULT 1.00000000`);
  }
};

exports.down = async function down(knex) {
  // Preserve the deployed schema's nullable historical evidence and six decimals.
  for (const table of ['ar_invoices', 'ap_invoices']) {
    const used = await knex(table).whereRaw('exchange_rate <> ROUND(exchange_rate, 6) OR ABS(exchange_rate) >= 1000000000').first('id');
    if (used) throw new Error('发票已使用高精度汇率，不能无损回滚到原汇率精度');
  }
  for (const table of ['ar_invoices', 'ap_invoices']) {
    await knex.raw(`ALTER TABLE \`${table}\` MODIFY COLUMN exchange_rate DECIMAL(15,6) NULL DEFAULT 1.000000`);
  }
};
