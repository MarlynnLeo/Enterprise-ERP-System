/**
 * 系统角色岗位范围 SSOT
 *
 * 用户权限只来自角色（user_roles → role_menus / role_permissions）。
 * 本文件定义每个系统角色能看见的模块/菜单/权限码。
 *
 * 约定：
 * - admin / is_super_admin：不受本表约束，拥有全部
 * - 未登记的角色视为自定义，权限页可任意勾选
 * - 已登记角色：保存权限、新建菜单、按模板重置都按本表裁剪
 * - /basedata、/dataoverview 只作目录，不代表其下全部子页
 */

const DATA_SCOPE = Object.freeze({
  ALL: 1,
  DEPT_AND_CHILDREN: 2,
  DEPT: 3,
  SELF: 4,
});

const COMMON_PERMISSIONS = Object.freeze([
  'dashboard',
  // 跨模块只读查找（下拉选项/名录/字典）。列在这里即表示「已登录即可读」，
  // 授权面与 dashboard 完全一致，但语义显式。详见 authorization/lookupPermissions.js。
  'lookup:read',
  'system:notifications',
  'system:notifications:view',
  'production:plans:view',
]);

const COMMON_PATHS = Object.freeze([
  '/',
  '/system/notifications',
  '/production',
  '/production/plan',
]);

const PRICE_SENSITIVE_PERMISSIONS = Object.freeze([
  'finance:price:view',
  'finance:price:update',
  'finance:price:export',
  'finance:pricing:view',
  'finance:pricing:create',
  'finance:pricing:update',
  'finance:pricing:delete',
  'finance:pricing:export',
  'finance:cost:view',
  'finance:cost:update',
  'finance:cost:export',
  'purchase:price:view',
  'purchase:price:update',
  'purchase:price:export',
  'sales:price:view',
  'sales:price:update',
  'sales:price:export',
  'inventory:value:view',
  'inventory:value:update',
  'inventory:value:export',
  'basedata:materials:view_price',
  'basedata:materials:view_cost',
]);

function matchesPrefix(value, prefix) {
  return value === prefix || value.startsWith(`${prefix}:`);
}

