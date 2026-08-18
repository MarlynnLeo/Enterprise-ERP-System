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

  // 2. CPU / 内存硬指标判断 (4核及以下直接判定为低端)
  if (Number.isFinite(cores) && cores <= 4) return true
  if (Number.isFinite(memory) && memory <= 4) return true

  // 3. 检测 GPU 硬件加速是否存在
  let gpuOk = false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ''
        // 若为软件渲染（如 SwiftShader, llvmpipe, GDI Generic 等），说明无 GPU 加速
        if (/SwiftShader|llvmpipe|Software|Basic Render|GDI Generic/i.test(renderer)) {
          return true
        }
      }
      gpuOk = true
    }
  } catch {
    gpuOk = false
  }

  if (!gpuOk) return true

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
  const lowEnd = isLowEndDevice() || isSaveData()
  const reducedMotion = prefersReducedMotion()

  root.classList.toggle('perf-low-end', lowEnd)
  root.classList.toggle('perf-reduced-motion', reducedMotion)
  root.classList.toggle('perf-save-data', isSaveData())

  // 暴露给 themeLoader 等模块
  if (typeof window !== 'undefined') {
    window.__ERP_PERF__ = {
      lowEnd,
      reducedMotion,
      saveData: isSaveData()
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
