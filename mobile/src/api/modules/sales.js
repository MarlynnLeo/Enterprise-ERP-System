/**
 * 销售管理 API 模块
 */
import api from '../client'

export const salesApi = {
  // 客户管理
  getCustomers(params) {
    return api.get('/sales/customers', { params })
  },

  getCustomer(id) {
    return api.get(`/sales/customers/${id}`)
  },

  createCustomer(data) {
    return api.post('/sales/customers', data)
  },

  updateCustomer(id, data) {
    return api.put(`/sales/customers/${id}`, data)
  },

  getCustomersList() {
    return api.get('/sales/customers-list')
  },

  // 销售报价单
  getSalesQuotations(params) {
    return api.get('/sales/quotations', { params })
  },

  getSalesQuotation(id) {
    return api.get(`/sales/quotations/${id}`)
  },

  createSalesQuotation(data) {
    return api.post('/sales/quotations', data)
  },

  updateSalesQuotation(id, data) {
    return api.put(`/sales/quotations/${id}`, data)
  },

  deleteSalesQuotation(id) {
    return api.delete(`/sales/quotations/${id}`)
  },

  convertQuotationToOrder(id) {
    return api.post(`/sales/quotations/${id}/convert`)
  },

  getSalesQuotationStatistics() {
    return api.get('/sales/quotations/statistics')
  },

  // 销售订单
  getSalesOrders(params) {
    return api.get('/sales/orders', { params })
  },

  getSalesOrder(id) {
    return api.get(`/sales/orders/${id}`)
  },

  createSalesOrder(data) {
    return api.post('/sales/orders', data)
  },

  updateSalesOrder(id, data) {
    return api.put(`/sales/orders/${id}`, data)
  },

  deleteSalesOrder(id) {
    return api.delete(`/sales/orders/${id}`)
  },

  updateSalesOrderStatus(id, status) {
    return api.put(`/sales/orders/${id}/status`, { newStatus: status })
  },

  getSalesStatistics() {
    return api.get('/sales/statistics')
  },

  // 销售出库
  getSalesOutbound(params) {
    return api.get('/sales/outbound', { params })
  },

  getSalesOutboundById(id) {
    return api.get(`/sales/outbound/${id}`)
  },

  createSalesOutbound(data) {
    return api.post('/sales/outbound', data)
  },

  updateSalesOutbound(id, data) {
    return api.put(`/sales/outbound/${id}`, data)
  },

  deleteSalesOutbound(id) {
    return api.delete(`/sales/outbound/${id}`)
  },

  // 销售退货
  getSalesReturns(params) {
    return api.get('/sales/returns', { params })
  },

  getSalesReturn(id) {
    return api.get(`/sales/returns/${id}`)
  },

  createSalesReturn(data) {
    return api.post('/sales/returns', data)
  },

  updateSalesReturn(id, data) {
    return api.put(`/sales/returns/${id}`, data)
  },

  updateSalesReturnStatus(id, status) {
    return api.put(`/sales/returns/${id}/status`, { status })
  },

  deleteSalesReturn(id) {
    return api.delete(`/sales/returns/${id}`)
  },

  // 销售换货
  getSalesExchanges(params) {
    return api.get('/sales/exchanges', { params })
  },

  getSalesExchange(id) {
    return api.get(`/sales/exchanges/${id}`)
  },

  createSalesExchange(data) {
    return api.post('/sales/exchanges', data)
  },

  updateSalesExchange(id, data) {
    return api.put(`/sales/exchanges/${id}`, data)
  },

  updateSalesExchangeStatus(id, status) {
    return api.put(`/sales/exchanges/${id}/status`, { status })
  },

  deleteSalesExchange(id) {
    return api.delete(`/sales/exchanges/${id}`)
  }
}
