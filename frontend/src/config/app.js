const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const trimTrailingSlash = (value) => String(value || '').trim().replace(/\/+$/, '')
const hasProtocol = (value) => /^[a-z][a-z\d+\-.]*:/i.test(String(value || ''))
const rawBaseURL = trimTrailingSlash(
  import.meta.env.VITE_APP_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  ''
)

const resolveApiBaseURL = (baseURL) => {
  if (!baseURL) return '/api'
  return baseURL.endsWith('/api') ? baseURL : `${baseURL}/api`
}

const joinUrl = (baseURL, path) => {
  const normalizedPath = path === '/' ? '' : path
  return `${trimTrailingSlash(baseURL)}${normalizedPath}`
}

export const API_CONFIG = {
  baseURL: rawBaseURL,
  defaultBaseURL: resolveApiBaseURL(rawBaseURL),
  timeoutMs: parsePositiveInt(import.meta.env.VITE_API_TIMEOUT_MS, 20000),
  fastTimeoutMs: parsePositiveInt(import.meta.env.VITE_API_FAST_TIMEOUT_MS, 5000),
  longTimeoutMs: parsePositiveInt(import.meta.env.VITE_API_LONG_TIMEOUT_MS, 120000),
  uploadTimeoutMs: parsePositiveInt(import.meta.env.VITE_API_UPLOAD_TIMEOUT_MS, 300000),
  retryCount: parsePositiveInt(import.meta.env.VITE_API_RETRY_COUNT, 1),
  retryDelayMs: parsePositiveInt(import.meta.env.VITE_API_RETRY_DELAY_MS, 1000),
  fastRetryDelayMs: parsePositiveInt(import.meta.env.VITE_API_FAST_RETRY_DELAY_MS, 500),
  getCacheTtlMs: parsePositiveInt(import.meta.env.VITE_API_GET_CACHE_TTL_MS, 1500),
  maxRequestCacheSize: parsePositiveInt(import.meta.env.VITE_API_MAX_REQUEST_CACHE_SIZE, 200),
  messageDurationMs: parsePositiveInt(import.meta.env.VITE_API_MESSAGE_DURATION_MS, 5000),
  csrfReloadDelayMs: parsePositiveInt(import.meta.env.VITE_API_CSRF_RELOAD_DELAY_MS, 1000),
}

export const normalizeApiRequestUrl = (url = '') => {
  if (!url) return url

  const rawUrl = String(url)
  if (hasProtocol(rawUrl)) return rawUrl

  const normalizedPath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`
  if (normalizedPath === '/api') return '/'
  if (normalizedPath.startsWith('/api/')) return normalizedPath.slice(4)

  return normalizedPath
}

export const buildApiUrl = (path = '') => {
  if (hasProtocol(path)) return path
  return joinUrl(API_CONFIG.defaultBaseURL, normalizeApiRequestUrl(path))
}

export const buildResourceUrl = (path = '') => {
  const rawPath = String(path || '').trim()
  if (!rawPath || hasProtocol(rawPath)) return rawPath

  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  const baseURL = API_CONFIG.baseURL

  if (!baseURL) return normalizedPath

  const resourceBaseURL = baseURL.endsWith('/api') ? baseURL.slice(0, -4) || '/' : baseURL
  return `${trimTrailingSlash(resourceBaseURL)}${normalizedPath}`
}
