const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const trimTrailingSlash = (value) => String(value || '').trim().replace(/\/+$/, '')
const hasProtocol = (value) => /^[a-z][a-z\d+\-.]*:/i.test(String(value || ''))
const allowedResourceProtocols = new Set(['http:', 'https:'])
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

const getRuntimeOrigin = () => {
  if (typeof window === 'undefined') return ''
  return window.location?.origin || ''
}

const getAllowedResourceOrigins = () => {
  const origins = new Set()
  const runtimeOrigin = getRuntimeOrigin()

  if (runtimeOrigin) {
    origins.add(runtimeOrigin)
  }

  if (API_CONFIG.baseURL && hasProtocol(API_CONFIG.baseURL)) {
    try {
      origins.add(new URL(API_CONFIG.baseURL).origin)
    } catch {
      // Ignore malformed resource origins; API requests fail loudly elsewhere.
    }
  }

  return origins
}

const isAllowedAbsoluteResourceUrl = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl)
    if (!allowedResourceProtocols.has(parsed.protocol)) return false

    return getAllowedResourceOrigins().has(parsed.origin)
  } catch {
    return false
  }
}

export const APP_INFO = {
  name: import.meta.env.VITE_APP_NAME || 'KACON-ERP移动端',
  version: import.meta.env.VITE_APP_VERSION || '1.0.0',
  description: import.meta.env.VITE_APP_DESCRIPTION || 'KACON ERP 移动端应用',
  author: import.meta.env.VITE_APP_AUTHOR || 'KACON Team',
  homepage: import.meta.env.VITE_APP_HOMEPAGE || ''
}

export const API_CONFIG = {
  baseURL: rawBaseURL,
  defaultBaseURL: resolveApiBaseURL(rawBaseURL),
  timeout: parsePositiveInt(import.meta.env.VITE_APP_API_TIMEOUT_MS, 30000),
  retryCount: parsePositiveInt(import.meta.env.VITE_APP_API_RETRY_COUNT, 3),
  retryBaseDelayMs: parsePositiveInt(import.meta.env.VITE_APP_API_RETRY_BASE_DELAY_MS, 1000),
  toastDurationMs: parsePositiveInt(import.meta.env.VITE_APP_TOAST_DURATION_MS, 2000),
  redirectDelayMs: parsePositiveInt(import.meta.env.VITE_APP_LOGIN_REDIRECT_DELAY_MS, 500)
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
  const normalizedPath = normalizeApiRequestUrl(path)
  const finalPath = normalizedPath === '/' ? '' : normalizedPath
  return `${API_CONFIG.defaultBaseURL.replace(/\/+$/, '')}${finalPath}`
}

export const buildResourceUrl = (path = '') => {
  const rawPath = String(path || '').trim()
  if (!rawPath) {
    return rawPath
  }

  if (rawPath.startsWith('//')) {
    return ''
  }

  if (hasProtocol(rawPath)) {
    return isAllowedAbsoluteResourceUrl(rawPath) ? rawPath : ''
  }

  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  const baseURL = API_CONFIG.baseURL

  if (!baseURL) return normalizedPath

  const resourceBaseURL = baseURL.endsWith('/api') ? baseURL.slice(0, -4) || '/' : baseURL
  return joinUrl(resourceBaseURL, normalizedPath)
}
