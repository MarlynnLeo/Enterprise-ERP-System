/**
 * 菜单权限数据 - 基于系统的菜单结构
 * 数据已按模块拆分到 ./permissions/ 目录
 */

import { baseMenuPermissions } from './permissions/index';


const appendRoutePermissionEntries = (menus) => {
  const nextMenus = menus.map((menu) => ({ ...menu }));

  const routeMenus = [
    {
      parentId: 72,
      path: '/finance/gl/entries/receipt',
      component: 'finance/gl/entries/ReceiptEntry',
      permission: 'finance:entries:create',
      visible: 0
    },
    {
      parentId: 72,
      path: '/finance/gl/entries/payment',
      component: 'finance/gl/entries/PaymentEntry',
      permission: 'finance:entries:create',
      visible: 0
    },
    {
      parentId: 72,
      path: '/finance/gl/entries/transfer',
      component: 'finance/gl/entries/TransferEntry',
      permission: 'finance:entries:create',
      visible: 0
    },
    {
      parentId: 72,
      path: '/finance/gl/entries/general',
      component: 'finance/gl/entries/GeneralEntry',
      permission: 'finance:entries:create',
      visible: 0
    },
    {
      id: 9301,
      parentId: 72,
      name: 'Create Voucher',
      path: '/finance/gl/entries/create',
      component: 'finance/gl/entries/EntryForm',
      icon: 'icon-edit',
      type: 1,
      permission: 'finance:entries:create',
      sort: 99,
      visible: 0,
      status: 1
    },
    {
      id: 9302,
      parentId: 740,
      name: 'Edit Budget',
      path: '/finance/budget/edit/:id',
      component: 'finance/budget/BudgetEdit',
      icon: 'icon-edit',
      type: 1,
      permission: 'finance:budgets:update',
      sort: 99,
      visible: 0,
      status: 1
    },
    {
      id: 9303,
      parentId: 2,
      name: 'Production Data View',
      path: '/production/data-view',
      component: 'production/ProductionDataView',
      icon: 'icon-data-board',
      type: 1,
      permission: 'production:data-view',
      sort: 8,
      status: 1
    },
    {
      id: 9304,
      parentId: 2,
      name: 'Production Gantt',
      path: '/production/gantt',
      component: 'production/ProductionGantt',
      icon: 'icon-data-line',
      type: 1,
      permission: 'production:gantt',
      sort: 9,
      status: 1
    },
    {
      id: 9311,
      parentId: 2,
      name: '生产日历',
      path: '/production/calendar',
      component: 'production/ProductionCalendar',
      icon: 'icon-calendar',
      type: 1,
      permission: 'production:calendar',
      sort: 10,
      status: 1
    },
    {
      id: 931101,
      parentId: 9311,
      name: '查看生产日历',
      path: '',
      component: '',
      icon: '',
      type: 2,
      permission: 'production:calendar:view',
      sort: 1,
      status: 1
    },
    {
      id: 931102,
      parentId: 9311,
      name: '维护生产日历',
      path: '',
      component: '',
      icon: '',
      type: 2,
      permission: 'production:calendar:update',
      sort: 2,
      status: 1
    },
    {
      id: 9305,
      parentId: 5,
      name: 'Purchase History',
      path: '/purchase/history',
      component: 'purchase/PurchaseHistory',
      icon: 'icon-time',
      type: 1,
      permission: 'purchase:history',
      sort: 7,
      status: 1
    },
    {
      id: 9306,
      parentId: 8,
      name: '8D Reports',
      path: '/quality/8d-reports',
      component: 'quality/EightDReport',
      icon: 'icon-document-checked',
      type: 1,
      permission: 'quality:8d',
      sort: 6,
      status: 1
    },
    {
      id: 9307,
      parentId: 8,
      name: 'AQL Standards',
      path: '/quality/aql-standards',
      component: 'quality/AQLStandards',
      icon: 'icon-setting',
      type: 1,
      permission: 'quality:aql',
      sort: 10,
      status: 1
    },
    {
      id: 9308,
      parentId: 8,
      name: 'Gauge Management',
      path: '/quality/gauges',
      component: 'quality/GaugeManagement',
      icon: 'icon-odometer',
      type: 1,
      permission: 'quality:gauges',
      sort: 13,
      status: 1
    },
    {
      id: 9309,
      parentId: 8,
      name: 'SPC Control Chart',
      path: '/quality/spc',
      component: 'quality/SPCControlChart',
      icon: 'icon-data-line',
      type: 1,
      permission: 'quality:spc',
      sort: 14,
      status: 1
    },
    {
      id: 9310,
      parentId: 8,
      name: 'Supplier Quality',
      path: '/quality/supplier-quality',
      component: 'quality/SupplierQualityScorecard',
      icon: 'icon-trophy',
      type: 1,
      permission: 'quality:supplier-quality',
      sort: 15,
      status: 1
    }
  ];

  const usedIds = new Set(nextMenus.map((menu) => menu.id));
  let nextId = 9400;

  routeMenus.forEach((entry) => {
    const existing = entry.path
      ? nextMenus.find((menu) => menu.path === entry.path)
      : nextMenus.find((menu) => menu.permission === entry.permission);

    if (existing) {
      Object.assign(existing, entry, { id: existing.id });
      return;
    }

    const id = entry.id && !usedIds.has(entry.id) ? entry.id : nextId++;
    usedIds.add(id);
    nextMenus.push({
      name: entry.name || entry.permission,
      icon: entry.icon || '',
      type: entry.type ?? 1,
      sort: entry.sort ?? 99,
      status: entry.status ?? 1,
      ...entry,
      id
    });
  });

  return nextMenus;
};

