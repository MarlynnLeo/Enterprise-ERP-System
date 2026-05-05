/**
 * 审批工作流 API
 */
import { api } from '../services/axiosInstance'

export const workflowApi = {
  // 模板管理
  getTemplates: (params) => api.get('/workflow/templates', { params }),
  getTemplateById: (id) => api.get(`/workflow/templates/${id}`),
  createTemplate: (data) => api.post('/workflow/templates', data),
  updateTemplate: (id, data) => api.put(`/workflow/templates/${id}`, data),
  deleteTemplate: (id) => api.delete(`/workflow/templates/${id}`),

  // 审批操作
  startWorkflow: (data) => api.post('/workflow/start', data),
  approveNode: (instanceId, data) => api.post(`/workflow/instances/${instanceId}/approve`, data),
  withdrawWorkflow: (instanceId) => api.post(`/workflow/instances/${instanceId}/withdraw`),

  // 查询
  getInstanceById: (id) => api.get(`/workflow/instances/${id}`),
  getMyInitiated: (params) => api.get('/workflow/my/initiated', { params }),
  getMyPending: (params) => api.get('/workflow/my/pending', { params }),
  getByBusiness: (businessType, businessId) => api.get('/workflow/business', { params: { business_type: businessType, business_id: businessId } }),
}
