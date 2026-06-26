import { api } from '../services/axiosInstance';

export const anomalyReportApi = {
  getList: (params) => api.get('/production/anomaly-reports', { params }),
  getById: (id) => api.get(`/production/anomaly-reports/${id}`),
  create: (data) => api.post('/production/anomaly-reports', data),
  assign: (id, data) => api.patch(`/production/anomaly-reports/${id}/assign`, data),
  resolve: (id, data) => api.patch(`/production/anomaly-reports/${id}/resolve`, data),
  close: (id) => api.patch(`/production/anomaly-reports/${id}/close`),
  delete: (id) => api.delete(`/production/anomaly-reports/${id}`),
  getStats: () => api.get('/production/anomaly-reports/stats'),
};

export const productionAssistApi = {
  checkReadiness: (taskId) => api.get(`/production/assist/material-readiness/${taskId}`),
  checkReadinessBatch: (taskIds) => api.post('/production/assist/material-readiness/batch', { taskIds }),
  scanVerify: (data) => api.post('/production/assist/scan-verify', data),
  getVerificationLogs: (params) => api.get('/production/assist/verification-logs', { params }),
};

export const employeeSkillApi = {
  getList: (params) => api.get('/hr/skills', { params }),
  getById: (id) => api.get(`/hr/skills/${id}`),
  create: (data) => api.post('/hr/skills', data),
  update: (id, data) => api.put(`/hr/skills/${id}`, data),
  delete: (id) => api.delete(`/hr/skills/${id}`),
  getMatrix: (params) => api.get('/hr/skills/matrix', { params }),
  getCategories: () => api.get('/hr/skills/categories'),
  getExpiring: (days) => api.get('/hr/skills/expiring', { params: { days } }),
};
