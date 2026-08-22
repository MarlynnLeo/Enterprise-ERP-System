/**
 * auth.js
 * @module stores/auth
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
import { clearAllRequestCaches, setRequestCacheUserId } from '@/utils/requestOptimizer'
import { resetCsrfToken } from '@/services/axiosInstance'

/**
 * 用户信息对象
 * @typedef {Object} User
 * @property {number} id - 用户ID
 * @property {string} username - 用户名
 * @property {string} [realName] - 真实姓名（HTTP camel）
 * @property {string} [name] - 姓名
 * @property {string} [email] - 邮箱
 * @property {string} [avatar] - 头像URL
 * @property {string} [avatarFrame] - 头像框
 * @property {number} [status] - 状态（1=启用, 0=禁用）
 */

/**
 * 登录凭证
 * @typedef {Object} LoginCredentials
 * @property {string} username - 用户名
 * @property {string} password - 密码
 */

/**
 * Auth Store 返回类型
 * @typedef {Object} AuthStore
 * @property {import('vue').Ref<string>} token - 令牌（已弃用，保持兼容）
 * @property {import('vue').Ref<User|null>} user - 当前用户信息
 * @property {import('vue').Ref<string[]>} permissions - 权限列表
 * @property {import('vue').Ref<boolean>} permissionsLoaded - 权限是否已加载
 * @property {import('vue').Ref<boolean>} permissionsLoading - 权限是否正在加载
 * @property {import('vue').ComputedRef<boolean>} isAuthenticated - 是否已认证
 * @property {import('vue').ComputedRef<boolean>} isAdmin - 是否为管理员
 * @property {import('vue').ComputedRef<string>} realName - 用户真实姓名
 * @property {(credentials: LoginCredentials) => Promise<boolean>} login - 登录
 * @property {() => Promise<void>} logout - 登出
 * @property {(userData: Partial<User>) => Promise<boolean>} updateUser - 更新用户信息
 * @property {(includePermissions?: boolean, force?: boolean, skipAuthRedirect?: boolean) => Promise<boolean>} fetchUserProfile - 获取用户资料
 * @property {(force?: boolean) => Promise<boolean>} fetchUserPermissions - 获取用户权限
 * @property {() => Promise<boolean>} refreshPermissions - 刷新权限
 * @property {(permission: string) => boolean} hasPermission - 检查权限
 * @property {(permission: string) => boolean} hasChildPermission - 检查子权限
 * @property {() => void} setAuthHeader - 设置认证头
 */

// ✅ 权限别名映射已迁移至后端 PermissionService.js
// 后端在返回权限列表时会自动展开别名，前端无需再维护硬编码映射

