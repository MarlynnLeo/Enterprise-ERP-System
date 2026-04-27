/**
 * 认证状态管理
 * @description 统一的认证状态管理，支持权限同步（与网页端共用后端 API）
 * @date 2025-12-27
 * @version 3.0.0 — 增加权限管理
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../services/api'

// 存储键名
const STORAGE_KEYS = {
  TOKEN: 'token',
  USER: 'user',
  REFRESH_TOKEN: 'refreshToken',
  IS_LOGGED_IN: 'isLoggedIn',
  PERMISSIONS: 'user_permissions'
}

/**
 * 安全地从指定 storage 获取并解析 JSON
 */
const safeGetJSON = (key, defaultValue = null, storage = sessionStorage) => {
  try {
    const value = storage.getItem(key)
    if (!value || value === 'undefined' || value === 'null') {
      return defaultValue
    }
    return JSON.parse(value)
  } catch (e) {
    return defaultValue
  }
}

/**
 * 安全地保存 JSON 到指定 storage
 */
const safeSaveJSON = (key, value, storage = sessionStorage) => {
  try {
    if (value === null || value === undefined) {
      storage.removeItem(key)
    } else {
      storage.setItem(key, JSON.stringify(value))
    }
  } catch (e) {
    console.error(`保存 ${key} 失败:`, e)
  }
}

/**
 * 检查 JWT token 是否已过期
 */
const isTokenValid = (tokenStr) => {
  if (!tokenStr) return false
  try {
    const parts = tokenStr.split('.')
    if (parts.length !== 3) return false
    const payload = JSON.parse(atob(parts[1]))
    if (payload.exp && Date.now() > payload.exp * 1000) return false
    return true
  } catch {
    return false
  }
}

