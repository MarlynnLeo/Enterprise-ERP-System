/**
 * 给 exchange_rates 表补充 deleted_at 字段以支持软删除
 */
exports.up = async function(knex) {
  const hasCol = await knex.schema.hasColumn('exchange_rates', 'deleted_at');
  if (!hasCol) {
    await knex.schema.alterTable('exchange_rates', (t) => {
      t.timestamp('deleted_at').nullable().defaultTo(null);
    });
  }
};

exports.down = async function(knex) {
  const hasCol = await knex.schema.hasColumn('exchange_rates', 'deleted_at');
  if (hasCol) {
    await knex.schema.alterTable('exchange_rates', (t) => {
      t.dropColumn('deleted_at');
    });
  }
};
