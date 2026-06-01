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
  if (typeof navigator === 'undefined') return false
  const memory = navigator.deviceMemory || 4
  const cores = navigator.hardwareConcurrency || 4
  return memory <= 4 || cores <= 4
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function initPerformanceMode() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const lowEnd = isLowEndDevice()
  const reducedMotion = prefersReducedMotion()

  root.classList.toggle('perf-low-end', lowEnd)
  root.classList.toggle('perf-reduced-motion', reducedMotion)

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
