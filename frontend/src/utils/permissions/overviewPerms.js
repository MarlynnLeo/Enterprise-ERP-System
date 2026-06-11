/**
 * 数据概览 - 菜单权限数据
 * 从 menuPermissions.js 拆分
 */

export const overviewPerms = [
// 10. 数据概览
  {
    id: 10,
    parentId: 0,
    name: '数据概览',
    path: '/dataoverview',
    component: '',
    icon: 'icon-data-board',
    type: 0,
    permission: 'dataoverview',
    sort: 10,
    status: 1
  },
  {
    id: 101,
    parentId: 10,
    name: '生产看板',
    path: '/dataoverview/production',
    component: 'dataoverview/ProductionDashboard',
    icon: 'icon-data-line',
    type: 1,
    permission: 'dataoverview:production',
    sort: 1,
    status: 1
  },
  {
    id: 102,
    parentId: 10,
    name: '库存看板',
    path: '/dataoverview/inventory',
    component: 'dataoverview/InventoryDashboard',
    icon: 'icon-goods',
    type: 1,
    permission: 'dataoverview:inventory',
    sort: 2,
    status: 1
  },
  {
    id: 103,
    parentId: 10,
    name: '销售看板',
    path: '/dataoverview/sales',
    component: 'dataoverview/SalesDashboard',
    icon: 'icon-shopping-cart',
    type: 1,
    permission: 'dataoverview:sales',
    sort: 3,
    status: 1
  },
  {
    id: 104,
    parentId: 10,
    name: '财务看板',
    path: '/dataoverview/finance',
    component: 'dataoverview/FinanceDashboard',
    icon: 'icon-money',
    type: 1,
    permission: 'dataoverview:finance',
    sort: 4,
    status: 1
  },
  {
    id: 105,
    parentId: 10,
    name: '质量看板',
    path: '/dataoverview/quality',
    component: 'dataoverview/QualityDashboard',
    icon: 'icon-check',
    type: 1,
    permission: 'dataoverview:quality',
    sort: 5,
    status: 1
  },
  {
    id: 106,
    parentId: 10,
    name: '采购看板',
    path: '/dataoverview/purchase',
    component: 'dataoverview/PurchaseDashboard',
    icon: 'icon-shopping-bag',
    type: 1,
    permission: 'dataoverview:purchase',
    sort: 6,
    status: 1
  },
];
