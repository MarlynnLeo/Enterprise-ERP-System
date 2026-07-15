/**
 * Purchase order lifecycle has more states than the original baseline ENUM.
 * Use a bounded VARCHAR so the service-level state registry remains the SSOT.
 */

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('purchase_orders'))) return;
  await knex.raw(`
    ALTER TABLE purchase_orders
    MODIFY status VARCHAR(20) NOT NULL DEFAULT 'draft'
  `);
};

exports.down = async function down() {
  // Non-destructive: narrowing the domain could invalidate legitimate lifecycle states.
};
