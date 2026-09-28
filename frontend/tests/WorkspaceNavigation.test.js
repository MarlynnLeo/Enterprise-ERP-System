import { afterEach, describe, expect, test, vi } from 'vitest'
import { reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { usePermissionStore } from '../src/stores/permissionStore'
import WorkspaceNavigation from '../src/components/layout/WorkspaceNavigation.vue'
import en from '../src/locales/en'
import ko from '../src/locales/ko'
import zhCN from '../src/locales/zhCN'

const route = reactive({ fullPath: '/production/plan' })
vi.mock('vue-router', () => ({ useRoute: () => route }))

let wrapper
let i18n
const createNavigation = (props = {}) => {
  const pinia = createPinia()
  i18n = createI18n({ legacy: false, locale: 'en', messages: { en, ko, 'zh-CN': zhCN } })
  setActivePinia(pinia)
  usePermissionStore().setMenuTree([
    { id: 1, name: '首页', path: '/', icon: 'House' },
    { id: 2, name: '生产管理', path: '/production', children: [
      { id: 3, name: '生产计划', path: '/production/plan' },
      { id: 4, name: 'Hidden', path: '/production/hidden', visible: 0 }
    ] },
    { id: 5, name: '财务', children: [
      { id: 6, name: '总账', children: [
        { id: 7, name: '凭证', path: '/finance/gl/entries' },
        { id: 8, name: 'Hidden action', path: '/finance/action', type: 2 }
      ] },
      { id: 9, name: '财务自动化', path: '/finance/settings?tab=automation' }
    ] }
  ])
  wrapper = mount(WorkspaceNavigation, {
    attachTo: document.body,
    props,
    global: { plugins: [pinia, i18n], stubs: { 'el-icon': { template: '<span><slot /></span>' } } }
  })
  return wrapper
}
afterEach(() => {
  wrapper?.unmount()
  route.fullPath = '/production/plan'
})

describe('workspace module navigation', () => {
  test('selects the matching module and excludes hidden and action-only menus', () => {
    createNavigation()
    expect(wrapper.get('.workspace-module.is-selected').text()).toBe(en.menu.production)
    expect(wrapper.get('.workspace-panel__menu').text()).toContain(en.menu.productionPlan)
    expect(wrapper.text()).not.toContain('Hidden')
  })

  test('selecting a group expands its context without navigating to a non-page route', async () => {
    createNavigation({ collapsed: true })
    await wrapper.findAll('.workspace-module')[2].trigger('click')
    expect(wrapper.emitted('expand')).toHaveLength(1)
    expect(wrapper.emitted('navigate')).toBeUndefined()
    expect(wrapper.get('.workspace-panel__title').text()).toBe('财务')
    await wrapper.get('input').setValue('entries')
    expect(wrapper.get('.app-menu-link').text()).toBe(en.menu.entries)
    expect(wrapper.get('.app-menu-node[data-depth="1"]').attributes('hidden')).toBeUndefined()
  })

  test('tab or history navigation resynchronizes pathless parent groups and clears the filter', async () => {
    createNavigation()
    await wrapper.get('input').setValue('no match')
    expect(wrapper.text()).toContain(en.workspaceNavigation.noMatches)
    route.fullPath = '/finance/gl/entries'
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.workspace-panel__title').text()).toBe('财务')
    expect(wrapper.get('input').element.value).toBe('')
    expect(wrapper.get('[aria-current="page"]').text()).toBe(en.menu.entries)
  })

  test('preserves query destinations and provides an explicit mobile dismiss control', async () => {
    createNavigation({ mobile: true })
    await wrapper.findAll('.workspace-module')[2].trigger('click')
    await wrapper.get('.app-menu-link').trigger('click')
    expect(wrapper.emitted('navigate')[0]).toEqual(['/finance/settings?tab=automation'])
    await wrapper.get('.workspace-panel__close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  test('removes revoked modules and their visible children after permissions refresh', async () => {
    createNavigation()
    usePermissionStore().setMenuTree([])
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.workspace-module')).toHaveLength(0)
    expect(wrapper.text()).toContain(en.workspaceNavigation.noMenus)
  })

  test('restores focus inside navigation after the focused module is revoked', async () => {
    createNavigation()
    wrapper.get('.workspace-module.is-selected').element.focus()
    usePermissionStore().setMenuTree([{ id: 1, name: '首页', path: '/' }])
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(document.activeElement).toBe(wrapper.get('.workspace-module').element)
  })

  test('query-only navigation selects the specific module and menu with extra query parameters', async () => {
    createNavigation()
    usePermissionStore().setMenuTree([
      { id: 10, name: 'General settings', children: [{ id: 11, name: 'Settings', path: '/finance/settings' }] },
      { id: 20, name: 'Automation', children: [{ id: 21, name: 'Automation rules', path: '/finance/settings?tab=automation' }] }
    ])
    route.fullPath = '/finance/settings'
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.workspace-panel__title').text()).toBe('General settings')
    expect(wrapper.get('[aria-current="page"]').text()).toBe(en.menu.financeSettings)
    route.fullPath = '/finance/settings?page=2&tab=automation#rules'
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.workspace-panel__title').text()).toBe('Automation')
    expect(wrapper.get('[aria-current="page"]').text()).toBe(en.menu.financeAutomation)
    route.fullPath = '/finance/settings?tab=general'
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.workspace-panel__title').text()).toBe('General settings')
  })

  test.each([['en', en], ['ko', ko], ['zh-CN', zhCN]])('updates navigation labels and controls in %s', async (locale, messages) => {
    createNavigation({ mobile: true })
    i18n.global.locale.value = locale
    await wrapper.vm.$nextTick()
    expect(wrapper.attributes('aria-label')).toBe(messages.workspaceNavigation.navigation)
    expect(wrapper.get('.workspace-panel__brand strong').text()).toBe(messages.workspaceNavigation.title)
    expect(wrapper.get('.workspace-panel__close').attributes('aria-label')).toBe(messages.workspaceNavigation.close)
    expect(wrapper.findAll('.workspace-module')[0].text()).toBe(messages.menu.dashboard)
    expect(wrapper.get('input').attributes('placeholder')).toBe(messages.workspaceNavigation.filterPlaceholder)
    expect(wrapper.get('.workspace-panel__section > span').text()).toBe(i18n.global.t('workspaceNavigation.itemCount', { count: 1 }))
  })
})
