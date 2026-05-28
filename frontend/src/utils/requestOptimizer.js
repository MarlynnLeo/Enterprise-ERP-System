const CACHEABLE_METHODS = new Set(['get'])
const MUTATION_METHODS = new Set(['post', 'put', 'patch', 'delete'])
const DOWNLOAD_RESPONSE_TYPES = new Set(['blob', 'arraybuffer', 'stream'])

const getHeader = (headers, name) => {
  if (!headers) return ''
  if (typeof headers.get === 'function') return headers.get(name) || headers.get(name.toLowerCase()) || ''
  return headers[name] || headers[name.toLowerCase()] || ''
}

const hashValue = (value) => {
  let hash = 0
  const text = String(value || '')

  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  }

  return Math.abs(hash).toString(36)
}

const getAuthCacheKey = (headers) => {
  const authHeader = String(getHeader(headers, 'Authorization') || '').trim()
  if (!authHeader) return 'anon'

  return `auth:${hashValue(authHeader.replace(/^Bearer\s+/i, ''))}`
}

const stableSerialize = (value) => {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`

  return Object.keys(value)
    .sort()
    .map((key) => `${key}:${stableSerialize(value[key])}`)
    .join('|')
}

const cloneData = (value) => {
  if (!value || typeof value !== 'object') return value
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value
  if (value instanceof ArrayBuffer) return value.slice(0)

  try {
    if (typeof window !== 'undefined' && typeof window.structuredClone === 'function') {
      return window.structuredClone(value)
    }
  } catch {
    // Fall back to JSON cloning below.
  }

  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return value
  }
}

const cloneResponse = (response, config, meta = {}) => ({
  ...response,
  config,
  data: cloneData(response.data),
  _requestOptimizer: meta,
})

const isNoCacheRequest = (config) => {
  const cacheControl = String(getHeader(config.headers, 'Cache-Control')).toLowerCase()
  const pragma = String(getHeader(config.headers, 'Pragma')).toLowerCase()
  return cacheControl.includes('no-cache') || cacheControl.includes('no-store') || pragma.includes('no-cache')
}

export const applyRequestOptimizer = (apiInstance, axios, options = {}) => {
  const {
    defaultCacheTtl = 1500,
    maxCacheSize = 200,
  } = options

  const inflightRequests = new Map()
  const responseCache = new Map()

  const clearCache = () => {
    responseCache.clear()
  }

  const notifyMutation = () => {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('erp:api-mutated'))
    }
  }

  const trimCache = () => {
    while (responseCache.size > maxCacheSize) {
      const firstKey = responseCache.keys().next().value
      responseCache.delete(firstKey)
    }
  }

  const getRequestKey = (config) => {
    const method = String(config.method || 'get').toLowerCase()
    return [
      method,
      config.baseURL || '',
      config.url || '',
      stableSerialize(config.params),
      stableSerialize(config.data),
      getAuthCacheKey(config.headers),
    ].join('::')
  }

  const getCacheEntry = (key) => {
    const entry = responseCache.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      responseCache.delete(key)
      return null
    }
    return entry.response
  }

  const setCacheEntry = (key, response, ttl, config) => {
    if (!ttl || ttl <= 0) return
    responseCache.set(key, {
      expiresAt: Date.now() + ttl,
      response: cloneResponse(response, config, { source: 'cache-store' }),
    })
    trimCache()
  }

  const shouldOptimize = (config) => {
    const method = String(config.method || 'get').toLowerCase()
    if (!CACHEABLE_METHODS.has(method)) return false
    if (config.skipDedupe || config.dedupe === false) return false
    if (DOWNLOAD_RESPONSE_TYPES.has(String(config.responseType || '').toLowerCase())) return false
    return true
  }

  const getCacheTtl = (config) => {
    if (config.skipCache || config.cache === false || isNoCacheRequest(config)) return 0
    const ttl = Number(config.cacheTtl ?? config.metadata?.cacheTtl ?? defaultCacheTtl)
    return Number.isFinite(ttl) && ttl > 0 ? ttl : 0
  }

  apiInstance.interceptors.request.use((config) => {
    if (!shouldOptimize(config)) return config

    const key = getRequestKey(config)
    const cacheTtl = getCacheTtl(config)
    const cachedResponse = cacheTtl > 0 ? getCacheEntry(key) : null

    if (cachedResponse) {
      config.adapter = async (adapterConfig) => cloneResponse(cachedResponse, adapterConfig, { source: 'cache' })
      return config
    }

    const originalAdapter = axios.getAdapter
      ? axios.getAdapter(config.adapter || apiInstance.defaults.adapter || axios.defaults.adapter)
      : (config.adapter || apiInstance.defaults.adapter || axios.defaults.adapter)

    config.adapter = async (adapterConfig) => {
      const running = inflightRequests.get(key)
      if (running) {
        const response = await running
        return cloneResponse(response, adapterConfig, { source: 'dedupe' })
      }

      const requestPromise = originalAdapter(adapterConfig)
        .then((response) => {
          setCacheEntry(key, response, cacheTtl, adapterConfig)
          return response
        })
        .finally(() => {
          inflightRequests.delete(key)
        })

      inflightRequests.set(key, requestPromise)
      const response = await requestPromise
      return cloneResponse(response, adapterConfig, { source: 'network' })
    }

    return config
  })

  apiInstance.interceptors.response.use(
    (response) => {
      const method = String(response.config?.method || '').toLowerCase()
      if (MUTATION_METHODS.has(method)) {
        clearCache()
        notifyMutation()
      }
      return response
    },
    (error) => {
      const method = String(error.config?.method || '').toLowerCase()
      if (MUTATION_METHODS.has(method)) {
        clearCache()
        notifyMutation()
      }
      return Promise.reject(error)
    }
  )

  apiInstance.clearRequestCache = clearCache
  return { clearCache }
}
