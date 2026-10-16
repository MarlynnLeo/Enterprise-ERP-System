'use strict';

// Add evidence only. Historical balances must be reconciled to actual posted
// vouchers by an operator; this migration never invents vouchers or backfills money.
exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('fixed_assets', 'acquisition_entry_item_id'))) {
    await knex.schema.alterTable('fixed_assets', table => {
      table.integer('acquisition_entry_item_id').unsigned().nullable().index();
    });
  }
  if (!(await knex.schema.hasTable('asset_cost_allocations'))) {
    await knex.schema.createTable('asset_cost_allocations', table => {
      table.increments('id');
      table.string('target_type', 20).notNullable();
      table.integer('target_id').unsigned().notNullable();
      table.integer('gl_entry_id').unsigned().notNullable();
      table.integer('gl_entry_item_id').unsigned().notNullable().index();
      table.decimal('amount', 18, 2).notNullable();
      table.date('source_date').notNullable();
      table.boolean('reconciles_existing').notNullable().defaultTo(false);
      table.string('created_by', 100).nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['target_type', 'target_id', 'gl_entry_item_id'], 'asset_cost_target_source_uq');
      table.index(['target_type', 'target_id']);
    });
  }
  if (!(await knex.schema.hasTable('cip_capitalizations'))) {
    await knex.schema.createTable('cip_capitalizations', table => {
      table.integer('project_id').unsigned().primary();
      table.integer('asset_id').unsigned().notNullable().unique();
      table.integer('gl_entry_id').unsigned().notNullable().unique();
      table.decimal('amount', 18, 2).notNullable();
      table.date('capitalization_date').notNullable();
      table.string('created_by', 100).nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function down(knex) {
  for (const name of ['asset_cost_allocations', 'cip_capitalizations']) {
    if (await knex.schema.hasTable(name)) {
      if (await knex(name).first('created_at')) throw new Error('已有资本化来源记录，禁止自动回滚并丢失会计追溯');
    }
  }
  if (await knex('fixed_assets').whereNotNull('acquisition_entry_item_id').first('id')) {
    throw new Error('资产已关联取得凭证，禁止自动回滚');
  }
  await knex.schema.dropTableIfExists('cip_capitalizations');
  await knex.schema.dropTableIfExists('asset_cost_allocations');
  await knex.schema.alterTable('fixed_assets', table => table.dropColumn('acquisition_entry_item_id'));
};
