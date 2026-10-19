import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'

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
    api.put.mockReset()
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

  test('does not restore an edited profile after logout', async () => {
    const pending = deferred()
    api.put.mockReturnValueOnce(pending.promise)
    const update = auth.updateProfile({ realName: 'updated' })
    await auth.logout()
    pending.resolve({ data: { id: 1, username: 'old-user' } })
    expect(await update).toBe(false)
    expect(auth.user).toBeNull()
    expect(sessionStorage.getItem('user')).toBeNull()
  })

  test('a cookie account switch revokes cached permissions and pending previous-account responses', async () => {
    const stalePermissions = deferred()
    const staleUpdate = deferred()
    auth.permissions = ['*']
    auth.permissionsLoaded = true
    sessionStorage.setItem('user_permissions', JSON.stringify(['*']))
    api.get.mockReturnValueOnce(stalePermissions.promise)
      .mockResolvedValueOnce({ data: { id: 2, username: 'new-user' } })
    api.put.mockReturnValueOnce(staleUpdate.promise)
    const permissions = auth.fetchUserPermissions(true)
    const update = auth.updateProfile({ realName: 'old account' })
    expect(await auth.fetchUserProfile()).toBe(true)
    expect(auth.user.id).toBe(2)
    expect(auth.permissionsLoaded).toBe(false)
    expect(auth.permissions).toEqual([])
    expect(sessionStorage.getItem('user_permissions')).toBeNull()
    stalePermissions.resolve({ data: ['*'] })
    staleUpdate.resolve({ data: { id: 1, username: 'old-user' } })
    await Promise.all([permissions, update])
    expect(auth.user.id).toBe(2)
    expect(auth.hasPermission('finance:ap:pay')).toBe(false)
  })

  test('a slower profile response cannot overwrite a newer confirmed identity', async () => {
    const stale = deferred()
    api.get.mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce({ data: { id: 1, username: 'fresh-profile' } })
    const first = auth.fetchUserProfile()
    expect(await auth.fetchUserProfile(true)).toBe(true)
    stale.resolve({ data: { id: 9, username: 'stale-profile' } })
    expect(await first).toBe(false)
    expect(auth.user.username).toBe('fresh-profile')
  })

  test('three concurrent profile callers share one session probe and all receive success', async () => {
    const pending = deferred()
    api.get.mockReturnValueOnce(pending.promise)
    const reads = [auth.fetchUserProfile(), auth.fetchUserProfile(), auth.fetchUserProfile()]
    expect(api.get).toHaveBeenCalledTimes(1)
    pending.resolve({ data: { id: 1, username: 'confirmed-user' } })
    expect(await Promise.all(reads)).toEqual([true, true, true])
    expect(auth.user.username).toBe('confirmed-user')
  })

  test('a failed shared profile probe is cleared so a later navigation can retry', async () => {
    const pending = deferred()
    api.get.mockReturnValueOnce(pending.promise)
    const first = auth.fetchUserProfile(), second = auth.fetchUserProfile()
    pending.reject(new Error('offline'))
    expect(await Promise.all([first, second])).toEqual([false, false])
    api.get.mockResolvedValueOnce({ data: { id: 1, username: 'recovered-user' } })
    expect(await auth.fetchUserProfile()).toBe(true)
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  test('an older forced profile completion cannot remove the current shared probe', async () => {
    const old = deferred(), current = deferred()
    api.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const first = auth.fetchUserProfile()
    const forced = auth.fetchUserProfile(true)
    old.resolve({ data: { id: 9, username: 'obsolete-user' } })
    expect(await first).toBe(false)
    const joined = auth.fetchUserProfile()
    expect(api.get).toHaveBeenCalledTimes(2)
    current.resolve({ data: { id: 1, username: 'current-user' } })
    expect(await Promise.all([forced, joined])).toEqual([true, true])
  })

  test('malformed profile data cannot mark a session authenticated', async () => {
    api.get.mockResolvedValueOnce({ data: {} })
    expect(await auth.fetchUserProfile()).toBe(false)
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.profileLoaded).toBe(false)
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

  test.each([1, 2])('resets the previous theme only when the profile confirms account %s', async (id) => {
    await useTheme().setTheme('workspace', { syncServer: false })
    api.get.mockResolvedValueOnce({ data: { id, username: `user-${id}` } })
    expect(await auth.fetchUserProfile()).toBe(true)
    expect(useTheme().currentThemeName.value).toBe(id === 1 ? 'workspace' : 'kacon')
  })
})
