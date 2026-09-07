import axios from 'axios'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('element-plus/es/components/message/index', () => ({
  ElMessage: { error: vi.fn() }
}))
vi.mock('element-plus/es/components/message/style/css', () => ({}))

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

describe('shared authentication refresh', () => {
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
