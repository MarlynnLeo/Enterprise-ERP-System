/**
 * 增强模块 API — 编码规则 / 单据关联 / 汇率 / 绩效 / ECN / 文档 / 告警
 */
import { api } from '../services/axiosInstance'

// 编码规则
export const codingRuleApi = {
  getList: (params) => api.get('/api/enhanced/coding-rules', { params }),
  getById: (id) => api.get(`/api/enhanced/coding-rules/${id}`),
  create: (data) => api.post('/api/enhanced/coding-rules', data),
  update: (id, data) => api.put(`/api/enhanced/coding-rules/${id}`, data),
  delete: (id) => api.delete(`/api/enhanced/coding-rules/${id}`),
  preview: (type) => api.get(`/api/enhanced/coding-rules/preview/${type}`),
  getSequences: (type) => api.get(`/api/enhanced/coding-rules/sequences/${type}`),
  resetSequence: (data) => api.post('/api/enhanced/coding-rules/reset-sequence', data),
}

// 单据关联
export const docLinkApi = {
  getLinks: (businessType, businessId) => api.get('/api/enhanced/document-links', { params: { business_type: businessType, business_id: businessId } }),
  getFullChain: (businessType, businessId) => api.get('/api/enhanced/document-links/chain', { params: { business_type: businessType, business_id: businessId } }),
  getTypeLabels: () => api.get('/api/enhanced/document-links/types'),
  create: (data) => api.post('/api/enhanced/document-links', data),
  delete: (id) => api.delete(`/api/enhanced/document-links/${id}`),
}

// 汇率
export const exchangeRateApi = {
  getList: (params) => api.get('/api/enhanced/exchange-rates', { params }),
  getLatest: (from, to) => api.get('/api/enhanced/exchange-rates/latest', { params: { from, to } }),
  create: (data) => api.post('/api/enhanced/exchange-rates', data),
  delete: (id) => api.delete(`/api/enhanced/exchange-rates/${id}`),
}

// 绩效管理
export const performanceApi = {
  getIndicators: (params) => api.get('/api/enhanced/performance/indicators', { params }),
  createIndicator: (data) => api.post('/api/enhanced/performance/indicators', data),
  updateIndicator: (id, data) => api.put(`/api/enhanced/performance/indicators/${id}`, data),
  deleteIndicator: (id) => api.delete(`/api/enhanced/performance/indicators/${id}`),
  getPeriods: () => api.get('/api/enhanced/performance/periods'),
  createPeriod: (data) => api.post('/api/enhanced/performance/periods', data),
  updatePeriodStatus: (id, status) => api.put(`/api/enhanced/performance/periods/${id}/status`, { status }),
  getEvaluations: (params) => api.get('/api/enhanced/performance/evaluations', { params }),
  getEvaluationById: (id) => api.get(`/api/enhanced/performance/evaluations/${id}`),
  createEvaluation: (data) => api.post('/api/enhanced/performance/evaluations', data),
  scoreEvaluation: (id, data) => api.put(`/api/enhanced/performance/evaluations/${id}/score`, data),
}

// ECN 变更管理
export const ecnApi = {
  getList: (params) => api.get('/api/enhanced/ecn', { params }),
  getById: (id) => api.get(`/api/enhanced/ecn/${id}`),
  create: (data) => api.post('/api/enhanced/ecn', data),
  update: (id, data) => api.put(`/api/enhanced/ecn/${id}`, data),
  updateStatus: (id, status) => api.put(`/api/enhanced/ecn/${id}/status`, { status }),
  delete: (id) => api.delete(`/api/enhanced/ecn/${id}`),
}

// 文档管理
export const documentApi = {
  getList: (params) => api.get('/api/enhanced/documents', { params }),
  create: (data) => api.post('/api/enhanced/documents', data),
  update: (id, data) => api.put(`/api/enhanced/documents/${id}`, data),
  delete: (id) => api.delete(`/api/enhanced/documents/${id}`),
  download: (id) => api.get(`/api/enhanced/documents/${id}/download`),
}

// 业务告警
export const alertApi = {
  getList: () => api.get('/api/enhanced/business-alerts'),
  update: (id, data) => api.put(`/api/enhanced/business-alerts/${id}`, data),
}
