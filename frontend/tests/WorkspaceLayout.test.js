import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { h, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import Layout from '@/views/Layout.vue'
import NavigationTabs from '@/components/layout/NavigationTabs.vue'
import { prepareMenuTree } from '@/utils/menuTree'

const stores = vi.hoisted(() => ({ auth: null, theme: null, permissions: null }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => stores.auth }))
vi.mock('@/stores/theme', () => ({ useThemeStore: () => stores.theme }))
vi.mock('@/stores/permissionStore', () => ({ usePermissionStore: () => stores.permissions }))
vi.mock('@/stores/language', () => ({ useLanguageStore: () => ({ supportedLanguages: [], currentLanguage: 'en' }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key }) }))
vi.mock('@/api/user', () => ({ userApi: { getUserMenus: async () => ({ data: [
  { id: 1, path: '/', name: 'Home' },
  { id: 2, path: '/purchase', name: 'Purchase', children: [{ id: 3, path: '/purchase/orders', name: 'Orders' }] },
  { id: 4, path: '/inventory', name: 'Inventory', children: [{ id: 5, path: '/inventory/stock', name: 'Stock' }] },
] }) } }))
vi.mock('@/components/common/ThemeSelector.vue', () => ({ default: { template: '<button>Theme</button>' } }))
vi.mock('@/components/NotificationCenter.vue', () => ({ default: { template: '<button>Notifications</button>' } }))
vi.mock('@/components/common/MenuSearch.vue', () => ({ default: { template: '<button>Search</button>' } }))
vi.mock('@/components/layout/Breadcrumb.vue', () => ({ default: { template: '<span>Breadcrumb</span>' } }))
vi.mock('@/views/auth/components/DecorativeAvatarFrame.vue', () => ({ default: { template: '<span>Avatar</span>' } }))

let wrapper
const originalWidth = window.innerWidth
beforeEach(() => {
  stores.auth = reactive({
    user: { id: 1, realName: 'Tester' }, isAuthenticated: true, permissionsLoaded: true, permissions: ['*'],
    hasPermission: () => true, hasChildPermission: () => false,
  })
  stores.theme = reactive({ appearance: { preset: 'workspace' } })
  stores.permissions = reactive({
    menuTree: [],
    get preparedMenuTree() { return prepareMenuTree(this.menuTree) },
    setMenuTree(menus) { this.menuTree = menus },
  })
})
afterEach(() => {
  wrapper?.unmount()
  window.innerWidth = originalWidth
})

const createLayout = async (width = 1440) => {
  window.innerWidth = width
  const page = { render: () => h('h1', 'Business page') }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: Layout, children: [
      { path: '', component: page },
      { path: 'purchase/orders', component: page },
      { path: 'inventory/stock', component: page },
      { path: 'profile', component: page },
    ] }],
  })
  await router.push('/purchase/orders')
  await router.isReady()
  wrapper = mount(RouterView, {
    attachTo: document.body,
    global: {
      plugins: [router],
      mocks: { $t: key => key },
      stubs: {
        ElContainer: { template: '<section><slot /></section>' },
        ElAside: { template: '<aside><slot /></aside>' },
        ElHeader: { template: '<header><slot /></header>' },
        ElMain: { template: '<main><slot /></main>' },
        ElIcon: { template: '<span><slot /></span>' },
        ElDropdown: { template: '<div><slot /></div>' },
        ElDropdownItem: true,
        ElDropdownMenu: true,
      },
    },
  })
  await flushPromises()
  return router
}

const openMobileMenu = async () => {
  const toggle = wrapper.get('.toggle-sidebar')
  toggle.element.focus()
  await toggle.trigger('click')
  await flushPromises()
}

