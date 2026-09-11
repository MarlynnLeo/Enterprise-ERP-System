import { afterEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useI18n } from 'vue-i18n'
import SidebarMenu from '../src/components/layout/SidebarMenu.vue'

vi.mock('vue-i18n', async () => {
  const { ref } = await import('vue')
  const locale = ref('zh')
  const t = vi.fn((key) => locale.value + ':' + key)
  return { useI18n: () => ({ t, locale }) }
})

const menus = [
  { id: 1, menuIndex: 'finance', path: '/finance', hasChildren: true, children: [
    { id: 2, menuIndex: 'gl', name: '总账', hasChildren: true, children: [
      { id: 3, menuIndex: 'entries', path: '/finance/gl/entries', name: '凭证', hasChildren: false }
    ] }
  ] },
  { id: 4, menuIndex: 'production', path: '/production', hasChildren: true, children: [
    { id: 5, menuIndex: 'plan', path: '/production/plan', name: '计划', hasChildren: false }
  ] }
]

let wrapper
const mountMenu = (props = {}) => (wrapper = mount(SidebarMenu, {
  props: { menus, ...props },
  global: { stubs: { 'el-icon': { template: '<span><slot /></span>' } } }
}))
const branch = (index) => wrapper.findAll('.app-menu-title')[index]

afterEach(() => {
  wrapper?.unmount()
  useI18n().locale.value = 'zh'
  vi.clearAllMocks()
})

describe('sidebar interaction isolation', () => {
  test('keeps branch state local and reuses mounted descendants', async () => {
    mountMenu()
    expect(wrapper.findAll('.app-menu-node')).toHaveLength(2)
    await branch(0).trigger('click')
    await branch(1).trigger('click')
    const link = wrapper.get('.app-menu-link').element
    await branch(0).trigger('click')
    expect(link.parentElement.hidden).toBe(true)
    expect(link.getAttribute('tabindex')).toBe('-1')
    await branch(0).trigger('click')
    await branch(1).trigger('click')
    expect(wrapper.get('.app-menu-link').element).toBe(link)
    expect(link.parentElement.hidden).toBe(false)
    expect(wrapper.emitted('toggle')).toBeUndefined()
  })

  test('does not translate all labels again for branch and mini toggles', async () => {
    mountMenu()
    const { t, locale } = useI18n()
    t.mockClear()
    await branch(0).trigger('click')
    await branch(0).trigger('click')
    await wrapper.setProps({ mini: true })
    expect(t).not.toHaveBeenCalled()
    locale.value = 'en'
    await nextTick()
    expect(t).toHaveBeenCalled()
    expect(wrapper.text()).toContain('en:menu.finance')
  })

  test('synchronizes ancestors on navigation and exposes the active page', async () => {
    mountMenu({ openChain: ['finance', 'gl'], activePath: '/finance/gl/entries' })
    expect(wrapper.get('[aria-current="page"]').attributes('tabindex')).toBe('0')
    await wrapper.setProps({ openChain: ['production'], activePath: '/production/plan' })
    expect(wrapper.get('[aria-current="page"]').text()).toBe('zh:menu.productionPlan')
    expect(wrapper.findAll('.app-menu-node[hidden]').length).toBeGreaterThan(0)
  })

  test('opens the selected branch when clicked in mini mode', async () => {
    mountMenu({ mini: true })
    await branch(0).trigger('click')
    expect(wrapper.emitted('expand')).toHaveLength(1)
    await wrapper.setProps({ mini: false })
    expect(branch(0).attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('.app-menu-node:not([hidden])')).toHaveLength(3)
  })

  test('refreshes a retained node handler when its route changes', async () => {
    mountMenu({ openChain: ['production'] })
    const updated = structuredClone(menus)
    updated[1].children[0].path = '/production/new-plan'
    await wrapper.setProps({ menus: updated })
    await wrapper.get('.app-menu-link').trigger('click')
    expect(wrapper.emitted('navigate')).toEqual([['/production/new-plan']])
  })

  test('a branch click does not render its parent or a sibling business page', async () => {
    let parentRenders = 0
    const unrelated = ref(0)
    const Host = defineComponent({
      setup: () => () => {
        parentRenders++
        return h('div', [h(SidebarMenu, { menus }), h('main', String(unrelated.value))])
      }
    })
    wrapper = mount(Host, { global: { stubs: { 'el-icon': true } } })
    await wrapper.find('.app-menu-title').trigger('click')
    expect(parentRenders).toBe(1)
  })
})
