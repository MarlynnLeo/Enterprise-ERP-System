/** Align generic inventory ledger codes with the source workflows that produce them. */

const TYPES = [
  ['inbound', '其他入库', 'in', 'success', '#67C23A', 8],
  ['outbound', '其他出库', 'out', 'danger', '#F56C6C', 18],
  ['in', '入库', 'in', 'success', '#67C23A', 1],
  ['out', '出库', 'out', 'danger', '#F56C6C', 11],
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
      .merge({
        name,
        category,
        group_code: 'inventory_transaction',
        tag_type: tagType,
        color,
        sort_order: sortOrder,
        is_system: 1,
        status: 1,
        updated_at: knex.fn.now(),
      });
  }
};

exports.down = async function down() {
  // Preserve normalized names because source workflows continue to emit these codes.
};
