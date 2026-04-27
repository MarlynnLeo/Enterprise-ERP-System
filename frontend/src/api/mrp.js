/**
 * MRP 物料需求计划 API
 */
import { api } from '../services/axiosInstance'

export const mrpApi = {
  getRunList: (params) => api.get('/api/mrp/runs', { params }),
  getRunById: (id) => api.get(`/api/mrp/runs/${id}`),
  createAndRun: (data) => api.post('/api/mrp/runs', data),
  updateSuggestionStatus: (id, status) => api.put(`/api/mrp/results/${id}/status`, { status }),
  batchConfirm: (ids) => api.post('/api/mrp/results/batch-confirm', { ids }),
  convertSuggestions: (ids) => api.post('/api/mrp/results/convert', { ids }),
}
