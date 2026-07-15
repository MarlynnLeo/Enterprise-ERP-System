/**
 * errorReporter.js
 * @description 前端全局错误处理与上报
 * @date 2026-06-22
 *
 * 捕获三类错误:
 * 1. Vue 组件渲染错误 (app.config.errorHandler)
 * 2. 未捕获的 JS 异常 (window.onerror)
 * 3. 未处理的 Promise rejection (unhandledrejection)
 *
 * 用法 (在 main.js 中):
 *   import { setupErrorReporter } from '@/utils/errorReporter'
 *   setupErrorReporter(app)
 */

import { api } from '@/services/axiosInstance'

// 上报节流 — 避免错误风暴时频繁请求
const REPORT_INTERVAL = 5000 // 5 秒内同一类错误只上报一次
const reportedErrors = new Map()

/**
 * 判断是否应该上报（防抖 + 去重）
 */
function shouldReport(errorKey) {
  const now = Date.now()
  const lastTime = reportedErrors.get(errorKey)
  if (lastTime && now - lastTime < REPORT_INTERVAL) {
    return false
  }
  reportedErrors.set(errorKey, now)

  // 清理过期的记录（防止 Map 无限增长）
  if (reportedErrors.size > 100) {
    const threshold = now - REPORT_INTERVAL * 2
    for (const [key, time] of reportedErrors) {
      if (time < threshold) reportedErrors.delete(key)
    }
  }
  return true
}

/**
 * 上报错误到后端
 */
function reportError(errorInfo) {
  const errorKey = `${errorInfo.type}:${errorInfo.message}`
  if (!shouldReport(errorKey)) return

  // 静默上报，不影响用户体验
  api.post('/system/client-errors', errorInfo).catch(() => {
    // 上报失败不处理（避免循环错误）
  })
}

/**
 * 从 Error 对象提取有用信息
 */
function extractErrorInfo(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack?.substring(0, 1000), // 限制长度
      name: error.name,
    }
  }
  return {
    message: String(error),
    stack: '',
    name: 'Unknown',
  }
}

/**
 * 安装全局错误处理器
 * @param {import('vue').App} app - Vue app 实例
 */
export function setupErrorReporter(app) {
  // 1. Vue 组件渲染错误
  app.config.errorHandler = (error, instance, info) => {
    console.error('[Vue Error]', error)

    const errorInfo = extractErrorInfo(error)
    reportError({
      type: 'vue_error',
      ...errorInfo,
      componentName: instance?.$options?.name || instance?.$.type?.name || 'Anonymous',
      lifecycleHook: info,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    })
  }

  // 2. 未捕获的 JS 异常
  window.onerror = (message, source, lineno, colno, error) => {
    // 过滤第三方脚本错误（跨域脚本会返回 "Script error."）
    if (message === 'Script error.' || message === 'ResizeObserver loop limit exceeded') {
      return false
    }

    const errorInfo = error ? extractErrorInfo(error) : { message: String(message), stack: '', name: 'Error' }
    reportError({
      type: 'js_error',
      ...errorInfo,
      source,
      lineno,
      colno,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    })

    return false // 不阻止默认处理
  }

  // 3. 未处理的 Promise rejection
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason
    const errorInfo = extractErrorInfo(error)

    reportError({
      type: 'unhandled_rejection',
      ...errorInfo,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    })
  })
}
