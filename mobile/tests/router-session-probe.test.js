import { beforeEach, describe, expect, test, vi } from 'vitest'
import { showToast } from 'vant'
import '@/router'

const state = vi.hoisted(() => ({ guard: null, auth: null }))
vi.mock('vue-router', () => ({
  createWebHistory: vi.fn(),
  createRouter: () => ({ beforeEach: guard => { state.guard = guard }, onError: vi.fn() }),
}))
vi.mock('vant', () => ({ showToast: vi.fn() }))
vi.mock('@/composables/useTheme', () => ({ loadThemeForUser: vi.fn(async () => {}) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => state.auth }))

const protectedRoute = { name: 'Inventory', fullPath: '/inventory?tab=1', meta: { permission: 'inventory:stock:view' } }

beforeEach(() => {
  vi.clearAllMocks()
  state.auth = {
    isAuthenticated: false, profileLoaded: false, permissionsLoaded: false,
    fetchUserProfile: vi.fn(async () => false),
    logout: vi.fn(async () => {}),
    fetchUserPermissions: vi.fn(async () => false),
    refreshPermissions: vi.fn(async () => false),
    hasPermission: vi.fn(() => false), hasChildPermission: vi.fn(() => false),
  }
})

describe('mobile router session probes', () => {
  test('an expired cached login is probed once before redirecting to login', async () => {
    state.auth.isAuthenticated = true
    expect(await state.guard(protectedRoute)).toEqual({ name: 'Login', query: { redirect: protectedRoute.fullPath } })
    expect(state.auth.fetchUserProfile).toHaveBeenCalledTimes(1)
    expect(state.auth.logout).toHaveBeenCalledTimes(1)
    expect(state.auth.fetchUserPermissions).not.toHaveBeenCalled()
  })

  test('a new protected navigation still probes an unmarked cookie session', async () => {
    expect(await state.guard(protectedRoute)).toEqual({ name: 'Login', query: { redirect: protectedRoute.fullPath } })
    expect(state.auth.fetchUserProfile).toHaveBeenCalledTimes(1)
    expect(state.auth.logout).not.toHaveBeenCalled()
  })

  test('a guest route without a cached login does not request a profile', async () => {
    expect(await state.guard({ name: 'Login', fullPath: '/login', meta: { allowGuest: true } })).toBe(true)
    expect(state.auth.fetchUserProfile).not.toHaveBeenCalled()
  })

  test('profile recovery does not bypass permission confirmation', async () => {
    state.auth.fetchUserProfile.mockResolvedValue(true)
    expect(await state.guard(protectedRoute)).toBe('/')
    expect(state.auth.fetchUserProfile).toHaveBeenCalledTimes(1)
    expect(state.auth.fetchUserPermissions).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('您没有权限访问此页面')
  })

  test('a recovered session with confirmed permission can enter the route', async () => {
    state.auth.fetchUserProfile.mockResolvedValue(true)
    state.auth.fetchUserPermissions.mockImplementation(async () => {
      state.auth.permissionsLoaded = true
      state.auth.hasPermission.mockReturnValue(true)
      return true
    })
    expect(await state.guard(protectedRoute)).toBe(true)
    expect(state.auth.fetchUserProfile).toHaveBeenCalledTimes(1)
    expect(state.auth.fetchUserPermissions).toHaveBeenCalledTimes(1)
  })

  test('a confirmed profile avoids another session probe on navigation', async () => {
    state.auth.isAuthenticated = true
    state.auth.profileLoaded = true
    state.auth.permissionsLoaded = true
    state.auth.hasPermission.mockReturnValue(true)
    expect(await state.guard(protectedRoute)).toBe(true)
    expect(state.auth.fetchUserProfile).not.toHaveBeenCalled()
  })
})
