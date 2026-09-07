import { beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { Picker } from 'vant'
import { inventoryApi } from '@/api'
import CreateInbound from '@/views/inventory/CreateInbound.vue'
import CreateOutbound from '@/views/inventory/CreateOutbound.vue'
import CreateTransfer from '@/views/inventory/CreateTransfer.vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ back: vi.fn() }) }))
vi.mock('@/api', () => ({
  inventoryApi: {
    getWarehouses: vi.fn()
  }
}))

describe('mobile inventory warehouse selection', () => {
  beforeEach(() => {
    inventoryApi.getWarehouses.mockResolvedValue({
      data: { data: [{ id: 7, name: '原料仓', code: 'WH-7', type: 'warehouse' }], total: 1 }
    })
  })
  test.each([
    ['inbound', CreateInbound],
    ['outbound', CreateOutbound],
    ['transfer', CreateTransfer],
  ])('makes the real warehouse selectable when creating %s documents', async (_, component) => {
    const wrapper = shallowMount(component, { global: { renderStubDefaultSlot: true } })
    try {
      await flushPromises()
      const warehousePicker = wrapper.findAllComponents(Picker)
        .find((picker) => picker.props('columns').some((option) => option.value === '7'))
      expect(warehousePicker).toBeTruthy()
      expect(warehousePicker.props('columns')).toContainEqual({ text: '原料仓', value: '7' })
    } finally {
      wrapper.unmount()
    }
  })
})
