import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api', () => ({
  default: {
    defaults: { headers: { common: {} } },
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn()
  }
}))
vi.mock('@/api/client', () => ({ resetCsrfToken: vi.fn() }))
vi.mock('@/composables/useSocket', () => ({ disconnectSocket: vi.fn() }))

const deferred = () => {
  let resolve, reject
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}

describe('mobile authentication session isolation', () => {
  let auth
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    api.get.mockReset()
    api.post.mockReset().mockResolvedValue({})
    localStorage.clear()
    sessionStorage.clear()
    sessionStorage.setItem('user', JSON.stringify({ id: 1, username: 'old-user' }))
    setActivePinia(createPinia())
    auth = useAuthStore()
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  test('does not trust cached wildcard permissions before server confirmation', () => {
    auth.permissions = ['*']
    expect(auth.hasPermission('inventory:outbound:create')).toBe(false)
  })

  test('coalesces concurrent permission reads for the same session', async () => {
    const pending = deferred()
    api.get.mockReturnValueOnce(pending.promise)
    const first = auth.fetchUserPermissions()
    const second = auth.fetchUserPermissions()
    pending.resolve({ data: ['production:reports:create'] })
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(auth.hasPermission('production:reports:create')).toBe(true)
  })

  test('clears local permissions as soon as logout begins', async () => {
    const pending = deferred()
    api.post.mockReturnValueOnce(pending.promise)
    auth.permissions = ['*']
    auth.permissionsLoaded = true
    const logout = auth.logout()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.hasPermission('inventory:outbound:create')).toBe(false)
    pending.resolve({})
    await logout
  })

  test('does not restore permissions from a response that arrives after logout', async () => {
    const pending = deferred()
    api.get.mockReturnValueOnce(pending.promise)
    const permissions = auth.fetchUserPermissions()
    await auth.logout()
    pending.resolve({ data: ['*'] })
    await permissions
    expect(auth.permissions).toEqual([])
    expect(auth.permissionsLoaded).toBe(false)
    expect(sessionStorage.getItem('user_permissions')).toBeNull()
  })

  test('does not restore a profile from a response that arrives after logout', async () => {
    const pending = deferred()
    api.get.mockReturnValueOnce(pending.promise)
    const profile = auth.fetchUserProfile()
    await auth.logout()
    pending.resolve({ data: { id: 1, username: 'old-user' } })
    expect(await profile).toBe(false)
    expect(auth.user).toBeNull()
    expect(localStorage.getItem('isLoggedIn')).toBeNull()
  })

  test('keeps new-account permissions when the previous account responds late', async () => {
    const old = deferred()
    api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ data: ['sales:orders:view'] })
    const permissions = auth.fetchUserPermissions()
    api.post.mockResolvedValueOnce({ data: { user: { id: 2, username: 'new-user' } } })
    await auth.login({ username: 'new-user', password: 'test-only' })
    old.resolve({ data: ['*'] })
    await permissions
    expect(auth.user.id).toBe(2)
    expect(auth.permissions).toEqual(['sales:orders:view'])
    expect(auth.hasPermission('inventory:outbound:create')).toBe(false)
  })

  test('a previous-account profile failure cannot erase a newly signed-in account', async () => {
    const old = deferred()
    api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ data: ['sales:orders:view'] })
    const profile = auth.fetchUserProfile()
    api.post.mockResolvedValueOnce({ data: { user: { id: 2, username: 'new-user' } } })
    await auth.login({ username: 'new-user', password: 'test-only' })
    old.reject(new Error('old request failed'))
    await profile
    expect(auth.user?.id).toBe(2)
    expect(auth.permissions).toEqual(['sales:orders:view'])
  })

  test('a timed-out permission response cannot authorize later navigation', async () => {
    const pending = deferred()
    api.get.mockReturnValueOnce(pending.promise)
    const permissions = auth.fetchUserPermissions()
    await vi.advanceTimersByTimeAsync(10001)
    expect(await permissions).toBe(false)
    pending.resolve({ data: ['*'] })
    await flushPromises()
    expect(auth.hasPermission('inventory:outbound:create')).toBe(false)
    expect(auth.permissionsLoaded).toBe(false)
  })
})
