const READ_METHODS = new Set(['get', 'head'])
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504])
const NETWORK_CODES = new Set(['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE'])

const assertNotCancelled = (config, axios) => {
  config.cancelToken?.throwIfRequested()
  if (config.signal?.aborted) throw new axios.CanceledError('请求已取消', config)
}

const waitForRetry = (delay, config, axios) => new Promise((resolve, reject) => {
  const cleanup = () => {
    clearTimeout(timer)
    config.signal?.removeEventListener('abort', cancel)
    config.cancelToken?.unsubscribe(cancel)
  }
  const cancel = () => {
    cleanup()
    reject(new axios.CanceledError('请求已取消', config))
  }
  const timer = setTimeout(() => { cleanup(); resolve() }, delay)
  config.signal?.addEventListener('abort', cancel, { once: true })
  config.cancelToken?.subscribe(cancel)
  if (config.signal?.aborted || config.cancelToken?.reason) cancel()
})

// Run below response normalization and inside request deduplication. All readers
// share one retry budget and receive the same final outcome, not a shared mutable
// error.config.retryCount that lets one reader exhaust everyone else's retries.
export const requestWithRetry = async (adapter, config, axios, assertActive = () => {}) => {
  const method = String(config.method || 'get').toLowerCase()
  const configuredRetries = Number(config.retry)
  const retryLimit = READ_METHODS.has(method) && Number.isFinite(configuredRetries)
    ? Math.max(0, Math.floor(configuredRetries)) : 0
  const retryDelay = Math.max(0, Number(config.retryDelay) || 0)

  for (let attempt = 0; ; attempt++) {
    assertNotCancelled(config, axios)
    assertActive(config)
    try {
      return await adapter(config)
    } catch (error) {
      const status = error.response?.status
      const transient = status ? TRANSIENT_STATUSES.has(status) : NETWORK_CODES.has(error.code)
      if (axios.isCancel(error) || !transient || attempt >= retryLimit) throw error
      assertNotCancelled(config, axios)
      assertActive(config)
      await waitForRetry(Math.min(retryDelay * (2 ** attempt), 10000), config, axios)
    }
  }
}
