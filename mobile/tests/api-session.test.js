import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

vi.mock('vant', () => ({ showToast: vi.fn() }))

const deferred = () => {
  let resolve
  const promise = new Promise((accept) => { resolve = accept })
  return { promise, resolve }
}
const success = (config) => ({
  config, status: 200, statusText: 'OK', headers: {}, data: { success: true, data: { ok: true } }
})

describe('mobile API cookie and CSRF recovery', () => {
  let api, axios, resetCsrfToken

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    localStorage.clear()
    sessionStorage.clear()
    window.history.replaceState({}, '', '/login')
    axios = (await import('axios')).default
    ;({ default: api, resetCsrfToken } = await import('@/api/client'))
    api.defaults.adapter = vi.fn(async (config) => success(config))
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { csrfToken: 'current-token' } })
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const rejectHttp = (config, status, data = {}) => {
    throw new axios.AxiosError('Request failed', 'ERR_BAD_REQUEST', config, {}, {
      config, status, statusText: 'Error', headers: {}, data
    })
  }

  test('uses cookie credentials and fetches one CSRF token for concurrent writes', async () => {
    await Promise.all([api.post('/inventory/check', {}), api.put('/inventory/check/1', {})])
    expect(axios.get).toHaveBeenCalledTimes(1)
    for (const [config] of api.defaults.adapter.mock.calls) {
      expect(config.withCredentials).toBe(true)
      expect(config.headers.get('X-CSRF-Token')).toBe('current-token')
    }
  })

  test('does not fetch a CSRF token for read requests or login bootstrap', async () => {
    await api.get('/api/auth/profile')
    await api.post('/auth/login', { username: 'test', password: 'test-only' })
    expect(axios.get).not.toHaveBeenCalled()
    expect(api.defaults.adapter.mock.calls[0][0].url).toBe('/auth/profile')
  })

  test('does not reuse a stale in-flight CSRF response after session reset', async () => {
    const oldToken = deferred()
    axios.get.mockReturnValueOnce(oldToken.promise)
      .mockResolvedValueOnce({ data: { csrfToken: 'new-token' } })
    const first = api.post('/inventory/check', {})
    await flushPromises()
    resetCsrfToken()
    await api.post('/inventory/check', {})
    oldToken.resolve({ data: { csrfToken: 'old-token' } })
    await first
    await api.post('/inventory/check', {})
    expect(api.defaults.adapter.mock.calls.map(([config]) => config.headers.get('X-CSRF-Token')))
      .toEqual(['new-token', 'new-token', 'new-token'])
  })

  test('retries an invalid CSRF token only once with a fresh token', async () => {
    axios.get.mockResolvedValueOnce({ data: { csrfToken: 'expired-token' } })
      .mockResolvedValueOnce({ data: { csrfToken: 'fresh-token' } })
    api.defaults.adapter.mockImplementation(async (config) => {
      if (!config._csrfRetry) return rejectHttp(config, 403, { code: 'INVALID_CSRF_TOKEN' })
      return success(config)
    })
    await api.post('/inventory/check', {})
    expect(api.defaults.adapter).toHaveBeenCalledTimes(2)
    expect(api.defaults.adapter.mock.calls[1][0].headers.get('X-CSRF-Token')).toBe('fresh-token')
  })

  test('does not retry a timed-out business write', async () => {
    api.defaults.adapter.mockImplementation(async (config) => {
      throw new axios.AxiosError('timeout', 'ECONNABORTED', config, {})
    })
    await expect(api.post('/inventory/outbound', {})).rejects.toMatchObject({ code: 'ECONNABORTED' })
    expect(api.defaults.adapter).toHaveBeenCalledTimes(1)
  })

  test('does not start another refresh for an already retried queued request', async () => {
    const refresh = deferred()
    let refreshCalls = 0
    let successfulReads = 0
    api.defaults.adapter.mockImplementation(async (config) => {
      if (config.url === '/auth/refresh') {
        refreshCalls++
        await refresh.promise
        return success(config)
      }
      if (config.url === '/allowed' && successfulReads++ > 0) return success(config)
      return rejectHttp(config, 401)
    })
    const requests = Promise.allSettled([api.get('/allowed'), api.get('/blocked')])
    await flushPromises()
    refresh.resolve()
    const results = await requests
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
    expect(refreshCalls).toBe(1)
  })
})
