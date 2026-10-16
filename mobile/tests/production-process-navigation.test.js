import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ProductionIndex from '@/views/production/Index.vue'
import ModuleIndexPage from '@/components/common/ModuleIndexPage.vue'
import { productionRoutes } from '@/router/modules/production'
import { productionApi } from '@/api'

const { router, auth } = vi.hoisted(() => ({
  router: { push: vi.fn(), back: vi.fn() },
  auth: { hasPermission: vi.fn(), hasChildPermission: vi.fn() }
}))

vi.mock('vue-router', async importOriginal => ({
  ...await importOriginal(),
  useRouter: () => router
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/api', () => ({ productionApi: { getDashboardStatistics: vi.fn() } }))

let wrapper
const processEntries = selector => wrapper.findAll(selector).filter(item =>
  item.find(selector === '.quick-item' ? '.quick-text' : '.card-title').text() === '生产过程'
)

async function openProduction(permissions) {
  auth.hasPermission.mockImplementation(permission => permissions.includes('*') || permissions.includes(permission))
  auth.hasChildPermission.mockImplementation(permission => permissions.some(code => code.startsWith(`${permission}:`)))
  wrapper = mount(ProductionIndex, {
    global: { stubs: { NavBar: true, SvgIcon: true } }
  })
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  productionApi.getDashboardStatistics.mockResolvedValue({ data: {} })
})
afterEach(() => wrapper?.unmount())

describe('production process navigation', () => {
  test.each(['production:process', 'production:process:view', 'production:process:update', '*'])(
    'opens production processes from both menu entries for %s', async permission => {
      await openProduction([permission])
      expect(wrapper.findComponent(ModuleIndexPage).exists()).toBe(true)

      const quickEntries = processEntries('.quick-item')
      const moduleEntries = processEntries('.group-card')
      expect(quickEntries).toHaveLength(1)
      expect(moduleEntries).toHaveLength(1)

      await quickEntries[0].trigger('click')
      await moduleEntries[0].trigger('click')
      expect(router.push.mock.calls).toEqual([['/production/process'], ['/production/process']])
    }
  )

  test.each([
    { permissions: [] },
    { permissions: ['production:tasks:view'] },
    { permissions: ['production:plans:view'] }
  ])(
    'hides both entries without production process permission: $permissions', async ({ permissions }) => {
      await openProduction(permissions)
      expect(processEntries('.quick-item')).toHaveLength(0)
      expect(processEntries('.group-card')).toHaveLength(0)
      expect(router.push).not.toHaveBeenCalled()
    }
  )

  test('registers an accessible production process page with the desktop permission namespace', async () => {
    const route = productionRoutes.find(item => item.path === '/production/process')
    expect(route).toMatchObject({
      name: 'ProductionProcess',
      meta: { title: '生产过程', permission: 'production:process' }
    })
    const page = await route.component()
    expect(page.default.__file.replaceAll('\\', '/')).toMatch(/\/production\/Processes\.vue$/)
  })
})
