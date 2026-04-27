/**
 * 迁移: 为 sales_orders.status 添加 shortage 枚举值
 * 
 * 原因: 代码中会根据库存情况将订单状态设为 'shortage'（缺货），
 * 但数据库 ENUM 类型未包含此值，导致 'Data truncated' 错误。
 */

exports.up = function (knex) {
  return knex.raw(`
    ALTER TABLE sales_orders 
    MODIFY COLUMN status ENUM(
      'draft','pending','confirmed','processing',
      'in_production','in_procurement','shortage',
      'ready_to_ship','partial_shipped','shipped',
      'delivered','completed','cancelled'
    ) DEFAULT 'draft'
  `);
};

exports.down = function (knex) {
  return knex.raw(`
    ALTER TABLE sales_orders 
    MODIFY COLUMN status ENUM(
      'draft','pending','confirmed','processing',
      'in_production','in_procurement',
      'ready_to_ship','partial_shipped','shipped',
      'delivered','completed','cancelled'
    ) DEFAULT 'draft'
  `);
};
