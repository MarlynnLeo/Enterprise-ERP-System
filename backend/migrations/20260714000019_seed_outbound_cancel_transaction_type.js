/** Complete the reversal dictionary for minimally seeded databases. */

exports.up = async function up(knex) {
  await knex('business_types')
    .insert({
      code: 'outbound_cancel',
      name: '撤销出库',
      category: 'in',
      group_code: 'inventory_transaction',
      tag_type: 'success',
      color: '#67C23A',
      sort_order: 7,
      description: '撤销出库库存流水',
      is_system: 1,
      status: 1,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    })
    .onConflict('code')
    .merge({
      name: '撤销出库',
      category: 'in',
      group_code: 'inventory_transaction',
      tag_type: 'success',
      color: '#67C23A',
      sort_order: 7,
      is_system: 1,
      status: 1,
      updated_at: knex.fn.now(),
    });
};

exports.down = async function down() {
  // Preserve the mapping because historical ledgers continue to reference this code.
};
