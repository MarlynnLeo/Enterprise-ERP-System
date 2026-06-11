/**
 * 设备管理 API 模块
 */
import api from '../client'

export const equipmentApi = {
  getList(params) {
    return api.get('/equipment/list', { params })
  },
  getTypes(params) {
    return api.get('/equipment/types', { params })
  },
  createType(data) {
    return api.post('/equipment/types', data)
  },
  createEquipment(data) {
    return api.post('/equipment', data)
  },
  updateEquipment(id, data) {
    return api.put(`/equipment/${id}`, data)
  },
  getStats() {
    return api.get('/equipment/stats')
  },
  getMaintenanceRecords(params) {
    return api.get('/equipment/maintenance', { params })
  },
  getFailureRecords(params) {
    return api.get('/equipment/failures', { params })
  },
  getInspectionRecords(params) {
    return api.get('/equipment/inspections', { params })
  },
  getById(id) {
    return api.get(`/equipment/${id}`)
  },
  addInspection(equipmentId, data) {
    return api.post(`/equipment/${equipmentId}/inspection`, data)
  },
  addFailure(equipmentId, data) {
    return api.post(`/equipment/${equipmentId}/failure`, data)
  },
  addMaintenance(equipmentId, data) {
    return api.post(`/equipment/${equipmentId}/maintenance`, data)
  }
}
