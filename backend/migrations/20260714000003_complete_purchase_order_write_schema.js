/**
 * Align the purchase order table with the create/update/approval write contract.
 */

async function addColumnIfMissing(knex, columnName, defineColumn) {
  if (await knex.schema.hasColumn('purchase_orders', columnName)) return;
  await knex.schema.alterTable('purchase_orders', (table) => defineColumn(table));
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('purchase_orders'))) return;

  await addColumnIfMissing(knex, 'supplier_name', (table) => {
    table.string('supplier_name', 100).nullable();
  });
  await addColumnIfMissing(knex, 'expected_delivery_date', (table) => {
    table.date('expected_delivery_date').nullable();
  });
  await addColumnIfMissing(knex, 'contact_person', (table) => {
    table.string('contact_person', 50).nullable();
  });
  await addColumnIfMissing(knex, 'contact_phone', (table) => {
    table.string('contact_phone', 50).nullable();
  });
  await addColumnIfMissing(knex, 'completion_percentage', (table) => {
    table.decimal('completion_percentage', 5, 2).notNullable().defaultTo(0).index();
  });
  await addColumnIfMissing(knex, 'requisition_id', (table) => {
    table.integer('requisition_id').nullable().index();
  });
  await addColumnIfMissing(knex, 'requisition_number', (table) => {
    table.string('requisition_number', 50).nullable();
  });
};

exports.down = async function down() {
  // Non-destructive for purchase documents that may already contain these values.
};
