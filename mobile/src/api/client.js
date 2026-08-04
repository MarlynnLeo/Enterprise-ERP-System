/**
 * API 客户端
 * @description Axios 实例、请求/响应拦截器、CSRF token 管理、Token 刷新队列
 * @date 2025-12-27
 * @version 2.0.0
 */

import axios from 'axios'
import { showToast } from 'vant'
import { API_CONFIG, normalizeApiRequestUrl } from '@/config/app'

// ==================== 创建 Axios 实例 ====================

/**
 * 开发环境：使用相对路径 /api，通过 Vite 代理转发到后端
 * 生产环境：使用完整 URL
 */
const api = axios.create({
  baseURL: API_CONFIG.defaultBaseURL,
  timeout: API_CONFIG.timeout,
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true
})

// ==================== 请求拦截器 ====================

const unsafeMethods = new Set(['post', 'put', 'patch', 'delete'])
let csrfToken = ''
let csrfTokenPromise = null

const clearLegacyTokenStorage = () => {
  sessionStorage.removeItem('token')
  localStorage.removeItem('refreshToken')
}

const clearClientAuthState = () => {
  sessionStorage.removeItem('token')
  sessionStorage.removeItem('user')
  sessionStorage.removeItem('isLoggedIn')
  localStorage.removeItem('user')
  localStorage.removeItem('isLoggedIn')
  localStorage.removeItem('refreshToken')
  sessionStorage.removeItem('user_permissions')
  localStorage.removeItem('user_permissions')
  if (typeof window !== 'undefined') {
    delete window.__mobileThemeLoaded
    delete window.__mobileThemeLoadedFor
  }
}

const getLoginUrlWithRedirect = () => {
  if (typeof window === 'undefined') return '/login'
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (!currentPath || window.location.pathname.includes('/login')) return '/login'
  return `/login?redirect=${encodeURIComponent(currentPath)}`
}

const redirectToLogin = () => {
  if (typeof window === 'undefined') return
  if (window.location.pathname.includes('/login')) return
  window.location.replace(getLoginUrlWithRedirect())
}

const fetchCsrfToken = async () => {
  if (csrfToken) return csrfToken
  if (!csrfTokenPromise) {
    csrfTokenPromise = axios.get('/csrf-token', {
      baseURL: api.defaults.baseURL,
      timeout: API_CONFIG.timeout,
      withCredentials: true
    }).then((response) => {
      const token = response.data?.csrfToken || response.data?.token || ''
      csrfToken = token
      return token
    }).finally(() => {
      csrfTokenPromise = null
    })
  }
  return csrfTokenPromise
}

api.interceptors.request.use(
  async (config) => {
    clearLegacyTokenStorage()
    config.url = normalizeApiRequestUrl(config.url)
    const method = (config.method || 'get').toLowerCase()
    const url = config.url || ''
    const isAuthBootstrapRequest =
      url.includes('/csrf-token') ||
      url.includes('/auth/login') ||
      url.includes('/auth/refresh')
    // 从 sessionStorage 获取 JWT token（与 auth store 保持一致）
    if (unsafeMethods.has(method) && !config.skipCsrf && !isAuthBootstrapRequest) {
      const csrf = await fetchCsrfToken()
      if (csrf) {
        config.headers = config.headers || {}
        config.headers['X-CSRF-Token'] = csrf
      }
    }

    return config
  },
  (error) => {
    console.error('请求拦截器错误:', error)
    return Promise.reject(error)
  }
)

// 响应拦截器 - 支持自动Token刷新
let isRefreshing = false
let failedQueue = []

const processQueue = (error) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve()
    }
  })
  failedQueue = []
}

