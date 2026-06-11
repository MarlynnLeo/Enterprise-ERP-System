/**
 * 采购管理 API 模块
 */
import api from '../client'
import { baseDataApi } from './baseData'

export const purchaseApi = {
  // 采购申请
  getRequisitions(params) {
    return api.get('/purchase/requisitions', { params })
  },

  getRequisition(id) {
    return api.get(`/purchase/requisitions/${id}`)
  },

  createRequisition(data) {
    return api.post('/purchase/requisitions', data)
  },

  updateRequisition(id, data) {
    return api.put(`/purchase/requisitions/${id}`, data)
  },

  deleteRequisition(id) {
    return api.delete(`/purchase/requisitions/${id}`)
  },

  updateRequisitionStatus(id, status) {
    return api.put(`/purchase/requisitions/${id}/status`, { newStatus: status })
  },

  // 采购订单
  getOrders(params) {
    return api.get('/purchase/orders', { params })
  },

  getOrder(id) {
    return api.get(`/purchase/orders/${id}`)
  },

  createOrder(data) {
    return api.post('/purchase/orders', data)
  },

  updateOrder(id, data) {
    return api.put(`/purchase/orders/${id}`, data)
  },

  deleteOrder(id) {
    return api.delete(`/purchase/orders/${id}`)
  },

  updateOrderStatus(id, status) {
    return api.put(`/purchase/orders/${id}/status`, { status })
  },

  // 采购入库
  getReceipts(params) {
    return api.get('/purchase/receipts', { params })
  },

  getReceipt(id) {
    return api.get(`/purchase/receipts/${id}`)
  },

  createReceipt(data) {
    return api.post('/purchase/receipts', data)
  },

  updateReceipt(id, data) {
    return api.put(`/purchase/receipts/${id}`, data)
  },

  updateReceiptStatus(id, status, remarks) {
    return api.put(`/purchase/receipts/${id}/status`, { status, remarks })
  },

  // 采购退货
  getReturns(params) {
    return api.get('/purchase/returns', { params })
  },

  getReturn(id) {
    return api.get(`/purchase/returns/${id}`)
  },

  createReturn(data) {
    return api.post('/purchase/returns', data)
  },

  updateReturn(id, data) {
    return api.put(`/purchase/returns/${id}`, data)
  },

  updateReturnStatus(id, status) {
    return api.put(`/purchase/returns/${id}/status`, { newStatus: status })
  },

  // 外委加工
  getProcessing(params) {
    return api.get('/purchase/outsourced-processings', { params })
  },

  getProcessingById(id) {
    return api.get(`/purchase/outsourced-processings/${id}`)
  },

  createProcessing(data) {
    return api.post('/purchase/outsourced-processings', data)
  },

  updateProcessing(id, data) {
    return api.put(`/purchase/outsourced-processings/${id}`, data)
  },

  updateProcessingStatus(id, status) {
    return api.put(`/purchase/outsourced-processings/${id}/status`, { status })
  },

  deleteProcessing(id) {
    return api.delete(`/purchase/outsourced-processings/${id}`)
  },

  // 外委入库
  getProcessingReceipts(params) {
    return api.get('/purchase/outsourced-receipts', { params })
  },

  getProcessingReceipt(id) {
    return api.get(`/purchase/outsourced-receipts/${id}`)
  },

  createProcessingReceipt(data) {
    return api.post('/purchase/outsourced-receipts', data)
  },

  updateProcessingReceipt(id, data) {
    return api.put(`/purchase/outsourced-receipts/${id}`, data)
  },

  updateProcessingReceiptStatus(id, status) {
    return api.put(`/purchase/outsourced-receipts/${id}/status`, { status })
  },

  // 供应商管理 — 指向 baseDataApi.getSuppliers，避免跨模块重复 (W-23)
  getSuppliers(params) {
    return baseDataApi.getSuppliers(params)
  },

  // 统计数据
  getStatistics() {
    return api.get('/purchase/statistics')
  }
}
