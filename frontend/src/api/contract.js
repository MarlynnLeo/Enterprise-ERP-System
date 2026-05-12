/**
 * 合同管理 API
 */
import { api } from '../services/axiosInstance'

export const contractApi = {
  getList: (params) => api.get('/contracts', { params }),
  getById: (id) => api.get(`/contracts/${id}`),
  create: (data) => api.post('/contracts', data),
  update: (id, data) => api.put(`/contracts/${id}`, data),
  delete: (id) => api.delete(`/contracts/${id}`),
  updateStatus: (id, status) => api.put(`/contracts/${id}/status`, { status }),
  addExecution: (id, data) => api.post(`/contracts/${id}/executions`, data),
  getExpiring: (days) => api.get('/contracts/expiring', { params: { days } }),
}
