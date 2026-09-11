const DEFAULT_CHECK_INTERVAL_MS = 5 * 60 * 1000
const DEFAULT_RELOAD_COOLDOWN_MS = 60 * 1000
const RELOAD_STORAGE_KEY = 'erp:release-reload-at'

const currentBuildId = import.meta.env.VITE_APP_BUILD_ID || 'development'

const getErrorMessage = (reason) => {
  if (reason instanceof Error) return reason.message
  if (reason && typeof reason === 'object' && 'message' in reason) {
    return String(reason.message)
  }
  return String(reason || '')
}

export const isReleaseAssetError = (reason) => {
  const message = getErrorMessage(reason)
  return /Failed to fetch dynamically imported module|Unable to preload CSS|Importing a module script failed|error loading dynamically imported module/i.test(message)
}

export const createReleaseReloader = ({
  storage,
  reload,
  now = () => Date.now(),
  cooldownMs = DEFAULT_RELOAD_COOLDOWN_MS
}) => {
  let lastReloadAt = 0
  return () => {
    const timestamp = now()
    if (lastReloadAt > 0 && timestamp - lastReloadAt < cooldownMs) return false

    try {
      const previous = Number(storage?.getItem(RELOAD_STORAGE_KEY) || 0)
      if (previous > 0 && timestamp - previous < cooldownMs) return false
      storage?.setItem(RELOAD_STORAGE_KEY, String(timestamp))
    } catch {
      // Keep the in-memory cooldown even if storage is unavailable.
    }

    lastReloadAt = timestamp
    reload()
    return true
  }
}

export const fetchReleaseVersion = async ({ fetchImpl, cacheBust = Date.now(), timeoutMs = 8000 }) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`/version.json?v=${cacheBust}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal
    })
    if (!response.ok) return null
    const payload = await response.json()
    return typeof payload?.buildId === 'string' && payload.buildId.trim() ? payload.buildId : null
  } finally {
    clearTimeout(timeout)
  }
}

export const setupReleaseRecovery = ({
  buildId = currentBuildId,
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  windowRef = typeof window === 'undefined' ? null : window,
  documentRef = typeof document === 'undefined' ? null : document,
  fetchImpl = typeof fetch === 'undefined' ? null : fetch
} = {}) => {
  if (!windowRef || !documentRef || !fetchImpl || buildId === 'development') return () => {}

  let pendingCheck = null
  let disposed = false

  let storage = null
  try {
    storage = windowRef.sessionStorage
  } catch {
    // Some privacy modes expose window.sessionStorage but reject access.
  }

  const reloadLatest = createReleaseReloader({
    storage,
    reload: () => windowRef.location.reload()
  })

  const checkVersion = () => {
    if (disposed || documentRef.visibilityState === 'hidden') return Promise.resolve()
    if (pendingCheck) return pendingCheck
    pendingCheck = fetchReleaseVersion({ fetchImpl })
      .then((latestBuildId) => {
        if (!disposed && latestBuildId && latestBuildId !== buildId) reloadLatest()
      })
      .catch(() => {
        // A transient network failure must not interrupt normal ERP usage.
      })
      .finally(() => { pendingCheck = null })
    return pendingCheck
  }

  const handlePreloadError = (event) => {
    event.preventDefault()
    reloadLatest()
  }

  const handleUnhandledRejection = (event) => {
    if (!isReleaseAssetError(event.reason)) return
    event.preventDefault()
    reloadLatest()
  }

  const handleVisibilityChange = () => {
    if (documentRef.visibilityState === 'visible') void checkVersion()
  }

  windowRef.addEventListener('vite:preloadError', handlePreloadError)
  windowRef.addEventListener('unhandledrejection', handleUnhandledRejection)
  windowRef.addEventListener('focus', checkVersion)
  documentRef.addEventListener('visibilitychange', handleVisibilityChange)

  const timer = windowRef.setInterval(checkVersion, checkIntervalMs)
  // An already-focused tab loading cached HTML otherwise kept old code for
  // five minutes, until a focus change or the first interval tick.
  void checkVersion()

  return () => {
    disposed = true
    windowRef.removeEventListener('vite:preloadError', handlePreloadError)
    windowRef.removeEventListener('unhandledrejection', handleUnhandledRejection)
    windowRef.removeEventListener('focus', checkVersion)
    documentRef.removeEventListener('visibilitychange', handleVisibilityChange)
    windowRef.clearInterval(timer)
  }
}
