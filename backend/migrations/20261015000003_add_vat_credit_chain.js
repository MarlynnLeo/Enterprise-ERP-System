'use strict';

// No historical return is recalculated. Null balances identify legacy snapshots
// that need a documented opening balance before entering the new VAT chain.
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('tax_ledger_locks'))) {
    await knex.schema.createTable('tax_ledger_locks', table => {
      table.integer('id').primary();
    });
  }
  await knex('tax_ledger_locks').insert({ id: 1 }).onConflict('id').ignore();
  const columns = {
    opening_input_credit: table => table.decimal('opening_input_credit', 18, 2).nullable(),
    closing_input_credit: table => table.decimal('closing_input_credit', 18, 2).nullable(),
    opening_credit_note: table => table.string('opening_credit_note', 500).nullable(),
    previous_vat_return_id: table => table.integer('previous_vat_return_id').nullable(),
    previous_vat_snapshot_version: table => table.integer('previous_vat_snapshot_version').nullable(),
    vat_snapshot_version: table => table.integer('vat_snapshot_version').notNullable().defaultTo(0),
  };
  for (const [name, add] of Object.entries(columns)) {
    if (!(await knex.schema.hasColumn('tax_returns', name))) {
      await knex.schema.alterTable('tax_returns', add);
    }
  }
};

exports.down = async function () {
  throw new Error('VAT carryforward snapshots are accounting evidence; use a reviewed forward migration.');
};
