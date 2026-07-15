/** Register inventory reversal ledger types in the shared business dictionary. */

const TYPES = [
  {
    code: 'inbound_cancel',
    name: '撤销入库',
    category: 'out',
    tag_type: 'danger',
    color: '#F56C6C',
    sort_order: 17,
  },
  {
    code: 'transfer_cancel_in',
    name: '撤销调拨入库',
    category: 'transfer',
    tag_type: 'danger',
    color: '#F56C6C',
    sort_order: 24,
  },
  {
    code: 'transfer_cancel_out',
    name: '撤销调拨出库',
    category: 'transfer',
    tag_type: 'success',
    color: '#67C23A',
    sort_order: 25,
  },
];

exports.up = async function up(knex) {
  for (const type of TYPES) {
    await knex('business_types')
      .insert({
        ...type,
        group_code: 'inventory_transaction',
        description: `${type.name}库存流水`,
        is_system: 1,
        status: 1,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      })
      .onConflict('code')
      .merge({
        name: type.name,
        category: type.category,
        group_code: 'inventory_transaction',
        tag_type: type.tag_type,
        color: type.color,
        sort_order: type.sort_order,
        is_system: 1,
        status: 1,
        updated_at: knex.fn.now(),
      });
  }
};

exports.down = async function down() {
  // Preserve dictionary entries because historical ledgers continue to reference these codes.
};
