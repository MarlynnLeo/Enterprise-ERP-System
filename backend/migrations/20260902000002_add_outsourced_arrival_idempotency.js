/** Add a client idempotency key to outsourced arrival registration. */

exports.up = async function up(knex) {
  const exists = await knex.schema.hasColumn('outsourced_processing_receipts', 'arrival_idempotency_key');
  if (!exists) {
    await knex.schema.alterTable('outsourced_processing_receipts', (table) => {
      table.string('arrival_idempotency_key', 191).nullable().unique();
    });
  }
};

exports.down = async function down(knex) {
  const exists = await knex.schema.hasColumn('outsourced_processing_receipts', 'arrival_idempotency_key');
  if (exists) {
    await knex.schema.alterTable('outsourced_processing_receipts', (table) => {
      table.dropColumn('arrival_idempotency_key');
    });
  }
};