describe('classic theme layout lifecycle', () => {
  test('preserves the current session tabs across theme switches and uses matching content semantics', async () => {
    const router = await createLayout()
    await router.push('/inventory/stock?filter=low')
    await flushPromises()
    const tabInstance = wrapper.findComponent(NavigationTabs).vm.$.uid
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(3)
    expect(wrapper.get('#workspace-page').attributes('aria-labelledby')).toBe('workspace-tab-%2Finventory%2Fstock')
    stores.theme.appearance.preset = 'light'
    await flushPromises()
    expect(wrapper.findComponent(NavigationTabs).vm.$.uid).toBe(tabInstance)
    expect(wrapper.get('.navigation-tabs').element.style.display).toBe('none')
    expect(wrapper.get('#workspace-page').attributes('role')).toBeUndefined()
    stores.theme.appearance.preset = 'workspace'
    await flushPromises()
    expect(wrapper.findComponent(NavigationTabs).vm.$.uid).toBe(tabInstance)
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(3)
    expect(wrapper.get('[aria-selected="true"]').attributes('data-path')).toBe('/inventory/stock')
  })

  test('traps mobile keyboard focus, marks background inert, and restores the toggle after Escape', async () => {
    await createLayout(375)
    expect(wrapper.get('#app-navigation').attributes('inert')).toBeDefined()
    await openMobileMenu()
    const drawer = wrapper.get('#app-navigation')
    expect(drawer.attributes('role')).toBe('dialog')
    expect(drawer.attributes('aria-modal')).toBe('true')
    expect(wrapper.get('.main-container').attributes('inert')).toBeDefined()
    expect(drawer.element.contains(document.activeElement)).toBe(true)
    const last = drawer.findAll('button').at(-1)
    last.element.focus()
    await last.trigger('keydown', { key: 'Tab', code: 'Tab' })
    expect(document.activeElement).toBe(drawer.findAll('button')[0].element)
    await drawer.trigger('keydown', { key: 'Escape', code: 'Escape' })
    await flushPromises()
    expect(wrapper.find('.sidebar-backdrop').exists()).toBe(false)
    expect(wrapper.get('.main-container').attributes('inert')).toBeUndefined()
    expect(document.activeElement).toBe(wrapper.get('.toggle-sidebar').element)
  })

  test('keeps the mobile menu open when navigation is blocked and closes after a successful route', async () => {
    const router = await createLayout(375)
    const removeGuard = router.beforeEach(to => to.path !== '/inventory/stock')
    await openMobileMenu()
    await wrapper.findAll('.workspace-module')[2].trigger('click')
    await wrapper.get('.app-menu-link').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/purchase/orders')
    expect(wrapper.find('.sidebar-backdrop').exists()).toBe(true)
    removeGuard()
    await wrapper.get('.app-menu-link').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/inventory/stock')
    expect(wrapper.find('.sidebar-backdrop').exists()).toBe(false)
  })

  test('releases mobile focus and background restrictions when changing the navigation layout', async () => {
    await createLayout(375)
    await openMobileMenu()
    stores.theme.appearance.preset = 'light'
    await flushPromises()
    expect(wrapper.find('.sidebar-backdrop').exists()).toBe(false)
    expect(wrapper.get('#app-navigation').attributes('inert')).toBeDefined()
    expect(wrapper.get('.main-container').attributes('inert')).toBeUndefined()
    expect(document.activeElement).toBe(wrapper.get('.toggle-sidebar').element)
  })

  test('restores focus when a theme hides tabs or replaces the focused sidebar, without stealing header focus', async () => {
    await createLayout()
    wrapper.get('[aria-selected="true"]').element.focus()
    stores.theme.appearance.preset = 'light'
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('.toggle-sidebar').element)
    wrapper.get('.app-sidebar .app-menu-item').element.focus()
    stores.theme.appearance.preset = 'workspace'
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('.toggle-sidebar').element)
    const headerButton = wrapper.get('.header-right button').element
    headerButton.focus()
    stores.theme.appearance.preset = 'light'
    await flushPromises()
    expect(document.activeElement).toBe(headerButton)
  })
})
