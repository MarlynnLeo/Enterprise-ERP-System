/**
 * 移除 inventory_year_end_balances 表中未使用的 adjust_quantity 列
 *
 * 审计发现：该字段在表结构中定义但 Service 层从未写入或读取。
 * 库存调整事务已通过 inventory_ledger 的正/负 quantity 体现在
 * inbound / outbound 汇总中，adjust_quantity 纯属冗余。
 */

exports.up = async function (knex) {
  const hasCol = await knex.schema.hasColumn('inventory_year_end_balances', 'adjust_quantity');
  if (hasCol) {
    await knex.schema.alterTable('inventory_year_end_balances', (table) => {
      table.dropColumn('adjust_quantity');
    });
  }
};

exports.down = async function (knex) {
  const hasCol = await knex.schema.hasColumn('inventory_year_end_balances', 'adjust_quantity');
  if (!hasCol) {
    await knex.schema.alterTable('inventory_year_end_balances', (table) => {
      table.decimal('adjust_quantity', 15, 3).notNullable().defaultTo(0).comment('调整数量');
    });
  }
};
