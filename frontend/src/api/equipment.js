import { api } from '../services/axiosInstance';

export const equipmentApi = {
    // 设备列表 - 后端路由是 /api/equipment/list
    getEquipments: (params) => api.get('/equipment/list', { params }),
    getEquipmentList: (params) => api.get('/equipment/list', { params }), // 别名
    getEquipment: (id) => api.get(`/equipment/${id}`),
    getEquipmentById: (id) => api.get(`/equipment/${id}`), // 别名
    createEquipment: (data) => api.post('/equipment', data),
    updateEquipment: (id, data) => api.put(`/equipment/${id}`, data),
    deleteEquipment: (id) => api.delete(`/equipment/${id}`),
    importEquipment: (data) => api.post('/equipment/import', data),

    // 设备维护
    getMaintenances: (params) => api.get('/equipment/maintenance', { params }),
    createMaintenance: (equipmentId, data) => api.post(`/equipment/${equipmentId}/maintenance`, data),
    updateMaintenance: (id, data) => api.put(`/equipment/maintenance/${id}`, data),
    completeMaintenance: (id, data) => api.post(`/equipment/maintenance/${id}/complete`, data),

    // 设备故障
    getFailures: (params) => api.get('/equipment/failures', { params }),
    createFailure: (equipmentId, data) => api.post(`/equipment/${equipmentId}/failure`, data),

    // 设备检查
    getInspections: (params) => api.get('/equipment/inspections', { params }),
    createInspection: (equipmentId, data) => api.post(`/equipment/${equipmentId}/inspection`, data),

    // 设备状态变更
    updateStatus: (id, status) => api.put(`/equipment/${id}/status`, { status }),

    // 设备统计 - 后端路由是 /api/equipment/stats
    getStatistics: () => api.get('/equipment/stats'),
    getEquipmentStats: () => api.get('/equipment/stats') // 别名
};
