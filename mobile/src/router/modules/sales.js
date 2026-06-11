/**
 * 销售管理路由
 */
export const salesRoutes = [
  {
    path: '/sales',
    name: 'Sales',
    component: () => import('@/views/sales/Index.vue'),
    meta: { title: '销售管理', permission: 'sales' }
  },
  {
    path: '/sales/orders',
    name: 'SalesOrders',
    component: () => import('@/views/sales/Orders.vue'),
    meta: { title: '销售订单', permission: 'sales' }
  },
  {
    path: '/sales/orders/create',
    name: 'CreateSalesOrderPage',
    component: () => import('@/views/sales/CreateSalesOrder.vue'),
    meta: { title: '新建销售订单', permission: 'sales' }
  },
  {
    path: '/sales/orders/:id',
    name: 'SalesOrderDetail',
    component: () => import('@/views/sales/OrderDetail.vue'),
    meta: { title: '销售订单详情', permission: 'sales' }
  },
  {
    path: '/sales/outbound',
    name: 'SalesOutbound',
    component: () => import('@/views/sales/Outbound.vue'),
    meta: { title: '销售出库', permission: 'sales' }
  },
  {
    path: '/sales/outbound/new',
    name: 'CreateSalesOutbound',
    component: () => import('@/views/sales/CreateSalesOutbound.vue'),
    meta: { title: '新建销售出库', permission: 'sales' }
  },
  {
    path: '/sales/outbound/:id',
    name: 'SalesOutboundDetail',
    component: () => import('@/views/sales/OutboundDetail.vue'),
    meta: { title: '销售出库详情', permission: 'sales' }
  },
  {
    path: '/sales/returns',
    name: 'SalesReturns',
    component: () => import('@/views/sales/Returns.vue'),
    meta: { title: '销售退货', permission: 'sales' }
  },
  {
    path: '/sales/returns/:id',
    name: 'SalesReturnDetail',
    component: () => import('@/views/sales/ReturnDetail.vue'),
    meta: { title: '销售退货详情', permission: 'sales' }
  },
  {
    path: '/sales/exchanges',
    name: 'SalesExchanges',
    component: () => import('@/views/sales/Exchanges.vue'),
    meta: { title: '销售换货', permission: 'sales' }
  },
  {
    path: '/sales/exchanges/:id',
    name: 'SalesExchangeDetail',
    component: () => import('@/views/sales/ExchangeDetail.vue'),
    meta: { title: '销售换货详情', permission: 'sales' }
  },
  {
    path: '/sales/quotations',
    name: 'SalesQuotations',
    component: () => import('@/views/sales/Quotations.vue'),
    meta: { title: '报价管理', permission: 'sales' }
  },
  {
    path: '/sales/quotations/:id',
    name: 'SalesQuotationDetail',
    component: () => import('@/views/sales/QuotationDetail.vue'),
    meta: { title: '报价详情', permission: 'sales' }
  },
  {
    path: '/sales/customers',
    name: 'SalesCustomers',
    component: () => import('@/views/sales/SalesCustomers.vue'),
    meta: { title: '客户管理', permission: 'sales' }
  }
]
