import { api } from '../services/axiosInstance';

export const technicalCommunicationApi = {
  getCommunications: (params) => api.get('/system/technical-communications', { params }),
  getCommunicationDetail: (id) => api.get(`/system/technical-communications/${id}`),
  createCommunication: (data) => api.post('/system/technical-communications', data),
  updateCommunication: (id, data) => api.put(`/system/technical-communications/${id}`, data),
  deleteCommunication: (id) => api.delete(`/system/technical-communications/${id}`),
  addComment: (id, data) => api.post(`/system/technical-communications/${id}/comments`, data),
  deleteComment: (commentId) => api.delete(`/system/technical-communications/comments/${commentId}`),
  toggleLike: (id) => api.post(`/system/technical-communications/${id}/like`),
  toggleFavorite: (id) => api.post(`/system/technical-communications/${id}/favorite`),
  getUserInteraction: (id) => api.get(`/system/technical-communications/${id}/interaction`),
  getRecipients: (id) => api.get(`/system/technical-communications/${id}/recipients`),
  markAsRead: (id) => api.post(`/system/technical-communications/${id}/mark-read`)
};

export default technicalCommunicationApi;
