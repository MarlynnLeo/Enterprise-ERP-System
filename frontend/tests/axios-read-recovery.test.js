import axios from 'axios'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { error: vi.fn() } }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))

const responseFor = (config, data = { items: [1] }) => ({
  config, status: 200, statusText: 'OK', headers: {}, data: { success: true, data }
})
const gatewayError = (config, status = 502) => new axios.AxiosError(
  'Bad Gateway', 'ERR_BAD_RESPONSE', config, {}, { config, status, headers: {}, data: '' }
)

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); localStorage.clear() })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('read recovery during rapid navigation', () => {
  test.each(['api', 'fastApi'])('%s shares the entire recovery with concurrent readers', async name => {
    const client = (await import('@/services/axiosInstance'))[name]
    let attempts = 0
    const adapter = vi.fn(async config => {
      if (++attempts < 3) throw gatewayError(config)
      return responseFor(config)
    })
    const pending = Promise.allSettled(Array.from({ length: 8 }, () =>
      client.get('/inventory/locations', { adapter, retry: 2, retryDelay: 100 })
    ))
    await flushPromises()
    expect(adapter).toHaveBeenCalledTimes(1)
    await vi.runAllTimersAsync()
    const results = await pending
    expect(results.map(result => result.status)).toEqual(Array(8).fill('fulfilled'))
    expect(results.map(result => result.value.data)).toEqual(Array(8).fill({ items: [1] }))
    expect(adapter).toHaveBeenCalledTimes(3)
    results[0].value.data.items.push(2)
    expect(results[1].value.data.items).toEqual([1])
    expect((await client.get('/inventory/locations', { adapter })).data.items).toEqual([1])
    expect(adapter).toHaveBeenCalledTimes(3)
  })

  test('a persistent outage rejects all readers after the bounded shared attempts', async () => {
    const { api } = await import('@/services/axiosInstance')
    const adapter = vi.fn(async config => { throw gatewayError(config) })
    const pending = Promise.allSettled(Array.from({ length: 6 }, () =>
      api.get('/inventory/check', { adapter, retry: 2, retryDelay: 100 })
    ))
    await flushPromises()
    await vi.runAllTimersAsync()
    expect((await pending).every(result => result.status === 'rejected')).toBe(true)
    expect(adapter).toHaveBeenCalledTimes(3)
  })

  test('a cancelled read does not wait for or send a recovery attempt', async () => {
    const { api } = await import('@/services/axiosInstance')
    const controller = new AbortController()
    const adapter = vi.fn(async config => { throw gatewayError(config) })
    const pending = api.get('/inventory/check', {
      adapter, signal: controller.signal, retry: 2, retryDelay: 1000
    })
    const rejected = expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    await flushPromises()
    controller.abort()
    await flushPromises()
    expect(vi.getTimerCount()).toBe(0)
    await rejected
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  test('a session change prevents a delayed read from using the next session', async () => {
    const { api, resetCsrfToken } = await import('@/services/axiosInstance')
    const adapter = vi.fn(async config => { throw gatewayError(config) })
    const pending = api.get('/inventory/check', { adapter, retry: 2, retryDelay: 100 })
    const rejected = expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    await flushPromises()
    resetCsrfToken()
    await vi.runAllTimersAsync()
    await rejected
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  test('honors retry: 0', async () => {
    const { api } = await import('@/services/axiosInstance')
    const adapter = vi.fn(async config => { throw gatewayError(config) })
    await expect(api.get('/inventory/check', { adapter, retry: 0 })).rejects.toMatchObject({ response: { status: 502 } })
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  test('recovers a network reset and spaces repeated attempts with backoff', async () => {
    const { api } = await import('@/services/axiosInstance')
    const started = Date.now()
    const times = []
    const adapter = vi.fn(async config => {
      times.push(Date.now() - started)
      if (times.length < 3) throw new axios.AxiosError('Connection reset', 'ERR_NETWORK', config)
      return responseFor(config)
    })
    const pending = api.get('/inventory/check', { adapter, retry: 2, retryDelay: 100 })
    await flushPromises()
    await vi.runAllTimersAsync()
    expect((await pending).data).toEqual({ items: [1] })
    expect(times).toEqual([0, 100, 300])
  })

  test('an authentication replay does not multiply a later outage retry budget', async () => {
    const { api } = await import('@/services/axiosInstance')
    vi.spyOn(api, 'post').mockResolvedValue({ data: {} })
    let attempts = 0
    const adapter = vi.fn(async config => { throw gatewayError(config, ++attempts === 1 ? 401 : 502) })
    const rejected = expect(api.get('/inventory/check', { adapter, retry: 2, retryDelay: 100 }))
      .rejects.toMatchObject({ response: { status: 502 } })
    await flushPromises()
    await vi.runAllTimersAsync()
    await rejected
    expect(adapter).toHaveBeenCalledTimes(4)
  })

  test.each(['post', 'put', 'patch', 'delete'])('never replays a %s after 502', async method => {
    const { api } = await import('@/services/axiosInstance')
    const adapter = vi.fn(async config => { throw gatewayError(config) })
    await expect(api.request({ url: '/inventory/inbound', method, adapter, skipCsrf: true }))
      .rejects.toMatchObject({ response: { status: 502 } })
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  test.each([400, 403, 404, 429])('does not retry HTTP %s', async status => {
    const { api } = await import('@/services/axiosInstance')
    const adapter = vi.fn(async config => { throw gatewayError(config, status) })
    await expect(api.get('/inventory/check', { adapter })).rejects.toMatchObject({ response: { status } })
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  test('does not retry a business failure returned in a successful HTTP response', async () => {
    const { api } = await import('@/services/axiosInstance')
    const adapter = vi.fn(async config => ({
      ...responseFor(config), data: { success: false, message: '业务数据不可用' }
    }))
    const rejected = expect(api.get('/inventory/check', { adapter })).rejects.toThrow('业务数据不可用')
    await flushPromises()
    await vi.runAllTimersAsync()
    await rejected
    expect(adapter).toHaveBeenCalledTimes(1)
  })
})
