import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { systemApi } from '@/api/modules/system'
import { useAuthStore } from '@/stores/auth'
import { useDictionaryStore, watchAuthenticatedDictionary } from '@/stores/dictionary'

let auth
vi.mock('@/stores/auth', () => ({ useAuthStore: vi.fn() }))
vi.mock('@/api/modules/system', () => ({
  systemApi: { getBusinessTypeDictionary: vi.fn() }
}))

describe('mobile dictionary authentication boundary', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    auth = reactive({ isAuthenticated: false, profileLoaded: false })
    useAuthStore.mockReturnValue(auth)
    systemApi.getBusinessTypeDictionary.mockReset().mockResolvedValue({
      data: [{ groupCode: 'purchase', code: 'normal', name: '普通采购' }]
    })
  })

  test('does not make a protected request on a fresh login page', async () => {
    await useDictionaryStore().fetchDictionary()
    expect(systemApi.getBusinessTypeDictionary).not.toHaveBeenCalled()
    expect(useDictionaryStore().isLoaded).toBe(false)
  })

  test('waits for server confirmation of a cached login marker', async () => {
    auth.isAuthenticated = true
    await useDictionaryStore().fetchDictionary()
    expect(systemApi.getBusinessTypeDictionary).not.toHaveBeenCalled()
  })

  test('loads after a restored cookie session has a confirmed profile', async () => {
    auth.isAuthenticated = true
    const stop = watchAuthenticatedDictionary()
    try {
      expect(systemApi.getBusinessTypeDictionary).not.toHaveBeenCalled()
      auth.profileLoaded = true
      await flushPromises()
      expect(systemApi.getBusinessTypeDictionary).toHaveBeenCalledTimes(1)
      expect(useDictionaryStore().getItem('purchase', 'normal')?.name).toBe('普通采购')
    } finally { stop() }
  })

  test('automatically loads when a guest page later restores authentication', async () => {
    const stop = watchAuthenticatedDictionary()
    try {
      await flushPromises()
      expect(systemApi.getBusinessTypeDictionary).not.toHaveBeenCalled()
      auth.isAuthenticated = true
      auth.profileLoaded = true
      await flushPromises()
      expect(systemApi.getBusinessTypeDictionary).toHaveBeenCalledTimes(1)
      expect(useDictionaryStore().isLoaded).toBe(true)
    } finally { stop() }
  })

  test('a forced load still requires an authenticated session', async () => {
    await useDictionaryStore().fetchDictionary(true)
    expect(systemApi.getBusinessTypeDictionary).not.toHaveBeenCalled()
  })

  test('preserves errors from an expired authenticated session', async () => {
    auth.isAuthenticated = true
    auth.profileLoaded = true
    const error = { response: { status: 401 }, message: '登录已过期，请重新登录' }
    systemApi.getBusinessTypeDictionary.mockRejectedValueOnce(error)
    await expect(useDictionaryStore().fetchDictionary()).rejects.toBe(error)
    expect(useDictionaryStore().isLoading).toBe(false)
    expect(useDictionaryStore().isLoaded).toBe(false)
  })
})
