/**
 * 采购管理路由
 */
export const purchaseRoutes = [
  {
    path: '/purchase',
    name: 'Purchase',
    component: () => import('@/views/purchase/Index.vue'),
    meta: { title: '采购管理', permission: 'purchase' }
  },
  {
    path: '/purchase/dashboard',
    name: 'PurchaseDashboard',
    redirect: '/purchase'
  },
  {
    path: '/purchase/requisitions',
    name: 'PurchaseRequisitions',
    component: () => import('@/views/purchase/Requisitions.vue'),
    meta: { title: '采购申请', permission: 'purchase' }
  },
  {
    path: '/purchase/requisitions/create',
    name: 'CreateRequisition',
    component: () => import('@/views/purchase/CreateRequisition.vue'),
    meta: { title: '新建采购申请', permission: 'purchase' }
  },
  {
    path: '/purchase/requisitions/new',
    name: 'NewRequisition',
    component: () => import('@/views/purchase/CreateRequisition.vue'),
    meta: { title: '新建采购申请', permission: 'purchase' }
  },
  {
    path: '/purchase/requisitions/:id',
    name: 'PurchaseRequisitionDetail',
    component: () => import('@/views/purchase/RequisitionDetail.vue'),
    meta: { title: '采购申请详情', permission: 'purchase' }
  },
  {
    path: '/purchase/orders',
    name: 'PurchaseOrders',
    component: () => import('@/views/purchase/Orders.vue'),
    meta: { title: '采购订单', permission: 'purchase' }
  },
  {
    path: '/purchase/orders/create',
    name: 'CreatePurchaseOrder',
    component: () => import('@/views/purchase/CreateOrder.vue'),
    meta: { title: '新建采购订单', permission: 'purchase' }
  },
  {
    path: '/purchase/orders/new',
    name: 'NewPurchaseOrder',
    component: () => import('@/views/purchase/CreateOrder.vue'),
    meta: { title: '新建采购订单', permission: 'purchase' }
  },
  {
    path: '/purchase/orders/:id/edit',
    name: 'EditPurchaseOrder',
    component: () => import('@/views/purchase/CreateOrder.vue'),
    meta: { title: '编辑采购订单', permission: 'purchase' }
  },
  {
    path: '/purchase/orders/:id',
    name: 'PurchaseOrderDetail',
    component: () => import('@/views/purchase/OrderDetail.vue'),
    meta: { title: '采购订单详情', permission: 'purchase' }
  },
  {
    path: '/purchase/receipts',
    name: 'PurchaseReceipts',
    component: () => import('@/views/purchase/Receipts.vue'),
    meta: { title: '采购入库', permission: 'purchase' }
  },
  {
    path: '/purchase/receipts/create',
    name: 'CreatePurchaseReceipt',
    component: () => import('@/views/purchase/CreateReceipt.vue'),
    meta: { title: '创建入库单', permission: 'purchase' }
  },
  {
    path: '/purchase/receipts/:id',
    name: 'PurchaseReceiptDetail',
    component: () => import('@/views/purchase/ReceiptDetail.vue'),
    meta: { title: '采购入库详情', permission: 'purchase' }
  },
  {
    path: '/purchase/returns',
    name: 'PurchaseReturns',
    component: () => import('@/views/purchase/Returns.vue'),
    meta: { title: '采购退货', permission: 'purchase' }
  },
  {
    path: '/purchase/returns/:id',
    name: 'PurchaseReturnDetail',
    component: () => import('@/views/purchase/ReturnDetail.vue'),
    meta: { title: '退货详情', permission: 'purchase' }
  },
  {
    path: '/purchase/processing',
    name: 'PurchaseProcessing',
    component: () => import('@/views/purchase/Processing.vue'),
    meta: { title: '委外加工', permission: 'purchase' }
  },
  {
    path: '/purchase/processing/:id',
    name: 'PurchaseProcessingDetail',
    component: () => import('@/views/purchase/ProcessingDetail.vue'),
    meta: { title: '委外加工详情', permission: 'purchase' }
  },
  {
    path: '/purchase/processing-receipts',
    name: 'PurchaseProcessingReceipts',
    component: () => import('@/views/purchase/ProcessingReceipts.vue'),
    meta: { title: '委外入库', permission: 'purchase' }
  },
  {
    path: '/purchase/processing-receipts/:id',
    name: 'PurchaseProcessingReceiptDetail',
    component: () => import('@/views/purchase/ProcessingReceiptDetail.vue'),
    meta: { title: '委外入库详情', permission: 'purchase' }
  }
]