function matchesPathPrefix(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function isPriceSensitive(code) {
  return PRICE_SENSITIVE_PERMISSIONS.includes(code);
}

function permissionAllowed(code, spec) {
  if (!code) return false;
  if ((spec.denyPermissions || []).includes(code)) return false;
  if (spec.denyPrice !== false && isPriceSensitive(code) && !(spec.allowPricePermissions || []).includes(code)) {
    return false;
  }
  if (COMMON_PERMISSIONS.includes(code)) return true;
  if ((spec.exactPermissions || []).includes(code)) return true;
  return (spec.permissionPrefixes || []).some((prefix) => matchesPrefix(code, prefix));
}

function menuAllowed(menu, spec) {
  const path = String(menu?.path || '').trim();
  const perm = String(menu?.permission || '').trim();
  if (perm && (spec.denyPermissions || []).includes(perm)) return false;
  if (
    perm &&
    spec.denyPrice !== false &&
    isPriceSensitive(perm) &&
    !(spec.allowPricePermissions || []).includes(perm)
  ) {
    return false;
  }
  if (COMMON_PATHS.includes(path)) return true;
  if ((spec.exactPaths || []).includes(path)) return true;
  if (path && (spec.pathPrefixes || []).some((prefix) => matchesPathPrefix(path, prefix))) {
    return true;
  }
  if (!path) return permissionAllowed(perm, spec);
  return false;
}

function selectAllowedMenuIds(menus, spec) {
  return (menus || [])
    .filter((menu) => Number(menu.status) !== 0 && menuAllowed(menu, spec))
    .map((menu) => Number(menu.id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function defineProfile(spec) {
  return Object.freeze({
    label: spec.label,
    modules: Object.freeze([...new Set(['生产计划', ...(spec.modules || [])])]),
    permissionPrefixes: Object.freeze([...(spec.permissionPrefixes || [])]),
    exactPermissions: Object.freeze([...(spec.exactPermissions || [])]),
    pathPrefixes: Object.freeze([...(spec.pathPrefixes || [])]),
    exactPaths: Object.freeze([...(spec.exactPaths || [])]),
    denyPermissions: Object.freeze([...(spec.denyPermissions || [])]),
    allowPricePermissions: Object.freeze([...(spec.allowPricePermissions || [])]),
    denyPrice: spec.denyPrice !== false,
    // 行级数据范围已停用：岗位模板只决定功能/动作权限。
    dataScope: DATA_SCOPE.ALL,
  });
}

const MATERIAL_VIEW = ['basedata', 'basedata:materials', 'basedata:materials:view'];
const LOCATION_VIEW = ['basedata:locations', 'basedata:locations:view'];
const UNIT_VIEW = ['basedata:units', 'basedata:units:view'];
const CUSTOMER_VIEW = ['basedata:customers', 'basedata:customers:view'];
const SUPPLIER_VIEW = ['basedata:suppliers', 'basedata:suppliers:view'];
const BOM_VIEW = ['basedata:boms', 'basedata:boms:view'];
const PROCESS_VIEW = ['basedata:processtemplates', 'basedata:processtemplates:view'];
const STOCK_VIEW = ['inventory', 'inventory:stock', 'inventory:stock:view'];
const PURCHASE_PRICE = ['purchase:price:view', 'purchase:price:update', 'purchase:price:export'];
const SALES_PRICE = ['sales:price:view', 'sales:price:update', 'sales:price:export'];
const WORKFLOW_USE = ['system:workflow:use'];
const WORKFLOW_PATHS = [];
const PURCHASE_APPROVE = [
  'purchase:orders:approve',
  'purchase:requisitions:approve',
  'purchase:returns:approve',
];
const SALES_APPROVE = [
  'sales:orders:approve',
  'sales:outbound:approve',
  'contract:approve',
  'sales:returns:approve',
];
const FINANCE_APPROVE = [
  'finance:budgets:approve',
  'finance:cash:approve',
  'finance:entries:approve',
  'finance:expenses:approve',
  'finance:assets:approve',
  'finance:inventory:approve',
  'finance:inventory:reverse',
];
const INVENTORY_APPROVE = [
  'inventory:check:approve',
  'inventory:inbound:approve',
  'inventory:manual:approve',
  'inventory:outbound:approve',
  'inventory:transfer:approve',
];
const QUALITY_APPROVE = [
  'quality:incoming:approve',
  'quality:final:approve',
  'quality:8d:approve',
  'quality:scrap:approve',
  'quality:nonconforming:approve',
];
const OPERATOR_DENY_APPROVE = [
  ...PURCHASE_APPROVE,
  ...SALES_APPROVE,
  ...FINANCE_APPROVE,
  ...INVENTORY_APPROVE,
  ...QUALITY_APPROVE,
  'basedata:ecn:approve',
  'basedata:boms:approve',
  'production:plans:approve',
  'sales:returns:approve',
];

const WAREHOUSE_DENY = [
  ...OPERATOR_DENY_APPROVE,
  'inventory:outbound:cancel',
];

const WAREHOUSE_PURCHASE_RECEIPT_PERMS = [
  'purchase',
  'purchase:orders',
  'purchase:orders:view',
  'purchase:orders:pushdown', // 采购订单到货
  'purchase:orders:print',
  'purchase:receipts',
  'purchase:receipts:view',
  'purchase:receipts:update', // 采购收货单入库确认
  'purchase:receipts:print',
  'purchase:receipts:export',
  'purchase:returns',
  'purchase:returns:view',
  'purchase:returns:print',
  'purchase:processing-receipts',
  'purchase:processing-receipts:view',
  'purchase:processing-receipts:create',
  'purchase:processing-receipts:edit',
  'purchase:processing-receipts:export',
];

const WAREHOUSE_PURCHASE_PATHS = [
  '/purchase',
  '/purchase/orders',
  '/purchase/receipts',
  '/purchase/returns',
  '/purchase/processing-receipts',
];

// 委外发料由零部件仓执行：只开放查看委外加工单和发料出库动作，
// 不授予委外建单、删除或导出权限。仓储管理角色保留同样的操作能力。
const WAREHOUSE_OUTSOURCED_ISSUE_PERMS = [
  'purchase:processing',
  'purchase:processing:view',
  'purchase:processing:update',
];

const WAREHOUSE_OUTSOURCED_ISSUE_PATHS = ['/purchase/processing'];

const inventoryOperator = defineProfile({
  label: '仓储作业',
  modules: ['仪表盘', '库存', '采购到货/入库', '委外发料', '物料/库位/单位'],
  permissionPrefixes: ['inventory'],
  exactPermissions: [
    ...MATERIAL_VIEW,
    ...LOCATION_VIEW,
    ...UNIT_VIEW,
    ...WAREHOUSE_PURCHASE_RECEIPT_PERMS,
    ...WAREHOUSE_OUTSOURCED_ISSUE_PERMS,
    'production:tasks:view',
  ],
  denyPermissions: WAREHOUSE_DENY,
  pathPrefixes: ['/inventory'],
  exactPaths: [
    '/basedata',
    '/basedata/materials',
    '/basedata/locations',
    '/basedata/units',
    ...WAREHOUSE_PURCHASE_PATHS,
    ...WAREHOUSE_OUTSOURCED_ISSUE_PATHS,
  ],
  dataScope: DATA_SCOPE.ALL,
});

const inventoryManager = defineProfile({
  label: '仓储管理',
  modules: ['仪表盘', '库存', '库存概览', '采购到货/入库', '委外发料', '物料/库位/单位'],
  permissionPrefixes: ['inventory'],
  exactPermissions: [
    ...MATERIAL_VIEW,
    ...LOCATION_VIEW,
    ...UNIT_VIEW,
    ...WORKFLOW_USE,
    ...WAREHOUSE_PURCHASE_RECEIPT_PERMS,
    ...WAREHOUSE_OUTSOURCED_ISSUE_PERMS,
    'dataoverview',
    'dataoverview:inventory',
    'production:tasks:view',
  ],
  denyPermissions: ['inventory:outbound:cancel'],
  pathPrefixes: ['/inventory'],
  exactPaths: [
    '/basedata',
    '/basedata/materials',
    '/basedata/locations',
    '/basedata/units',
    '/dataoverview',
    '/dataoverview/inventory',
    ...WAREHOUSE_PURCHASE_PATHS,
    ...WAREHOUSE_OUTSOURCED_ISSUE_PATHS,
    ...WORKFLOW_PATHS,
  ],
  // 出入库单会由采购、生产、质量等多部门产生，仓库管理员需要
  // 在已授权的库存功能内查看全部单据；功能和动作仍由 permission 控制。
  dataScope: DATA_SCOPE.ALL,
});

const componentWarehouseOperator = defineProfile({
  label: '零部件仓作业',
  modules: ['仪表盘', '库存入库/出库', '采购到货/入库', '委外发料', '物料/库位/单位'],
  // 仓库操作员需要同时处理零部件入库、采购收货和生产发料出库；审批仍由
  // OPERATOR_DENY_APPROVE 统一排除，避免把业务操作权限扩大为审批权限。
  permissionPrefixes: ['inventory:inbound', 'inventory:outbound'],
  exactPermissions: [
    ...MATERIAL_VIEW,
    ...LOCATION_VIEW,
    ...UNIT_VIEW,
    ...STOCK_VIEW,
    ...WAREHOUSE_PURCHASE_RECEIPT_PERMS,
    ...WAREHOUSE_OUTSOURCED_ISSUE_PERMS,
    'inventory',
    'production:tasks:view',
  ],
  denyPermissions: WAREHOUSE_DENY,
  pathPrefixes: ['/inventory/inbound', '/inventory/outbound'],
  exactPaths: [
    '/inventory',
    '/inventory/stock',
    '/production',
    '/production/task',
    '/basedata',
    '/basedata/materials',
    '/basedata/locations',
    '/basedata/units',
    ...WAREHOUSE_PURCHASE_PATHS,
    ...WAREHOUSE_OUTSOURCED_ISSUE_PATHS,
  ],
  dataScope: DATA_SCOPE.ALL,
});

const finishedGoodsOperator = defineProfile({
  label: '成品仓作业',
  modules: ['仪表盘', '成品入库', '采购到货/入库', '销售出库', '出库管理', '物料/库位/单位'],
  permissionPrefixes: ['inventory:inbound', 'inventory:outbound', 'sales:outbound'],
  denyPermissions: WAREHOUSE_DENY,
  exactPermissions: [
    ...MATERIAL_VIEW,
    ...LOCATION_VIEW,
    ...UNIT_VIEW,
    ...STOCK_VIEW,
    ...CUSTOMER_VIEW,
    ...WAREHOUSE_PURCHASE_RECEIPT_PERMS,
    'inventory',
    'sales',
    'sales:orders:view',
    'production:tasks:view',
  ],
  pathPrefixes: ['/inventory/inbound', '/inventory/outbound', '/sales/outbound'],
  exactPaths: [
    '/inventory',
    '/inventory/stock',
    '/sales',
    '/basedata',
    '/basedata/materials',
    '/basedata/locations',
    '/basedata/units',
    '/basedata/customers',
    ...WAREHOUSE_PURCHASE_PATHS,
  ],
  dataScope: DATA_SCOPE.ALL,
});

const purchaseOperator = defineProfile({
  label: '采购作业',
  modules: ['仪表盘', '采购', '物料/供应商', '库存查询'],
  permissionPrefixes: ['purchase'],
  exactPermissions: [...MATERIAL_VIEW, ...SUPPLIER_VIEW, ...STOCK_VIEW],
  denyPermissions: OPERATOR_DENY_APPROVE,
  pathPrefixes: ['/purchase'],
  exactPaths: [
    '/basedata',
    '/basedata/materials',
    '/basedata/suppliers',
    '/inventory',
    '/inventory/stock',
  ],
  allowPricePermissions: PURCHASE_PRICE,
  dataScope: DATA_SCOPE.ALL,
});

const purchaseDept = defineProfile({
  label: '采购部门',
  modules: ['仪表盘', '采购', '采购概览', '物料/供应商', '库存查询'],
  permissionPrefixes: ['purchase'],
  exactPermissions: [...MATERIAL_VIEW, ...SUPPLIER_VIEW, ...STOCK_VIEW, 'dataoverview', 'dataoverview:purchase'],
  denyPermissions: OPERATOR_DENY_APPROVE,
  pathPrefixes: ['/purchase'],
  exactPaths: [
    '/basedata',
    '/basedata/materials',
    '/basedata/suppliers',
    '/inventory',
    '/inventory/stock',
    '/dataoverview',
    '/dataoverview/purchase',
  ],
  allowPricePermissions: PURCHASE_PRICE,
  dataScope: DATA_SCOPE.ALL,
});

const purchaseManager = defineProfile({
  label: '采购管理',
  modules: ['仪表盘', '采购', '采购概览', '物料/供应商', '库存查询'],
  permissionPrefixes: ['purchase'],
  exactPermissions: [...MATERIAL_VIEW, ...SUPPLIER_VIEW, ...STOCK_VIEW, ...WORKFLOW_USE, ...PURCHASE_APPROVE, 'dataoverview', 'dataoverview:purchase'],
  pathPrefixes: ['/purchase'],
  exactPaths: [
    '/basedata',
    '/basedata/materials',
    '/basedata/suppliers',
    '/inventory',
    '/inventory/stock',
    '/dataoverview',
    '/dataoverview/purchase',
    ...WORKFLOW_PATHS,
  ],
  allowPricePermissions: PURCHASE_PRICE,
  dataScope: DATA_SCOPE.ALL,
});

const productionPlanner = defineProfile({
  label: '生产计划员',
  modules: ['仪表盘', '生产计划', '生产任务', '生产过程', '生产报工', 'BOM/工艺', '库存查询'],
  permissionPrefixes: ['production:plans', 'production:tasks', 'production:process', 'production:reports'],
  exactPermissions: [
    'production',
    ...MATERIAL_VIEW,
    ...BOM_VIEW,
    ...PROCESS_VIEW,
    ...STOCK_VIEW,
    'dataoverview',
    'dataoverview:production',
  ],
  pathPrefixes: ['/production/plan', '/production/task', '/production/process', '/production/report'],
  exactPaths: [
    '/production',
    '/basedata',
    '/basedata/materials',
    '/basedata/boms',
    '/basedata/process-templates',
    '/inventory',
    '/inventory/stock',
    '/dataoverview',
    '/dataoverview/production',
  ],
  denyPermissions: ['production:plans:approve'],
  dataScope: DATA_SCOPE.ALL,
});

const productionPlanning = defineProfile({
  label: '生产计划',
  modules: ['仪表盘', '采购', '销售', '生产计划', '生产任务', '生产过程', '生产报工', 'BOM/工艺', '库存查询'],
  permissionPrefixes: [
    'purchase',
    'sales',
    'contract',
    'production:plans',
    'production:tasks',
    'production:process',
    'production:reports',
  ],
  exactPermissions: [
    'production',
    ...MATERIAL_VIEW,
    ...SUPPLIER_VIEW,
    ...CUSTOMER_VIEW,
    ...BOM_VIEW,
    ...PROCESS_VIEW,
    ...STOCK_VIEW,
    'dataoverview',
    'dataoverview:purchase',
    'dataoverview:sales',
    'dataoverview:production',
  ],
  pathPrefixes: [
    '/purchase',
    '/sales',
    '/production/plan',
    '/production/task',
    '/production/process',
    '/production/report',
  ],
  exactPaths: [
    '/production',
    '/basedata',
    '/basedata/materials',
    '/basedata/suppliers',
    '/basedata/customers',
    '/basedata/boms',
    '/basedata/process-templates',
    '/inventory',
    '/inventory/stock',
    '/dataoverview',
    '/dataoverview/purchase',
    '/dataoverview/sales',
    '/dataoverview/production',
  ],
  allowPricePermissions: [...PURCHASE_PRICE, ...SALES_PRICE],
  denyPermissions: OPERATOR_DENY_APPROVE,
  dataScope: DATA_SCOPE.ALL,
});

const salesOperator = defineProfile({
  label: '销售作业',
  modules: ['仪表盘', '销售', '客户/物料', '库存查询'],
  permissionPrefixes: ['sales', 'contract'],
  exactPermissions: [...MATERIAL_VIEW, ...CUSTOMER_VIEW, ...STOCK_VIEW],
  denyPermissions: OPERATOR_DENY_APPROVE,
  pathPrefixes: ['/sales'],
  exactPaths: [
    '/basedata',
    '/basedata/materials',
    '/basedata/customers',
    '/inventory',
    '/inventory/stock',
  ],
  allowPricePermissions: SALES_PRICE,
  dataScope: DATA_SCOPE.ALL,
});

const salesDept = defineProfile({
  label: '销售部门',
  modules: ['仪表盘', '销售', '销售概览', '客户/物料', '库存查询'],
  permissionPrefixes: ['sales', 'contract'],
  exactPermissions: [...MATERIAL_VIEW, ...CUSTOMER_VIEW, ...STOCK_VIEW, ...WORKFLOW_USE, ...SALES_APPROVE, 'dataoverview', 'dataoverview:sales'],
  pathPrefixes: ['/sales'],
  exactPaths: [
    '/basedata',
    '/basedata/materials',
    '/basedata/customers',
    '/inventory',
    '/inventory/stock',
    '/dataoverview',
    '/dataoverview/sales',
    ...WORKFLOW_PATHS,
  ],
  allowPricePermissions: SALES_PRICE,
  dataScope: DATA_SCOPE.ALL,
});

const productionOperator = defineProfile({
  label: '生产作业',
  modules: ['仪表盘', '生产任务', '生产报工', '生产过程', '设备', '物料/库存查询'],
  permissionPrefixes: [
    'production:reports',
    'production:process',
    'production:equipment',
    'production:anomaly',
    'equipment',
  ],
  exactPermissions: [
    ...MATERIAL_VIEW,
    ...STOCK_VIEW,
    'production',
    'production:tasks',
    'production:tasks:view',
    'production:tasks:update',
    'production:supplement:create',
    'production:exchange:create',
  ],
  pathPrefixes: [
    '/production/task',
    '/production/report',
    '/production/process',
    '/production/anomaly',
    '/production/equipment-monitoring',
    '/equipment',
  ],
  exactPaths: ['/production', '/basedata', '/basedata/materials', '/inventory', '/inventory/stock'],
  denyPermissions: [
    'production:plans:create',
    'production:plans:update',
    'production:plans:delete',
    'production:plans:pushdown',
    'production:tasks:create',
    'production:tasks:delete',
  ],
  dataScope: DATA_SCOPE.ALL,
});

const productionManager = defineProfile({
  label: '生产管理',
  modules: ['仪表盘', '生产', '设备', '生产概览', 'BOM/工艺', '库存查询'],
  permissionPrefixes: ['production', 'equipment'],
  exactPermissions: [
    ...MATERIAL_VIEW,
    ...BOM_VIEW,
    ...PROCESS_VIEW,
    ...LOCATION_VIEW,
    ...STOCK_VIEW,
    'dataoverview',
    'dataoverview:production',
    ...WORKFLOW_USE,
    'basedata:ecn:approve',
    'basedata:boms:approve',
  ],
  pathPrefixes: ['/production', '/equipment'],
  exactPaths: [
    '/basedata',
    '/basedata/materials',
    '/basedata/boms',
    '/basedata/process-templates',
    '/basedata/locations',
    '/inventory',
    '/inventory/stock',
    '/dataoverview',
    '/dataoverview/production',
    ...WORKFLOW_PATHS,
  ],
  dataScope: DATA_SCOPE.ALL,
});

const qualityProfile = defineProfile({
  label: '品质',
  modules: ['仪表盘', '质量', '质量概览', '物料/客商', '库存查询'],
  permissionPrefixes: ['quality'],
  exactPermissions: [...MATERIAL_VIEW, ...CUSTOMER_VIEW, ...SUPPLIER_VIEW, ...STOCK_VIEW, 'dataoverview', 'dataoverview:quality'],
  denyPermissions: OPERATOR_DENY_APPROVE,
  pathPrefixes: ['/quality'],
  exactPaths: [
    '/basedata',
    '/basedata/materials',
    '/basedata/customers',
    '/basedata/suppliers',
    '/inventory',
    '/inventory/stock',
    '/dataoverview',
    '/dataoverview/quality',
  ],
  dataScope: DATA_SCOPE.ALL,
});

const INSPECTOR_SHARED_PERMS = Object.freeze([
  'quality',
  'quality:templates',
  'quality:templates:view',
  'quality:nonconforming',
  'quality:nonconforming:view',
  'quality:nonconforming:create',
  'quality:nonconforming:update',
  'quality:traceability',
  'quality:traceability:view',
  ...MATERIAL_VIEW,
  ...STOCK_VIEW,
]);

const INSPECTOR_SHARED_PATHS = Object.freeze([
  '/quality',
  '/quality/templates',
  '/quality/nonconforming',
  '/quality/traceability',
  '/basedata',
  '/basedata/materials',
  '/inventory',
  '/inventory/stock',
]);

const incomingInspector = defineProfile({
  label: '来料检验员',
  modules: ['仪表盘', '来料检验', '不合格品', '物料/供应商', '库存查询'],
  permissionPrefixes: ['quality:incoming'],
  exactPermissions: [...INSPECTOR_SHARED_PERMS, ...SUPPLIER_VIEW, 'quality:incoming:view', 'purchase:orders:view'],
  denyPermissions: OPERATOR_DENY_APPROVE,
  pathPrefixes: ['/quality/incoming'],
  exactPaths: [...INSPECTOR_SHARED_PATHS, '/basedata/suppliers'],
  dataScope: DATA_SCOPE.ALL,
});

const processInspector = defineProfile({
  label: '线上检验员',
  modules: ['仪表盘', '过程检验', '首检', '不合格品', '物料', '库存查询'],
  permissionPrefixes: ['quality:process', 'quality:first-article'],
  exactPermissions: [
    ...INSPECTOR_SHARED_PERMS,
    'quality:process:view',
    'quality:first-article:view',
    'production:tasks:view',
    'production:process:view',
  ],
  denyPermissions: OPERATOR_DENY_APPROVE,
  pathPrefixes: ['/quality/process', '/quality/first-article'],
  exactPaths: [...INSPECTOR_SHARED_PATHS],
  dataScope: DATA_SCOPE.ALL,
});

const finalInspector = defineProfile({
  label: '成品检验员',
  modules: ['仪表盘', '成品检验', '不合格品', '成品入库', '物料/客户', '库存查询'],
  permissionPrefixes: ['quality:final', 'inventory:inbound'],
  exactPermissions: [
    ...INSPECTOR_SHARED_PERMS,
    ...CUSTOMER_VIEW,
    ...SUPPLIER_VIEW,
    'quality:final:view',
    'production:tasks:view',
    'purchase:orders:view',
  ],
  denyPermissions: OPERATOR_DENY_APPROVE,
  pathPrefixes: ['/quality/final', '/inventory/inbound'],
  exactPaths: [...INSPECTOR_SHARED_PATHS, '/basedata/customers', '/basedata/suppliers'],
  dataScope: DATA_SCOPE.ALL,
});

const financeDept = defineProfile({
  label: '会计管理',
  modules: ['仪表盘', '财务', '财务概览', '客户/供应商'],
  permissionPrefixes: ['finance'],
  exactPermissions: [...CUSTOMER_VIEW, ...SUPPLIER_VIEW, ...WORKFLOW_USE, ...FINANCE_APPROVE, 'basedata', 'dataoverview', 'dataoverview:finance'],
  pathPrefixes: ['/finance'],
  exactPaths: [
    '/basedata',
    '/basedata/customers',
    '/basedata/suppliers',
    '/dataoverview',
    '/dataoverview/finance',
    ...WORKFLOW_PATHS,
  ],
  denyPrice: false,
  dataScope: DATA_SCOPE.ALL,
});

const accountantAssistant = defineProfile({
  label: '会计助理',
  modules: ['仪表盘', '凭证', '应收应付', '报表', '客户/供应商'],
  permissionPrefixes: ['finance:entries', 'finance:ar', 'finance:ap', 'finance:expenses'],
  exactPermissions: [
    'finance',
    'finance:accounts',
    'finance:accounts:view',
    'finance:periods:view',
    'finance:reports',
    'finance:reports:view',
    'finance:tax',
    'finance:tax:view',
    'finance:tax:create',
    'finance:tax:update',
    'finance:assets:view',
    'finance:cost:view',
    'finance:inventory:view',
    'finance:budget:view',
    ...CUSTOMER_VIEW,
    ...SUPPLIER_VIEW,
    'basedata',
    'dataoverview',
    'dataoverview:finance',
  ],
  denyPermissions: OPERATOR_DENY_APPROVE,
  pathPrefixes: [
    '/finance/gl/entries',
    '/finance/ar',
    '/finance/ap',
    '/finance/expenses',
    '/finance/reports',
  ],
  exactPaths: [
    '/finance',
    '/finance/gl',
    '/finance/gl/accounts',
    '/finance/gl/trial-balance',
    '/finance/gl/periods',
    '/finance/tax',
    '/finance/tax/invoices',
    '/finance/tax/returns',
    '/finance/assets',
    '/finance/assets/list',
    '/finance/assets/reports',
    '/finance/cost',
    '/finance/inventory-posting',
    '/finance/cost/dashboard',
    '/finance/budget',
    '/finance/budget/list',
    '/basedata',
    '/basedata/customers',
    '/basedata/suppliers',
    '/dataoverview',
    '/dataoverview/finance',
  ],
  denyPrice: false,
  dataScope: DATA_SCOPE.ALL,
});

const cashier = defineProfile({
  label: '出纳',
  modules: ['仪表盘', '出纳/资金', '现金流量'],
  permissionPrefixes: ['finance:cash', 'finance:cashier'],
  denyPermissions: OPERATOR_DENY_APPROVE,
  exactPermissions: [
    'finance',
    'finance:reports:cash-flow:view',
    'finance:reports:standard-cash-flow',
    'finance:reports:standard-cash-flow:view',
  ],
  pathPrefixes: ['/finance/cash'],
  exactPaths: ['/finance', '/finance/reports/standard-cash-flow'],
  dataScope: DATA_SCOPE.ALL,
});

const systemAdmin = defineProfile({
  label: '系统管理',
  modules: ['仪表盘', '系统管理'],
  permissionPrefixes: ['system'],
  exactPermissions: [],
  pathPrefixes: ['/system'],
  exactPaths: [],
  dataScope: DATA_SCOPE.ALL,
});

const employee = defineProfile({
  label: '基础账号',
  modules: ['仪表盘', '通知'],
  permissionPrefixes: [],
  exactPermissions: [],
  pathPrefixes: [],
  exactPaths: [],
  dataScope: DATA_SCOPE.ALL,
});

const hrManager = defineProfile({
  label: '人事管理',
  modules: ['仪表盘', '人力资源'],
  permissionPrefixes: ['hr'],
  exactPermissions: [...WORKFLOW_USE],
  pathPrefixes: ['/hr'],
  exactPaths: [...WORKFLOW_PATHS],
  dataScope: DATA_SCOPE.ALL,
});

const ROLE_ACCESS_PROFILES = Object.freeze({
  inventory_operator: inventoryOperator,
  inventory_manager: inventoryManager,
  component_warehouse_operator: componentWarehouseOperator,
  finished_goods_operator: finishedGoodsOperator,
  purchase: purchaseDept,
  purchaser: purchaseOperator,
  purchase_manager: purchaseManager,
  XX: salesDept,
  salesperson: salesOperator,
  sales_manager: salesDept,
  production_operator: productionOperator,
  production_planner: productionPlanner,
  production_planning: productionPlanning,
  production_manager: productionManager,
  quality_inspector: qualityProfile,
  incoming_inspector: incomingInspector,
  process_inspector: processInspector,
  final_inspector: finalInspector,
  quality_manager: defineProfile({
    ...qualityProfile,
    label: '质量管理',
    exactPermissions: [...qualityProfile.exactPermissions, ...WORKFLOW_USE, ...QUALITY_APPROVE],
    exactPaths: [...qualityProfile.exactPaths, ...WORKFLOW_PATHS],
    denyPermissions: [],
    dataScope: DATA_SCOPE.ALL,
  }),
  '100001': qualityProfile,
  finance_manager: financeDept,
  accountant: accountantAssistant,
  cashier,
  system_admin: systemAdmin,
  employee,
  user: employee,
  hr_manager: hrManager,
});

function getProfile(code) {
  if (!code) return null;
  return ROLE_ACCESS_PROFILES[String(code)] || null;
}

function isManagedRole(code, isSuperAdmin = false) {
  if (Number(isSuperAdmin) === 1) return true;
  return Boolean(getProfile(code));
}

function describeRoleAccess(code, isSuperAdmin = false) {
  if (Number(isSuperAdmin) === 1) {
    return {
      managed: true,
      superAdmin: true,
      label: '全部模块',
      modules: ['*'],
    };
  }
  const profile = getProfile(code);
  if (!profile) {
    return {
      managed: false,
      superAdmin: false,
      label: '自定义',
      modules: [],
    };
  }
  return {
    managed: true,
    superAdmin: false,
    label: profile.label,
    modules: [...profile.modules],
  };
}

function listManagedProfiles() {
  return Object.entries(ROLE_ACCESS_PROFILES).map(([code, profile]) => ({
    code,
    label: profile.label,
    modules: [...profile.modules],
    dataScope: profile.dataScope,
  }));
}

module.exports = {
  DATA_SCOPE,
  COMMON_PERMISSIONS,
  COMMON_PATHS,
  PRICE_SENSITIVE_PERMISSIONS,
  ROLE_ACCESS_PROFILES,
  permissionAllowed,
  menuAllowed,
  selectAllowedMenuIds,
  getProfile,
  isManagedRole,
  describeRoleAccess,
  listManagedProfiles,
};
