/**
 * 审批工作流 API
 */
import { api } from '../services/axiosInstance'

export const workflowApi = {
  // 模板管理
  getTemplates: (params) => api.get('/api/workflow/templates', { params }),
  getTemplateById: (id) => api.get(`/api/workflow/templates/${id}`),
  createTemplate: (data) => api.post('/api/workflow/templates', data),
  updateTemplate: (id, data) => api.put(`/api/workflow/templates/${id}`, data),
  deleteTemplate: (id) => api.delete(`/api/workflow/templates/${id}`),

  // 审批操作
  startWorkflow: (data) => api.post('/api/workflow/start', data),
  approveNode: (instanceId, data) => api.post(`/api/workflow/instances/${instanceId}/approve`, data),
  withdrawWorkflow: (instanceId) => api.post(`/api/workflow/instances/${instanceId}/withdraw`),

  // 查询
  getInstanceById: (id) => api.get(`/api/workflow/instances/${id}`),
  getMyInitiated: (params) => api.get('/api/workflow/my/initiated', { params }),
  getMyPending: (params) => api.get('/api/workflow/my/pending', { params }),
  getByBusiness: (businessType, businessId) => api.get('/api/workflow/business', { params: { business_type: businessType, business_id: businessId } }),
}
