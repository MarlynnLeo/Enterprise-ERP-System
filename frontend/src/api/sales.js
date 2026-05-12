import { api, fastApi } from '../services/axiosInstance';

export const salesApi = {
  // 客户管理
  getCustomers: () => api.get('/sales/customers'),
  getCustomer: (id) => api.get(`/sales/customers/${id}`),
  createCustomer: (customer) => api.post('/sales/customers', customer),
  updateCustomer: (id, customer) => api.put(`/sales/customers/${id}`, customer),

  // 产品列表（用于报价单和订单）
  getProductsList: () => api.get('/sales/products-list'),
  getCustomersList: () => api.get('/sales/customers-list'),

  // 报价单管理
  getQuotations: (params) => api.get('/sales/quotations', { params }),
  getQuotation: (id) => api.get(`/sales/quotations/${id}`),
  createQuotation: (quotation) => api.post('/sales/quotations', quotation),
  updateQuotation: (id, quotation) => api.put(`/sales/quotations/${id}`, quotation),
  deleteQuotation: (id) => api.delete(`/sales/quotations/${id}`),
  convertQuotationToOrder: (id) => api.post(`/sales/quotations/${id}/convert`),

  // 销售订单管理
  getOrders: (params) => fastApi.get('/sales/orders', { params }),
  getOrder: (id) => fastApi.get(`/sales/orders/${id}`),
  getOrderDetails: (id) => api.get(`/sales/orders/${id}`),
  getOrderUnshippedItems: (id) => fastApi.get(`/sales/orders/${id}/unshipped-items`),
  createOrder: (order) => api.post('/sales/orders', order),
  updateOrder: (id, order) => api.put(`/sales/orders/${id}`, order),
  deleteOrder: (id) => api.delete(`/sales/orders/${id}`),
  updateOrderStatus: (id, statusData) => api.put(`/sales/orders/${id}/status`, statusData),

  // 销售订单导出导入
  exportOrders: (params) => api.post('/sales/orders/export', params, { responseType: 'blob' }),
  importOrders: (formData) => api.post('/sales/orders/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  // 添加销售订单导入模板下载API
  downloadOrderTemplate: () => api.get('/sales/orders/template', {
    responseType: 'blob'
  }),

  // 订单锁定管理
  lockOrder: (id, data) => api.post(`/sales/orders/${id}/lock`, data),
  unlockOrder: (id) => api.post(`/sales/orders/${id}/unlock`),
  getOrderLockStatus: (id) => api.get(`/sales/orders/${id}/lock-status`),

  // 销售出库管理
  getOutbounds: (params) => fastApi.get('/sales/outbound', { params }),
  getOutbound: (id) => fastApi.get(`/sales/outbound/${id}`),
  createOutbound: (outbound) => api.post('/sales/outbound', outbound),
  updateOutbound: (id, outbound) => api.put(`/sales/outbound/${id}`, outbound),
  deleteOutbound: (id) => api.delete(`/sales/outbound/${id}`),

  // 销售退货管理
  getReturns: (params) => api.get('/sales/returns', { params }),
  getReturn: (id) => api.get(`/sales/returns/${id}`),
  getReturnDetails: (id) => api.get(`/sales/returns/${id}`),
  createReturn: (returnOrder) => api.post('/sales/returns', returnOrder),
  updateReturn: (id, returnOrder) => api.put(`/sales/returns/${id}`, returnOrder),
  deleteReturn: (id) => api.delete(`/sales/returns/${id}`),

  // 销售换货管理
  getExchanges: (params) => api.get('/sales/exchanges', { params }),
  getExchange: (id) => api.get(`/sales/exchanges/${id}`),
  createExchange: (exchange) => api.post('/sales/exchanges', exchange),
  updateExchange: (id, exchange) => api.put(`/sales/exchanges/${id}`, exchange),
  deleteExchange: (id) => api.delete(`/sales/exchanges/${id}`),
  updateExchangeStatus: (id, status) => api.put(`/sales/exchanges/${id}/status`, { status }),

  // 统计数据
  getQuotationStatistics: () => api.get('/sales/quotations/statistics'),
  getOrderStatistics: () => api.get('/sales/orders/statistics'),
  getSalesStatistics: () => api.get('/sales/statistics'),
  getSalesTrend: () => api.get('/sales/trend'),

  // 发货统计
  getDeliveryStats: (params) => api.get('/sales/delivery-stats', { params }),
  getDeliveryOverview: () => api.get('/sales/delivery-stats/overview'),
  getOrderDeliveryDetails: (orderId) => api.get(`/sales/delivery-stats/orders/${orderId}`),

  // 客户产品查询
  getCustomerOrderProducts: (customerId, params = {}) => api.get(`/sales/customers/${customerId}/order-products`, { params }),

  // 装箱单管理
  getPackingLists: (params) => api.get('/sales/packing-lists', { params }),
  getPackingList: (id) => api.get(`/sales/packing-lists/${id}`),
  createPackingList: (packingList) => api.post('/sales/packing-lists', packingList),
  updatePackingList: (id, packingList) => api.put(`/sales/packing-lists/${id}`, packingList),
  deletePackingList: (id) => api.delete(`/sales/packing-lists/${id}`),
  updatePackingListStatus: (id, status) => api.patch(`/sales/packing-lists/${id}/status`, { status }),
  getPackingListStatistics: () => api.get('/sales/packing-lists-statistics')
};
