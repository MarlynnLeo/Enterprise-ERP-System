import { api } from '../services/axiosInstance'

export const equipmentApi = {
  getEquipments: (params) => api.get('/equipment/list', { params }),
  getEquipmentList: (params) => api.get('/equipment/list', { params }),
  getEquipment: (id) => api.get(`/equipment/${id}`),
  getEquipmentById: (id) => api.get(`/equipment/${id}`),
  createEquipment: (data) => api.post('/equipment', data),
  updateEquipment: (id, data) => api.put(`/equipment/${id}`, data),
  deleteEquipment: (id) => api.delete(`/equipment/${id}`),
  importEquipment: (data) => api.post('/equipment/import', data),

  getMaintenances: (params) => api.get('/equipment/maintenance', { params }),
  createMaintenance: (equipmentId, data) => api.post(`/equipment/${equipmentId}/maintenance`, data),

  getFailures: (params) => api.get('/equipment/failures', { params }),
  createFailure: (equipmentId, data) => api.post(`/equipment/${equipmentId}/failure`, data),

  getInspections: (params) => api.get('/equipment/inspections', { params }),
  createInspection: (equipmentId, data) => api.post(`/equipment/${equipmentId}/inspection`, data),

  updateStatus: (id, status) => api.put(`/equipment/${id}/status`, { status }),

  getStatistics: () => api.get('/equipment/stats'),
  getEquipmentStats: () => api.get('/equipment/stats')
}
