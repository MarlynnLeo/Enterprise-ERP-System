import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { userApi } from '@/api/user'
import { tokenManager, permissionManager } from '@/utils/unifiedStorage'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api/user', () => ({
  userApi: {
    login: vi.fn(), logout: vi.fn(), getProfileFast: vi.fn(),
    getPermissions: vi.fn(), updateProfile: vi.fn()
  }
}))
vi.mock('@/services/axiosInstance', () => ({ resetCsrfToken: vi.fn() }))

const deferred = () => {
  let resolve, reject
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}

describe('desktop authentication session isolation', () => {
  let auth
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    tokenManager.setUser({ id: 1, username: 'old-user' })
    userApi.logout.mockResolvedValue({})
    setActivePinia(createPinia())
    auth = useAuthStore()
  })

  test('revokes local permissions as soon as logout starts', async () => {
    userApi.getPermissions.mockResolvedValueOnce({ data: ['*'] })
    await auth.fetchUserPermissions()
    const pending = deferred()
    userApi.logout.mockReturnValueOnce(pending.promise)
    const logout = auth.logout()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.hasPermission('inventory:outbound:create')).toBe(false)
    pending.resolve({})
    await logout
  })

  test.each(['profile', 'permissions', 'update'])('ignores a late %s response after logout', async (kind) => {
    const pending = deferred()
    const read = {
      profile: () => { userApi.getProfileFast.mockReturnValueOnce(pending.promise); return auth.fetchUserProfile() },
      permissions: () => { userApi.getPermissions.mockReturnValueOnce(pending.promise); return auth.fetchUserPermissions() },
      update: () => { userApi.updateProfile.mockReturnValueOnce(pending.promise); return auth.updateUser({ realName: 'updated' }) }
    }[kind]()
    await auth.logout()
    pending.resolve({ data: kind === 'permissions' ? ['*'] : { id: 1, username: 'old-user' } })
    expect(await read).toBe(false)
    expect(auth.user).toBeNull()
    expect(auth.permissionsLoaded).toBe(false)
    expect(tokenManager.getUser()).toBeNull()
    expect(permissionManager.getUserPermissions()).toBeNull()
  })

  test('old profile failure and permissions cannot overwrite a new account', async () => {
    const profile = deferred()
    const permissions = deferred()
    userApi.getProfileFast.mockReturnValueOnce(profile.promise)
      .mockResolvedValueOnce({ data: { id: 2, username: 'new-user' } })
    userApi.getPermissions.mockReturnValueOnce(permissions.promise)
      .mockResolvedValueOnce({ data: ['sales:orders:view'] })
    const oldProfile = auth.fetchUserProfile()
    const oldPermissions = auth.fetchUserPermissions()
    userApi.login.mockResolvedValueOnce({ data: { user: { id: 2, username: 'new-user' } } })
    await auth.login({ username: 'new-user', password: 'test-only' })
    await auth.fetchUserPermissions()
    profile.reject(new Error('old request failed'))
    permissions.resolve({ data: ['*'] })
    await Promise.all([oldProfile, oldPermissions])
    expect(auth.user?.id).toBe(2)
    expect(auth.permissions).toEqual(['sales:orders:view'])
    expect(auth.hasPermission('inventory:outbound:create')).toBe(false)
  })

  test('a forced permissions refresh owns its result even when an earlier read finishes later', async () => {
    const pending = deferred()
    userApi.getPermissions.mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ data: ['sales:orders:view'] })
    const old = auth.fetchUserPermissions()
    await auth.refreshPermissions()
    pending.resolve({ data: ['*'] })
    await old
    expect(auth.permissions).toEqual(['sales:orders:view'])
  })

  test('a coalesced profile request still loads permissions when the second caller requires them', async () => {
    const pending = deferred()
    userApi.getProfileFast.mockReturnValueOnce(pending.promise)
    userApi.getPermissions.mockResolvedValueOnce({ data: ['sales:orders:view'] })
    const profile = auth.fetchUserProfile()
    const authorizedProfile = auth.fetchUserProfile(true)
    pending.resolve({ data: { id: 1, username: 'old-user' } })
    await Promise.all([profile, authorizedProfile])
    expect(userApi.getProfileFast).toHaveBeenCalledTimes(1)
    expect(auth.hasPermission('sales:orders:view')).toBe(true)
  })

  test('supports the alternative permissions used by MRP and shortage routes', async () => {
    userApi.getPermissions.mockResolvedValueOnce({ data: ['production:mrp:view', 'sales:*'] })
    await auth.fetchUserPermissions()
    expect(auth.hasPermission(['production:shortage', 'production:mrp'])).toBe(false)
    expect(auth.hasChildPermission(['production:shortage', 'production:mrp'])).toBe(true)
    expect(auth.hasPermission(['inventory:*', 'sales:orders:view'])).toBe(true)
    expect(auth.hasPermission(['inventory:*', 'quality:*'])).toBe(false)
  })

  test('rejects malformed permission members without authorizing the session', async () => {
    userApi.getPermissions.mockResolvedValueOnce({ data: ['*', null] })
    await expect(auth.fetchUserPermissions()).rejects.toThrow('权限数据格式不正确')
    expect(auth.hasPermission('sales:orders:view')).toBe(false)
  })
})