const appendActionPermissionEntries = (menus) => {
  const nextMenus = menus.map((menu) => ({ ...menu }));

  const actionGroups = [
    { parentPermission: 'production:equipment', actions: ['view', 'create', 'update', 'delete'] },
    { parentPermission: 'basedata:materials', actions: ['view', 'create', 'update', 'delete', 'import', 'export'] },
    { parentPermission: 'basedata:boms', actions: ['view', 'create', 'update', 'delete', 'import', 'export', 'approve'] },
    { parentPermission: 'basedata:customers', actions: ['view', 'create', 'update', 'delete', 'import', 'export'] },
    { parentPermission: 'basedata:suppliers', actions: ['view', 'create', 'update', 'delete', 'import', 'export'] },
    { parentPermission: 'basedata:categories', actions: ['view', 'create', 'update', 'delete', 'import', 'export'] },
    { parentPermission: 'basedata:units', actions: ['view', 'create', 'update', 'delete', 'export'] },
    { parentPermission: 'basedata:locations', actions: ['view', 'create', 'update', 'delete', 'edit', 'export'] },
    { parentPermission: 'basedata:processtemplates', actions: ['view', 'create', 'update', 'delete', 'export'] },
    { parentPermission: 'basedata:productcategories', actions: ['view', 'create', 'update', 'delete'] },
    {
      parentPermission: 'basedata:productcategories',
      permissions: [
        'basedata:materialsources:view',
        'basedata:materialsources:create',
        'basedata:materialsources:update',
        'basedata:materialsources:delete',
        'basedata:inspectionmethods:view',
        'basedata:inspectionmethods:create',
        'basedata:inspectionmethods:update',
        'basedata:inspectionmethods:delete'
      ]
    },
    { parentPermission: 'basedata:ecn', actions: ['view', 'create', 'update', 'delete'] },
    { parentPermission: 'inventory:stock', actions: ['view', 'adjust', 'edit', 'view-detail', 'export'] },
    { parentPermission: 'inventory:inbound', actions: ['view', 'create', 'update', 'delete', 'export'] },
    { parentPermission: 'inventory:outbound', actions: ['view', 'create', 'update', 'delete', 'export'] },
    {
      parentPermission: 'inventory:manual-transaction',
      permissions: ['inventory:manual:view', 'inventory:manual:create', 'inventory:manual:update', 'inventory:manual:delete', 'inventory:manual:approve']
    },
    { parentPermission: 'inventory:transfer', actions: ['view', 'create', 'update', 'delete', 'export'] },
    { parentPermission: 'inventory:check', actions: ['view', 'create', 'update', 'delete'] },
    { parentPermission: 'inventory:report', actions: ['view', 'export'] },
    { parentPermission: 'inventory:transaction', permissions: ['inventory:transactions:view', 'inventory:transactions:export', 'inventory:ledger:view'] },
    { parentPermission: 'purchase:requisitions', actions: ['view', 'create', 'update', 'delete', 'approve', 'export'] },
    { parentPermission: 'purchase:orders', actions: ['view', 'create', 'update', 'delete', 'approve', 'export', 'import'] },
    { parentPermission: 'purchase:receipts', actions: ['view', 'create', 'update', 'delete', 'export'] },
    { parentPermission: 'purchase:returns', actions: ['view', 'create', 'update', 'delete', 'approve', 'export'] },
    { parentPermission: 'purchase:processing', actions: ['view', 'create', 'update', 'delete', 'export'] },
    {
      parentPermission: 'purchase:processing-receipts',
      permissions: ['purchase:processing-receipts:view', 'purchase:processing-receipts:create', 'purchase:processing-receipts:edit', 'purchase:processing-receipts:delete', 'purchase:processing-receipts:export']
    },
    { parentPermission: 'sales:orders', actions: ['view', 'create', 'update', 'delete', 'export', 'import'] },
    { parentPermission: 'sales:outbound', actions: ['view', 'create', 'update', 'delete', 'export'] },
    { parentPermission: 'sales:returns', actions: ['view', 'create', 'update', 'delete', 'export'] },
    { parentPermission: 'sales:exchanges', permissions: ['sales:exchanges:view', 'sales:exchanges:create', 'sales:exchanges:update', 'sales:exchanges:delete'] },
    { parentPermission: 'sales:quotations', actions: ['view', 'create', 'update', 'delete', 'export'] },
    { parentPermission: 'sales:packing-lists', permissions: ['sales:packing:view', 'sales:packing:create', 'sales:packing:update', 'sales:packing:delete'] },
    { parentPermission: 'sales:delivery-stats', permissions: ['sales:reports:view'] },
    { parentPermission: 'contract:view', permissions: ['contract:create', 'contract:edit', 'contract:delete'] },
    { parentPermission: 'finance:accounts:view', permissions: ['finance:accounts:create', 'finance:accounts:update'] },
    { parentPermission: 'finance:entries:view', permissions: ['finance:entries:create', 'finance:entries:update', 'finance:entries:delete', 'finance:entries:approve'] },
    { parentPermission: 'finance:periods:view', permissions: ['finance:periods:create', 'finance:periods:update'] },
    { parentPermission: 'finance:closing:view', permissions: ['finance:closing:execute'] },
    { parentPermission: 'finance:ar:view', permissions: ['finance:ar:create', 'finance:ar:update', 'finance:ar:receive'] },
    { parentPermission: 'finance:ap:view', permissions: ['finance:ap:create', 'finance:ap:update', 'finance:ap:pay'] },
    { parentPermission: 'finance:assets:view', permissions: ['finance:assets:create', 'finance:assets:update', 'finance:assets:delete', 'finance:assets:execute', 'finance:assets:export'] },
    { parentPermission: 'finance:cash:view', permissions: ['finance:cash:create', 'finance:cash:update', 'finance:cash:delete', 'finance:cash:approve', 'finance:cash:export', 'finance:cash:reconcile'] },
    { parentPermission: 'finance:pricing:view', permissions: ['finance:pricing:create', 'finance:pricing:update', 'finance:pricing:delete', 'finance:pricing:export'] },
    { parentPermission: 'finance:tax:view', permissions: ['finance:tax:create', 'finance:tax:update', 'finance:tax:delete', 'finance:tax:pay'] },
    { parentPermission: 'finance:budgets:view', permissions: ['finance:budgets:create', 'finance:budgets:update', 'finance:budgets:delete', 'finance:budgets:approve'] },
    { parentPermission: 'finance:cost:view', permissions: ['finance:cost:create', 'finance:cost:update', 'finance:cost:delete', 'finance:cost:execute', 'finance:cost:export'] },
    { parentPermission: 'finance:expenses:view', permissions: ['finance:expenses:create', 'finance:expenses:update', 'finance:expenses:delete', 'finance:expenses:approve', 'finance:expenses:pay'] },
    { parentPermission: 'finance:settings:view', permissions: ['finance:settings:update'] },
    { parentPermission: 'finance:exchange-rates:view', permissions: ['finance:exchange-rates:update'] },
    { parentPermission: 'quality:incoming', permissions: ['quality:inspections:view', 'quality:inspections:create', 'quality:inspections:update', 'quality:inspections:delete'] },
    { parentPermission: 'quality:templates', permissions: ['quality:templates:view', 'quality:templates:create', 'quality:templates:update', 'quality:templates:delete'] },
    { parentPermission: 'quality:templates', permissions: ['quality:settings:view', 'quality:settings:create', 'quality:settings:update', 'quality:settings:delete'] },
    { parentPermission: 'quality:traceability', actions: ['view', 'create', 'update', 'export'] },
    { parentPermission: 'quality:nonconforming', actions: ['view', 'create', 'update', 'delete'] },
    { parentPermission: 'quality:replacement', actions: ['view', 'create', 'update', 'delete'] },
    { parentPermission: 'quality:rework', actions: ['view', 'create', 'update', 'delete'] },
    { parentPermission: 'quality:scrap', actions: ['view', 'create', 'update', 'delete'] },
    { parentPermission: 'quality:statistics', permissions: ['quality:reports:view', 'quality:reports:update'] },
    { parentPermission: 'quality:8d', actions: ['view', 'create', 'update', 'delete'] },
    { parentPermission: 'quality:aql', permissions: ['quality:aql:view', 'quality:standards:view', 'quality:standards:create', 'quality:standards:update', 'quality:standards:delete'] },
    { parentPermission: 'quality:gauges', permissions: ['quality:gauges:view', 'quality:gauges:create', 'quality:gauges:update', 'quality:gauges:delete'] },
    { parentPermission: 'quality:spc', permissions: ['quality:spc:view', 'quality:spc:update'] },
    { parentPermission: 'system:users', actions: ['create', 'update', 'delete'] },
    { parentPermission: 'system:departments', actions: ['create', 'update', 'delete'] },
    { parentPermission: 'system:permissions', permissions: ['system:permissions:manage'] },
    { parentPermission: 'system:tech-comm', permissions: ['system:tech-comm:create', 'system:tech-comm:edit', 'system:tech-comm:delete', 'system:tech-comm:manage'] },
    { parentPermission: 'system:print', permissions: ['system:print:view', 'system:print:create', 'system:print:update', 'system:print:delete'] },
    { parentPermission: 'system:notifications', permissions: ['system:notifications:create', 'system:notifications:delete'] },
    { parentPermission: 'system:business-types', permissions: ['system:business-types:create', 'system:business-types:update', 'system:business-types:delete'] },
    { parentPermission: 'system:workflow', permissions: ['system:workflow:view', 'system:workflow:create', 'system:workflow:edit', 'system:workflow:delete', 'system:workflow:use'] },
    { parentPermission: 'system:settings', permissions: ['system:settings:view', 'system:settings:edit', 'system:settings:read', 'system:settings:write', 'system:settings:update'] },
    { parentPermission: 'system:documents', permissions: ['system:documents:view', 'system:documents:edit', 'system:documents:delete'] },
    { parentPermission: 'system:business-alerts', permissions: ['system:business-alerts:view', 'system:business-alerts:edit'] },
    { parentPermission: 'hr:employees', actions: ['view', 'create', 'update', 'delete'] },
    { parentPermission: 'hr:attendance', actions: ['view', 'update', 'export'] },
    { parentPermission: 'hr:salary', actions: ['view', 'update', 'export'] },
    { parentPermission: 'hr:performance', permissions: ['hr:performance:view', 'hr:performance:edit'] }
  ];

  const usedIds = new Set(nextMenus.map((menu) => menu.id));
  const usedPermissions = new Set(nextMenus.map((menu) => menu.permission).filter(Boolean));
  let nextId = 10000;

  const nextUniqueId = () => {
    while (usedIds.has(nextId)) nextId += 1;
    usedIds.add(nextId);
    return nextId;
  };

  const findParentId = (parentPermission) => {
    const exact = nextMenus.find((menu) => menu.permission === parentPermission);
    if (exact) return exact.id;

    const prefixParent = nextMenus.find((menu) => parentPermission.startsWith(`${menu.permission}:`));
    return prefixParent?.id || 0;
  };

  actionGroups.forEach((group) => {
    const parentId = findParentId(group.parentPermission);
    const permissions = group.permissions || group.actions.map((action) => `${group.parentPermission}:${action}`);

    permissions.forEach((permission, index) => {
      if (usedPermissions.has(permission)) return;

      usedPermissions.add(permission);
      nextMenus.push({
        id: nextUniqueId(),
        parentId,
        name: permission,
        path: '',
        component: '',
        icon: '',
        type: 2,
        permission,
        sort: 1000 + index,
        status: 1
      });
    });
  });

  return nextMenus;
};

