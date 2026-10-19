import { flushPromises, shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Field, Form, Picker } from 'vant'
import CreateInbound from '@/views/inventory/CreateInbound.vue'

const state = vi.hoisted(() => ({ api: { getWarehouses: vi.fn(), createInbound: vi.fn() } }))
vi.mock('@/api', () => ({ inventoryApi: state.api }))
vi.mock('vue-router', () => ({ useRouter: () => ({ back: vi.fn() }) }))
vi.mock('vant', async original => ({ ...await original(), showToast: vi.fn() }))
let wrapper
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  state.api.getWarehouses.mockResolvedValue({ data: [{ id: 8, name: '材料仓' }] })
  state.api.createInbound.mockResolvedValue({ data: { id: 10 } })
})
afterEach(() => { wrapper?.unmount(); vi.clearAllTimers(); vi.useRealTimers() })

test('submits a valid warehouse and item without a client-supplied audit operator', async () => {
  wrapper = shallowMount(CreateInbound, { global: { renderStubDefaultSlot: true } })
  await flushPromises()
  const warehouse = wrapper.findAllComponents(Picker).find(component => component.props('columns').some(option => option.value === '8'))
  warehouse.vm.$emit('confirm', { selectedOptions: [{ value: '8', text: '材料仓' }] })
  wrapper.vm.$.setupState.form.items = [{ materialId: 7, materialName: '螺栓', quantity: '', unitId: 1 }]
  await flushPromises()
  wrapper.findAllComponents(Field).find(component => component.props('label') === '入库数量').vm.$emit('update:modelValue', '2')
  let resolveSave
  const pending = new Promise(resolve => { resolveSave = resolve })
  state.api.createInbound.mockReturnValueOnce(pending)
  wrapper.findComponent(Form).vm.$emit('submit')
  wrapper.findComponent(Form).vm.$emit('submit')
  await flushPromises()
  expect(state.api.createInbound).toHaveBeenCalledOnce()
  const payload = state.api.createInbound.mock.calls[0][0]
  expect(payload).not.toHaveProperty('operator')
  expect(payload).toEqual(expect.objectContaining({ inboundType: 'other', status: 'draft', locationId: 8,
    items: [{ materialId: 7, quantity: 2, unitId: 1, locationId: 8 }] }))
  resolveSave({ data: { id: 10 } })
  await flushPromises()
})
