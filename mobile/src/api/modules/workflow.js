/**
 * 工作流 API — 对接后端 /api/workflow/*
 */
import api from '../client'

export const workflowApi = {
  getMyPending: (params) => api.get('/workflow/my/pending', { params }),
  getMyInitiated: (params) => api.get('/workflow/my/initiated', { params }),
  getInstanceById: (id) => api.get(`/workflow/instances/${id}`),
  approveNode: (instanceId, data) =>
    api.post(`/workflow/instances/${instanceId}/approve`, data),
  withdrawWorkflow: (instanceId) =>
    api.post(`/workflow/instances/${instanceId}/withdraw`),
}

export default workflowApi
