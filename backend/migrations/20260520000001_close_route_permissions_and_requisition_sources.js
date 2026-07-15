const ROUTE_MENUS = [
  { parentPermission: 'dataoverview', name: 'Production Overview', path: '/dataoverview/production', component: 'dataOverview/ProductionDashboard', icon: 'DataAnalysis', permission: 'dataoverview:production', sort_order: 10 },
  { parentPermission: 'dataoverview', name: 'Inventory Overview', path: '/dataoverview/inventory', component: 'dataOverview/InventoryDashboard', icon: 'DataAnalysis', permission: 'dataoverview:inventory', sort_order: 20 },
  { parentPermission: 'dataoverview', name: 'Sales Overview', path: '/dataoverview/sales', component: 'dataOverview/SalesDashboard', icon: 'DataAnalysis', permission: 'dataoverview:sales', sort_order: 30 },
  { parentPermission: 'dataoverview', name: 'Finance Overview', path: '/dataoverview/finance', component: 'dataOverview/FinanceDashboard', icon: 'DataAnalysis', permission: 'dataoverview:finance', sort_order: 40 },
  { parentPermission: 'dataoverview', name: 'Quality Overview', path: '/dataoverview/quality', component: 'dataOverview/QualityDashboard', icon: 'DataAnalysis', permission: 'dataoverview:quality', sort_order: 50 },
  { parentPermission: 'dataoverview', name: 'Purchase Overview', path: '/dataoverview/purchase', component: 'dataOverview/PurchaseDashboard', icon: 'DataAnalysis', permission: 'dataoverview:purchase', sort_order: 60 },
  { parentPermission: 'production', name: '缺料统计', path: '/production/material-shortage', component: 'production/MaterialShortage', icon: 'Warning', permission: 'production:shortage', sort_order: 50 },
  { parentPermission: 'production', name: '排程甘特图', path: '/production/gantt', component: 'production/ProductionGantt', icon: 'DataLine', permission: 'production:gantt', sort_order: 90 },
  { parentPermission: 'inventory', name: 'Manual Transaction', path: '/inventory/manual-transaction', component: 'inventory/ManualTransaction', icon: 'Edit', permission: 'inventory:manual-transaction', sort_order: 35 },
  { parentPermission: 'inventory', name: 'Inventory Report', path: '/inventory/report', component: 'inventory/InventoryReport', icon: 'Document', permission: 'inventory:report', sort_order: 60 },
  { parentPermission: 'inventory', name: 'Inventory Transaction', path: '/inventory/transaction', component: 'inventory/InventoryTransaction', icon: 'Tickets', permission: 'inventory:transaction', sort_order: 80 },
  { parentPermission: 'sales', name: 'Packing Lists', path: '/sales/packing-lists', component: 'sales/PackingLists', icon: 'Document', permission: 'sales:packing-lists', sort_order: 60 },
  { parentPermission: 'sales', name: 'Delivery Stats', path: '/sales/delivery-stats', component: 'sales/DeliveryStats', icon: 'TrendCharts', permission: 'sales:delivery-stats', sort_order: 70 },
  { parentPermission: 'equipment', name: 'Equipment Inspection', path: '/equipment/inspection', component: 'equipment/Inspection', icon: 'CircleCheck', permission: 'equipment:inspection', sort_order: 30 },
  { parentPermission: 'equipment', name: 'Equipment Status', path: '/equipment/status', component: 'equipment/Status', icon: 'Monitor', permission: 'equipment:status', sort_order: 40 },
  { parentPermission: 'quality', name: 'First Article Inspection', path: '/quality/first-article', component: 'quality/FirstArticleInspection', icon: 'CircleCheck', permission: 'quality:first-article', sort_order: 25 },
  { parentPermission: 'quality', name: 'AQL Standards', path: '/quality/aql-standards', component: 'quality/AQLStandards', icon: 'Setting', permission: 'quality:aql', sort_order: 60 },
  { parentPermission: 'quality', name: 'Replacement Orders', path: '/quality/replacement-orders', component: 'quality/ReplacementOrders', icon: 'Refresh', permission: 'quality:replacement', sort_order: 70 },
  { parentPermission: 'quality', name: 'Rework Tasks', path: '/quality/rework-tasks', component: 'quality/ReworkTasks', icon: 'Tools', permission: 'quality:rework', sort_order: 80 },
  { parentPermission: 'quality', name: 'Scrap Records', path: '/quality/scrap-records', component: 'quality/ScrapRecords', icon: 'Delete', permission: 'quality:scrap', sort_order: 90 },
  { parentPermission: 'quality', name: 'Quality Statistics', path: '/quality/statistics', component: 'quality/QualityStatistics', icon: 'DataAnalysis', permission: 'quality:statistics', sort_order: 100 },
  { parentPermission: 'quality', name: 'Batch Traceability', path: '/quality/traceability', component: 'quality/components/UnifiedTraceability', icon: 'Connection', permission: 'quality:traceability', sort_order: 110 },
  { parentPermission: 'quality', name: 'Gauge Management', path: '/quality/gauges', component: 'quality/GaugeManagement', icon: 'Odometer', permission: 'quality:gauges', sort_order: 120 },
  { parentPermission: 'quality', name: 'SPC Control Chart', path: '/quality/spc', component: 'quality/SPCControlChart', icon: 'DataLine', permission: 'quality:spc', sort_order: 130 },
  { parentPermission: 'quality', name: 'Supplier Quality', path: '/quality/supplier-quality', component: 'quality/SupplierQualityScorecard', icon: 'Trophy', permission: 'quality:supplier-quality', sort_order: 140 },
  { parentPermission: 'finance', name: 'Finance Settings', path: '/finance/settings', component: 'finance/settings/FinanceSettings', icon: 'Setting', permission: 'finance:settings:view', sort_order: 95 },
];