export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const user = ref(tokenManager.getUser() || null)

  const savedPermissions = permissionManager.getUserPermissions()
  const permissions = ref(Array.isArray(savedPermissions) ? savedPermissions : [])
  // 初始化时不将 permissionsLoaded 置为 true，强制初次访问带 permission 的路由时获取最新权限。
  // 缓存仅用于状态恢复展示；权限判断在后端权限加载完成前一律拒绝。
  const permissionsLoaded = ref(false)
  const permissionsLoading = ref(false) // 权限是否正在加载
  // 本会话是否已向后端校验过 Cookie（冷启动防伪登录）
  const sessionProbed = ref(false)

  // O(1) 权限查询：页面上 v-permission / 路由守卫会高频调用，不能每次线性扫大数组
  let permissionSet = new Set(permissions.value)
  let wildcardPrefixes = permissions.value
    .filter((p) => typeof p === 'string' && p.endsWith(':*'))
    .map((p) => p.slice(0, -1)) // keep trailing ":" → "production:" from "production:*"

  const rebuildPermissionIndex = (list) => {
    const arr = Array.isArray(list) ? list : []
    permissionSet = new Set(arr)
    wildcardPrefixes = []
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i]
      if (typeof p === 'string' && p.endsWith(':*')) {
        wildcardPrefixes.push(p.slice(0, -1))
      }
    }
  }
  rebuildPermissionIndex(permissions.value)

  const isAuthenticated = computed(() => Boolean(user.value))
  const isAdmin = computed(() => permissionsLoaded.value && permissionSet.has('*'))
  const mustChangePassword = computed(() => {
    const flag = user.value?.forcePasswordChange
    const expired = user.value?.passwordExpired
    return flag === true || flag === 1 || flag === '1' || expired === true || expired === 1 || expired === '1'
  })

  // 认证令牌由后端 HttpOnly Cookie 管理，前端只清理旧的浏览器可读 token。
  const setAuthHeader = () => {
    token.value = ''
    tokenManager.removeToken()
    tokenManager.removeRefreshToken()
  }

  // 初始化设置
  setAuthHeader()
  if (user.value?.id) {
    setRequestCacheUserId(user.value.id)
  }

  const clearClientSession = () => {
    token.value = ''
    user.value = null
    permissions.value = []
    rebuildPermissionIndex([])
    permissionsLoaded.value = false
    permissionsLoading.value = false
    sessionProbed.value = false
    permissionManager.clearUserPermissions()
    localStorage.removeItem('theme_settings')
    tokenManager.clearAll()
    setRequestCacheUserId(null)
    clearAllRequestCaches()
    resetCsrfToken()
  }

  // 登录
  const login = async (credentials) => {
    try {
      // 切换账号前清除旧主体，避免旧用户状态继续驱动权限判断。
      clearClientSession()

      const response = await userApi.login(credentials)
      resetCsrfToken()

      // 拦截器已解包，response.data 就是 { user }
      const data = response.data

      // 保存用户信息
      user.value = data.user
      if (!user.value) {
        throw new Error('登录响应缺少用户信息')
      }
      tokenManager.setUser(user.value)
      setRequestCacheUserId(user.value.id)

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
      clearClientSession()
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

  // 获取用户信息（同时作为 Cookie 会话探测，并发请求共享同一 Promise）
  let _userProfilePromise = null
  let _lastProfileFetchTime = 0

  const fetchUserProfile = async (includePermissions = false, force = false, skipAuthRedirect = false) => {
    const now = Date.now()
    if (!force && user.value && sessionProbed.value && (now - _lastProfileFetchTime < 10000)) {
      if (includePermissions) {
        await fetchUserPermissions()
      }
      return true
    }

    if (_userProfilePromise && !force) {
      return _userProfilePromise
    }

    _userProfilePromise = (async () => {
      try {
        const response = await userApi.getProfileFast({ skipAuthRedirect })
        user.value = response.data
        tokenManager.setUser(user.value)
        if (user.value?.id) {
          setRequestCacheUserId(user.value.id)
        }
        sessionProbed.value = true
        _lastProfileFetchTime = Date.now()

        if (includePermissions) {
          await fetchUserPermissions()
        }

        return true
      } catch (error) {
        clearClientSession()
        throw error
      } finally {
        _userProfilePromise = null
      }
    })()

    return _userProfilePromise
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
        throw new Error('权限数据格式不正确')
      }

      rebuildPermissionIndex(permissions.value)
      permissionManager.setUserPermissions(permissions.value)
      permissionsLoaded.value = true
      return true
    } catch (error) {
      console.error('获取用户权限失败:', error)

      permissions.value = []
      rebuildPermissionIndex([])
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
    rebuildPermissionIndex([])
    permissionsLoaded.value = false
    permissionsLoading.value = false

    // ✅ 优化: 清除权限缓存
    permissionManager.clearUserPermissions()

    return await fetchUserPermissions(true)
  }

  // 检查是否有特定权限（Set + 预计算通配前缀，避免每次 O(n)）
  const hasPermission = (permission) => {
    // 权限未完成后端加载前一律拒绝，避免使用旧缓存短暂放开按钮或路由。
    if (!permissionsLoaded.value) {
      return false
    }
    if (!permission) {
      return true
    }

    if (permissionSet.has('*') || permissionSet.has(permission)) {
      return true
    }

    // 支持通配符匹配 (例如: production:* 匹配 production:tasks:view)
    for (let i = 0; i < wildcardPrefixes.length; i++) {
      if (permission.startsWith(wildcardPrefixes[i])) {
        return true
      }
    }
    return false
  }

  const hasChildPermission = (permission) => {
    if (!permissionsLoaded.value) {
      return false
    }
    if (!permission) {
      return false
    }

    if (permissionSet.has('*') || permissionSet.has(`${permission}:*`)) {
      return true
    }

    const prefix = `${permission}:`
    // 后端已展开别名；子权限用前缀扫描（调用频率远低于 hasPermission）
    for (const p of permissionSet) {
      if (typeof p === 'string' && p.startsWith(prefix)) {
        return true
      }
    }
    return false
  }

  // 获取用户真实姓名的计算属性（HTTP 仅 camel）
  const realName = computed(() => {
    if (!user.value) return '';
    return user.value.realName || user.value.name || user.value.username || '';
  })

  return {
    token,
    user,
    permissions,
    permissionsLoaded,
    permissionsLoading,
    isAuthenticated,
    isAdmin,
    mustChangePassword,
    login,
    logout,
    clearClientSession,
    updateUser,
    fetchUserProfile,
    fetchUserPermissions,
    refreshPermissions,
    hasPermission,
    hasChildPermission,
    setAuthHeader,
    realName,
    sessionProbed
  }
})
