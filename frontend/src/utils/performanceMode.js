const idleFallbackDelay = 600

export function runWhenIdle(callback, timeout = 2000) {
  if (typeof window === 'undefined') return setTimeout(callback, 0)
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout })
  }
  return setTimeout(callback, idleFallbackDelay)
}

export function cancelIdleTask(id) {
  if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(id)
    return
  }
  clearTimeout(id)
}

function isLowEndDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false

  // 1. 用户手动强制开启极速性能模式
  try {
    if (localStorage.getItem('erp_low_end_mode') === 'true') {
      return true
    }
  } catch {}

  const memory = Number(navigator.deviceMemory)
  const cores = Number(navigator.hardwareConcurrency)

  // 2. CPU / memory indicators are synchronous metadata reads.
  if (Number.isFinite(cores) && cores <= 4) return true
  if (Number.isFinite(memory) && memory <= 4) return true

  // Creating a WebGL context here used to synchronously initialize the GPU
  // driver before Vue mounted. On software-rendered or unstable Windows
  // clients that can block the browser for seconds, so startup must never
  // probe graphics hardware.
  if (window.matchMedia?.('(update: slow)')?.matches) return true

  return false
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isSaveData() {
  if (typeof navigator === 'undefined') return false
  return Boolean(navigator.connection?.saveData)
}

/**
 * 初始化全局性能模式 class
 * - perf-low-end：弱化阴影/毛玻璃/多层过渡
 * - perf-reduced-motion：跟随系统减少动画
 * - perf-save-data：省流，不预取次要主题
 */
export function initPerformanceMode() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const saveData = isSaveData()
  const lowEnd = isLowEndDevice() || saveData
  const reducedMotion = prefersReducedMotion()

  root.classList.toggle('perf-low-end', lowEnd)
  root.classList.toggle('perf-reduced-motion', reducedMotion)
  root.classList.toggle('perf-save-data', saveData)

  // 暴露给 themeLoader 等模块
  if (typeof window !== 'undefined') {
    window.__ERP_PERF__ = {
      lowEnd,
      reducedMotion,
      saveData
    }
  }

  if (typeof window !== 'undefined' && window.matchMedia) {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotionClass = () => {
      root.classList.toggle('perf-reduced-motion', media.matches)
    }
    if (media.addEventListener) {
      media.addEventListener('change', updateMotionClass)
    } else if (media.addListener) {
      media.addListener(updateMotionClass)
    }
  }
}

export function shouldPrefetchThemes() {
  if (typeof window === 'undefined') return false
  if (window.__ERP_PERF__?.saveData || window.__ERP_PERF__?.lowEnd) return false
  return true
}
