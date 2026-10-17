import axios from 'axios'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { error: vi.fn() } }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

describe('API credential origin boundary', () => {
  test.each([
    ['https://outside.example/api/payment', {}],
    ['/payment', { baseURL: 'https://outside.example/api' }]
  ])('never attaches application credentials to %s', async (url, options) => {
    const { api } = await import('@/services/axiosInstance')
    const csrfFetch = vi.spyOn(axios, 'get')
    const adapter = vi.fn(async config => ({ config, status: 200, headers: {}, data: {} }))
    await api.post(url, {}, {
      ...options, adapter,
      headers: { aUtHoRiZaTiOn: 'Bearer stale', 'x-CsRf-ToKeN': 'stale-token' }
    })
    const config = adapter.mock.calls[0][0]
    expect(config.withCredentials).toBe(false)
    expect(config.headers.has('Authorization')).toBe(false)
    expect(config.headers.has('X-CSRF-Token')).toBe(false)
    expect(csrfFetch).not.toHaveBeenCalled()
  })

  test('retains cookies and CSRF protection for application API writes', async () => {
    const { api } = await import('@/services/axiosInstance')
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { csrfToken: 'app-token' } })
    const adapter = vi.fn(async config => ({ config, status: 200, headers: {}, data: {} }))
    await api.post('/payment', {}, { adapter })
    const config = adapter.mock.calls[0][0]
    expect(config.withCredentials).toBe(true)
    expect(config.headers.get('X-CSRF-Token')).toBe('app-token')
  })

  test.each([401, 403])('an external %s cannot refresh or retry the application session', async status => {
    const { api } = await import('@/services/axiosInstance')
    const csrfFetch = vi.spyOn(axios, 'get')
    const refresh = vi.spyOn(api, 'post')
    const adapter = vi.fn(async config => {
      throw new axios.AxiosError('External failure', 'ERR_BAD_REQUEST', config, {}, {
        config, status, headers: {}, data: { code: 'INVALID_CSRF_TOKEN' }
      })
    })
    await expect(api.get('/report', { baseURL: 'https://outside.example/api', adapter })).rejects.toBeTruthy()
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(csrfFetch).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})
