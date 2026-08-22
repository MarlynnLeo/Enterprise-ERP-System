/**
 * 采购管理 - 菜单权限数据
 * 从 menuPermissions.js 拆分
 */

export const purchasePerms = [
// 5. 采购管理
  {
    id: 5,
    parentId: 0,
    name: '采购管理',
    path: '/purchase',
    component: '',
    icon: 'icon-shopping-bag',
    type: 0,
    permission: 'purchase',
    sort: 5,
    status: 1
  },
  {
    id: 51,
    parentId: 5,
    name: '采购申请',
    path: '/purchase/requisitions',
    component: 'purchase/PurchaseRequisitions',
    icon: 'icon-document',
    type: 1,
    permission: 'purchase:requisitions',
    sort: 1,
    status: 1
  },
  {
    id: 52,
    parentId: 5,
    name: '采购订单',
    path: '/purchase/orders',
    component: 'purchase/PurchaseOrders',
    icon: 'icon-wallet',
    type: 1,
    permission: 'purchase:orders',
    sort: 2,
    status: 1
  },
  {
    id: 53,
    parentId: 5,
    name: '采购入库',
    path: '/purchase/receipts',
    component: 'purchase/PurchaseReceipts',
    icon: 'icon-goods',
    type: 1,
    permission: 'purchase:receipts',
    sort: 3,
    status: 1
  },
  {
    id: 54,
    parentId: 5,
    name: '采购退货',
    path: '/purchase/returns',
    component: 'purchase/PurchaseReturns',
    icon: 'icon-return',
    type: 1,
    permission: 'purchase:returns',
    sort: 4,
    status: 1
  },
  {
    id: 55,
    parentId: 5,
    name: '委外加工',
    path: '/purchase/processing',
    component: 'purchase/OutsourcedProcessing',
    icon: 'icon-set-up',
    type: 1,
    permission: 'purchase:processing',
    sort: 5,
    status: 1
  },
  {
    id: 56,
    parentId: 5,
    name: '加工入库',
    path: '/purchase/processing-receipts',
    component: 'purchase/OutsourcedReceipts',
    icon: 'icon-goods',
    type: 1,
    permission: 'purchase:processing-receipts',
    sort: 6,
    status: 1
  },
];
