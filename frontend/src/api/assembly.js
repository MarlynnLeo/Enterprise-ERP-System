import { api } from '../services/axiosInstance';

// ==================== 工位管理 ====================
export const workStationApi = {
  getList: (params) => api.get('/production/assembly/stations', { params }),
  getById: (id) => api.get(`/production/assembly/stations/${id}`),
  create: (data) => api.post('/production/assembly/stations', data),
  update: (id, data) => api.put(`/production/assembly/stations/${id}`, data),
  delete: (id) => api.delete(`/production/assembly/stations/${id}`),
  getLines: () => api.get('/production/assembly/stations/lines'),
  getStatus: () => api.get('/production/assembly/stations/status'),
};

// ==================== 工序路线 ====================
export const processRouteApi = {
  getList: (params) => api.get('/production/assembly/routes', { params }),
  getById: (id) => api.get(`/production/assembly/routes/${id}`),
  create: (data) => api.post('/production/assembly/routes', data),
  update: (id, data) => api.put(`/production/assembly/routes/${id}`, data),
  delete: (id) => api.delete(`/production/assembly/routes/${id}`),
  getActiveByProduct: (productId) => api.get(`/production/assembly/routes/product/${productId}`),
  suggestMaterials: (productId) => api.get(`/production/assembly/routes/suggest-materials/${productId}`),
};

// ==================== 装配执行 ====================
export const assemblyExecutionApi = {
  generateSteps: (taskId) => api.post(`/production/assembly/tasks/${taskId}/generate-steps`),
  getTaskSteps: (taskId) => api.get(`/production/assembly/tasks/${taskId}/steps`),
  getStepDetail: (stepId) => api.get(`/production/assembly/steps/${stepId}`),
  startStep: (stepId, data) => api.post(`/production/assembly/steps/${stepId}/start`, data),
  completeStep: (stepId, data) => api.post(`/production/assembly/steps/${stepId}/complete`, data),
  skipStep: (stepId, data) => api.post(`/production/assembly/steps/${stepId}/skip`, data),
  getBoard: () => api.get('/production/assembly/board'),
};
