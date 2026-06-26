import { api } from '../services/axiosInstance';

const BASE_URL = '/system/notification-rules';

export const notificationRuleApi = {
  getRules: (params) => api.get(BASE_URL, { params }),
  getRuleById: (id) => api.get(`${BASE_URL}/${id}`),
  createRule: (data) => api.post(BASE_URL, data),
  updateRule: (id, data) => api.put(`${BASE_URL}/${id}`, data),
  deleteRule: (id) => api.delete(`${BASE_URL}/${id}`),
  toggleActive: (id, is_active) => api.patch(`${BASE_URL}/${id}/toggle`, { is_active }),
  getSupportedEvents: () => api.get(`${BASE_URL}/events`),
};

export default notificationRuleApi;
