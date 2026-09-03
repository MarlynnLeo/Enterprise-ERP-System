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
  return () => {
    const timestamp = now()

    try {
      const previous = Number(storage?.getItem(RELOAD_STORAGE_KEY) || 0)
      if (previous > 0 && timestamp - previous < cooldownMs) return false
      storage?.setItem(RELOAD_STORAGE_KEY, String(timestamp))
    } catch {
      // Storage can be unavailable in restricted browser modes. Reload once anyway.
    }

    reload()
    return true
  }
}

export const fetchReleaseVersion = async ({ fetchImpl, cacheBust = Date.now() }) => {
  const response = await fetchImpl(`/version.json?v=${cacheBust}`, {
    cache: 'no-store',
    credentials: 'same-origin'
  })
  if (!response.ok) return null

  const payload = await response.json()
  return typeof payload?.buildId === 'string' ? payload.buildId : null
}

export const setupReleaseRecovery = ({
  buildId = currentBuildId,
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  windowRef = typeof window === 'undefined' ? null : window,
  documentRef = typeof document === 'undefined' ? null : document,
  fetchImpl = typeof fetch === 'undefined' ? null : fetch
} = {}) => {
  if (!windowRef || !documentRef || !fetchImpl) return () => {}

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

  const checkVersion = async () => {
    if (documentRef.visibilityState === 'hidden') return

    try {
      const latestBuildId = await fetchReleaseVersion({ fetchImpl })
      if (latestBuildId && latestBuildId !== buildId) reloadLatest()
    } catch {
      // A transient network failure must not interrupt normal ERP usage.
    }
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

  return () => {
    windowRef.removeEventListener('vite:preloadError', handlePreloadError)
    windowRef.removeEventListener('unhandledrejection', handleUnhandledRejection)
    windowRef.removeEventListener('focus', checkVersion)
    documentRef.removeEventListener('visibilitychange', handleVisibilityChange)
    windowRef.clearInterval(timer)
  }
}
