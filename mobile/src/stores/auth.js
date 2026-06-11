/**
 * 认证状态管理
 * @description 统一的认证状态管理，支持权限同步（与网页端共用后端 API）
 * @date 2025-12-27
 * @version 3.0.0 — 增加权限管理
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'
import { buildResourceUrl } from '@/config/app'

// 存储键名
const STORAGE_KEYS = {
  USER: 'user',
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
  } catch {
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

const normalizeUserData = (userData) => {
  if (!userData || typeof userData !== 'object') return userData
  const normalized = { ...userData }
  if (normalized.avatar) {
    normalized.avatar = buildResourceUrl(normalized.avatar)
  }
  return normalized
}

/**
 * 检查 JWT token 是否已过期
 */
export const useAuthStore = defineStore('auth', () => {
  // ==================== 状态 ====================
  // 后端使用 httpOnly cookie 管理 accessToken / refreshToken，前端无需操作 token
  // user 信息存 localStorage（关闭浏览器后仍可恢复登录态）
  const token = ref('')
  const user = ref(normalizeUserData(
    safeGetJSON(STORAGE_KEYS.USER, null, localStorage) ||
    safeGetJSON(STORAGE_KEYS.USER, null, sessionStorage)
  ))
  const profileLoaded = ref(false)
  const refreshToken = ref('')

  // 权限状态 — 与网页端 authStore 保持一致
  // 权限缓存使用 sessionStorage，关闭浏览器即失效，降低泄露风险
  const permissions = ref(
    safeGetJSON(STORAGE_KEYS.PERMISSIONS, [], sessionStorage) ||
    []
  )
  const permissionsLoaded = ref(false)
  const permissionsLoading = ref(false)

  // ==================== 计算属性 ====================
  // 判定是否已认证：有用户数据 或 有本地登录标记（cookie 可能仍有效）
  const isAuthenticated = computed(() => {
    if (!!user.value) return true
    // 本地有登录标记时，说明之前登录过，cookie 可能仍有效
    const wasLoggedIn = localStorage.getItem(STORAGE_KEYS.IS_LOGGED_IN) === 'true' ||
      sessionStorage.getItem(STORAGE_KEYS.IS_LOGGED_IN) === 'true'
    return wasLoggedIn
  })
  const userId = computed(() => user.value?.id)
  const username = computed(() => user.value?.username)
  const realName = computed(() => user.value?.real_name || user.value?.username)

  // ==================== 私有方法 ====================

  /**
   * 设置认证头
   */
  const setAuthHeader = () => {
    delete api.defaults.headers.common['Authorization']
  }

  /**
   * 保存认证信息
   * 后端通过 httpOnly cookie 管理 token，前端只保存 user 数据
   */
  const saveAuthData = (authData) => {
    const { user: rawUserData } = authData
    const userData = normalizeUserData(rawUserData)

    if (userData) {
      user.value = userData
      profileLoaded.value = true
      // 同时写入 localStorage 和 sessionStorage，确保关闭浏览器后仍可恢复
      safeSaveJSON(STORAGE_KEYS.USER, userData, localStorage)
      safeSaveJSON(STORAGE_KEYS.USER, userData, sessionStorage)
    }

    // 标记登录状态到 localStorage（关闭浏览器后仍保留）
    localStorage.setItem(STORAGE_KEYS.IS_LOGGED_IN, 'true')
    sessionStorage.setItem(STORAGE_KEYS.IS_LOGGED_IN, 'true')
    if (typeof window !== 'undefined') {
      delete window.__mobileThemeLoaded
      delete window.__mobileThemeLoadedFor
    }
    setAuthHeader()
  }

  /**
   * 清除认证信息
   */
  const clearAuthData = () => {
    token.value = ''
    user.value = null
    profileLoaded.value = false
    refreshToken.value = ''
    permissions.value = []
    permissionsLoaded.value = false
    permissionsLoading.value = false

    // 清除所有存储的认证数据
    sessionStorage.removeItem('token')
    sessionStorage.removeItem(STORAGE_KEYS.USER)
    sessionStorage.removeItem(STORAGE_KEYS.IS_LOGGED_IN)
    localStorage.removeItem(STORAGE_KEYS.USER)
    localStorage.removeItem(STORAGE_KEYS.IS_LOGGED_IN)
    localStorage.removeItem('refreshToken')
    sessionStorage.removeItem(STORAGE_KEYS.PERMISSIONS)
    if (typeof window !== 'undefined') {
      delete window.__mobileThemeLoaded
      delete window.__mobileThemeLoadedFor
    }

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

      if (!authData || !authData.user) {
        throw new Error('登录响应数据格式错误')
      }

      saveAuthData(authData)

      // 登录成功后清除旧权限缓存，再获取新权限
      permissions.value = []
      permissionsLoaded.value = false
      sessionStorage.removeItem(STORAGE_KEYS.PERMISSIONS)
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
    } catch {
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
      const userData = normalizeUserData(response.data)

      if (userData) {
        user.value = userData
        profileLoaded.value = true
        // 同步保存到 localStorage 和 sessionStorage
        safeSaveJSON(STORAGE_KEYS.USER, userData, localStorage)
        safeSaveJSON(STORAGE_KEYS.USER, userData, sessionStorage)
        localStorage.setItem(STORAGE_KEYS.IS_LOGGED_IN, 'true')
        return true
      }
      return false
    } catch {
      // 请求失败说明 cookie 已过期，清除本地登录标记
      user.value = null
      profileLoaded.value = false
      permissions.value = []
      permissionsLoaded.value = false
      localStorage.removeItem(STORAGE_KEYS.USER)
      sessionStorage.removeItem(STORAGE_KEYS.USER)
      localStorage.removeItem(STORAGE_KEYS.IS_LOGGED_IN)
      sessionStorage.removeItem(STORAGE_KEYS.IS_LOGGED_IN)
      sessionStorage.removeItem(STORAGE_KEYS.PERMISSIONS)
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
      user.value = normalizeUserData({ ...user.value, ...response.data })
      profileLoaded.value = true
      safeSaveJSON(STORAGE_KEYS.USER, user.value, localStorage)
      safeSaveJSON(STORAGE_KEYS.USER, user.value, sessionStorage)
    }
    return true
  }

  // W-25: 共享 Promise — 第一个请求完成时，所有等待者同时获得结果
  let _permissionsPromise = null

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

    // 防止重复请求 — 后续调用者复用同一个 Promise，无需轮询
    if (permissionsLoading.value && _permissionsPromise) {
      return _permissionsPromise
    }

    permissionsLoading.value = true

    // 创建共享 Promise，带 10 秒超时保护
    _permissionsPromise = Promise.race([
      (async () => {
        try {
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
          safeSaveJSON(STORAGE_KEYS.PERMISSIONS, null, sessionStorage)
          throw error
        } finally {
          permissionsLoading.value = false
          _permissionsPromise = null
        }
      })(),
      new Promise((_, reject) => {
        setTimeout(() => {
          console.warn('[auth] 等待权限加载超时，放弃等待')
          reject(new Error('权限加载超时'))
        }, 10000)
      })
    ]).catch((error) => {
      permissionsLoading.value = false
      _permissionsPromise = null
      // 超时情况下返回 false 而非抛出错误，与原行为一致
      if (error?.message === '权限加载超时') return false
      throw error
    })

    return _permissionsPromise
  }

  /**
   * 清除缓存并重新加载权限
   */
  const refreshPermissions = async () => {
    permissions.value = []
    permissionsLoaded.value = false
    permissionsLoading.value = false
    sessionStorage.removeItem(STORAGE_KEYS.PERMISSIONS)
    return await fetchUserPermissions(true)
  }

  /**
   * 检查是否有特定权限 — 逻辑与网页端 authStore.hasPermission 完全一致
   * @param {string} perm - 权限标识（如 'purchase:requisitions:create'）
   * @returns {boolean}
   */
  const hasPermission = (perm) => {
    if (!perm) return true
    if (Array.isArray(perm)) {
      return perm.some((item) => hasPermission(item))
    }

    // 权限未从服务端确认前一律拒绝，避免短暂信任陈旧缓存
    if (!permissionsLoaded.value) {
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

      if (authData) {
        saveAuthData(authData)
        return !!user.value
      }
      return false
    } catch {
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
    profileLoaded,
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
