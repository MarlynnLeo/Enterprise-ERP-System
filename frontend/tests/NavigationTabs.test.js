import { afterEach, describe, expect, test, vi } from 'vitest'
import { effectScope, h, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { useNavigationTabs } from '../src/composables/useNavigationTabs'
import NavigationTabs from '../src/components/layout/NavigationTabs.vue'

const stores = vi.hoisted(() => ({ auth: null, permissions: null }))
vi.mock('../src/stores/auth', () => ({ useAuthStore: () => stores.auth }))
vi.mock('../src/stores/permissionStore', () => ({ usePermissionStore: () => stores.permissions }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key) => key }) }))

const scopes = []
let wrapper
afterEach(() => {
  wrapper?.unmount()
  scopes.splice(0).forEach((scope) => scope.stop())
})

async function createHarness({ initial = '/purchase/orders', permissions = ['*'] } = {}) {
  const page = { render: () => h('div', 'Page') }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/', component: { render: () => h(RouterView) }, meta: { requiresAuth: true },
        children: [
          { path: '', name: 'dashboard', component: page, meta: { permission: 'dashboard' } },
          { path: 'purchase/orders', name: 'orders', component: page, meta: { permission: 'purchase:orders' } },
          { path: 'inventory/stock', name: 'stock', component: page, meta: { permission: 'inventory:stock' } },
          { path: 'production/plan', name: 'plan', component: page, meta: { permission: 'production:plans' } },
          { path: 'finance/budget/edit/:id', name: 'budget-edit', component: page, meta: { permission: 'budget:edit' } },
          { path: 'finance/settings', name: 'finance-settings', component: page, meta: { title: '财务设置' } },
          { path: 'profile', name: 'profile', component: page },
          { path: 'broken', name: 'broken', component: () => Promise.reject(new Error('Import failed')) },
          { path: 'orders-alias', redirect: '/purchase/orders' }
        ]
      },
      { path: '/diagnose', component: page }
    ]
  })
  router.onError(vi.fn())
  const auth = reactive({
    user: { id: 1 }, isAuthenticated: true, permissionsLoaded: true, permissions,
    hasPermission: (permission) => Array.isArray(permission)
      ? permission.some((item) => auth.hasPermission(item))
      : auth.permissions.includes('*') || auth.permissions.includes(permission),
    hasChildPermission: (permission) => auth.permissions.some((item) => item.startsWith(`${permission}:`))
  })
  await router.push(initial)
  await router.isReady()
  const scope = effectScope()
  scopes.push(scope)
  const workspace = scope.run(() => useNavigationTabs({ router, auth }))
  const visit = async (path) => { await router.push(path); await flushPromises() }
  const paths = () => workspace.tabs.value.map((tab) => tab.path)
  return { ...workspace, auth, router, visit, paths }
}

