import { beforeEach, expect, test, vi } from 'vitest'

const { authStore } = vi.hoisted(() => ({ authStore: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: authStore }))
vi.mock('@/stores/theme', () => ({ useThemeStore: () => ({ loadedForUser: 1 }) }))
vi.mock('@/utils/performanceMode', () => ({ runWhenIdle: vi.fn() }))
vi.mock('@/locales', () => ({ default: { global: { t: key => key } } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { error: vi.fn() } }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))
vi.mock('vue-router', async importOriginal => {
  const actual = await importOriginal()
  const stubComponents = route => ({
    ...route,
    component: route.component ? { template: '<div />' } : undefined,
    children: route.children?.map(stubComponents)
  })
  return {
    ...actual,
    createRouter: options => actual.createRouter({
      ...options, history: actual.createMemoryHistory(), routes: options.routes.map(stubComponents)
    })
  }
})

beforeEach(() => {
  vi.resetModules()
  authStore.mockReturnValue({
    user: { id: 1 }, isAuthenticated: true, sessionProbed: true,
    permissionsLoaded: true, mustChangePassword: false,
    hasPermission: () => false, hasChildPermission: () => false
  })
})

test.each(['/', '/sales/orders', '/force-password'])('a signed-in account without business permissions can leave %s without redirect loops', async path => {
  const { default: router } = await import('@/router')
  await router.push(path)
  expect(router.currentRoute.value.path).toBe('/profile')
})
