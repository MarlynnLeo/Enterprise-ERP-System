/**
 * api.js
 * @description 移动端应用文件
 * @date 2025-08-27
 * @version 1.0.0
 */

// API配置文件
const config = {
  // 开发环境配置 - 使用 Vite 代理
  development: {
    baseURL: '', // 开发环境使用相对路径，通过 Vite 代理转发
    apiPrefix: '/api',
    timeout: 10000
  },

  // 生产环境配置 - 使用环境变量
  production: {
    baseURL: import.meta.env.VITE_APP_API_BASE_URL || '',
    apiPrefix: '/api',
    timeout: 10000
  },

  // 测试环境配置
  test: {
    baseURL: import.meta.env.VITE_APP_API_BASE_URL || '',
    apiPrefix: '/api',
    timeout: 10000
  }
}

// 获取当前环境
const getEnvironment = () => {
  // 可以通过环境变量或其他方式判断当前环境
  if (import.meta.env.MODE === 'production') {
    return 'production'
  } else if (import.meta.env.MODE === 'test') {
    return 'test'
  }
  return 'development'
}

// 获取当前环境的配置
const getCurrentConfig = () => {
  const env = getEnvironment()
  return config[env]
}

// 导出配置
export const API_CONFIG = getCurrentConfig()

// 导出常用的API端点
export const API_ENDPOINTS = {
  // 认证相关
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    PROFILE: '/auth/profile',
    PERMISSIONS: '/auth/permissions'
  },

  // 用户相关
  USERS: {
    LIST: '/users',
    PROFILE: '/users/profile',
    AVATAR: '/users/avatar'
  }
}

// 构建完整的API URL
export const buildApiUrl = (endpoint) => {
  const { baseURL, apiPrefix } = API_CONFIG
  // 如果 baseURL 为空（开发环境），直接返回相对路径
  if (!baseURL) {
    return `${apiPrefix}${endpoint}`
  }
  // 生产环境返回完整URL
  return `${baseURL}${apiPrefix}${endpoint}`
}

// 导出环境信息
export const ENV_INFO = {
  current: getEnvironment(),
  isDevelopment: getEnvironment() === 'development',
  isProduction: getEnvironment() === 'production',
  isTest: getEnvironment() === 'test'
}