const buildStaticMenuPermissions = (menus) =>
  appendActionPermissionEntries(appendRoutePermissionEntries(menus));

export const menuPermissions = buildStaticMenuPermissions(baseMenuPermissions);

/**
 * 将平铺的菜单列表转换为树形结构
 */
export function buildMenuTree(menus = menuPermissions) {
  const menuMap = {};
  menus.forEach(menu => {
    menuMap[menu.id] = { ...menu, children: [] };
  });

  const tree = [];
  menus.forEach(menu => {
    const id = menu.id;
    const parentId = menu.parentId;

    if (parentId === 0) {
      tree.push(menuMap[id]);
    } else {
      if (menuMap[parentId]) {
        menuMap[parentId].children.push(menuMap[id]);
      }
    }
  });

  return tree;
}

/**
 * 导出SQL格式的菜单数据，用于数据库初始化
 */
export function generateMenuSQL() {
  let sql = 'INSERT INTO menus (id, parent_id, name, path, component, icon, permission, type, visible, status, sort_order, created_at, updated_at) VALUES\n';

  const values = menuPermissions.map(menu => {
    return `(${menu.id}, ${menu.parentId}, '${menu.name}', '${menu.path}', '${menu.component}', '${menu.icon}', '${menu.permission}', ${menu.type}, ${menu.visible ?? 1}, ${menu.status}, ${menu.sort}, NOW(), NOW())`;
  }).join(',\n');

  sql += values + ';';
  return sql;
}

export default menuPermissions;
