import { defineComponent, h, KeepAlive, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import { useInspectionDeepLink } from '@/composables/useInspectionDeepLink'
let wrapper
const setup = (query = {}) => {
  const currentRoute = ref({ path: '/quality/incoming', query })
  const visible = ref(true)
  const open = vi.fn()
  const Page = defineComponent({ setup() { useInspectionDeepLink({ currentRoute }, '/quality/incoming', open); return () => h('div') } })
  wrapper = mount(defineComponent({ setup: () => () => h(KeepAlive, null, { default: () => visible.value ? h(Page) : null }) }))
  return { currentRoute, visible, open }
}
afterEach(() => wrapper?.unmount())
test('mount and initial KeepAlive activation open the requested inspection exactly once', async () => {
  const { open } = setup({ inspectionId: '71' })
  await flushPromises()
  expect(open).toHaveBeenCalledExactlyOnceWith({ id: 71 })
})
test('same page query navigation opens the newly requested inspection', async () => {
  const { currentRoute, open } = setup({ inspectionId: '71' })
  await flushPromises()
  currentRoute.value = { path: '/quality/incoming', query: { inspectionId: '72' } }
  await flushPromises()
  expect(open.mock.calls).toEqual([[{ id: 71 }], [{ id: 72 }]])
})
test('cached inactive page ignores another page and opens only its own route on return', async () => {
  const { currentRoute, visible, open } = setup({ inspectionId: '71' })
  await flushPromises()
  visible.value = false
  currentRoute.value = { path: '/quality/final', query: { inspectionId: '99' } }
  await flushPromises()
  expect(open).toHaveBeenCalledTimes(1)
  currentRoute.value = { path: '/quality/incoming', query: { inspectionId: '72' } }
  visible.value = true
  await flushPromises()
  expect(open.mock.calls).toEqual([[{ id: 71 }], [{ id: 72 }]])
})
test('invalid IDs and unrelated query changes do not open a document', async () => {
  const { currentRoute, open } = setup({ inspectionId: '-1' })
  await flushPromises()
  currentRoute.value = { path: '/quality/incoming', query: { inspectionId: 'abc' } }
  await flushPromises()
  expect(open).not.toHaveBeenCalled()
})
