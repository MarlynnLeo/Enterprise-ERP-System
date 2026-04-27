/**
 * 合同管理 API
 */
import { api } from '../services/axiosInstance'

export const contractApi = {
  getList: (params) => api.get('/api/contracts', { params }),
  getById: (id) => api.get(`/api/contracts/${id}`),
  create: (data) => api.post('/api/contracts', data),
  update: (id, data) => api.put(`/api/contracts/${id}`, data),
  delete: (id) => api.delete(`/api/contracts/${id}`),
  updateStatus: (id, status) => api.put(`/api/contracts/${id}/status`, { status }),
  addExecution: (id, data) => api.post(`/api/contracts/${id}/executions`, data),
  getExpiring: (days) => api.get('/api/contracts/expiring', { params: { days } }),
}
