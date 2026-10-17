import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { Form } from 'vant'
import CreateRequisition from '@/views/purchase/CreateRequisition.vue'

const mocks = vi.hoisted(() => ({ create: vi.fn(), toast: vi.fn(), back: vi.fn(), leave: vi.fn(), update: vi.fn() }))
vi.mock('@/api', () => ({ purchaseApi: { createRequisition: mocks.create }, baseDataApi: { getMaterials: async () => ({ data: [] }) } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ back: mocks.back }), onBeforeRouteLeave: mocks.leave, onBeforeRouteUpdate: mocks.update }))
vi.mock('vant', async original => ({ ...await original(), showToast: mocks.toast }))
let wrapper
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset())
  mocks.create.mockResolvedValue({ data: { id: 7 } })
  wrapper = shallowMount(CreateRequisition, { global: { renderStubDefaultSlot: true } })
  wrapper.vm.form.requester = '申请人'
  wrapper.vm.form.items[0] = { materialId: 8, materialName: '物料', materialCode: 'M8', quantity: 2, requiredDate: '' }
})
afterEach(() => { wrapper?.unmount(); vi.useRealTimers() })

test('pending request blocks edits, leaving and duplicate submission, then navigates once immediately', async () => {
  vi.useFakeTimers()
  let finish
  mocks.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const save = wrapper.vm.onSubmit()
  await flushPromises()
  expect(wrapper.findComponent(Form).props('disabled')).toBe(true)
  expect(wrapper.attributes()).toHaveProperty('inert')
  expect(await mocks.leave.mock.calls[0][0]()).toBe(false)
  expect(await mocks.update.mock.calls[0][0]()).toBe(false)
  wrapper.vm.addItem()
  wrapper.vm.removeItem(0)
  await wrapper.vm.openMaterialPicker(0)
  expect(wrapper.vm.form.items).toHaveLength(1)
  expect(wrapper.vm.showMaterialPicker).toBe(false)
  await wrapper.vm.onSubmit()
  expect(mocks.create).toHaveBeenCalledTimes(1)
  finish({ data: { id: 7 } })
  await save
  expect(mocks.back).toHaveBeenCalledTimes(1)
  expect(await mocks.leave.mock.calls[0][0]()).toBe(true)
  await wrapper.vm.onSubmit()
  expect(mocks.create).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(2000)
  expect(mocks.back).toHaveBeenCalledTimes(1)
})
test('failure retains editable input and allows a successful retry', async () => {
  mocks.create.mockRejectedValueOnce(new Error('offline'))
  wrapper.vm.form.remarks = '保留原因'
  await wrapper.vm.onSubmit()
  expect(wrapper.vm.form.remarks).toBe('保留原因')
  expect(wrapper.vm.submitting).toBe(false)
  expect(wrapper.vm.submitted).toBe(false)
  expect(mocks.back).not.toHaveBeenCalled()
  await wrapper.vm.onSubmit()
  expect(mocks.create).toHaveBeenCalledTimes(2)
  expect(mocks.back).toHaveBeenCalledTimes(1)
})
test('a late result after unmount cannot navigate or display success', async () => {
  let finish
  mocks.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const save = wrapper.vm.onSubmit()
  wrapper.unmount()
  finish({ data: { id: 7 } })
  await save
  expect(mocks.back).not.toHaveBeenCalled()
  expect(mocks.toast).not.toHaveBeenCalled()
})
