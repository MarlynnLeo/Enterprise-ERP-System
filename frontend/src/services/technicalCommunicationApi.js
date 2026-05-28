/**
 * 即时通讯API服务
 */

import { api } from './api';

export default {
  /**
   * 获取技术通讯列表
   */
  getCommunications(params) {
    return api.get('/system/technical-communications', { params });
  },

  /**
   * 获取技术通讯详情
   */
  getCommunicationDetail(id) {
    return api.get(`/system/technical-communications/${id}`);
  },

  /**
   * 创建技术通讯
   */
  createCommunication(data) {
    return api.post('/system/technical-communications', data);
  },

  /**
   * 更新技术通讯
   */
  updateCommunication(id, data) {
    return api.put(`/system/technical-communications/${id}`, data);
  },

  /**
   * 删除技术通讯
   */
  deleteCommunication(id) {
    return api.delete(`/system/technical-communications/${id}`);
  },

  /**
   * 添加评论
   */
  addComment(id, data) {
    return api.post(`/system/technical-communications/${id}/comments`, data);
  },

  /**
   * 删除评论
   */
  deleteComment(commentId) {
    return api.delete(`/system/technical-communications/comments/${commentId}`);
  },

  /**
   * 切换点赞
   */
  toggleLike(id) {
    return api.post(`/system/technical-communications/${id}/like`);
  },

  /**
   * 切换收藏
   */
  toggleFavorite(id) {
    return api.post(`/system/technical-communications/${id}/favorite`);
  },

  /**
   * 获取用户互动状态
   */
  getUserInteraction(id) {
    return api.get(`/system/technical-communications/${id}/interaction`);
  },

  /**
   * 获取抄送人员列表
   */
  getRecipients(id) {
    return api.get(`/system/technical-communications/${id}/recipients`);
  },

  /**
   * 标记为已读
   */
  markAsRead(id) {
    return api.post(`/system/technical-communications/${id}/mark-read`);
  }
};
