/**
 * 创建金属价格维护表。
 * 价格表保存当前参考价，历史表保存手工维护或外部刷新形成的价格轨迹。
 */

exports.up = async function (knex) {
  const hasPrices = await knex.schema.hasTable('metal_prices');
  if (!hasPrices) {
    await knex.schema.createTable('metal_prices', (table) => {
      table.increments('id').primary();
      table.string('symbol', 32).notNullable().unique();
      table.string('name', 100).notNullable();
      table.decimal('price', 18, 6).notNullable();
      table.decimal('change_amount', 18, 6).notNullable().defaultTo(0);
      table.decimal('change_percent', 12, 6).notNullable().defaultTo(0);
      table.string('unit', 50).notNullable();
      table.string('source', 80).notNullable().defaultTo('CONFIGURED_REFERENCE');
      table.timestamp('last_update_at').notNullable().defaultTo(knex.fn.now());
      table.timestamps(true, true);
      table.index(['symbol']);
      table.index(['source']);
      table.index(['last_update_at']);
    });
  }

  const hasHistory = await knex.schema.hasTable('metal_price_history');
  if (!hasHistory) {
    await knex.schema.createTable('metal_price_history', (table) => {
      table.increments('id').primary();
      table.string('symbol', 32).notNullable();
      table.decimal('price', 18, 6).notNullable();
      table.string('source', 80).notNullable().defaultTo('CONFIGURED_REFERENCE');
      table.timestamp('recorded_at').notNullable().defaultTo(knex.fn.now());
      table.index(['symbol', 'recorded_at']);
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('metal_price_history');
  await knex.schema.dropTableIfExists('metal_prices');
};
