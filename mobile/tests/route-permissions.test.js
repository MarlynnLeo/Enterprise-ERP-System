import { beforeEach, describe, expect, test, vi } from 'vitest'
import { showToast } from 'vant'
import '@/router'

const state = vi.hoisted(() => ({ routes: [], guard: null, permissions: [] }))
vi.mock('vue-router', () => ({
  createWebHistory: vi.fn(),
  createRouter: ({ routes }) => {
    state.routes = routes
    return { beforeEach: guard => { state.guard = guard }, onError: vi.fn() }
  }
}))
vi.mock('vant', () => ({ showToast: vi.fn() }))
vi.mock('@/composables/useTheme', () => ({ loadThemeForUser: vi.fn(async () => {}) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({
  isAuthenticated: true, profileLoaded: true, permissionsLoaded: true, userId: 1,
  hasPermission: permission => state.permissions.some(value => value === '*' || value === permission ||
    (value.endsWith(':*') && permission.startsWith(value.slice(0, -1)))),
  hasChildPermission: permission => state.permissions.some(value => value.startsWith(`${permission}:`)),
  refreshPermissions: vi.fn(async () => {})
}) }))

beforeEach(() => { state.permissions = []; showToast.mockClear() })

describe('mobile final route permission contracts', () => {
  test.each(['/quality/rework', '/quality/rework/:id'])('keeps the dedicated permission after central rules for %s', path => {
    expect(state.routes.find(route => route.path === path).meta.permission).toBe('quality:rework:view')
  })

  test.each(['quality:incoming:view', 'quality:reports:view', 'quality:nonconforming:view'])(
    'denies rework navigation with only unrelated %s permission', async permission => {
      state.permissions = [permission]
      const route = state.routes.find(route => route.path === '/quality/rework/:id')
      expect(await state.guard({ ...route, fullPath: '/quality/rework/5' })).toBe('/')
      expect(showToast).toHaveBeenCalledWith('您没有权限访问此页面')
    }
  )

  test.each(['quality:rework:view', 'quality:*', '*'])('allows authorized rework navigation for %s', async permission => {
    state.permissions = [permission]
    const route = state.routes.find(route => route.path === '/quality/rework')
    expect(await state.guard({ ...route, fullPath: route.path })).toBe(true)
    expect(showToast).not.toHaveBeenCalled()
  })
})
