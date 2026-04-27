/**
 * 迁移: 为 equipment 表添加 deleted_at 列（支持软删除）
 * 
 * 原因: BaseService 默认启用软删除，会在查询时自动添加
 * WHERE equipment.deleted_at IS NULL 条件。
 * 但 equipment 表缺少该列，导致 SQL 报错。
 */

exports.up = function (knex) {
  return knex.schema.alterTable('equipment', (table) => {
    table.datetime('deleted_at').nullable().defaultTo(null);
    table.index('deleted_at');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('equipment', (table) => {
    table.dropIndex('deleted_at');
    table.dropColumn('deleted_at');
  });
};