api.interceptors.response.use(
  (response) => {
    // 解包后端 ResponseHandler 格式
    // 格式: { success: true, data: {...}, message: "..." }
    const responseData = response.data

    if (responseData && typeof responseData === 'object' && 'success' in responseData) {
      if (responseData.success === true) {
        // 成功响应：解包 data 字段
        return {
          ...response,
          data: responseData.data,
          _message: responseData.message,
          _raw: responseData
        }
      } else {
        // 业务失败：抛出错误
        const error = new Error(responseData.message || '操作失败')
        error.response = response
        error.code = responseData.errorCode || 'BUSINESS_ERROR'
        throw error
      }
    }

    return response
  },
  async (error) => {
    const originalRequest = error.config || {}
    let errorMessage = '服务器错误，请稍后再试'

    if (error.response) {
      const status = error.response.status

      // 401错误 - 尝试自动刷新Token
      if (
        status === 401 &&
        !originalRequest._retry &&
        !originalRequest.url?.includes('/auth/login') &&
        !originalRequest.url?.includes('/auth/refresh')
      ) {
        if (isRefreshing) {
          // 正在刷新Token，将请求加入队列
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject })
          })
            .then(() => {
              return api(originalRequest)
            })
            .catch((err) => {
              return Promise.reject(err)
            })
        }

        originalRequest._retry = true
        isRefreshing = true

        try {
          // 尝试刷新Token
          await api.post('/auth/refresh', null, { skipCsrf: true })
          // 响应拦截器已经解包，直接使用 data
          processQueue(null)
          return api(originalRequest)
        } catch (refreshError) {
          processQueue(refreshError, null)
          // 刷新失败，清除所有认证信息并跳转登录
          clearClientAuthState()

          errorMessage = '登录已过期，请重新登录'

          showToast({
            type: 'fail',
            message: errorMessage,
            duration: API_CONFIG.toastDurationMs
          })

          // 延迟跳转，确保toast显示
          setTimeout(() => {
            redirectToLogin()
          }, API_CONFIG.redirectDelayMs)

          return Promise.reject(refreshError)
        } finally {
          isRefreshing = false
        }
      } else if (status === 401) {
        // 如果是登录或刷新接口返回401，直接跳转登录页
        if (
          originalRequest.url?.includes('/auth/login') ||
          originalRequest.url?.includes('/auth/refresh')
        ) {
          clearClientAuthState()

          if (!window.location.pathname.includes('/login')) {
            errorMessage = '登录已过期，请重新登录'
            showToast({
              type: 'fail',
              message: errorMessage,
              duration: API_CONFIG.toastDurationMs
            })

            setTimeout(() => {
              redirectToLogin()
            }, API_CONFIG.redirectDelayMs)
          }
        }
      } else if (status === 403) {
        const csrfErrorCode = error.response.data?.errorCode || error.response.data?.code
        if (csrfErrorCode === 'INVALID_CSRF_TOKEN' && !originalRequest._csrfRetry) {
          // CSRF token 失效，清除缓存后重新获取并重试一次
          csrfToken = ''
          originalRequest._csrfRetry = true
          try {
            const newCsrf = await fetchCsrfToken()
            if (newCsrf) {
              originalRequest.headers = originalRequest.headers || {}
              originalRequest.headers['X-CSRF-Token'] = newCsrf
              return api(originalRequest)
            }
          } catch {
            // 重新获取 CSRF token 失败，走下面的错误提示
          }
        }
        errorMessage = '没有权限执行此操作'
      } else if (status === 404) {
        errorMessage = '请求的资源不存在'
      } else if (error.response.data && error.response.data.message) {
        errorMessage = error.response.data.message
      }
    } else if (error.request) {
      // 请求已发送但未收到响应
      errorMessage = '网络连接错误，请检查网络'

      // 自动重试：仅幂等安全方法，避免 POST/PUT/DELETE 重复出库/收款
      const method = String(originalRequest.method || 'get').toLowerCase()
      const safeMethod = method === 'get' || method === 'head' || method === 'options'
      const allowRetry = safeMethod || originalRequest.idempotent === true
      const shouldRetry =
        allowRetry &&
        (error.code === 'ECONNABORTED' || error.message.includes('Network Error'))
      if (shouldRetry) {
        if (!originalRequest._retryCount) {
          originalRequest._retryCount = 0
        }

        if (originalRequest._retryCount < API_CONFIG.retryCount) {
          originalRequest._retryCount++
          const delay = originalRequest._retryCount * API_CONFIG.retryBaseDelayMs
          console.warn(`网络请求失败: 正在进行第 ${originalRequest._retryCount} 次重试...`)

          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(api(originalRequest))
            }, delay)
          })
        }
      }
    } else {
      // 请求设置时出错
      errorMessage = '请求发送失败'
    }

    showToast({
      type: 'fail',
      message: errorMessage,
      duration: API_CONFIG.toastDurationMs
    })

    return Promise.reject(error)
  }
)

export default api