describe('workspace page tabs', () => {
  test('uses confirmed routes, deduplicates a page, and restores its latest query and hash', async () => {
    const workspace = await createHarness({ initial: '/purchase/orders?id=7#lines' })
    expect(workspace.paths()).toEqual(['/', '/purchase/orders'])
    await workspace.visit('/purchase/orders?id=9#summary')
    expect(workspace.paths()).toEqual(['/', '/purchase/orders'])
    await workspace.visit('/inventory/stock')
    await workspace.navigate(workspace.tabs.value.find((tab) => tab.path === '/purchase/orders'))
    expect(workspace.router.currentRoute.value.fullPath).toBe('/purchase/orders?id=9#summary')
    await workspace.visit('/orders-alias')
    expect(workspace.paths()).toEqual(['/', '/purchase/orders', '/inventory/stock'])
    expect(workspace.tabs.value.find((tab) => tab.path === '/purchase/orders').fullPath).toBe('/purchase/orders')
  })

  test('follows browser history and distinguishes routes with different path parameters', async () => {
    const workspace = await createHarness()
    await workspace.visit('/finance/budget/edit/12')
    await workspace.visit('/finance/budget/edit/13')
    workspace.router.back()
    await flushPromises()
    expect(workspace.activePath.value).toBe('/finance/budget/edit/12')
    expect(workspace.paths()).toContain('/finance/budget/edit/13')
    expect(workspace.paths()).toContain('/finance/budget/edit/12')
  })

  test('uses one tab for optional trailing slashes and preserves the last deep link', async () => {
    const workspace = await createHarness()
    await workspace.visit('/purchase/orders/?id=9#summary')
    expect(workspace.paths()).toEqual(['/', '/purchase/orders'])
    expect(workspace.activePath.value).toBe('/purchase/orders')
    await workspace.visit('/inventory/stock/')
    expect(await workspace.closeTab('/inventory/stock')).toBe(true)
    expect(workspace.router.currentRoute.value.fullPath).toBe('/purchase/orders/?id=9#summary')
    expect(workspace.paths()).toEqual(['/', '/purchase/orders'])
  })

  test('does not add a tab for an aborted route or a failed lazy import', async () => {
    const workspace = await createHarness()
    workspace.router.beforeEach((to) => to.path !== '/inventory/stock')
    expect(await workspace.navigate({ fullPath: '/inventory/stock' })).toBe(false)
    expect(await workspace.navigate({ fullPath: '/broken' })).toBe(false)
    expect(workspace.paths()).toEqual(['/', '/purchase/orders'])
    expect(workspace.activePath.value).toBe('/purchase/orders')
  })

  test('keeps a current tab when its replacement navigation is blocked, then closes after success', async () => {
    const workspace = await createHarness({ initial: '/purchase/orders?id=8#details' })
    await workspace.visit('/inventory/stock')
    const removeGuard = workspace.router.beforeEach((to) => to.path !== '/purchase/orders')
    expect(await workspace.closeTab('/inventory/stock')).toBe(false)
    expect(workspace.paths()).toContain('/inventory/stock')
    expect(workspace.activePath.value).toBe('/inventory/stock')
    removeGuard()
    expect(await workspace.closeTab('/inventory/stock')).toBe(true)
    expect(workspace.router.currentRoute.value.fullPath).toBe('/purchase/orders?id=8#details')
    expect(workspace.paths()).toEqual(['/', '/purchase/orders'])
  })

  test('keeps the current tab visible while replacement navigation is pending', async () => {
    const workspace = await createHarness()
    await workspace.visit('/inventory/stock')
    let release
    workspace.router.beforeEach(() => new Promise((resolve) => { release = resolve }))
    const close = workspace.closeTab('/inventory/stock')
    await flushPromises()
    expect(workspace.pendingClose.value).toBe(true)
    expect(workspace.paths()).toContain('/inventory/stock')
    release(true)
    expect(await close).toBe(true)
    expect(workspace.pendingClose.value).toBe(false)
    expect(workspace.paths()).not.toContain('/inventory/stock')
  })

  test('closes inactive pages without changing the route and keeps home when closing others', async () => {
    const workspace = await createHarness()
    await workspace.visit('/inventory/stock')
    await workspace.visit('/production/plan')
    expect(await workspace.closeTab('/inventory/stock')).toBe(true)
    expect(workspace.activePath.value).toBe('/production/plan')
    expect(await workspace.closeTab('/')).toBe(false)
    workspace.closeOtherTabs()
    expect(workspace.paths()).toEqual(['/', '/production/plan'])
  })

  test('omits unauthorized home and uses profile when closing the last business page', async () => {
    const workspace = await createHarness({ permissions: ['purchase:orders'] })
    expect(workspace.paths()).toEqual(['/purchase/orders'])
    expect(await workspace.closeTab('/purchase/orders')).toBe(true)
    expect(workspace.paths()).toEqual(['/profile'])
    expect(workspace.activePath.value).toBe('/profile')
    expect(workspace.canClose(workspace.tabs.value[0])).toBe(false)
    expect(await workspace.closeTab('/profile')).toBe(false)
  })

  test('prunes revoked permissions and leaves a page that is no longer permitted', async () => {
    const workspace = await createHarness()
    await workspace.visit('/inventory/stock')
    workspace.auth.permissions = ['dashboard', 'purchase:orders']
    await flushPromises()
    expect(workspace.paths()).toEqual(['/', '/purchase/orders'])
    expect(workspace.activePath.value).toBe('/')
    expect(await workspace.navigate({ fullPath: '/inventory/stock' })).toBe(false)
  })

  test('clears another account’s tabs, pending permissions, and logout state', async () => {
    const workspace = await createHarness()
    await workspace.visit('/inventory/stock')
    workspace.auth.user = { id: 2 }
    await flushPromises()
    expect(workspace.paths()).toEqual(['/', '/inventory/stock'])
    workspace.auth.permissionsLoaded = false
    await flushPromises()
    expect(workspace.paths()).toEqual([])
    workspace.auth.permissions = ['inventory:stock']
    workspace.auth.permissionsLoaded = true
    await flushPromises()
    expect(workspace.paths()).toEqual(['/inventory/stock'])
    workspace.auth.isAuthenticated = false
    workspace.auth.user = null
    await flushPromises()
    expect(workspace.paths()).toEqual([])
  })

  test('does not let a pending close from a previous account lock or unlock the current account tabs', async () => {
    const workspace = await createHarness()
    await workspace.visit('/inventory/stock')
    const releases = []
    workspace.router.beforeEach(() => new Promise(resolve => { releases.push(resolve) }))
    const previousClose = workspace.closeTab('/inventory/stock')
    await flushPromises()
    workspace.auth.user = { id: 2 }
    await flushPromises()
    expect(workspace.pendingClose.value).toBe(false)
    const currentClose = workspace.closeTab('/inventory/stock')
    await flushPromises()
    releases[0](false)
    expect(await previousClose).toBe(false)
    expect(workspace.pendingClose.value).toBe(true)
    releases[1](true)
    expect(await currentClose).toBe(true)
    expect(workspace.pendingClose.value).toBe(false)
  })

  test('does not add standalone routes outside the application workspace', async () => {
    const workspace = await createHarness()
    await workspace.visit('/diagnose')
    expect(workspace.paths()).toEqual(['/', '/purchase/orders'])
  })

  test('renders accessible tabs and supports switching, keyboard closing, and closing others', async () => {
    const workspace = await createHarness()
    stores.auth = workspace.auth
    stores.permissions = reactive({ preparedMenuTree: [] })
    wrapper = mount(NavigationTabs, {
      attachTo: document.body,
      global: { plugins: [workspace.router], stubs: { 'el-icon': { template: '<span><slot /></span>' } } }
    })
    await workspace.visit('/inventory/stock?filter=low#results')
    expect(wrapper.findAll('[role="tab"]')).toHaveLength(3)
    const orders = wrapper.get('[data-path="/purchase/orders"]')
    await orders.trigger('click')
    await flushPromises()
    expect(orders.attributes('aria-selected')).toBe('true')
    expect(orders.attributes('aria-controls')).toBe('workspace-page')
    await orders.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement.dataset.path).toBe('/inventory/stock')
    await wrapper.get('[data-path="/inventory/stock"]').trigger('keydown', { key: 'Delete' })
    await flushPromises()
    expect(wrapper.find('[data-path="/inventory/stock"]').exists()).toBe(false)
    expect(document.activeElement.dataset.path).toBe('/purchase/orders')
    await workspace.visit('/production/plan')
    await wrapper.get('.navigation-tabs__others').trigger('click')
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.attributes('data-path'))).toEqual(['/', '/production/plan'])
  })

  test('uses the query menu title and latest destination without creating a second tab for the same page', async () => {
    const workspace = await createHarness({ initial: '/finance/settings' })
    stores.auth = workspace.auth
    stores.permissions = reactive({ preparedMenuTree: [
      { name: 'Settings', path: '/finance/settings', hasChildren: false },
      { name: 'Automation', path: '/finance/settings?tab=automation', hasChildren: false }
    ] })
    wrapper = mount(NavigationTabs, {
      global: { plugins: [workspace.router], stubs: { 'el-icon': { template: '<span><slot /></span>' } } }
    })
    expect(wrapper.get('[data-path="/finance/settings"]').text()).toBe('menu.financeSettings')
    await workspace.visit('/finance/settings?page=2&tab=automation#rules')
    expect(wrapper.findAll('[data-path="/finance/settings"]')).toHaveLength(1)
    expect(wrapper.get('[data-path="/finance/settings"]').text()).toBe('menu.financeAutomation')
    await workspace.visit('/inventory/stock')
    await wrapper.get('[data-path="/finance/settings"]').trigger('click')
    await flushPromises()
    expect(workspace.router.currentRoute.value.fullPath).toBe('/finance/settings?page=2&tab=automation#rules')
    await workspace.visit('/finance/settings?tab=general')
    expect(wrapper.findAll('[data-path="/finance/settings"]')).toHaveLength(1)
    expect(wrapper.get('[data-path="/finance/settings"]').text()).toBe('menu.financeSettings')
  })

  test('returns focus to the active page when a focused close button is removed', async () => {
    const workspace = await createHarness()
    stores.auth = workspace.auth
    stores.permissions = reactive({ preparedMenuTree: [] })
    wrapper = mount(NavigationTabs, {
      attachTo: document.body,
      global: { plugins: [workspace.router], stubs: { 'el-icon': { template: '<span><slot /></span>' } } }
    })
    await workspace.visit('/inventory/stock')
    const close = wrapper.get('[data-path="/inventory/stock"]').element.parentElement.querySelector('.navigation-tabs__close')
    close.focus()
    close.click()
    await flushPromises()
    expect(wrapper.find('[data-path="/inventory/stock"]').exists()).toBe(false)
    expect(document.activeElement.dataset.path).toBe('/purchase/orders')
  })

  test('returns focus from the disabled close-others control to the current page', async () => {
    const workspace = await createHarness()
    stores.auth = workspace.auth
    stores.permissions = reactive({ preparedMenuTree: [] })
    wrapper = mount(NavigationTabs, {
      attachTo: document.body,
      global: { plugins: [workspace.router], stubs: { 'el-icon': { template: '<span><slot /></span>' } } }
    })
    await workspace.visit('/inventory/stock')
    const closeOthers = wrapper.get('.navigation-tabs__others')
    closeOthers.element.focus()
    await closeOthers.trigger('click')
    await flushPromises()
    expect(closeOthers.attributes('disabled')).toBeDefined()
    expect(document.activeElement.dataset.path).toBe('/inventory/stock')
  })

  test('keeps focus outside the tabs when it moves during pending close navigation', async () => {
    const workspace = await createHarness()
    stores.auth = workspace.auth
    stores.permissions = reactive({ preparedMenuTree: [] })
    wrapper = mount(NavigationTabs, {
      attachTo: document.body,
      global: { plugins: [workspace.router], stubs: { 'el-icon': { template: '<span><slot /></span>' } } }
    })
    await workspace.visit('/inventory/stock')
    let release
    workspace.router.beforeEach(() => new Promise(resolve => { release = resolve }))
    const close = wrapper.get('[data-path="/inventory/stock"]').element.parentElement.querySelector('.navigation-tabs__close')
    close.focus()
    close.click()
    await flushPromises()
    const otherControl = document.createElement('input')
    document.body.append(otherControl)
    otherControl.focus()
    release(true)
    await flushPromises()
    expect(document.activeElement).toBe(otherControl)
    otherControl.remove()
  })
})
