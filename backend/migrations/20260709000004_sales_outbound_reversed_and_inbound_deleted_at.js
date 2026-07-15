/**
 * 1) sales_outbound 增加 reversed 状态（完成出库后可安全冲销）
 * 2) inventory_inbound 增加 deleted_at，与全局 softDelete 对齐
 */
exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE sales_outbound
    MODIFY COLUMN status ENUM(
      'draft',
      'processing',
      'completed',
      'reversed',
      'cancelled'
    ) DEFAULT 'draft'
  `);

  const hasDeletedAt = await knex.schema.hasColumn('inventory_inbound', 'deleted_at');
  if (!hasDeletedAt) {
    await knex.schema.alterTable('inventory_inbound', (table) => {
      table.datetime('deleted_at').nullable().index();
    });
  }

  // 历史 is_deleted=1 同步到 deleted_at
  await knex.raw(`
    UPDATE inventory_inbound
    SET deleted_at = COALESCE(updated_at, created_at, NOW())
    WHERE is_deleted = 1
      AND deleted_at IS NULL
  `);
};

exports.down = async function down(knex) {
  await knex.raw("UPDATE sales_outbound SET status = 'cancelled' WHERE status = 'reversed'");
  await knex.raw(`
    ALTER TABLE sales_outbound
    MODIFY COLUMN status ENUM(
      'draft',
      'processing',
      'completed',
      'cancelled'
    ) DEFAULT 'draft'
  `);

  // 不强制 drop deleted_at，避免丢数据；仅回写 is_deleted
  await knex.raw(`
    UPDATE inventory_inbound
    SET is_deleted = 1
    WHERE deleted_at IS NOT NULL AND is_deleted = 0
  `);
};
