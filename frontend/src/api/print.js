import { api } from '../services/axiosInstance';

export const printApi = {
  getSettings: (params) => api.get('/print/settings', { params }),
  getSetting: (id) => api.get(`/print/settings/${id}`),
  createSetting: (data) => api.post('/print/settings', data),
  updateSetting: (id, data) => api.put(`/print/settings/${id}`, data),
  deleteSetting: (id) => api.delete(`/print/settings/${id}`),

  getTemplates: (params) => api.get('/print/templates', { params }),
  getTemplate: (id) => api.get(`/print/templates/${id}`),
  getDefaultTemplate: (module, type) =>
    api.get('/print/templates/default', { params: { module, templateType: type } }),
  createTemplate: (data) => api.post('/print/templates', data),
  updateTemplate: (id, data) => api.put(`/print/templates/${id}`, data),
  deleteTemplate: (id) => api.delete(`/print/templates/${id}`)
};

export default printApi;
