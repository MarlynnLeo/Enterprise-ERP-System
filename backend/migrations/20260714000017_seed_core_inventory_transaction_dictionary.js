/** Ensure core ledger types remain translatable in minimally seeded databases. */

const TYPES = [
  ['purchase_inbound', '采购入库', 'in', 'success', '#67C23A', 2],
  ['production_inbound', '生产入库', 'in', 'success', '#67C23A', 3],
  ['production_outbound', '生产出库', 'out', 'danger', '#F56C6C', 13],
  ['sales_outbound', '销售出库', 'out', 'danger', '#F56C6C', 12],
];

exports.up = async function up(knex) {
  for (const [code, name, category, tagType, color, sortOrder] of TYPES) {
    await knex('business_types')
      .insert({
        code,
        name,
        category,
        group_code: 'inventory_transaction',
        tag_type: tagType,
        color,
        sort_order: sortOrder,
        description: `${name}库存流水`,
        is_system: 1,
        status: 1,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      })
      .onConflict('code')
      .ignore();
  }
};

exports.down = async function down() {
  // Preserve dictionary entries because historical ledgers continue to reference these codes.
};
