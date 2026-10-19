exports.up = async function up(knex) {
  for (const table of ['ar_receipts', 'ap_payments']) {
    await knex.raw(`ALTER TABLE \`${table}\`
      ADD COLUMN idempotency_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
      ADD COLUMN idempotency_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
      ADD UNIQUE KEY \`uk_${table}_idempotency_key\` (idempotency_key)`);
  }
};
exports.down = async function down(knex) {
  for (const table of ['ar_receipts', 'ap_payments']) {
    if (await knex(table).whereNotNull('idempotency_key').first('id')) {
      throw new Error('已记录收付款请求证据，不能删除重试保护');
    }
  }
  for (const table of ['ar_receipts', 'ap_payments']) {
    await knex.raw(`ALTER TABLE \`${table}\` DROP INDEX \`uk_${table}_idempotency_key\`, DROP COLUMN idempotency_hash, DROP COLUMN idempotency_key`);
  }
};
