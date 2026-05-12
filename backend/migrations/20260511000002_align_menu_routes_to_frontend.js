const ROUTE_MENU_ALIGNMENT = [
  { path: '/inventory/year-end', permission: 'inventory:stock', component: 'inventory/InventoryYearEnd' },
  { path: '/dataoverview/production', component: 'dataOverview/ProductionDashboard' },
  { path: '/dataoverview/inventory', component: 'dataOverview/InventoryDashboard' },
  { path: '/dataoverview/sales', component: 'dataOverview/SalesDashboard' },
  { path: '/dataoverview/finance', component: 'dataOverview/FinanceDashboard' },
  { path: '/dataoverview/quality', component: 'dataOverview/QualityDashboard' },
  { path: '/production/plan', component: 'production/ProductionPlan' },
  { path: '/production/process', component: 'production/ProductionProcess' },
  { path: '/production/report', component: 'production/ProductionReport' },
  { path: '/production/equipment-monitoring', component: 'production/EquipmentMonitoring' },
  { path: '/basedata/materials', component: 'baseData/Materials' },
  { path: '/basedata/boms', component: 'baseData/Boms' },
  { path: '/basedata/customers', component: 'baseData/Customers' },
  { path: '/basedata/suppliers', component: 'baseData/Suppliers' },
  { path: '/basedata/locations', component: 'baseData/Locations' },
  { path: '/inventory/stock', component: 'inventory/InventoryStock' },
  { path: '/inventory/inbound', component: 'inventory/InventoryInbound' },
  { path: '/inventory/outbound', component: 'inventory/InventoryOutbound' },
  { path: '/inventory/transfer', component: 'inventory/InventoryTransfer' },
  { path: '/inventory/check', component: 'inventory/InventoryCheck' },
  { path: '/purchase/requisitions', component: 'purchase/PurchaseRequisitions' },
  { path: '/purchase/orders', component: 'purchase/PurchaseOrders' },
  { path: '/purchase/receipts', component: 'purchase/PurchaseReceipts' },
  { path: '/purchase/returns', component: 'purchase/PurchaseReturns' },
  { path: '/purchase/processing', component: 'purchase/OutsourcedProcessing' },
  { path: '/purchase/processing-receipts', component: 'purchase/OutsourcedReceipts' },
  { path: '/sales/orders', component: 'sales/SalesOrders' },
  { path: '/sales/outbound', component: 'sales/SalesOutbound' },
  { path: '/sales/returns', component: 'sales/SalesReturns' },
  { path: '/sales/exchanges', component: 'sales/SalesExchanges' },
  { path: '/sales/quotations', component: 'sales/SalesQuotations' },
  { path: '/quality/incoming', component: 'quality/IncomingInspection' },
  { path: '/quality/process', component: 'quality/ProcessInspection' },
  { path: '/quality/templates', component: 'quality/InspectionTemplates' },
  { path: '/quality/final', component: 'quality/FinalInspection' },
  { path: '/equipment/list', component: 'equipment/EquipmentList' },
  { path: '/equipment/maintenance', component: 'equipment/Maintenance' },
  { path: '/equipment/inspection', component: 'equipment/Inspection' },
  { path: '/equipment/status', component: 'equipment/Status' },

  { path: '/finance/pricing', permission: 'finance:pricing:view' },
  { path: '/finance/gl/accounts', permission: 'finance:accounts:view' },
  { path: '/finance/gl/entries', permission: 'finance:entries:view' },
  { path: '/finance/gl/periods', permission: 'finance:periods:view' },
  { path: '/finance/gl/trial-balance', permission: 'finance:reports:view' },
  { path: '/finance/gl/period-closing', permission: 'finance:closing:view' },
  { path: '/finance/gl/entries/receipt', permission: 'finance:entries:create' },
  { path: '/finance/gl/entries/payment', permission: 'finance:entries:create' },
  { path: '/finance/gl/entries/transfer', permission: 'finance:entries:create' },
  { path: '/finance/gl/entries/general', permission: 'finance:entries:create' },
  { path: '/finance/ar/invoices', permission: 'finance:ar:view' },
  { path: '/finance/ar/receipts', permission: 'finance:ar:view' },
  { path: '/finance/ar/aging', permission: 'finance:reports:view' },
  { path: '/finance/ap/invoices', permission: 'finance:ap:view' },
  { path: '/finance/ap/payments', permission: 'finance:ap:view' },
  { path: '/finance/ap/aging', permission: 'finance:reports:view' },
  { path: '/finance/cash/accounts', permission: 'finance:cash:view' },
  { path: '/finance/cash/bank-transactions', permission: 'finance:cash:view' },
  { path: '/finance/cash/cash-transactions', permission: 'finance:cash:view' },
  { path: '/finance/cash/reconciliation', permission: 'finance:cash:reconcile' },
  { path: '/finance/expenses', permission: 'finance:expenses:view' },
  { path: '/finance/expenses/categories', permission: 'finance:expenses:view' },
  { path: '/finance/assets/list', permission: 'finance:assets:view' },
  { path: '/finance/assets/categories', permission: 'finance:assets:view' },
  { path: '/finance/assets/depreciation', permission: 'finance:assets:view' },
  { path: '/finance/assets/cip', permission: 'finance:assets:view' },
  { path: '/finance/assets/inventory', permission: 'finance:assets:view' },
  { path: '/finance/assets/reports', permission: 'finance:assets:view' },
  { path: '/finance/reports/balance-sheet', permission: 'finance:reports:view' },
  { path: '/finance/reports/income-statement', permission: 'finance:reports:view' },
  { path: '/finance/reports/cash-flow', permission: 'finance:reports:view' },
  { path: '/finance/tax/invoices', permission: 'finance:tax:view' },
  { path: '/finance/tax/returns', permission: 'finance:tax:view' },
  { path: '/finance/tax/account-config', permission: 'finance:tax:view' },
  { path: '/finance/budget/execution', permission: 'finance:budgets:view' },
  { path: '/finance/budget/list', permission: 'finance:budgets:view' },
  { path: '/finance/budget/edit', permission: 'finance:budgets:create' },
  { path: '/finance/budget/ai', permission: 'finance:budgets:view' },
  { path: '/finance/cost/standard', permission: 'finance:cost:view' },
  { path: '/finance/cost/actual', permission: 'finance:cost:view' },
  { path: '/finance/cost/variance', permission: 'finance:cost:view' },
  { path: '/finance/cost/settings', permission: 'finance:cost:view' },
  { path: '/finance/cost/center', permission: 'finance:cost:view' },
  { path: '/finance/cost/ledger', permission: 'finance:cost:view' },
  { path: '/finance/cost/profitability', permission: 'finance:cost:view' },
  { path: '/finance/cost/abc', permission: 'finance:cost:view' },
  { path: '/finance/cost/versions', permission: 'finance:cost:view' },
  { path: '/finance/automation', permission: 'finance:automation:view' },
];

