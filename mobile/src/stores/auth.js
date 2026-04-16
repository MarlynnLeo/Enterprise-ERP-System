/**
 * 认证状态管理
 * @description 统一的认证状态管理，与后端完全兼容
 * @date 2025-12-27
 * @version 2.0.0
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../services/api'

// 存储键名
const STORAGE_KEYS = {
  TOKEN: 'token',
  USER: 'user',
  REFRESH_TOKEN: 'refreshToken',
  IS_LOGGED_IN: 'isLoggedIn'
}

/**
 * 安全地从 localStorage 获取并解析 JSON
 */
const safeGetJSON = (key, defaultValue = null) => {
  try {
    const value = localStorage.getItem(key)
    if (!value || value === 'undefined' || value === 'null') {
      return defaultValue
    }
    return JSON.parse(value)
  } catch (e) {
    return defaultValue
  }
}

/**
 * 安全地保存 JSON 到 localStorage
 */
const safeSaveJSON = (key, value) => {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, JSON.stringify(value))
    }
  } catch (e) {
    console.error(`保存 ${key} 失败:`, e)
  }
}

export const useAuthStore = defineStore('auth', () => {
  // ==================== 状态 ====================
  const token = ref(localStorage.getItem(STORAGE_KEYS.TOKEN) || '')
  const user = ref(safeGetJSON(STORAGE_KEYS.USER))
  const refreshToken = ref(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN) || '')

  // ==================== 计算属性 ====================
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const userId = computed(() => user.value?.id)
  const username = computed(() => user.value?.username)
  const realName = computed(() => user.value?.real_name || user.value?.username)

  // ==================== 私有方法 ====================

  /**
   * 设置认证头
   */
  const setAuthHeader = () => {
    if (token.value) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token.value}`
    } else {
      delete api.defaults.headers.common['Authorization']
    }
  }

  /**
   * 保存认证信息到 localStorage
   */
  const saveAuthData = (authData) => {
    const { token: accessToken, accessToken: at, refreshToken: rt, user: userData } = authData

    // 优先使用 accessToken，其次使用 token
    const finalToken = at || accessToken

    if (finalToken) {
      token.value = finalToken
      localStorage.setItem(STORAGE_KEYS.TOKEN, finalToken)
    }

    if (rt) {
      refreshToken.value = rt
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, rt)
    }

    if (userData) {
      user.value = userData
      safeSaveJSON(STORAGE_KEYS.USER, userData)
    }

    localStorage.setItem(STORAGE_KEYS.IS_LOGGED_IN, 'true')
    setAuthHeader()
  }

  /**
   * 清除认证信息
   */
  const clearAuthData = () => {
    token.value = ''
    user.value = null
    refreshToken.value = ''

    localStorage.removeItem(STORAGE_KEYS.TOKEN)
    localStorage.removeItem(STORAGE_KEYS.USER)
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN)
    localStorage.removeItem(STORAGE_KEYS.IS_LOGGED_IN)

    setAuthHeader()
  }

  // ==================== 公共方法 ====================

  /**
   * 登录
   * @param {Object} credentials - 登录凭证 { username, password }
   * @returns {Promise<boolean>} 登录是否成功
   */
  const login = async (credentials) => {
    try {
      const response = await api.post('/auth/login', credentials)

      // 响应拦截器已经解包了 ResponseHandler 格式
      // response.data 就是 { token, accessToken, refreshToken, user }
      const authData = response.data

      if (!authData || (!authData.token && !authData.accessToken) || !authData.user) {
        throw new Error('登录响应数据格式错误')
      }

      saveAuthData(authData)
      return true
    } catch (error) {
      clearAuthData()
      throw error
    }
  }

  /**
   * 登出
   */
  const logout = async () => {
    try {
      // 调用后端登出接口
      await api.post('/auth/logout')
    } catch (error) {
      // 即使后端登出失败，也要清除本地数据
    } finally {
      clearAuthData()
    }
  }

  /**
   * 获取用户信息
   * @returns {Promise<boolean>} 是否成功
   */
  const fetchUserProfile = async () => {
    try {
      const response = await api.get('/auth/profile')
      const userData = response.data

      if (userData) {
        user.value = userData
        safeSaveJSON(STORAGE_KEYS.USER, userData)
        return true
      }
      return false
    } catch (error) {
      return false
    }
  }

  /**
   * 刷新 Token
   * @returns {Promise<boolean>} 是否成功
   */
  const refreshAccessToken = async () => {
    try {
      const response = await api.post('/auth/refresh')
      const authData = response.data

      if (authData && (authData.accessToken || authData.token)) {
        saveAuthData(authData)
        return true
      }
      return false
    } catch (error) {
      // Token 刷新失败，清除认证信息
      clearAuthData()
      return false
    }
  }

  // ==================== 初始化 ====================
  setAuthHeader()

  // ==================== 导出 ====================
  return {
    // 状态
    token,
    user,
    refreshToken,

    // 计算属性
    isAuthenticated,
    userId,
    username,
    realName,

    // 方法
    login,
    logout,
    fetchUserProfile,
    refreshAccessToken
  }
})
