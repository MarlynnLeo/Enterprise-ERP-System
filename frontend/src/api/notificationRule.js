import { api } from '../services/axiosInstance';

const BASE_URL = '/system/notification-rules';

export const notificationRuleApi = {
  getRules: (params) => api.get(BASE_URL, { params }),
  getRuleById: (id) => api.get(`${BASE_URL}/${id}`),
  createRule: (data) => api.post(BASE_URL, data),
  updateRule: (id, data) => api.put(`${BASE_URL}/${id}`, data),
  deleteRule: (id) => api.delete(`${BASE_URL}/${id}`),
  toggleActive: (id, isActive) => api.patch(`${BASE_URL}/${id}/toggle`, { isActive }),
  getSupportedEvents: () => api.get(`${BASE_URL}/events`),
  getRecipientOptions: () => api.get(`${BASE_URL}/recipient-options`),
  previewRecipients: (data) => api.post(`${BASE_URL}/preview`, data),
  getResponsibilities: () => api.get(`${BASE_URL}/responsibilities`),
  updateResponsibility: (code, data) => api.put(`${BASE_URL}/responsibilities/${code}`, data),
  sendTest: (id) => api.post(`${BASE_URL}/${id}/test`),
};

export default notificationRuleApi;
