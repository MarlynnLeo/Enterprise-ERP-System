import { api } from '../services/axiosInstance';

export const notificationApi = {
  getNotifications: (params) => api.get('/system/notifications', { params }),
  getUnreadCount: () => api.get('/system/notifications/unread-count'),
  markAsRead: (id) => api.put(`/system/notifications/${id}/read`),
  markAllAsRead: (ids = []) => api.put('/system/notifications/mark-all-read', { ids }),
  deleteNotification: (id) => api.delete(`/system/notifications/${id}`),
  createNotification: (data) => api.post('/system/notifications', data),
  createBatchNotifications: (notifications) => api.post('/system/notifications/batch', { notifications })
};

export default notificationApi;
