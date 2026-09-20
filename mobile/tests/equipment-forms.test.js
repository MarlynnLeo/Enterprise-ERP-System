import { beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { Button, Cell, Field, Picker, RadioGroup, showToast } from 'vant'
import { equipmentApi } from '@/api'
import CreateMaintenance from '@/views/equipment/CreateMaintenance.vue'
import CreateCheck from '@/views/equipment/CreateCheck.vue'
import EquipmentDetail from '@/views/equipment/EquipmentDetail.vue'

const router = vi.hoisted(() => ({ back: vi.fn(), go: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => router, useRoute: () => ({ params: { id: 7 } }) }))
vi.mock('@/api', () => ({ equipmentApi: {
  getList: vi.fn(), addMaintenance: vi.fn(), addInspection: vi.fn(), getById: vi.fn()
} }))
vi.mock('vant', async importOriginal => ({ ...await importOriginal(), showToast: vi.fn() }))

const field = (wrapper, label) => wrapper.findAllComponents(Field).find(component => component.props('label') === label)
const mount = component => shallowMount(component, {
  global: { renderStubDefaultSlot: true, stubs: { 'van-form': false, 'van-cell': false } }
})

describe('equipment form and response contracts', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    equipmentApi.getList.mockResolvedValue({ data: { list: [{ id: 7, code: 'EQ-7', name: '设备甲' }], total: 1 } })
    equipmentApi.addMaintenance.mockResolvedValue({ data: { id: 1 } })
    equipmentApi.addInspection.mockResolvedValue({ data: { id: 1 } })
  })

  const selectMaintenanceEquipment = async wrapper => {
    await flushPromises()
    wrapper.findAllComponents(Cell).find(cell => cell.props('title') === '设备甲').vm.$emit('click')
    await flushPromises()
  }

  test('saves a pending maintenance plan using supported type and camelCase fields', async () => {
    const wrapper = mount(CreateMaintenance)
    try {
      await selectMaintenanceEquipment(wrapper)
      wrapper.findComponent(Picker).vm.$emit('confirm', { selectedOptions: [{ value: 'preventive' }] })
      field(wrapper, '保养人').vm.$emit('update:modelValue', '张工')
      field(wrapper, '预算费用').vm.$emit('update:modelValue', '20.50')
      wrapper.findComponent(Button).vm.$emit('click')
      await flushPromises()
      expect(equipmentApi.addMaintenance).toHaveBeenCalledWith(7, expect.objectContaining({
        maintenanceType: 'preventive', maintenancePerson: '张工', cost: 20.5, status: 'pending'
      }))
      expect(Object.keys(equipmentApi.addMaintenance.mock.calls[0][1]).some(key => key.includes('_'))).toBe(false)
      expect(router.back).toHaveBeenCalledOnce()
    } finally { wrapper.unmount() }
  })

  test.each(['-1', 'NaN', 'Infinity'])('blocks invalid maintenance cost %s', async cost => {
    const wrapper = mount(CreateMaintenance)
    try {
      await selectMaintenanceEquipment(wrapper)
      field(wrapper, '预算费用').vm.$emit('update:modelValue', cost)
      wrapper.findComponent(Button).vm.$emit('click')
      await flushPromises()
      expect(equipmentApi.addMaintenance).not.toHaveBeenCalled()
      expect(showToast).toHaveBeenCalledWith('预算费用必须是大于或等于0的有效数字')
    } finally { wrapper.unmount() }
  })

  test('coalesces double submission while a maintenance save is pending', async () => {
    let complete
    equipmentApi.addMaintenance.mockReturnValueOnce(new Promise(resolve => { complete = resolve }))
    const wrapper = mount(CreateMaintenance)
    try {
      await selectMaintenanceEquipment(wrapper)
      wrapper.findComponent(Button).vm.$emit('click')
      wrapper.findComponent(Button).vm.$emit('click')
      await flushPromises()
      expect(equipmentApi.addMaintenance).toHaveBeenCalledOnce()
      complete({ data: { id: 1 } })
      await flushPromises()
    } finally { wrapper.unmount() }
  })

  test('requires an abnormal finding for a failed inspection and saves canonical fields', async () => {
    const wrapper = mount(CreateCheck)
    try {
      await flushPromises()
      await wrapper.find('.eq-item').trigger('click')
      wrapper.findComponent(RadioGroup).vm.$emit('update:modelValue', 'fail')
      await flushPromises()
      wrapper.findComponent(Button).vm.$emit('click')
      await flushPromises()
      expect(equipmentApi.addInspection).not.toHaveBeenCalled()
      const fields = wrapper.findAllComponents(Field)
      fields[0].vm.$emit('update:modelValue', '检查主轴')
      fields[1].vm.$emit('update:modelValue', '主轴异响')
      wrapper.findComponent(Button).vm.$emit('click')
      await flushPromises()
      expect(equipmentApi.addInspection).toHaveBeenCalledWith(7, {
        inspectionType: 'daily', inspectionItems: '检查主轴', result: 'fail', abnormalItems: '主轴异响'
      })
    } finally { wrapper.unmount() }
  })

  test('shows actual equipment code and inspection dates from the API', async () => {
    equipmentApi.getById.mockResolvedValueOnce({ data: {
      id: 7, code: 'EQ-7', name: '设备甲', status: 'idle',
      purchaseDate: '2026-01-02', inspectionDate: '2026-09-01', nextInspectionDate: '2026-10-01'
    } })
    const wrapper = mount(EquipmentDetail)
    try {
      await flushPromises()
      const values = Object.fromEntries(wrapper.findAllComponents(Cell).map(cell => [cell.props('title'), cell.props('value')]))
      expect(values).toMatchObject({ 设备编码: 'EQ-7', 状态: '闲置', 购置日期: '2026-01-02', 最近点检: '2026-09-01', 下次点检: '2026-10-01' })
    } finally { wrapper.unmount() }
  })
})
