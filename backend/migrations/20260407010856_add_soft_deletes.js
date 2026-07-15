/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const tables = [
    'materials',
    'purchase_orders',
    'purchase_receipts',
    'sales_orders',
    'sales_shipments',
    'production_plans',
    'production_tasks',
    'quality_inspections'
  ];

  for (const table of tables) {
    if (!(await knex.schema.hasTable(table))) continue;
    const hasColumn = await knex.schema.hasColumn(table, 'deleted_at');
    if (!hasColumn) {
      await knex.schema.alterTable(table, (t) => {
        t.timestamp('deleted_at').nullable().comment('用于软删除的标记');
        t.index(['deleted_at']); // 建立索引供查询物理屏蔽使用
      });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  const tables = [
    'materials',
    'purchase_orders',
    'purchase_receipts',
    'sales_orders',
    'sales_shipments',
    'production_plans',
    'production_tasks',
    'quality_inspections'
  ];

  for (const table of tables) {
    if (!(await knex.schema.hasTable(table))) continue;
    const hasColumn = await knex.schema.hasColumn(table, 'deleted_at');
    if (hasColumn) {
      await knex.schema.alterTable(table, (t) => {
        t.dropColumn('deleted_at');
      });
    }
  }
};
