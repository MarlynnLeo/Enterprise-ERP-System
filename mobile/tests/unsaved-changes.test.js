import { afterEach, expect, test, vi } from 'vitest'
import { defineComponent, reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'

const guards = vi.hoisted(() => ({ leave: vi.fn(), update: vi.fn(), dialog: vi.fn() }))
vi.mock('vue-router', () => ({ onBeforeRouteLeave: guards.leave, onBeforeRouteUpdate: guards.update }))
vi.mock('vant', () => ({ showConfirmDialog: guards.dialog }))
let wrapper
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks() })
const open = (confirm = vi.fn().mockResolvedValue(), options = {}) => {
  const form = reactive({ name: '', items: [{ quantity: 1 }] })
  let control
  wrapper = mount(defineComponent({ setup() {
    control = useUnsavedChanges(form, { confirm, ...options })
    return {}
  }, template: '<div />' }))
  return { form, control, confirm, leave: guards.leave.mock.calls.at(-1)[0] }
}
test('default confirmation survives repeated browser-back attempts by disabling Vant popstate closure', async () => {
  guards.dialog.mockRejectedValueOnce('cancel').mockResolvedValueOnce('confirm')
  const state = open(undefined, { confirm: undefined })
  state.form.name = 'dirty'
  expect(await state.leave()).toBe(false)
  expect(await state.leave()).toBe(true)
  expect(guards.dialog).toHaveBeenCalledTimes(2)
  for (const [options] of guards.dialog.mock.calls) {
    expect(options).toEqual(expect.objectContaining({
      closeOnPopstate: false, confirmButtonText: '放弃更改', cancelButtonText: '继续编辑'
    }))
  }
})
test('nested edits block navigation when discarded confirmation is cancelled', async () => {
  const state = open(vi.fn().mockRejectedValue('cancel'))
  state.form.items[0].quantity = 8
  expect(state.control.dirty.value).toBe(true)
  expect(await state.leave()).toBe(false)
  expect(state.form.items[0].quantity).toBe(8)
})
test('confirmed discard allows navigation; a successful save removes the prompt', async () => {
  const state = open()
  state.form.name = 'changed'
  expect(await state.leave()).toBe(true)
  state.control.markSaved()
  expect(await state.leave()).toBe(true)
  expect(state.confirm).toHaveBeenCalledTimes(1)
})
test('restoring the original value is clean; refresh protection and cleanup follow dirty state', () => {
  const state = open()
  state.form.name = 'changed'
  const dirtyEvent = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(dirtyEvent)
  expect(dirtyEvent.defaultPrevented).toBe(true)
  state.form.name = ''
  expect(state.control.dirty.value).toBe(false)
  const cleanEvent = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(cleanEvent)
  expect(cleanEvent.defaultPrevented).toBe(false)
  state.form.name = 'changed'
  wrapper.unmount()
  const removedEvent = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(removedEvent)
  expect(removedEvent.defaultPrevented).toBe(false)
})
test('overlapping attempts share one confirmation and can retry after cancellation', async () => {
  let reject
  const confirm = vi.fn(() => new Promise((_, no) => { reject = no }))
  const state = open(confirm)
  state.form.name = 'changed'
  const first = state.leave()
  const second = state.control.confirmDiscard()
  await flushPromises()
  expect(confirm).toHaveBeenCalledTimes(1)
  reject('cancel')
  expect(await first).toBe(false)
  expect(await second).toBe(false)
  confirm.mockResolvedValueOnce()
  expect(await state.leave()).toBe(true)
  expect(confirm).toHaveBeenCalledTimes(2)
})
test('saving blocks route leave, route update and unload until it finishes', async () => {
  const busy = ref(true)
  const state = open(undefined, { busy })
  expect(state.control.dirty.value).toBe(false)
  expect(await state.leave()).toBe(false)
  expect(await guards.update.mock.calls[0][0]()).toBe(false)
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  expect(state.confirm).not.toHaveBeenCalled()
  busy.value = false
  expect(await state.leave()).toBe(true)
})
test('markSaved only acknowledges the submitted snapshot, not later edits', () => {
  const state = open()
  state.form.name = 'submitted'
  const submitted = JSON.parse(JSON.stringify(state.form))
  state.form.name = 'changed while waiting'
  state.control.markSaved(submitted)
  expect(state.control.dirty.value).toBe(true)
  state.form.name = 'submitted'
  expect(state.control.dirty.value).toBe(false)
})
test('a pending discard confirmation cannot release a newly busy or unmounted form', async () => {
  const busy = ref(false)
  let resolve
  const state = open(() => new Promise(done => { resolve = done }), { busy })
  state.form.name = 'dirty'
  const leave = state.leave()
  await flushPromises()
  busy.value = true
  resolve()
  expect(await leave).toBe(false)
  busy.value = false
  const next = state.leave()
  await flushPromises()
  wrapper.unmount()
  resolve()
  expect(await next).toBe(false)
})