export const useAuthStore = defineStore('auth', () => {
  // ==================== 状态 ====================
  // accessToken + user 存 sessionStorage（标签关闭即清除，更安全）
  // refreshToken 存 localStorage（支持静默续签）
  const storedToken = sessionStorage.getItem(STORAGE_KEYS.TOKEN) || ''
  const token = ref(isTokenValid(storedToken) ? storedToken : '')
  const user = ref(safeGetJSON(STORAGE_KEYS.USER, null, sessionStorage))
  const refreshToken = ref(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN) || '')

  // 权限状态 — 与网页端 authStore 保持一致
  const permissions = ref(safeGetJSON(STORAGE_KEYS.PERMISSIONS, []))
  const permissionsLoaded = ref(false)
  const permissionsLoading = ref(false)

  // ==================== 计算属性 ====================
  const isAuthenticated = computed(() => !!token.value && !!user.value && isTokenValid(token.value))
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
   * 保存认证信息（accessToken/user → sessionStorage，refreshToken → localStorage）
   */
  const saveAuthData = (authData) => {
    const { token: accessToken, accessToken: at, refreshToken: rt, user: userData } = authData

    // 优先使用 accessToken，其次使用 token
    const finalToken = at || accessToken

    if (finalToken) {
      token.value = finalToken
      sessionStorage.setItem(STORAGE_KEYS.TOKEN, finalToken)
    }

    if (rt) {
      refreshToken.value = rt
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, rt)
    }

    if (userData) {
      user.value = userData
      safeSaveJSON(STORAGE_KEYS.USER, userData, sessionStorage)
    }

    sessionStorage.setItem(STORAGE_KEYS.IS_LOGGED_IN, 'true')
    setAuthHeader()
  }

  /**
   * 清除认证信息
   */
  const clearAuthData = () => {
    token.value = ''
    user.value = null
    refreshToken.value = ''
    permissions.value = []
    permissionsLoaded.value = false
    permissionsLoading.value = false

    sessionStorage.removeItem(STORAGE_KEYS.TOKEN)
    sessionStorage.removeItem(STORAGE_KEYS.USER)
    sessionStorage.removeItem(STORAGE_KEYS.IS_LOGGED_IN)
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN)
    localStorage.removeItem(STORAGE_KEYS.PERMISSIONS)

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

      // 登录成功后清除旧权限缓存，再获取新权限
      permissions.value = []
      permissionsLoaded.value = false
      localStorage.removeItem(STORAGE_KEYS.PERMISSIONS)
      try {
        await fetchUserPermissions()
      } catch (e) {
        console.warn('[auth] 获取权限数据失败:', e.message)
      }

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
        safeSaveJSON(STORAGE_KEYS.USER, userData, sessionStorage)
        return true
      }
      return false
    } catch (error) {
      return false
    }
  }

  /**
   * 更新用户资料
   * @param {Object} data - 待更新的用户字段
   * @returns {Promise<boolean>} 是否成功
   */
  const updateProfile = async (data) => {
    const response = await api.put('/auth/profile', data)
    if (response.data) {
      user.value = { ...user.value, ...response.data }
      safeSaveJSON(STORAGE_KEYS.USER, user.value, sessionStorage)
    }
    return true
  }

  /**
   * 获取用户权限列表 — 复用网页端同一后端 API
   * @param {boolean} force - 是否强制刷新
   */
  const fetchUserPermissions = async (force = false) => {
    if (force) {
      permissionsLoaded.value = false
    }

    if (permissionsLoaded.value && !force) {
      return true
    }

    // 防止重复请求（带 10 秒超时保护）
    if (permissionsLoading.value) {
      return new Promise((resolve) => {
        const startTime = Date.now()
        const MAX_WAIT = 10000
        const checkLoading = () => {
          if (!permissionsLoading.value) {
            resolve(permissionsLoaded.value)
          } else if (Date.now() - startTime > MAX_WAIT) {
            console.warn('[auth] 等待权限加载超时，放弃等待')
            resolve(false)
          } else {
            setTimeout(checkLoading, 100)
          }
        }
        checkLoading()
      })
    }

    try {
      permissionsLoading.value = true

      const timestamp = Date.now()
      const response = await api.get(`/auth/permissions?_t=${timestamp}`)
      const data = response.data

      // 处理不同的权限数据格式
      if (Array.isArray(data)) {
        permissions.value = data
      } else if (data && data.permissions && Array.isArray(data.permissions)) {
        permissions.value = data.permissions
      } else {
        console.error('[auth] 权限数据格式不正确:', data)
        permissions.value = []
      }

      // 权限缓存到 localStorage（跨标签共享，刷新后快速恢复）
      safeSaveJSON(STORAGE_KEYS.PERMISSIONS, permissions.value, localStorage)
      permissionsLoaded.value = true
      return true
    } catch (error) {
      console.error('[auth] 获取用户权限失败:', error)
      permissions.value = []
      permissionsLoaded.value = false
      safeSaveJSON(STORAGE_KEYS.PERMISSIONS, null, localStorage)
      throw error
    } finally {
      permissionsLoading.value = false
    }
  }

  /**
   * 清除缓存并重新加载权限
   */
  const refreshPermissions = async () => {
    permissions.value = []
    permissionsLoaded.value = false
    permissionsLoading.value = false
    localStorage.removeItem(STORAGE_KEYS.PERMISSIONS)
    return await fetchUserPermissions(true)
  }

  /**
   * 检查是否有特定权限 — 逻辑与网页端 authStore.hasPermission 完全一致
   * @param {string} perm - 权限标识（如 'purchase:requisitions:create'）
   * @returns {boolean}
   */
  const hasPermission = (perm) => {
    if (!perm) return true

    // 如果权限未加载且缓存为空，默认拒绝
    if (!permissionsLoaded.value && permissions.value.length === 0) {
      return false
    }

    // 超级管理员通配符
    if (permissions.value.includes('*')) {
      return true
    }

    // 精确匹配
    if (permissions.value.includes(perm)) {
      return true
    }

    // 前缀通配符匹配（如 'production:*' 匹配 'production:tasks:view'）
    const matched = permissions.value.some(p => {
      if (p.endsWith(':*')) {
        const prefix = p.slice(0, -2)
        return perm.startsWith(prefix + ':')
      }
      return false
    })
    if (matched) return true

    // 父级模块兼容：检查 perm 的子权限是否存在
    // 例如检查 'purchase' 时，用户有 'purchase:requisitions' 也算有权限
    const prefix = perm + ':'
    return permissions.value.some(p => p.startsWith(prefix))
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
    permissions,
    permissionsLoaded,
    permissionsLoading,

    // 计算属性
    isAuthenticated,
    userId,
    username,
    realName,

    // 方法
    login,
    logout,
    fetchUserProfile,
    updateProfile,
    fetchUserPermissions,
    refreshPermissions,
    hasPermission,
    refreshAccessToken
  }
})
