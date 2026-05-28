/**
 * Repair orphan sales outbound order references left by test data.
 *
 * Existing completed outbound records may be valid inventory movements even when
 * the linked sales order was deleted during testing. Keep the outbound document
 * and clear only invalid order references so list/detail joins stay consistent.
 */

const hasTable = async (knex, tableName) => knex.schema.hasTable(tableName);

exports.up = async function up(knex) {
  const hasSalesOutbound = await hasTable(knex, 'sales_outbound');
  const hasSalesOrders = await hasTable(knex, 'sales_orders');
  const hasSalesOutboundItems = await hasTable(knex, 'sales_outbound_items');

  if (!hasSalesOutbound || !hasSalesOrders) {
    return;
  }

  await knex.raw(`
    UPDATE sales_outbound so
    LEFT JOIN sales_orders o ON o.id = so.order_id
    SET
      so.order_id = NULL,
      so.related_orders = NULL,
      so.is_multi_order = 0,
      so.updated_at = NOW()
    WHERE so.order_id IS NOT NULL
      AND o.id IS NULL
  `);

  if (hasSalesOutboundItems) {
    await knex.raw(`
      UPDATE sales_outbound_items soi
      LEFT JOIN sales_orders o ON o.id = soi.source_order_id
      SET
        soi.source_order_id = NULL,
        soi.source_order_no = NULL
      WHERE soi.source_order_id IS NOT NULL
        AND o.id IS NULL
    `);
  }
};

exports.down = async function down() {
  // Data repair only. Invalid foreign references should not be restored.
};
