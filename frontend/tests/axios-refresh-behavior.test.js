import axios from 'axios'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('element-plus/es/components/message/index', () => ({
  ElMessage: { error: vi.fn() }
}))
vi.mock('element-plus/es/components/message/style/css', () => ({}))

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})
afterEach(() => vi.restoreAllMocks())

describe('shared authentication refresh', () => {
  test('cancels a write even when its cached CSRF token resolves across a session change', async () => {
    const { api, resetCsrfToken } = await import('@/services/axiosInstance')
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { csrfToken: 'old-token' } })
    const adapter = vi.fn(async config => ({ config, status: 200, headers: {}, data: {} }))
    await api.post('/warm', {}, { adapter })
    const payment = api.post('/payment', { amount: 100 }, { adapter })
    const cancelled = expect(payment).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    await Promise.resolve()
    resetCsrfToken()
    await cancelled
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  test.each([401, 403])('does not replay a previous-session write after a %s response', async status => {
    const { api, resetCsrfToken } = await import('@/services/axiosInstance')
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { csrfToken: 'old-token' } })
    let rejectWrite
    const pending = new Promise((_, reject) => { rejectWrite = reject })
    const adapter = vi.fn(() => pending)
    const payment = api.post('/payment', { amount: 100 }, { adapter })
    const cancelled = expect(payment).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    await flushPromises()
    const config = adapter.mock.calls[0][0]
    resetCsrfToken()
    rejectWrite(new axios.AxiosError('Old request failed', 'ERR_BAD_REQUEST', config, {}, {
      config, status, headers: {}, data: { code: 'INVALID_CSRF_TOKEN' }
    }))
    await cancelled
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  test('retries CSRF rotation within the same session', async () => {
    const { api } = await import('@/services/axiosInstance')
    vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: { csrfToken: 'old-token' } })
      .mockResolvedValueOnce({ data: { csrfToken: 'new-token' } })
    const adapter = vi.fn(async config => {
      if (!config._csrfRetry) throw new axios.AxiosError('CSRF expired', 'ERR_BAD_REQUEST', config, {}, {
        config, status: 403, headers: {}, data: { code: 'INVALID_CSRF_TOKEN' }
      })
      return { config, status: 200, headers: {}, data: {} }
    })
    await api.post('/payment', { amount: 100 }, { adapter })
    expect(adapter).toHaveBeenCalledTimes(2)
    expect(adapter.mock.calls[1][0].headers.get('X-CSRF-Token')).toBe('new-token')
  })

  test('ignores an in-flight CSRF response from a previous session', async () => {
    const { api, resetCsrfToken } = await import('@/services/axiosInstance')
    let completeOldToken
    const oldToken = new Promise(resolve => { completeOldToken = resolve })
    vi.spyOn(axios, 'get').mockReturnValueOnce(oldToken)
      .mockResolvedValueOnce({ data: { csrfToken: 'new-token' } })
    const adapter = vi.fn(async config => ({
      config, status: 200, statusText: 'OK', headers: {}, data: { success: true, data: {} }
    }))
    const first = api.post('/inventory/check', {}, { adapter })
    const cancelled = expect(first).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    await flushPromises()
    resetCsrfToken()
    await api.post('/inventory/check', {}, { adapter })
    completeOldToken({ data: { csrfToken: 'old-token' } })
    await cancelled
    await api.post('/inventory/check', {}, { adapter })
    expect(adapter.mock.calls.map(([config]) => config.headers.get('X-CSRF-Token')))
      .toEqual(['new-token', 'new-token'])
  })

  test('retries every concurrent request only once if its session stays unauthorized', async () => {
    const { api, fastApi } = await import('@/services/axiosInstance')
    let completeRefresh
    const refreshPromise = new Promise((resolve) => { completeRefresh = resolve })
    const refresh = vi.spyOn(api, 'post').mockReturnValue(refreshPromise)
    const adapter = vi.fn(async (config) => {
      throw new axios.AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
        config, status: 401, statusText: 'Unauthorized', headers: {}, data: { message: 'Unauthorized' }
      })
    })

    const requests = Promise.allSettled([
      api.get('/sales/orders', { adapter, skipCache: true, skipAuthRedirect: true }),
      fastApi.get('/inventory', { adapter, skipCache: true, skipAuthRedirect: true })
    ])
    await flushPromises()
    expect(adapter).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)

    completeRefresh({ data: {} })
    const results = await requests
    expect(results.every((result) => result.status === 'rejected')).toBe(true)
    expect(adapter).toHaveBeenCalledTimes(4)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