async function roleIdsWithMenu(trx, menuId) {
  if (!menuId) return [];
  const rows = await trx('role_menus').distinct('role_id').where('menu_id', menuId);
  return rows.map((row) => row.role_id);
}

async function grantMenuToRoles(trx, menuId, roleIds) {
  for (const roleId of [...new Set(roleIds.filter(Boolean))]) {
    const exists = await trx('role_menus').where({ role_id: roleId, menu_id: menuId }).first();
    if (!exists) {
      await trx('role_menus').insert({ role_id: roleId, menu_id: menuId, created_at: trx.fn.now() });
    }
  }
}

async function ensureProductionMrpMenu(trx) {
  const existing = await trx('menus').where({ path: '/production/mrp' }).first();
  const productionRoot = await trx('menus').where({ permission: 'production' }).orderBy('id').first();
  if (existing) {
    await trx('menus').where('id', existing.id).update({
      parent_id: productionRoot?.id || existing.parent_id,
      component: 'production/MRPPlanning',
      permission: 'production:mrp',
      type: 1,
      visible: 1,
      status: 1,
      updated_at: trx.fn.now(),
    });
    await grantMenuToRoles(trx, existing.id, await roleIdsWithMenu(trx, productionRoot?.id));
    return existing.id;
  }

  const [id] = await trx('menus').insert({
    parent_id: productionRoot?.id || 0,
    name: 'MRP Planning',
    path: '/production/mrp',
    component: 'production/MRPPlanning',
    icon: 'icon-data-analysis',
    permission: 'production:mrp',
    type: 1,
    visible: 1,
    status: 1,
    sort_order: 7,
    created_at: trx.fn.now(),
    updated_at: trx.fn.now(),
  });

  await grantMenuToRoles(trx, id, await roleIdsWithMenu(trx, productionRoot?.id));
  return id;
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    for (const spec of ROUTE_MENU_ALIGNMENT) {
      const payload = { updated_at: trx.fn.now() };
      if (spec.permission) payload.permission = spec.permission;
      if (spec.component) payload.component = spec.component;
      await trx('menus').where({ path: spec.path }).update(payload);
    }

    await ensureProductionMrpMenu(trx);
  });
};

exports.down = async function down() {
  // Menu alignment is a data repair and is intentionally not rolled back.
};
