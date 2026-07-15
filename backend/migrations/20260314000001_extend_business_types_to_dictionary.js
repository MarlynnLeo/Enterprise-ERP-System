/**
 * 扩展 business_types 表为通用系统字典
 * 新增 group_code（字典分组）和 tag_type（标签颜色）字段
 */

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('business_types'))) {
    await knex.schema.createTable('business_types', (table) => {
      table.increments('id').primary();
      table.string('code', 50).notNullable();
      table.string('name', 100).notNullable();
      table.specificType('category', "enum('in','out','transfer','adjust')").notNullable();
      table.text('description').nullable();
      table.string('icon', 100).nullable();
      table.string('color', 50).nullable();
      table.integer('sort_order').notNullable().defaultTo(0);
      table.boolean('is_system').notNullable().defaultTo(false);
      table.boolean('status').notNullable().defaultTo(true);
      table.integer('created_by').nullable();
      table.integer('updated_by').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique('code', { indexName: 'uk_code' });
    });
  }

  await knex.schema.alterTable('business_types', (table) => {
    table.string('group_code', 50).defaultTo('inventory_transaction').after('category')
      .comment('字典分组标识，如 warehouse_type, order_status 等');
    table.string('tag_type', 20).nullable().after('color')
      .comment('Element Plus 标签颜色类型（success/danger/warning/info/primary）');
    table.index('group_code', 'idx_group_code');
  });

  await knex('business_types')
    .whereNull('group_code')
    .orWhere('group_code', 'inventory_transaction')
    .update({ group_code: 'inventory_transaction' });
};

exports.down = function(knex) {
  return knex.schema.alterTable('business_types', (table) => {
    table.dropIndex('group_code', 'idx_group_code');
    table.dropColumn('tag_type');
    table.dropColumn('group_code');
  });
};
