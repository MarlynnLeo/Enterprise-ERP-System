/** Close the sales order to AR invoice lifecycle state. */

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('sales_orders'))) return;
  if (!(await knex.schema.hasColumn('sales_orders', 'invoice_status'))) {
    await knex.schema.alterTable('sales_orders', (table) => {
      table.string('invoice_status', 20).notNullable().defaultTo('uninvoiced').index();
    });
  }
};

exports.down = async function down() {
  // Retain invoicing state for financial traceability.
};
