/**
 * 库存管理 - 菜单权限数据
 * 从 menuPermissions.js 拆分
 */

export const inventoryPerms = [
// 4. 库存管理
  {
    id: 4,
    parentId: 0,
    name: '库存管理',
    path: '/inventory',
    component: '',
    icon: 'icon-inventory',
    type: 0,
    permission: 'inventory',
    sort: 4,
    status: 1
  },
  {
    id: 41,
    parentId: 4,
    name: '库存查询',
    path: '/inventory/stock',
    component: 'inventory/InventoryStock',
    icon: 'icon-stock',
    type: 1,
    permission: 'inventory:stock',
    sort: 1,
    status: 1
  },
  {
    id: 42,
    parentId: 4,
    name: '入库管理',
    path: '/inventory/inbound',
    component: 'inventory/InventoryInbound',
    icon: 'icon-plus',
    type: 1,
    permission: 'inventory:inbound',
    sort: 2,
    status: 1
  },
  {
    id: 43,
    parentId: 4,
    name: '出库管理',
    path: '/inventory/outbound',
    component: 'inventory/InventoryOutbound',
    icon: 'icon-minus',
    type: 1,
    permission: 'inventory:outbound',
    sort: 3,
    status: 1
  },
  {
    id: 431,
    parentId: 4,
    name: '手工出入',
    path: '/inventory/manual-transaction',
    component: 'inventory/ManualTransaction',
    icon: 'icon-edit',
    type: 1,
    permission: 'inventory:manual-transaction',
    sort: 4,
    status: 1
  },
  {
    id: 44,
    parentId: 4,
    name: '库存调拨',
    path: '/inventory/transfer',
    component: 'inventory/InventoryTransfer',
    icon: 'icon-right',
    type: 1,
    permission: 'inventory:transfer',
    sort: 5,
    status: 1
  },
  {
    id: 45,
    parentId: 4,
    name: '库存盘点',
    path: '/inventory/check',
    component: 'inventory/InventoryCheck',
    icon: 'icon-check',
    type: 1,
    permission: 'inventory:check',
    sort: 6,
    status: 1
  },
  {
    id: 46,
    parentId: 4,
    name: '库存报表',
    path: '/inventory/report',
    component: 'inventory/InventoryReport',
    icon: 'icon-chart',
    type: 1,
    permission: 'inventory:report',
    sort: 7,
    status: 1
  },
  {
    id: 47,
    parentId: 4,
    name: '流水报表',
    path: '/inventory/transaction',
    component: 'inventory/InventoryTransaction',
    icon: 'icon-list',
    type: 1,
    permission: 'inventory:transaction',
    sort: 8,
    status: 1
  },
];