async function hasColumn(knex, tableName, columnName) {
  const [rows] = await knex.raw(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function hasIndex(knex, tableName, indexName) {
  const [rows] = await knex.raw(
    `
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
    `,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function tableExists(knex, tableName) {
  const [rows] = await knex.raw('SHOW TABLES LIKE ?', [tableName]);
  return rows.length > 0;
}

async function ensureRequisitionSourceColumns(knex) {
  if (!(await tableExists(knex, 'purchase_requisitions'))) return;

  if (!(await hasColumn(knex, 'purchase_requisitions', 'source_type'))) {
    await knex.raw('ALTER TABLE purchase_requisitions ADD COLUMN source_type VARCHAR(50) NULL AFTER status');
  }

  if (!(await hasColumn(knex, 'purchase_requisitions', 'source_id'))) {
    await knex.raw('ALTER TABLE purchase_requisitions ADD COLUMN source_id INT NULL AFTER source_type');
  }

  if (!(await hasColumn(knex, 'purchase_requisitions', 'source_material_id'))) {
    await knex.raw('ALTER TABLE purchase_requisitions ADD COLUMN source_material_id INT NULL AFTER source_id');
  }

  if (!(await hasIndex(knex, 'purchase_requisitions', 'idx_pr_source_lookup'))) {
    await knex.raw(
      'ALTER TABLE purchase_requisitions ADD INDEX idx_pr_source_lookup (source_type, source_id, source_material_id)'
    );
  }
}

async function findParentMenu(trx, permission) {
  return trx('menus').where({ permission }).orderBy('id').first();
}

async function roleIdsWithMenu(trx, menuId) {
  if (!menuId) return [];
  const rows = await trx('role_menus').distinct('role_id').where({ menu_id: menuId });
  return rows.map((row) => row.role_id);
}

async function grantMenuToRoles(trx, menuId, roleIds) {
  for (const roleId of [...new Set(roleIds.filter(Boolean))]) {
    const exists = await trx('role_menus').where({ role_id: roleId, menu_id: menuId }).first();
    if (!exists) {
      await trx('role_menus').insert({
        role_id: roleId,
        menu_id: menuId,
        created_at: trx.fn.now(),
      });
    }
  }
}

async function upsertRouteMenu(trx, spec) {
  const parent = await findParentMenu(trx, spec.parentPermission);
  if (!parent) return null;

  const parentRoleIds = await roleIdsWithMenu(trx, parent.id);
  const payload = {
    parent_id: parent.id,
    name: spec.name,
    path: spec.path,
    component: spec.component,
    icon: spec.icon,
    permission: spec.permission,
    type: 1,
    visible: 1,
    status: 1,
    sort_order: spec.sort_order,
    updated_at: trx.fn.now(),
  };

  const existing = await trx('menus')
    .where({ path: spec.path })
    .orWhere({ permission: spec.permission })
    .first();

  if (existing) {
    await trx('menus').where({ id: existing.id }).update(payload);
    await grantMenuToRoles(trx, existing.id, parentRoleIds);
    return existing.id;
  }

  const [id] = await trx('menus').insert({
    ...payload,
    created_at: trx.fn.now(),
  });
  await grantMenuToRoles(trx, id, parentRoleIds);
  return id;
}

exports.up = async function up(knex) {
  await ensureRequisitionSourceColumns(knex);

  await knex.transaction(async (trx) => {
    for (const spec of ROUTE_MENUS) {
      await upsertRouteMenu(trx, spec);
    }
  });
};

exports.down = async function down(knex) {
  if (await tableExists(knex, 'purchase_requisitions')) {
    if (await hasIndex(knex, 'purchase_requisitions', 'uq_pr_source_material')) {
      await knex.raw('ALTER TABLE purchase_requisitions DROP INDEX uq_pr_source_material');
    }
    if (await hasIndex(knex, 'purchase_requisitions', 'idx_pr_source_lookup')) {
      await knex.raw('ALTER TABLE purchase_requisitions DROP INDEX idx_pr_source_lookup');
    }
    for (const column of ['source_material_id', 'source_id', 'source_type']) {
      if (await hasColumn(knex, 'purchase_requisitions', column)) {
        await knex.raw(`ALTER TABLE purchase_requisitions DROP COLUMN ${column}`);
      }
    }
  }
};
