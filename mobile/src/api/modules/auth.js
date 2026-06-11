/**
 * 认证相关 API 模块
 */
import api from '../client'

export const authApi = {
  // 用户登录
  login(credentials) {
    return api.post('/auth/login', credentials)
  },

  // 获取用户信息
  getUserProfile() {
    return api.get('/auth/profile')
  },

  // 更新用户资料
  updateProfile(data) {
    return api.put('/auth/profile', data)
  },

  // 修改密码
  changePassword(data) {
    return api.put('/auth/change-password', data)
  },

  // 上传头像
  uploadAvatar(formData) {
    return api.put('/auth/users/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }
}
