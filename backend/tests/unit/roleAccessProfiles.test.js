const {
  getProfile,
  menuAllowed,
  permissionAllowed,
  selectAllowedMenuIds,
  describeRoleAccess,
} = require('../../src/authorization/roleAccessProfiles');
const RoleAccessService = require('../../src/services/RoleAccessService');

describe('roleAccessProfiles', () => {
  test('库存操作员不能拿到财务/采购/销售菜单', () => {
    const spec = getProfile('inventory_operator');
    expect(menuAllowed({ path: '/inventory/stock', permission: 'inventory:stock' }, spec)).toBe(true);
    expect(menuAllowed({ path: '/basedata/materials', permission: 'basedata:materials' }, spec)).toBe(true);
    expect(menuAllowed({ path: '/basedata/boms', permission: 'basedata:boms' }, spec)).toBe(false);
    expect(menuAllowed({ path: '/production/plan', permission: 'production:plans' }, spec)).toBe(true);
    expect(permissionAllowed('production:plans:view', spec)).toBe(true);
    expect(permissionAllowed('production:plans:create', spec)).toBe(false);
    expect(permissionAllowed('production:plans:update', spec)).toBe(false);
    expect(menuAllowed({ path: '/finance/gl/accounts', permission: 'finance:accounts:view' }, spec)).toBe(false);
    expect(menuAllowed({ path: '/purchase/orders', permission: 'purchase:orders' }, spec)).toBe(false);
    expect(menuAllowed({ path: '/sales/orders', permission: 'sales:orders' }, spec)).toBe(false);
    expect(permissionAllowed('inventory:value:view', spec)).toBe(false);
    expect(permissionAllowed('basedata:materials:view', spec)).toBe(true);
  });

  test('/basedata 目录不等于全部基础资料', () => {
    const spec = getProfile('inventory_operator');
    expect(menuAllowed({ path: '/basedata', permission: 'basedata' }, spec)).toBe(true);
    expect(menuAllowed({ path: '/basedata/customers', permission: 'basedata:customers' }, spec)).toBe(false);
    expect(menuAllowed({ path: '/basedata/suppliers', permission: 'basedata:suppliers' }, spec)).toBe(false);
  });

  test('出纳只保留资金与现金流量', () => {
    const spec = getProfile('cashier');
    expect(menuAllowed({ path: '/finance/cash/accounts', permission: 'finance:cash:view' }, spec)).toBe(true);
    expect(menuAllowed({ path: '/finance/reports/standard-cash-flow', permission: 'finance:reports:standard-cash-flow' }, spec)).toBe(true);
    expect(menuAllowed({ path: '/finance/gl/accounts', permission: 'finance:accounts:view' }, spec)).toBe(false);
    expect(menuAllowed({ path: '/finance/ap/invoices', permission: 'finance:ap:view' }, spec)).toBe(false);
    expect(permissionAllowed('finance:cash:view', spec)).toBe(true);
    expect(permissionAllowed('finance:entries:view', spec)).toBe(false);
  });

  test('会计助理做凭证和应收应付，不能结账或改财务设置', () => {
    const assistant = getProfile('accountant');
    expect(permissionAllowed('finance:entries:create', assistant)).toBe(true);
    expect(permissionAllowed('finance:ar:view', assistant)).toBe(true);
    expect(permissionAllowed('finance:ap:view', assistant)).toBe(true);
    expect(permissionAllowed('finance:accounts:view', assistant)).toBe(true);
    expect(permissionAllowed('finance:closing:execute', assistant)).toBe(false);
    expect(permissionAllowed('finance:settings:update', assistant)).toBe(false);
    expect(permissionAllowed('finance:accounts:create', assistant)).toBe(false);
    expect(menuAllowed({ path: '/finance/gl/entries', permission: 'finance:entries' }, assistant)).toBe(true);
    expect(menuAllowed({ path: '/finance/gl/period-closing', permission: 'finance:closing' }, assistant)).toBe(false);
    expect(menuAllowed({ path: '/finance/settings', permission: 'finance:settings' }, assistant)).toBe(false);

    const manager = getProfile('finance_manager');
    expect(permissionAllowed('finance:closing:execute', manager)).toBe(true);
    expect(permissionAllowed('finance:settings:update', manager)).toBe(true);
    expect(menuAllowed({ path: '/finance/gl/period-closing', permission: 'finance:closing' }, manager)).toBe(true);
  });

  test('采购部门不含生产操作，生产计划员可以排产', () => {
    const purchase = getProfile('purchase');
    expect(permissionAllowed('purchase:orders:view', purchase)).toBe(true);
    expect(permissionAllowed('production:plans:view', purchase)).toBe(true);
    expect(permissionAllowed('production:plans:create', purchase)).toBe(false);
    expect(permissionAllowed('sales:orders:view', purchase)).toBe(false);
    expect(permissionAllowed('system:workflow:use', purchase)).toBe(false);

    expect(permissionAllowed('purchase:orders:approve', purchase)).toBe(false);
    expect(permissionAllowed('purchase:requisitions:approve', purchase)).toBe(false);
    expect(permissionAllowed('purchase:orders:approve', getProfile('purchaser'))).toBe(false);

    const purchaseManager = getProfile('purchase_manager');
    expect(permissionAllowed('purchase:orders:approve', purchaseManager)).toBe(true);
    expect(permissionAllowed('purchase:requisitions:approve', purchaseManager)).toBe(true);
    expect(permissionAllowed('system:workflow:use', purchaseManager)).toBe(true);
    expect(menuAllowed({ path: '/workflow/approvals', permission: 'system:workflow:use' }, purchaseManager)).toBe(false);
    expect(permissionAllowed('system:workflow:use', getProfile('production_operator'))).toBe(false);
    expect(permissionAllowed('sales:orders:approve', getProfile('salesperson'))).toBe(false);
    expect(permissionAllowed('contract:approve', getProfile('sales_manager'))).toBe(true);
    expect(permissionAllowed('basedata:ecn:approve', getProfile('production_manager'))).toBe(true);
    expect(permissionAllowed('finance:expenses:approve', getProfile('accountant'))).toBe(false);
    expect(permissionAllowed('finance:cash:approve', getProfile('cashier'))).toBe(false);
    expect(permissionAllowed('finance:expenses:approve', getProfile('finance_manager'))).toBe(true);
    expect(permissionAllowed('finance:assets:approve', getProfile('finance_manager'))).toBe(true);
    expect(permissionAllowed('inventory:manual:approve', getProfile('inventory_operator'))).toBe(false);
    expect(permissionAllowed('inventory:manual:approve', getProfile('inventory_manager'))).toBe(true);
    expect(permissionAllowed('quality:scrap:approve', getProfile('quality_inspector'))).toBe(false);
    expect(permissionAllowed('quality:scrap:approve', getProfile('quality_manager'))).toBe(true);

    const operator = getProfile('production_operator');
    expect(permissionAllowed('production:plans:view', operator)).toBe(true);
    expect(permissionAllowed('production:plans:create', operator)).toBe(false);
    expect(permissionAllowed('production:plans:update', operator)).toBe(false);
    expect(permissionAllowed('production:tasks:view', operator)).toBe(true);
    expect(permissionAllowed('production:tasks:update', operator)).toBe(true);
    expect(permissionAllowed('production:tasks:create', operator)).toBe(false);
    expect(permissionAllowed('production:reports:create', operator)).toBe(true);
    expect(permissionAllowed('production:supplement:create', operator)).toBe(true);
    expect(permissionAllowed('production:exchange:create', operator)).toBe(true);
    expect(permissionAllowed('inventory:outbound:create', operator)).toBe(false);
    expect(permissionAllowed('inventory:inbound:create', operator)).toBe(false);
    expect(menuAllowed({ path: '/production/plan', permission: 'production:plans' }, operator)).toBe(true);
    expect(menuAllowed({ path: '/production/task', permission: 'production:tasks' }, operator)).toBe(true);
    expect(menuAllowed({ path: '/production/process', permission: 'production:process' }, operator)).toBe(true);
    expect(menuAllowed({ path: '/production/report', permission: 'production:reports' }, operator)).toBe(true);
    expect(menuAllowed({ path: '/production/anomaly', permission: 'production:anomaly' }, operator)).toBe(true);
    expect(menuAllowed({ path: '/production/equipment-monitoring', permission: 'production:equipment' }, operator)).toBe(true);
    expect(menuAllowed({ path: '/production/mrp', permission: 'production:mrp' }, operator)).toBe(false);
    expect(menuAllowed({ path: '/production/gantt', permission: 'production:gantt' }, operator)).toBe(false);

    const planner = getProfile('production_planner');
    expect(permissionAllowed('production:plans:create', planner)).toBe(true);
    expect(permissionAllowed('production:plans:pushdown', planner)).toBe(true);
    expect(permissionAllowed('production:tasks:update', planner)).toBe(true);
    expect(permissionAllowed('production:process:view', planner)).toBe(true);
    expect(permissionAllowed('production:reports:create', planner)).toBe(true);
    expect(menuAllowed({ path: '/production/plan', permission: 'production:plans' }, planner)).toBe(true);
    expect(menuAllowed({ path: '/production/task', permission: 'production:tasks' }, planner)).toBe(true);
    expect(menuAllowed({ path: '/production/process', permission: 'production:process' }, planner)).toBe(true);
    expect(menuAllowed({ path: '/production/report', permission: 'production:reports' }, planner)).toBe(true);
    expect(permissionAllowed('production:equipment:view', planner)).toBe(false);
    expect(permissionAllowed('finance:entries:view', planner)).toBe(false);

    const planning = getProfile('production_planning');
    expect(permissionAllowed('purchase:orders:create', planning)).toBe(true);
    expect(permissionAllowed('sales:orders:create', planning)).toBe(true);
    expect(permissionAllowed('production:plans:create', planning)).toBe(true);
    expect(permissionAllowed('production:tasks:update', planning)).toBe(true);
    expect(permissionAllowed('purchase:price:view', planning)).toBe(true);
    expect(permissionAllowed('sales:price:view', planning)).toBe(true);
    expect(menuAllowed({ path: '/purchase/orders', permission: 'purchase:orders' }, planning)).toBe(true);
    expect(menuAllowed({ path: '/sales/orders', permission: 'sales:orders' }, planning)).toBe(true);
    expect(menuAllowed({ path: '/production/plan', permission: 'production:plans' }, planning)).toBe(true);
    expect(permissionAllowed('finance:entries:view', planning)).toBe(false);
    expect(permissionAllowed('inventory:outbound:create', planning)).toBe(false);
  });

  test('品质部覆盖质量模块，不含生产/财务', () => {
    const spec = getProfile('100001');
    expect(menuAllowed({ path: '/quality/incoming', permission: 'quality:incoming' }, spec)).toBe(true);
    expect(menuAllowed({ path: '/inventory/stock', permission: 'inventory:stock' }, spec)).toBe(true);
    expect(menuAllowed({ path: '/production/plan', permission: 'production:plans' }, spec)).toBe(true);
    expect(menuAllowed({ path: '/finance/cash/accounts', permission: 'finance:cash:view' }, spec)).toBe(false);
  });

  test('三类检验员只保留本岗检验，不互相串岗', () => {
    const incoming = getProfile('incoming_inspector');
    expect(menuAllowed({ path: '/quality/incoming', permission: 'quality:incoming' }, incoming)).toBe(true);
    expect(permissionAllowed('quality:incoming:create', incoming)).toBe(true);
    expect(menuAllowed({ path: '/quality/process', permission: 'quality:process' }, incoming)).toBe(false);
    expect(menuAllowed({ path: '/quality/final', permission: 'quality:final' }, incoming)).toBe(false);
    expect(permissionAllowed('quality:8d:create', incoming)).toBe(false);
    expect(permissionAllowed('quality:templates:view', incoming)).toBe(true);
    expect(permissionAllowed('quality:templates:create', incoming)).toBe(false);
    expect(permissionAllowed('quality:incoming:view', incoming)).toBe(true);
    expect(permissionAllowed('purchase:orders:view', incoming)).toBe(true);
    expect(permissionAllowed('purchase:orders:create', incoming)).toBe(false);
    expect(menuAllowed({ path: '/purchase/orders', permission: 'purchase:orders' }, incoming)).toBe(false);

    const process = getProfile('process_inspector');
    expect(menuAllowed({ path: '/quality/process', permission: 'quality:process' }, process)).toBe(true);
    expect(menuAllowed({ path: '/quality/first-article', permission: 'quality:first-article' }, process)).toBe(true);
    expect(menuAllowed({ path: '/quality/incoming', permission: 'quality:incoming' }, process)).toBe(false);
    expect(menuAllowed({ path: '/quality/final', permission: 'quality:final' }, process)).toBe(false);
    expect(permissionAllowed('production:tasks:view', process)).toBe(true);
    expect(permissionAllowed('production:process:view', process)).toBe(true);
    expect(permissionAllowed('production:tasks:create', process)).toBe(false);
    expect(menuAllowed({ path: '/production/task', permission: 'production:tasks' }, process)).toBe(false);

    const final = getProfile('final_inspector');
    expect(menuAllowed({ path: '/quality/final', permission: 'quality:final' }, final)).toBe(true);
    expect(permissionAllowed('quality:final:submit', final)).toBe(true);
    expect(menuAllowed({ path: '/quality/incoming', permission: 'quality:incoming' }, final)).toBe(false);
    expect(menuAllowed({ path: '/quality/process', permission: 'quality:process' }, final)).toBe(false);
    expect(permissionAllowed('production:tasks:view', final)).toBe(true);
    expect(permissionAllowed('inventory:inbound:create', final)).toBe(true);
    expect(permissionAllowed('purchase:orders:view', final)).toBe(true);
    expect(permissionAllowed('inventory:outbound:create', final)).toBe(false);
    expect(permissionAllowed('finance:entries:view', final)).toBe(false);
  });

  test('零部件仓只做出库，成品仓做入库和销售出库', () => {
    const component = getProfile('component_warehouse_operator');
    expect(permissionAllowed('inventory:outbound:create', component)).toBe(true);
    expect(permissionAllowed('inventory:stock:view', component)).toBe(true);
    expect(permissionAllowed('production:tasks:view', component)).toBe(true);
    expect(permissionAllowed('production:tasks:create', component)).toBe(false);
    expect(permissionAllowed('inventory:inbound:create', component)).toBe(false);
    expect(permissionAllowed('sales:outbound:create', component)).toBe(false);
    expect(menuAllowed({ path: '/inventory/outbound', permission: 'inventory:outbound' }, component)).toBe(true);
    expect(menuAllowed({ path: '/sales/outbound', permission: 'sales:outbound' }, component)).toBe(false);

    const finished = getProfile('finished_goods_operator');
    expect(permissionAllowed('inventory:inbound:create', finished)).toBe(true);
    expect(permissionAllowed('sales:outbound:create', finished)).toBe(true);
    expect(permissionAllowed('sales:orders:view', finished)).toBe(true);
    expect(permissionAllowed('inventory:outbound:create', finished)).toBe(false);
    expect(permissionAllowed('inventory:value:view', finished)).toBe(false);
    expect(menuAllowed({ path: '/inventory/inbound', permission: 'inventory:inbound' }, finished)).toBe(true);
    expect(menuAllowed({ path: '/sales/outbound', permission: 'sales:outbound' }, finished)).toBe(true);
    expect(menuAllowed({ path: '/dataoverview/inventory', permission: 'dataoverview:inventory' }, finished)).toBe(false);
  });

  test('普通员工只留仪表盘和通知', () => {
    const spec = getProfile('employee');
    expect(menuAllowed({ path: '/', permission: 'dashboard' }, spec)).toBe(true);
    expect(menuAllowed({ path: '/system/notifications', permission: 'system:notifications' }, spec)).toBe(true);
    expect(menuAllowed({ path: '/production/plan', permission: 'production:plans' }, spec)).toBe(true);
    expect(menuAllowed({ path: '/system/users', permission: 'system:users' }, spec)).toBe(false);
    expect(menuAllowed({ path: '/inventory/stock', permission: 'inventory:stock' }, spec)).toBe(false);
  });

  test('selectAllowedMenuIds 去掉停用菜单', () => {
    const spec = getProfile('inventory_operator');
    const ids = selectAllowedMenuIds(
      [
        { id: 1, path: '/inventory/stock', permission: 'inventory:stock', status: 1 },
        { id: 2, path: '/finance/gl/accounts', permission: 'finance:accounts:view', status: 1 },
        { id: 3, path: '/inventory/check', permission: 'inventory:check', status: 0 },
      ],
      spec
    );
    expect(ids).toEqual([1]);
  });

  test('超管描述为全部模块，自定义角色不托管', () => {
    expect(describeRoleAccess('admin', 1).superAdmin).toBe(true);
    expect(describeRoleAccess('custom_role').managed).toBe(false);
    expect(describeRoleAccess('inventory_operator').managed).toBe(true);
  });
});

