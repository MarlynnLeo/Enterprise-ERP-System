import { afterEach, describe, expect, test, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView, useRoute } from 'vue-router'
import SidebarMenu from '../src/components/layout/SidebarMenu.vue'
import LayoutContent from '../src/components/layout/LayoutContent.vue'
import { resolveMenuNavigationState } from '../src/utils/menuTree'
import { installNavigationErrorHandler } from '../src/utils/navigationError'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key) => key }) }))

const menus = [
  { id: 1, menuIndex: 'production', path: '/production', hasChildren: true, children: [
    { id: 2, menuIndex: 'plan', path: '/production/plan', hasChildren: false },
    { id: 3, menuIndex: 'task', path: '/production/task', hasChildren: false },
    { id: 4, menuIndex: 'broken', path: '/broken', name: 'Broken page', hasChildren: false }
  ] },
  { id: 5, menuIndex: 'inventory', path: '/inventory', hasChildren: true, children: [
    { id: 6, menuIndex: 'stock', path: '/inventory/stock', hasChildren: false }
  ] }
]

let wrapper
afterEach(() => wrapper?.unmount())

async function createHarness() {
  const notify = vi.fn()
  const report = vi.fn()
  const importError = new SyntaxError('The requested date plugin does not provide an export named default')
  let pageRenders = 0
  const businessPage = (name) => defineComponent({
    setup: () => () => {
      pageRenders++
      return h('h1', name)
    }
  })
  const Shell = defineComponent({
    setup() {
      const route = useRoute()
      const mini = ref(false)
      const navigation = computed(() => resolveMenuNavigationState(menus, route.path))
      return () => h('div', [
        h('button', { class: 'toggle-sidebar', onClick: () => { mini.value = !mini.value } }, 'Toggle'),
        h(SidebarMenu, {
          menus,
          activePath: navigation.value.activePath || route.path,
          openChain: navigation.value.openeds,
          mini: mini.value,
          onExpand: () => { mini.value = false },
          onNavigate: (path) => router.push(path).catch(() => {})
        }),
        h(LayoutContent)
      ])
    }
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{
      path: '/', component: Shell, children: [
        { path: '', component: businessPage('Dashboard') },
        { path: 'production/plan', component: businessPage('Production plan') },
        { path: 'production/task', component: businessPage('Production task') },
        { path: 'inventory/stock', component: businessPage('Inventory') },
        { path: 'broken', component: () => Promise.reject(importError) }
      ]
    }]
  })
  installNavigationErrorHandler(router, { notify, report })
  await router.push('/production/plan')
  await router.isReady()
  wrapper = mount(RouterView, {
    global: {
      plugins: [router],
      stubs: {
        'el-main': { template: '<main><slot /></main>' },
        'el-icon': { template: '<span><slot /></span>' }
      }
    }
  })
  return { router, notify, report, importError, pageRenders: () => pageRenders }
}

const clickItem = async (label) => {
  const button = wrapper.findAll('[role="menuitem"]').find((item) => item.text() === label)
  expect(button, label).toBeDefined()
  expect(button.element.closest('li').hidden, label).toBe(false)
  await button.trigger('click')
  await flushPromises()
}

describe('sidebar and route outlet integration', () => {
  test('updates sibling routes, cross-branch navigation, and browser history', async () => {
    const { router, notify } = await createHarness()
    for (const [label, path, heading] of [
      ['menu.productionTask', '/production/task', 'Production task'],
      ['menu.productionPlan', '/production/plan', 'Production plan'],
      ['menu.productionTask', '/production/task', 'Production task']
    ]) {
      await clickItem(label)
      expect(router.currentRoute.value.path).toBe(path)
      expect(wrapper.get('h1').text()).toBe(heading)
      expect(wrapper.get('[aria-current="page"]').text()).toBe(label)
    }
    await clickItem('menu.inventory')
    await clickItem('menu.stock')
    expect(wrapper.get('h1').text()).toBe('Inventory')
    router.back()
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Production task')
    expect(wrapper.get('[aria-current="page"]').text()).toBe('menu.productionTask')
    expect(notify).not.toHaveBeenCalled()
  })

  test('retains navigation after branch and mini cycles without rerendering the business page', async () => {
    const harness = await createHarness()
    const initialRenders = harness.pageRenders()
    await clickItem('menu.production')
    await clickItem('menu.production')
    await wrapper.get('.toggle-sidebar').trigger('click')
    await clickItem('menu.production')
    expect(harness.pageRenders()).toBe(initialRenders)
    await clickItem('menu.productionTask')
    expect(wrapper.get('h1').text()).toBe('Production task')
  })

  test('shows a failed lazy import, keeps the current page, and allows another menu click', async () => {
    const { notify, report, importError } = await createHarness()
    await clickItem('Broken page')
    expect(report).toHaveBeenCalledWith(importError)
    expect(notify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      message: '页面加载失败，请刷新页面后重试', grouping: true
    }))
    expect(wrapper.get('h1').text()).toBe('Production plan')
    await clickItem('menu.productionTask')
    expect(wrapper.get('h1').text()).toBe('Production task')
  })

  test('does not report ordinary navigation cancellation as a load error', async () => {
    const { router, notify } = await createHarness()
    router.beforeEach((to) => to.path !== '/production/task')
    await clickItem('menu.productionTask')
    expect(wrapper.get('h1').text()).toBe('Production plan')
    expect(notify).not.toHaveBeenCalled()
  })
})
