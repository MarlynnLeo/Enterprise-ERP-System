/**
 * 库存管理 API 模块
 */
import api from '../client'

export const inventoryApi = {
  // 看板
  getDashboard(params) {
    return api.get('/inventory/dashboard/summary', { params })
  },
  // 库存查询
  getInventoryStock(params) {
    return api.get('/inventory/stock', { params })
  },

  getStockList(params) {
    return api.get('/inventory/stock', { params })
  },

  getMaterialStock(materialId, locationId) {
    return api.get(`/inventory/stock/${materialId}/${locationId}`)
  },

  getStockRecords(id) {
    return api.get(`/inventory/stock/${id}/records`)
  },

  getMaterialRecords(id) {
    return api.get(`/inventory/materials/${id}/records`)
  },

  getMaterialsWithStock(params) {
    return api.get('/inventory/materials-with-stock', { params })
  },

  getMaterialsList(params) {
    return api.get('/inventory/materials', { params })
  },

  // 出库管理
  getOutboundList(params) {
    return api.get('/inventory/outbound', { params })
  },

  getOutboundDetail(id) {
    return api.get(`/inventory/outbound/${id}`)
  },

  createOutbound(data) {
    return api.post('/inventory/outbound', data)
  },

  updateOutbound(id, data) {
    return api.put(`/inventory/outbound/${id}`, data)
  },

  deleteOutbound(id) {
    return api.delete(`/inventory/outbound/${id}`)
  },

  updateOutboundStatus(id, newStatus) {
    return api.put(`/inventory/outbound/${id}/status`, { newStatus })
  },

  // 撤销出库（已完成 → 草稿，库存回退）
  cancelOutbound(id, force = false) {
    return api.post(`/inventory/outbound/${id}/cancel`, { force })
  },


  // 入库管理
  getInboundList(params) {
    return api.get('/inventory/inbound', { params })
  },

  getInboundDetail(id) {
    return api.get(`/inventory/inbound/${id}`)
  },

  createInbound(data) {
    return api.post('/inventory/inbound', data)
  },

  createInboundFromQuality(data) {
    return api.post('/inventory/inbound/from-quality', data)
  },

  updateInboundStatus(id, newStatus) {
    return api.put(`/inventory/inbound/status/${id}`, { newStatus })
  },

  // 库存调拨
  getTransferList(params) {
    return api.get('/inventory/transfer', { params })
  },

  getTransferDetail(id) {
    return api.get(`/inventory/transfer/${id}`)
  },

  createTransfer(data) {
    return api.post('/inventory/transfer', data)
  },

  updateTransfer(id, data) {
    return api.put(`/inventory/transfer/${id}`, data)
  },

  deleteTransfer(id) {
    return api.delete(`/inventory/transfer/${id}`)
  },

  updateTransferStatus(id, status) {
    return api.put(`/inventory/transfer/${id}/status`, { newStatus: status })
  },

  getTransferStatistics() {
    return api.get('/inventory/transfer/statistics')
  },

  // 库存盘点
  getCheckList(params) {
    return api.get('/inventory/check', { params })
  },

  getCheckDetail(id) {
    return api.get(`/inventory/check/${id}`)
  },

  createCheck(data) {
    return api.post('/inventory/check', data)
  },

  updateCheck(id, data) {
    return api.put(`/inventory/check/${id}`, data)
  },

  addCheckItem(id, data) {
    return api.post(`/inventory/check/${id}/items`, data)
  },

  deleteCheck(id) {
    return api.delete(`/inventory/check/${id}`)
  },

  updateCheckStatus(id, status) {
    return api.put(`/inventory/check/${id}/status`, { status })
  },

  submitCheckResult(id, data) {
    return api.post(`/inventory/check/${id}/result`, data)
  },

  adjustInventory(id) {
    return api.post(`/inventory/check/${id}/adjust`)
  },

  getCheckStatistics() {
    return api.get('/inventory/check/statistics')
  },

  // 库存调整
  adjustStock(data) {
    return api.post('/inventory/stock/adjust', data)
  },

  // 库存流水
  getTransactionList(params) {
    return api.get('/inventory/transactions', { params })
  },

  getTransactionStats() {
    return api.get('/inventory/transactions/stats')
  },

  exportTransactionReport(params) {
    return api.get('/inventory/transactions/export', { params })
  },

  // 库存报表
  getInventoryReport(params) {
    return api.get('/inventory/report', { params })
  },

  exportInventoryReport(params) {
    return api.get('/inventory/report/export', { params })
  },

  getInventoryLedger(params) {
    return api.get('/inventory/ledger', { params })
  },

  // 导出功能
  exportStocks(data) {
    return api.post('/inventory/stock/export', data)
  },

  // 获取库位列表
  getLocations(params) {
    return api.get('/inventory/locations', { params })
  },

  // 获取物料列表
  getAllMaterials() {
    return api.get('/base-data/materials')
  },

  // 获取物料列表（支持参数）
  getMaterials(params) {
    return api.get('/base-data/materials', { params })
  },

  // 仓库管理
  getWarehouses(params) {
    return api.get('/base-data/warehouses', { params })
  }
}
