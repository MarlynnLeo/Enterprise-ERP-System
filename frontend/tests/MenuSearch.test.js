import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElInput } from 'element-plus'
import MenuSearch from '@/components/common/MenuSearch.vue'
import { usePermissionStore } from '@/stores/permissionStore'

vi.mock('@/utils/logger', () => ({ default: { warn: vi.fn() } }))

const Dialog = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue', 'opened'],
  template: '<section v-if="modelValue"><slot /></section>'
})
const menus = [1, 2, 3].map(id => ({ id, name: `Menu ${id}`, path: `/menu/${id}` }))
let wrapper, router, permissions, push

beforeEach(async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  permissions = usePermissionStore()
  permissions.setMenuTree(menus)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }]
  })
  await router.push('/')
  push = vi.spyOn(router, 'push')
  wrapper = mount(MenuSearch, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router],
      components: { ElInput },
      stubs: { AppDialog: Dialog, EmptyState: true, 'el-icon': { template: '<span><slot /></span>' } }
    }
  })
  await wrapper.get('.search-trigger').trigger('click')
})

afterEach(() => {
  wrapper.unmount()
  document.body.innerHTML = ''
})

const search = async (query = 'Menu') => {
  await wrapper.get('input').setValue(query)
  return wrapper.get('input')
}

describe('menu search keyboard and navigation lifecycle', () => {
  test('normalizes whitespace and connects active results to the search input', async () => {
    const input = await search('  MENU  ')
    expect(wrapper.findAll('[role="option"]')).toHaveLength(3)
    expect(input.attributes('role')).toBe('combobox')
    expect(input.attributes('aria-controls')).toBe(wrapper.get('[role="listbox"]').attributes('id'))
    expect(input.attributes('aria-activedescendant')).toBe(wrapper.get('[aria-selected="true"]').attributes('id'))
    await input.setValue('   ')
    expect(wrapper.findAll('[role="option"]')).toHaveLength(0)
    expect(input.attributes('aria-activedescendant')).toBeUndefined()
  })

  test('leaves IME Enter and arrow events available to the composition candidate list', async () => {
    const input = await search()
    for (const options of [{ key: 'Enter', isComposing: true }, { key: 'ArrowDown', isComposing: true }, { key: 'Enter', keyCode: 229 }]) {
      const event = new KeyboardEvent('keydown', { ...options, bubbles: true, cancelable: true })
      input.element.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(push).not.toHaveBeenCalled()
    expect(wrapper.get('[aria-selected="true"]').text()).toContain('Menu 1')
  })

  test('scrolls the newly selected local result after rendering', async () => {
    const input = await search()
    const unrelated = document.createElement('div')
    unrelated.className = 'result-item active'
    unrelated.scrollIntoView = vi.fn()
    document.body.prepend(unrelated)
    const options = wrapper.findAll('[role="option"]')
    for (const option of options) option.element.scrollIntoView = vi.fn()
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(options[1].element.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    expect(options[0].element.scrollIntoView).not.toHaveBeenCalled()
    expect(unrelated.scrollIntoView).not.toHaveBeenCalled()
  })

  test('resets selection when permission changes shorten or remove the result list', async () => {
    const input = await search()
    for (const option of wrapper.findAll('[role="option"]')) option.element.scrollIntoView = vi.fn()
    await input.trigger('keydown', { key: 'ArrowUp' })
    permissions.setMenuTree([menus[0]])
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[aria-selected="true"]').text()).toContain('Menu 1')
    permissions.setMenuTree([])
    await input.trigger('keydown', { key: 'Enter' })
    expect(push).not.toHaveBeenCalled()
  })

  test('keeps the search open after an aborted navigation and supports retry', async () => {
    router.beforeEach(() => false)
    const input = await search()
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(wrapper.find('input').exists()).toBe(true)
    expect(router.currentRoute.value.path).toBe('/')
    expect(wrapper.get('.search-results').attributes('aria-busy')).toBe('false')
  })

  test('shows navigation errors without losing the query, then closes after a successful retry', async () => {
    push.mockRejectedValueOnce(new Error('chunk failed'))
    const input = await search()
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('无法打开菜单，请重试')
    expect(input.element.value).toBe('Menu')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/menu/1')
    expect(wrapper.find('input').exists()).toBe(false)
  })

  test('ignores a pending selection after closing and reopening the search', async () => {
    let resolve
    push.mockReturnValueOnce(new Promise(accept => { resolve = accept }))
    const input = await search()
    await input.trigger('keydown', { key: 'Enter' })
    await input.trigger('keydown', { key: 'Enter' })
    expect(push).toHaveBeenCalledTimes(1)
    wrapper.findComponent(Dialog).vm.$emit('update:modelValue', false)
    await wrapper.vm.$nextTick()
    await wrapper.get('.search-trigger').trigger('click')
    await search('Menu 2')
    resolve()
    await flushPromises()
    expect(wrapper.get('input').element.value).toBe('Menu 2')
  })

  test('recognizes uppercase shortcut keys and removes the global shortcut on unmount', async () => {
    wrapper.findComponent(Dialog).vm.$emit('update:modelValue', false)
    await wrapper.vm.$nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'K', cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('input').exists()).toBe(true)
    wrapper.unmount()
    const event = new KeyboardEvent('keydown', { ctrlKey: true, key: 'K', cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})
