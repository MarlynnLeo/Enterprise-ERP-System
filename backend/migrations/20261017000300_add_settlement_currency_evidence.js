exports.up = async function up(knex) {
  for (const table of ['ar_receipts', 'ap_payments']) {
    for (const [field, definition] of Object.entries({
      currency_code: 'VARCHAR(10) NULL DEFAULT NULL',
      exchange_rate: 'DECIMAL(18,8) NULL DEFAULT NULL',
      base_amount: 'DECIMAL(15,2) NULL DEFAULT NULL',
    })) {
      if (!(await knex.schema.hasColumn(table, field))) await knex.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${field}\` ${definition}`);
    }
  }
  for (const table of ['ar_receipt_items', 'ap_payment_items']) {
    if (!(await knex.schema.hasColumn(table, 'base_settlement_amount'))) await knex.raw(`ALTER TABLE \`${table}\` ADD COLUMN base_settlement_amount DECIMAL(15,2) NULL DEFAULT NULL`);
  }
};

exports.down = async function down(knex) {
  for (const table of ['ar_receipts', 'ap_payments']) {
    const used = await knex(table).where('currency_code', 'USD').first('id');
    if (used) throw new Error('已记录美元结算凭证，不能删除其币种和本位核销依据');
  }
  for (const table of ['ar_receipt_items', 'ap_payment_items']) {
    if (await knex.schema.hasColumn(table, 'base_settlement_amount')) await knex.raw(`ALTER TABLE \`${table}\` DROP COLUMN base_settlement_amount`);
  }
  for (const table of ['ar_receipts', 'ap_payments']) {
    for (const field of ['base_amount', 'exchange_rate', 'currency_code']) {
      if (await knex.schema.hasColumn(table, field)) await knex.raw(`ALTER TABLE \`${table}\` DROP COLUMN \`${field}\``);
    }
  }
};
