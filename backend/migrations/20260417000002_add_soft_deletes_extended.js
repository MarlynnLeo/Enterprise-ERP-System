/**
 * 扩展软删除: 为更多核心业务表添加 deleted_at 字段
 * 已有 deleted_at 的表: materials, purchase_orders, purchase_receipts,
 *   sales_orders, sales_shipments, production_plans, production_tasks, quality_inspections
 */

exports.up = async function (knex) {
  const tables = [
    // 主数据表
    'customers',
    'suppliers',
    'categories',
    'units',
    'locations',
    'bom_masters',
    'process_templates',
    'inspection_methods',
    'material_sources',
    // 财务/成本表
    'expenses',
    'expense_categories',
    'cost_centers',
    'cost_activities',
    'overhead_allocation_config',
    'finance_account_mapping',
    // 销售事务表
    'sales_quotations',
    'sales_returns',
    'sales_outbound',
    'sales_exchanges',
    'packing_lists',
    // 采购事务表
    'purchase_requisitions',
    // 库存事务表
    'inventory_transfers',
    'inventory_checks',
    'inventory_outbound',
    // 质量事务表
    'eight_d_reports',
    'first_article_inspections',
    // 打印/配置表
    'print_templates',
    'print_settings',
  ];

  for (const table of tables) {
    const exists = await knex.schema.hasTable(table);
    if (!exists) continue;
    const hasColumn = await knex.schema.hasColumn(table, 'deleted_at');
    if (!hasColumn) {
      await knex.schema.alterTable(table, (t) => {
        t.timestamp('deleted_at').nullable().comment('软删除标记');
        t.index(['deleted_at']);
      });
    }
  }
};

exports.down = async function (knex) {
  const tables = [
    'customers',
    'suppliers',
    'categories',
    'units',
    'locations',
    'bom_masters',
    'process_templates',
    'inspection_methods',
    'material_sources',
    'expenses',
    'expense_categories',
    'cost_centers',
    'cost_activities',
    'overhead_allocation_config',
    'finance_account_mapping',
    'sales_quotations',
    'sales_returns',
    'sales_outbound',
    'sales_exchanges',
    'packing_lists',
    'purchase_requisitions',
    'inventory_transfers',
    'inventory_checks',
    'inventory_outbound',
    'eight_d_reports',
    'first_article_inspections',
    'print_templates',
    'print_settings',
  ];

  for (const table of tables) {
    const exists = await knex.schema.hasTable(table);
    if (!exists) continue;
    const hasColumn = await knex.schema.hasColumn(table, 'deleted_at');
    if (hasColumn) {
      await knex.schema.alterTable(table, (t) => {
        t.dropColumn('deleted_at');
      });
    }
  }
};