describe('RoleAccessService.shouldGrantNewMenu', () => {
  test('超管永远继承新菜单', () => {
    expect(
      RoleAccessService.shouldGrantNewMenu(
        { code: 'admin', is_super_admin: 1 },
        { path: '/finance/new', permission: 'finance:new', type: 1 }
      )
    ).toBe(true);
  });

  test('库存角色不会因为有基础资料目录就继承客户页', () => {
    expect(
      RoleAccessService.shouldGrantNewMenu(
        { code: 'inventory_operator', is_super_admin: 0 },
        { path: '/basedata/customers', permission: 'basedata:customers', type: 1 },
        { parentAssigned: true }
      )
    ).toBe(false);
  });

  test('库存角色继承库存页下的按钮', () => {
    expect(
      RoleAccessService.shouldGrantNewMenu(
        { code: 'inventory_operator', is_super_admin: 0 },
        { path: '', permission: 'inventory:inbound:create', type: 2 },
        { parentAssigned: true }
      )
    ).toBe(true);
  });

  test('自定义角色只继承已有页面下的按钮', () => {
    expect(
      RoleAccessService.shouldGrantNewMenu(
        { code: 'custom_x', is_super_admin: 0 },
        { path: '/sales/orders', permission: 'sales:orders', type: 1 },
        { parentAssigned: true }
      )
    ).toBe(false);
    expect(
      RoleAccessService.shouldGrantNewMenu(
        { code: 'custom_x', is_super_admin: 0 },
        { path: '', permission: 'sales:orders:create', type: 2 },
        { parentAssigned: true }
      )
    ).toBe(true);
  });
});
