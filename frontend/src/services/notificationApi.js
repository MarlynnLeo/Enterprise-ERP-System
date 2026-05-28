/**
 * 通知API服务
 */

import { api } from './api';

export default {
  /**
   * 获取通知列表
   */
  getNotifications(params) {
    return api.get('/system/notifications', { params });
  },

  /**
   * 获取未读通知数量
   */
  getUnreadCount() {
    return api.get('/system/notifications/unread-count');
  },

  /**
   * 标记通知为已读
   */
  markAsRead(id) {
    return api.put(`/system/notifications/${id}/read`);
  },

  /**
   * 批量标记为已读
   */
  markAllAsRead(ids = []) {
    return api.put('/system/notifications/mark-all-read', { ids });
  },

  /**
   * 删除通知
   */
  deleteNotification(id) {
    return api.delete(`/system/notifications/${id}`);
  },

  /**
   * 创建通知
   */
  createNotification(data) {
    return api.post('/system/notifications', data);
  },

  /**
   * 批量创建通知
   */
  createBatchNotifications(notifications) {
    return api.post('/system/notifications/batch', { notifications });
  }
};
