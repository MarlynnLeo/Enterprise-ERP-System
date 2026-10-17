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

const defaultMode = Object.freeze({ lowEnd: false, reducedMotion: false, saveData: false })
const modeClasses = {
  lowEnd: 'perf-low-end',
  reducedMotion: 'perf-reduced-motion',
  saveData: 'perf-save-data'
}
let currentMode = defaultMode
let initialized = false
let reducedMotionMedia
let slowUpdateMedia
let connection
let cleanupListeners = []

function isLowEndDevice() {
  try {
    if (window.localStorage.getItem('erp_low_end_mode') === 'true') return true
  } catch {}

  // Metadata only: creating a Canvas/WebGL context here can synchronously
  // initialize a Windows graphics driver and stall startup for seconds.
  const hasLimitedCapacity = (value) => {
    const capacity = Number(value)
    return Number.isFinite(capacity) && capacity > 0 && capacity <= 4
  }
  return hasLimitedCapacity(navigator.hardwareConcurrency)
    || hasLimitedCapacity(navigator.deviceMemory)
    || Boolean(slowUpdateMedia?.matches)
}

function refreshPerformanceMode() {
  const saveData = Boolean(connection?.saveData)
  const next = {
    lowEnd: isLowEndDevice() || saveData,
    reducedMotion: Boolean(reducedMotionMedia?.matches),
    saveData
  }
  const root = document.documentElement
  for (const [key, className] of Object.entries(modeClasses)) {
    if (root.classList.contains(className) !== next[key]) {
      root.classList.toggle(className, next[key])
    }
  }

  if (Object.keys(modeClasses).every(key => currentMode[key] === next[key])) return
  currentMode = Object.freeze(next)
}

function observeMedia(media) {
  if (media?.addEventListener) {
    media.addEventListener('change', refreshPerformanceMode)
    cleanupListeners.push(() => media.removeEventListener('change', refreshPerformanceMode))
  } else if (media?.addListener) {
    media.addListener(refreshPerformanceMode)
    cleanupListeners.push(() => media.removeListener(refreshPerformanceMode))
  }
}

/**
 * Single source for CSS, Canvas rendering and optional resource prefetching.
 * The application owns initialization and teardown. Repeated initialization
 * refreshes the applied classes without adding listeners or replacing an
 * unchanged snapshot.
 */
export function initPerformanceMode() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return disposePerformanceMode
  if (!initialized) {
    initialized = true
    reducedMotionMedia = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    slowUpdateMedia = window.matchMedia?.('(update: slow)')
    connection = navigator.connection
    observeMedia(reducedMotionMedia)
    observeMedia(slowUpdateMedia)
    if (connection?.addEventListener) {
      connection.addEventListener('change', refreshPerformanceMode)
      cleanupListeners.push(() => connection.removeEventListener('change', refreshPerformanceMode))
    }
    const onStorage = (event) => {
      if (event.key === 'erp_low_end_mode' || event.key === null) refreshPerformanceMode()
    }
    window.addEventListener('storage', onStorage)
    cleanupListeners.push(() => window.removeEventListener('storage', onStorage))
  }
  refreshPerformanceMode()
  return disposePerformanceMode
}

export function getPerformanceMode() {
  return currentMode
}

/** Release the application-level observers on teardown or hot replacement. */
export function disposePerformanceMode() {
  cleanupListeners.forEach(cleanup => cleanup())
  cleanupListeners = []
  initialized = false
  currentMode = defaultMode
  reducedMotionMedia = undefined
  slowUpdateMedia = undefined
  connection = undefined
}

export function shouldPrefetchThemes() {
  // Optional work must not revive observers after the application is unmounted.
  if (!initialized) return false
  const { lowEnd, saveData } = getPerformanceMode()
  return !lowEnd && !saveData
}

if (import.meta.hot) import.meta.hot.dispose(disposePerformanceMode)
