/**
 * auth.js
 * @description 状态管理文件 - 支持新的Cookie based认证
 * @date 2025-11-21
 * @version 2.1.0 - 适配统一响应解包
 *
 * 重要说明：
 * axios 拦截器已统一解包 ResponseHandler 格式
 * 所有 API 响应的 response.data 都是实际的业务数据
 * 不需要再访问 response.data.data
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, fastApi } from '../services/api'
import { tokenManager, permissionManager } from '../utils/unifiedStorage'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(tokenManager.getToken() || '')
  const user = ref(tokenManager.getUser() || null)

  const savedPermissions = permissionManager.getUserPermissions()
  const permissions = ref(Array.isArray(savedPermissions) ? savedPermissions : [])
  // 初始化时不将 permissionsLoaded 置为 true，强制初次访问带 permission 的路由时获取最新权限
  // 但为了不阻塞白屏，我们仍然可以使用缓存的内容作为初始值
  const permissionsLoaded = ref(false) 
  const permissionsLoading = ref(false) // 权限是否正在加载

  const isAuthenticated = computed(() => !!token.value && tokenManager.isTokenValid())

  // 设置请求头中的token
  const setAuthHeader = () => {
    if (token.value && tokenManager.isTokenValid()) {
      tokenManager.setToken(token.value)
    } else {
      tokenManager.removeToken()
    }
  }

  // 初始化设置
  setAuthHeader()

  // 登录
  const login = async (credentials) => {
    try {
      const response = await api.post('/auth/login', credentials)

      // 拦截器已解包，response.data 就是 { accessToken, refreshToken, user }
      const data = response.data

      // 保存accessToken
      if (data.accessToken) {
        token.value = data.accessToken
        tokenManager.setToken(data.accessToken)
      } else if (data.token) {
        token.value = data.token
        tokenManager.setToken(data.token)
      }

      // 保存refreshToken到localStorage（作为Cookie的fallback）
      if (data.refreshToken) {
        tokenManager.setRefreshToken(data.refreshToken)
      }

      // 保存用户信息
      user.value = data.user
      tokenManager.setUser(user.value)

      setAuthHeader()

      // 登录成功后尝试获取用户详细信息（不阻塞登录流程）
      try {
        await fetchUserProfile()
      } catch (profileError) {
        if (import.meta.env.DEV) {
          console.warn('[auth] 获取用户详细信息失败:', profileError.message)
        }
      }

      return true
    } catch (error) {
      throw error
    }
  }

  // 登出
  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } catch (error) {
      console.error('登出请求失败:', error)
    } finally {
      token.value = ''
      user.value = null
      permissions.value = []
      permissionsLoaded.value = false
      permissionsLoading.value = false

      // ✅ 优化: 清除权限缓存和主题缓存
      permissionManager.clearUserPermissions()
      localStorage.removeItem('theme_settings')

      tokenManager.clearAuth()
    }
  }

  // 更新用户信息
  const updateUser = async (userData) => {
    try {
      const response = await api.put('/auth/profile', userData)
      // 拦截器已解包，response.data 就是用户信息
      user.value = response.data
      tokenManager.setUser(user.value)
      return true
    } catch (error) {
      console.error('更新用户信息失败:', error)
      throw error
    }
  }

  // 获取用户信息
  const fetchUserProfile = async (includePermissions = false) => {
    try {
      const response = await fastApi.get('/auth/profile')
      // 拦截器已解包，response.data 就是用户信息
      user.value = response.data
      tokenManager.setUser(user.value)

      if (includePermissions) {
        await fetchUserPermissions()
      }

      return true
    } catch (error) {
      throw error
    }
  }

  // 获取用户权限
  const fetchUserPermissions = async (force = false) => {
    // ✅ 修复: 不再基于 user.role 判断是否需要检查权限
    // 所有用户都从后端获取权限列表,由后端决定是否给予管理员权限

    // 如果强制刷新，重置加载状态
    if (force) {
      permissionsLoaded.value = false
    }

    if (permissionsLoaded.value && !force) {
      return true
    }

    if (permissionsLoading.value) {
      return new Promise((resolve) => {
        const checkLoading = () => {
          if (!permissionsLoading.value) {
            resolve(permissionsLoaded.value)
          } else {
            setTimeout(checkLoading, 100)
          }
        }
        checkLoading()
      })
    }

    try {
      permissionsLoading.value = true

      // 添加时间戳参数防止缓存
      const timestamp = Date.now()
      const response = await api.get(`/auth/permissions?_t=${timestamp}`)
      // 拦截器已解包，response.data 就是权限数据
      const data = response.data

      // 处理不同的权限数据格式
      if (Array.isArray(data)) {
        permissions.value = data
      } else if (data && data.permissions && Array.isArray(data.permissions)) {
        permissions.value = data.permissions
      } else {
        console.error('获取到的权限数据格式不正确:', data)
        permissions.value = []
      }

      // ✅ 优化: 保存权限到缓存,避免页面刷新时闪烁
      permissionManager.setUserPermissions(permissions.value)

      permissionsLoaded.value = true
      return true
    } catch (error) {
      console.error('获取用户权限失败:', error)
      permissions.value = []
      permissionsLoaded.value = false

      // ✅ 优化: 获取失败时清除缓存
      permissionManager.clearUserPermissions()

      throw error
    } finally {
      permissionsLoading.value = false
    }
  }

  // 清除权限缓存并重新加载
  const refreshPermissions = async () => {
    permissions.value = []
    permissionsLoaded.value = false
    permissionsLoading.value = false

    // ✅ 优化: 清除权限缓存
    permissionManager.clearUserPermissions()

    return await fetchUserPermissions(true)
  }
  
  // 检查是否有特定权限
  const hasPermission = (permission) => {
    // 即使未完全 loaded，如果本地缓存 permissions.value 有数据，也允许基于本地数据判断（防止页面闪烁）
    // 去掉强制 !permissionsLoaded.value 的阻挡，它会导致刷新瞬间所有能看到的按钮都隐藏又出现
    if (!permissionsLoaded.value && permissions.value.length === 0) {
      return false
    }

    // ✅ 修复: 不再基于 user.role 判断管理员
    // 而是基于权限列表中是否包含 '*' 通配符
    if (permissions.value.includes('*')) {
      return true
    }

    // 精确匹配
    if (permissions.value.includes(permission)) {
      return true
    }

    // 支持通配符匹配 (例如: production:* 匹配 production:tasks:view)
    return permissions.value.some(p => {
      if (p.endsWith(':*')) {
        const prefix = p.slice(0, -2)
        return permission.startsWith(prefix + ':')
      }
      return false
    })
  }
  
  // 获取用户真实姓名的计算属性
  const realName = computed(() => {
    if (!user.value) return '';
    return user.value.real_name || user.value.realName || user.value.name || user.value.username || '';
  })
  
  return {
    token,
    user,
    permissions,
    permissionsLoaded,
    permissionsLoading,
    isAuthenticated,
    login,
    logout,
    updateUser,
    fetchUserProfile,
    fetchUserPermissions,
    refreshPermissions,
    hasPermission,
    setAuthHeader,
    realName
  }
})