/**
 * auth.js
 * @description 状态管理文件 - 支持新的Cookie based认证
 * @date 2025-11-21
 * @version 2.1.0 - 适配统一响应解包
 *
 * 重要说明：
 * axios 拦截器已统一解包 ResponseHandler 格式
 * 所有 API 响应的 response.data 都是实际的业务数据
 * 不需要再手动解包嵌套 data
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { userApi } from '@/api/user'
import { tokenManager, permissionManager } from '../utils/unifiedStorage'

const permissionAliasMap = {
  'basedata:bom': 'basedata:boms',
  'basedata:process-templates': 'basedata:processtemplates',
  'basedata:product-categories': 'basedata:productcategories',
  'basedata:material-sources': 'basedata:materialsources',
  'basedata:inspection-methods': 'basedata:inspectionmethods',
  'inventory:manualtransaction': 'inventory:manual',
  'inventory:manual-transaction': 'inventory:manual',
  'production:productionreport': 'production:reports',
  'production:productionreport:read': 'production:reports:view',
  'sales:exchanges': 'sales:returns',
  'sales:packinglists': 'sales:packing',
  'sales:packing-lists': 'sales:packing',
  'equipment:list': 'production:equipment',
  'equipment:maintenance': 'production:equipment',
  'equipment:inspection': 'production:equipment',
  'equipment:status': 'production:equipment',
  'quality:incoming': 'quality:inspections',
  'quality:process': 'quality:inspections',
  'quality:final': 'quality:inspections',
  'quality:first-article': 'quality:inspections',
  'system:print:add': 'system:print:create',
  'system:print:edit': 'system:print:update',
  'system:print:template:view': 'system:print:view',
  'system:print:template:add': 'system:print:create',
  'system:print:template:edit': 'system:print:update',
  'system:print:template:delete': 'system:print:delete'
}

const expandPermissionCandidates = (permission) => {
  if (!permission) return []

  const candidates = new Set([permission])
  Object.entries(permissionAliasMap).forEach(([legacyPrefix, canonicalPrefix]) => {
    if (permission === legacyPrefix || permission.startsWith(`${legacyPrefix}:`)) {
      candidates.add(permission.replace(legacyPrefix, canonicalPrefix))
    }
    if (permission === canonicalPrefix || permission.startsWith(`${canonicalPrefix}:`)) {
      candidates.add(permission.replace(canonicalPrefix, legacyPrefix))
    }
  })

  return [...candidates]
}

const isTransientPermissionLoadError = (error) => {
  const status = error?.response?.status
  return !status || status === 429 || status >= 500
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const user = ref(tokenManager.getUser() || null)

  const savedPermissions = permissionManager.getUserPermissions()
  const permissions = ref(Array.isArray(savedPermissions) ? savedPermissions : [])
  // 初始化时不将 permissionsLoaded 置为 true，强制初次访问带 permission 的路由时获取最新权限
  // 但为了不阻塞白屏，我们仍然可以使用缓存的内容作为初始值
  const permissionsLoaded = ref(false)
  const permissionsLoading = ref(false) // 权限是否正在加载

  const isAuthenticated = computed(() => Boolean(user.value))
  const isAdmin = computed(() => permissionsLoaded.value && permissions.value.includes('*'))

  // 认证令牌由后端 HttpOnly Cookie 管理，前端只清理旧的浏览器可读 token。
  const setAuthHeader = () => {
    token.value = ''
    tokenManager.removeToken()
    tokenManager.removeRefreshToken()
  }

  // 初始化设置
  setAuthHeader()

  // 登录
  const login = async (credentials) => {
    try {
      const response = await userApi.login(credentials)

      // 拦截器已解包，response.data 就是 { user }
      const data = response.data

      // 保存用户信息
      user.value = data.user
      if (!user.value) {
        throw new Error('登录响应缺少用户信息')
      }
      tokenManager.setUser(user.value)

      setAuthHeader()

      // 登录成功后尝试获取用户详细信息（不阻塞登录流程）
      try {
        await fetchUserProfile()
      } catch {
        // 登录主流程已完成，资料补充加载失败时保持静默。
      }

      return true
    } catch (error) {
      throw error
    }
  }

  // 登出
  const logout = async () => {
    try {
      await userApi.logout()
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

      tokenManager.clearAll()
    }
  }

  // 更新用户信息
  const updateUser = async (userData) => {
    try {
      const response = await userApi.updateProfile(userData)
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
      const response = await userApi.getProfileFast()
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

  // 获取用户权限（Promise 缓存，避免轮询）
  let _permissionsPromise = null
  const fetchUserPermissions = async (force = false) => {
    // 所有用户都从后端获取权限列表,由后端决定是否给予管理员权限

    // 如果强制刷新，重置加载状态和缓存的 Promise
    if (force) {
      permissionsLoaded.value = false
      _permissionsPromise = null
    }

    if (permissionsLoaded.value && !force) {
      return true
    }

    // 多个组件并发请求时共享同一个 Promise，而非 100ms 轮询
    if (_permissionsPromise && !force) {
      return _permissionsPromise
    }

    _permissionsPromise = _doFetchPermissions()
    return _permissionsPromise
  }

  // 实际执行权限加载的内部函数
  const _doFetchPermissions = async () => {
    try {
      permissionsLoading.value = true

      const response = await userApi.getPermissions()
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

      permissionManager.setUserPermissions(permissions.value)
      permissionsLoaded.value = true
      return true
    } catch (error) {
      console.error('获取用户权限失败:', error)

      const cachedPermissions = permissionManager.getUserPermissions()
      const fallbackPermissions = permissions.value.length
        ? permissions.value
        : (Array.isArray(cachedPermissions) ? cachedPermissions : [])

      if (isTransientPermissionLoadError(error) && fallbackPermissions.length > 0) {
        permissions.value = fallbackPermissions
        permissionsLoaded.value = true
        permissionManager.setUserPermissions(permissions.value)
        return true
      }

      permissions.value = []
      permissionsLoaded.value = false
      permissionManager.clearUserPermissions()

      throw error
    } finally {
      permissionsLoading.value = false
      _permissionsPromise = null
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
    // 权限未完成后端加载前一律拒绝，避免使用旧缓存短暂放开按钮或路由。
    if (!permissionsLoaded.value) {
      return false
    }

    // ✅ 修复: 不再基于 user.role 判断管理员
    // 而是基于权限列表中是否包含 '*' 通配符
    if (permissions.value.includes('*')) {
      return true
    }

    const candidates = expandPermissionCandidates(permission)

    // 精确匹配
    if (candidates.some(item => permissions.value.includes(item))) {
      return true
    }

    // 支持通配符匹配 (例如: production:* 匹配 production:tasks:view)
    return permissions.value.some(p => {
      if (p.endsWith(':*')) {
        const prefix = p.slice(0, -2)
        return candidates.some(item => item.startsWith(prefix + ':'))
      }
      return false
    })
  }

  const hasChildPermission = (permission) => {
    if (!permissionsLoaded.value) {
      return false
    }

    if (permissions.value.includes('*')) {
      return true
    }

    const candidates = expandPermissionCandidates(permission)
    return permissions.value.some(p =>
      candidates.some(candidate => p.startsWith(`${candidate}:`))
    )
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
    isAdmin,
    login,
    logout,
    updateUser,
    fetchUserProfile,
    fetchUserPermissions,
    refreshPermissions,
    hasPermission,
    hasChildPermission,
    setAuthHeader,
    realName
  }
})
