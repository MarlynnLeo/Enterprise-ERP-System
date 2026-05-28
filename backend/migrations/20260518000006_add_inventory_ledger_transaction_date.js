async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function hasColumn(knex, tableName, columnName) {
  return knex.schema.hasColumn(tableName, columnName);
}

exports.up = async function up(knex) {
  if (!(await hasTable(knex, 'inventory_ledger'))) {
    return;
  }

  if (!(await hasColumn(knex, 'inventory_ledger', 'transaction_date'))) {
    await knex.schema.alterTable('inventory_ledger', (table) => {
      table.date('transaction_date').nullable().comment('库存业务日期');
      table.index(['transaction_date'], 'idx_inventory_ledger_transaction_date');
      table.index(
        ['material_id', 'location_id', 'transaction_date'],
        'idx_inventory_ledger_mat_loc_tx_date'
      );
    });
  }

  await knex.raw(`
    UPDATE inventory_ledger
    SET transaction_date = DATE(created_at)
    WHERE transaction_date IS NULL
  `);
};

exports.down = async function down(knex) {
  if (
    !(await hasTable(knex, 'inventory_ledger')) ||
    !(await hasColumn(knex, 'inventory_ledger', 'transaction_date'))
  ) {
    return;
  }

  await knex.schema.alterTable('inventory_ledger', (table) => {
    table.dropIndex(['material_id', 'location_id', 'transaction_date'], 'idx_inventory_ledger_mat_loc_tx_date');
    table.dropIndex(['transaction_date'], 'idx_inventory_ledger_transaction_date');
    table.dropColumn('transaction_date');
  });
};
