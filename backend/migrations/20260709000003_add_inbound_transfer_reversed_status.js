/**
 * 入库单 / 调拨单支持 reversed 状态（与出库冲销一致）
 */
exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE inventory_inbound
    MODIFY COLUMN status ENUM(
      'draft',
      'confirmed',
      'completed',
      'reversed',
      'cancelled'
    ) DEFAULT 'draft'
  `);

  await knex.raw(`
    ALTER TABLE inventory_transfers
    MODIFY COLUMN status ENUM(
      'draft',
      'pending',
      'approved',
      'completed',
      'reversed',
      'cancelled'
    ) DEFAULT 'draft'
  `);
};

exports.down = async function down(knex) {
  await knex.raw("UPDATE inventory_inbound SET status = 'cancelled' WHERE status = 'reversed'");
  await knex.raw(`
    ALTER TABLE inventory_inbound
    MODIFY COLUMN status ENUM(
      'draft',
      'confirmed',
      'completed',
      'cancelled'
    ) DEFAULT 'draft'
  `);

  await knex.raw("UPDATE inventory_transfers SET status = 'cancelled' WHERE status = 'reversed'");
  await knex.raw(`
    ALTER TABLE inventory_transfers
    MODIFY COLUMN status ENUM(
      'draft',
      'pending',
      'approved',
      'completed',
      'cancelled'
    ) DEFAULT 'draft'
  `);
};
