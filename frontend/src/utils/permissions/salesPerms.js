/**
 * 销售管理 - 菜单权限数据
 * 从 menuPermissions.js 拆分
 */

export const salesPerms = [
// 6. 销售管理
  {
    id: 6,
    parentId: 0,
    name: '销售管理',
    path: '/sales',
    component: '',
    icon: 'icon-sales',
    type: 0,
    permission: 'sales',
    sort: 6,
    status: 1
  },
  {
    id: 61,
    parentId: 6,
    name: '销售订单',
    path: '/sales/orders',
    component: 'sales/SalesOrders',
    icon: 'icon-order',
    type: 1,
    permission: 'sales:orders',
    sort: 1,
    status: 1
  },
  {
    id: 62,
    parentId: 6,
    name: '销售出库',
    path: '/sales/outbound',
    component: 'sales/SalesOutbound',
    icon: 'icon-outbound',
    type: 1,
    permission: 'sales:outbound',
    sort: 2,
    status: 1
  },
  {
    id: 63,
    parentId: 6,
    name: '销售退货',
    path: '/sales/returns',
    component: 'sales/SalesReturns',
    icon: 'icon-return',
    type: 1,
    permission: 'sales:returns',
    sort: 3,
    status: 1
  },
  {
    id: 64,
    parentId: 6,
    name: '销售换货',
    path: '/sales/exchanges',
    component: 'sales/SalesExchanges',
    icon: 'icon-exchange',
    type: 1,
    permission: 'sales:exchanges',
    sort: 4,
    status: 1
  },
  {
    id: 65,
    parentId: 6,
    name: '报价单统计',
    path: '/sales/quotations',
    component: 'sales/SalesQuotations',
    icon: 'icon-quotation',
    type: 1,
    permission: 'sales:quotations',
    sort: 5,
    status: 1
  },
  {
    id: 66,
    parentId: 6,
    name: '装箱单',
    path: '/sales/packing-lists',
    component: 'sales/PackingLists',
    icon: 'icon-box',
    type: 1,
    permission: 'sales:packing-lists',
    sort: 6,
    status: 1
  },
  {
    id: 67,
    parentId: 6,
    name: '发货统计',
    path: '/sales/delivery-stats',
    component: 'sales/DeliveryStats',
    icon: 'icon-data-analysis',
    type: 1,
    permission: 'sales:delivery-stats',
    sort: 7,
    status: 1
  },
  {
    id: 68,
    parentId: 6,
    name: '合同管理',
    path: '/sales/contracts',
    component: 'sales/ContractManagement',
    icon: 'icon-document-copy',
    type: 1,
    permission: 'contract:view',
    sort: 8,
    status: 1
  },
];
