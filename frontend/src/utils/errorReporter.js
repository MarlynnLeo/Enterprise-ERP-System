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
let canReportError = () => false

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
  if (!canReportError()) return

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
 * 判断是否为良性/非致命的无害通知
 * 1. 第三方跨域脚本泛化错误 "Script error."
 * 2. ResizeObserver 循环交付警告（多见于各类响应式表格、自适应列宽与浮动弹窗）
 * 3. Vue Router 路由切换中断/重定向良性错误
 */
function isBenignError(message) {
  if (!message) return false
  const msg = String(message)
  return (
    msg === 'Script error.' ||
    /ResizeObserver loop/i.test(msg) ||
    /Navigation cancelled|Navigation aborted|Avoided redundant navigation|Redirected when going from/i.test(msg)
  )
}

/**
 * 安装全局错误处理器
 * @param {import('vue').App} app - Vue app 实例
 */
export function setupErrorReporter(app, options = {}) {
  canReportError = typeof options.canReport === 'function' ? options.canReport : () => false

  // 1. Vue 组件渲染错误
  app.config.errorHandler = (error, instance, info) => {
    console.error('[Vue Error]', error)

    const errorInfo = extractErrorInfo(error)
    if (isBenignError(errorInfo.message)) return

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
    if (isBenignError(message)) {
      return false
    }

    const errorInfo = error ? extractErrorInfo(error) : { message: String(message), stack: '', name: 'Error' }
    if (isBenignError(errorInfo.message)) {
      return false
    }

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
    if (isBenignError(errorInfo.message)) return

    reportError({
      type: 'unhandled_rejection',
      ...errorInfo,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    })
  })
}
