/**
 * 库存管理路由
 */
export const inventoryRoutes = [
  {
    path: '/inventory',
    name: 'Inventory',
    component: () => import('@/views/inventory/Index.vue'),
    meta: { title: '库存管理', permission: 'inventory' }
  },
  {
    path: '/inventory/stock',
    name: 'InventoryStock',
    component: () => import('@/views/inventory/Stock.vue'),
    meta: { title: '库存查询', permission: 'inventory' }
  },
  {
    path: '/inventory/inbound',
    name: 'InventoryInbound',
    component: () => import('@/views/inventory/Inbound.vue'),
    meta: { title: '库存入库', permission: 'inventory' }
  },
  {
    path: '/inventory/inbound/create',
    name: 'CreateInbound',
    component: () => import('@/views/inventory/CreateInbound.vue'),
    meta: { title: '新建入库单', permission: 'inventory' }
  },
  {
    path: '/inventory/inbound/:id',
    name: 'InventoryInboundDetail',
    component: () => import('@/views/inventory/InboundDetail.vue'),
    meta: { title: '入库详情', permission: 'inventory' }
  },
  {
    path: '/inventory/outbound',
    name: 'InventoryOutbound',
    component: () => import('@/views/inventory/Outbound.vue'),
    meta: { title: '库存出库', permission: 'inventory' }
  },
  {
    path: '/inventory/outbound/create',
    name: 'CreateOutbound',
    component: () => import('@/views/inventory/CreateOutbound.vue'),
    meta: { title: '新建出库单', permission: 'inventory' }
  },
  {
    path: '/inventory/outbound/:id',
    name: 'InventoryOutboundDetail',
    component: () => import('@/views/inventory/OutboundDetail.vue'),
    meta: { title: '出库详情', permission: 'inventory' }
  },
  {
    path: '/inventory/transfer',
    name: 'InventoryTransfer',
    component: () => import('@/views/inventory/Transfer.vue'),
    meta: { title: '库存调拨', permission: 'inventory' }
  },
  {
    path: '/inventory/transfer/create',
    name: 'CreateTransfer',
    component: () => import('@/views/inventory/CreateTransfer.vue'),
    meta: { title: '新建调拨单', permission: 'inventory' }
  },
  {
    path: '/inventory/transfer/:id',
    name: 'InventoryTransferDetail',
    component: () => import('@/views/inventory/TransferDetail.vue'),
    meta: { title: '调拨详情', permission: 'inventory' }
  },
  {
    path: '/inventory/check',
    name: 'InventoryCheck',
    component: () => import('@/views/inventory/Check.vue'),
    meta: { title: '库存盘点', permission: 'inventory' }
  },
  {
    path: '/inventory/check/new',
    name: 'NewCheck',
    component: () => import('@/views/inventory/NewCheck.vue'),
    meta: { title: '新建盘点单', permission: 'inventory' }
  },
  {
    path: '/inventory/check/:id',
    name: 'CheckDetail',
    component: () => import('@/views/inventory/CheckDetail.vue'),
    meta: { title: '盘点单详情', permission: 'inventory' }
  },
  {
    path: '/inventory/check/:id/edit',
    name: 'EditCheck',
    component: () => import('@/views/inventory/EditCheck.vue'),
    meta: { title: '编辑盘点单', permission: 'inventory' }
  },
  {
    path: '/inventory/report',
    name: 'InventoryReport',
    component: () => import('@/views/inventory/Report.vue'),
    meta: { title: '库存报表', permission: 'inventory' }
  },
  {
    path: '/inventory/transaction',
    name: 'InventoryTransaction',
    component: () => import('@/views/inventory/Transaction.vue'),
    meta: { title: '库存流水', permission: 'inventory' }
  }
]
