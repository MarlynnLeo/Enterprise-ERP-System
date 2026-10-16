import { defineComponent, nextTick, reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { permission } from '@/directives/permission'

const { getAuth } = vi.hoisted(() => ({ getAuth: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: getAuth }))
let auth
const wrappers = []
const open = (template) => {
  const wrapper = mount(defineComponent({ template }), { global: { directives: { permission } } })
  wrappers.push(wrapper)
  return wrapper.find('button').element
}

beforeEach(() => {
  auth = reactive({
    permissionsLoaded: false,
    permissions: ['sales:orders:create'],
    hasPermission(code) { return this.permissions.includes(code) },
    hasChildPermission() { return false }
  })
  getAuth.mockReturnValue(auth)
})
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

test('permission resolution preserves business disabled state, layout and focus attributes', async () => {
  const button = open('<button v-permission="\'sales:orders:create\'" disabled tabindex="2" style="display: inline-flex; margin: 4px">Save</button>')
  expect(button.style.display).toBe('none')
  auth.permissionsLoaded = true
  await nextTick()
  expect(button.disabled).toBe(true)
  expect(button.tabIndex).toBe(2)
  expect(button.style.display).toBe('inline-flex')
  expect(button.style.margin).toBe('4px')
})

test('permission revocation hides a mounted control without requiring its parent to rerender', async () => {
  auth.permissionsLoaded = true
  const button = open('<button v-permission="\'sales:orders:create\'">Create</button>')
  expect(button.style.display).not.toBe('none')
  auth.permissions = []
  await nextTick()
  expect(button.style.display).toBe('none')
  auth.permissions = ['sales:orders:create']
  await nextTick()
  expect(button.style.display).not.toBe('none')
  expect(button.disabled).toBe(false)
})
