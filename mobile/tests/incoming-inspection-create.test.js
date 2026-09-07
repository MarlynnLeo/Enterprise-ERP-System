import { beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { Button, Cell, Field, Form, Picker, Search, showToast } from 'vant'
import { purchaseApi, qualityApi } from '@/api'
import CreateIncoming from '@/views/quality/CreateIncoming.vue'

const router = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => router }))
vi.mock('@/api', () => ({
  purchaseApi: { getOrders: vi.fn(), getOrder: vi.fn() },
  qualityApi: { getInspectionTemplates: vi.fn(), createIncomingInspection: vi.fn() }
}))
vi.mock('vant', async importOriginal => ({
  ...await importOriginal(), showToast: vi.fn(), showLoadingToast: vi.fn(), closeToast: vi.fn()
}))

const order = {
  id: 7, orderNo: 'PO-7', status: 'approved', supplierId: 3, supplierName: '供应商甲',
  items: [{ id: 70, materialId: 5, materialCode: 'RM-5', materialName: '原料甲', unitId: 1, unitName: '件', quantity: 10 }]
}
const field = (wrapper, label) => wrapper.findAllComponents(Field).find(component => component.props('label') === label)
const picker = (wrapper, title) => wrapper.findAllComponents(Picker).find(component => component.props('title') === title)
const selectSource = async wrapper => {
  field(wrapper, '采购订单').vm.$emit('click')
  await flushPromises()
  wrapper.findAllComponents(Cell).find(component => component.props('title') === order.orderNo).vm.$emit('click')
  await flushPromises()
  picker(wrapper, '选择订单物料').vm.$emit('confirm', { selectedOptions: [{ value: '70' }] })
  await flushPromises()
}
const submit = async wrapper => {
  field(wrapper, '批次号').vm.$emit('update:modelValue', 'BATCH-7')
  wrapper.findComponent(Form).vm.$emit('submit')
  await flushPromises()
}

describe('mobile incoming inspection source and template contract', () => {
  beforeEach(() => {
    purchaseApi.getOrders.mockReset().mockResolvedValue({ data: { data: [order, { id: 8, orderNo: 'PO-DRAFT', status: 'draft' }], total: 2 } })
    purchaseApi.getOrder.mockReset().mockResolvedValue({ data: order })
    qualityApi.getInspectionTemplates.mockReset().mockResolvedValue({ data: { data: [{ id: 9, templateName: '原料来料检验', inspectionItems: [{ id: 1 }] }], total: 1 } })
    qualityApi.createIncomingInspection.mockReset().mockResolvedValue({ data: { id: 20 } })
    router.replace.mockReset()
    showToast.mockClear()
  })

  test('offers valid source orders and preserves their material/supplier/template IDs in a camelCase submission', async () => {
    const wrapper = shallowMount(CreateIncoming, { global: { renderStubDefaultSlot: true } })
    try {
      await selectSource(wrapper)
      expect(wrapper.findAllComponents(Cell).map(component => component.props('title'))).toEqual(['PO-7'])
      expect(field(wrapper, '供应商').props('modelValue')).toBe('供应商甲')
      expect(field(wrapper, '物料名称').props('modelValue')).toBe('原料甲')
      expect(field(wrapper, '检验模板').props('modelValue')).toBe('原料来料检验')
      expect(qualityApi.getInspectionTemplates).toHaveBeenCalledWith(expect.objectContaining({ inspectionType: 'incoming', status: 'active', materialType: 5, includeGeneral: true }))
      wrapper.findAllComponents(Picker).find(component => !component.props('title')).vm.$emit('confirm', { selectedOptions: [{ value: 'full' }] })
      await submit(wrapper)
      expect(qualityApi.createIncomingInspection).toHaveBeenCalledOnce()
      expect(qualityApi.createIncomingInspection).toHaveBeenCalledWith(expect.objectContaining({
        inspectionType: 'incoming', sourceType: 'purchase_order', referenceId: 7, referenceNo: 'PO-7',
        materialId: 5, supplierId: 3, productName: '原料甲', quantity: 10, unit: '件', unitId: 1,
        templateId: 9, batchNo: 'BATCH-7', isFullInspection: true, status: 'pending'
      }))
      expect(Object.keys(qualityApi.createIncomingInspection.mock.calls[0][0]).some(key => key.includes('_'))).toBe(false)
      expect(router.replace).toHaveBeenCalledWith('/quality/incoming')
    } finally { wrapper.unmount() }
  })

  test.each(['-1', '0', 'NaN', 'Infinity'])('blocks invalid quantity %s before writing an inspection', async quantity => {
    const wrapper = shallowMount(CreateIncoming, { global: { renderStubDefaultSlot: true } })
    try {
      await selectSource(wrapper)
      field(wrapper, '到货数量').vm.$emit('update:modelValue', quantity)
      await submit(wrapper)
      expect(qualityApi.createIncomingInspection).not.toHaveBeenCalled()
      expect(showToast).toHaveBeenCalledWith('到货数量必须是大于0的有效数字')
    } finally { wrapper.unmount() }
  })

  test('blocks submission without an actual source order', async () => {
    const wrapper = shallowMount(CreateIncoming, { global: { renderStubDefaultSlot: true } })
    try {
      await submit(wrapper)
      expect(qualityApi.createIncomingInspection).not.toHaveBeenCalled()
      expect(showToast).toHaveBeenCalledWith('请选择采购订单')
    } finally { wrapper.unmount() }
  })

  test('replaces an in-flight source search and keeps pagination on the submitted keyword', async () => {
    let resolveOld
    const old = new Promise(resolve => { resolveOld = resolve })
    const newOrders = Array.from({ length: 50 }, (_, index) => ({ id: 100 + index, orderNo: 'PO-NEW-' + index, status: 'approved' }))
    purchaseApi.getOrders.mockReset().mockReturnValueOnce(old)
      .mockResolvedValueOnce({ data: { data: newOrders, total: 51 } })
      .mockResolvedValueOnce({ data: { data: [], total: 51 } })
    const wrapper = shallowMount(CreateIncoming, { global: { renderStubDefaultSlot: true } })
    try {
      field(wrapper, '采购订单').vm.$emit('click')
      const search = wrapper.findComponent(Search)
      search.vm.$emit('update:modelValue', 'PO-NEW')
      search.vm.$emit('search')
      await flushPromises()
      expect(purchaseApi.getOrders).toHaveBeenCalledTimes(2)
      resolveOld({ data: { data: [order], total: 1 } })
      await flushPromises()
      expect(wrapper.findAllComponents(Cell).map(component => component.props('title'))).toEqual(newOrders.map(item => item.orderNo))
      search.vm.$emit('update:modelValue', 'NOT-SUBMITTED')
      wrapper.findAllComponents(Button).find(component => component.text() === '加载更多').vm.$emit('click')
      await flushPromises()
      expect(purchaseApi.getOrders).toHaveBeenLastCalledWith({ page: 2, pageSize: 50, keyword: 'PO-NEW' })
    } finally { wrapper.unmount() }
  })

  test('does not invent inspection items when no active applicable template exists', async () => {
    qualityApi.getInspectionTemplates.mockResolvedValue({ data: { data: [], total: 0 } })
    const wrapper = shallowMount(CreateIncoming, { global: { renderStubDefaultSlot: true } })
    try {
      await selectSource(wrapper)
      await submit(wrapper)
      expect(qualityApi.createIncomingInspection).not.toHaveBeenCalled()
      expect(showToast).toHaveBeenCalledWith('请选择有效的检验模板')
    } finally { wrapper.unmount() }
  })

  test('clears the previous material and template if selecting a new source fails', async () => {
    const wrapper = shallowMount(CreateIncoming, { global: { renderStubDefaultSlot: true } })
    try {
      await selectSource(wrapper)
      purchaseApi.getOrder.mockRejectedValueOnce(new Error('源单已失效'))
      wrapper.findAllComponents(Cell)[0].vm.$emit('click')
      await flushPromises()
      expect(field(wrapper, '物料名称').props('modelValue')).toBe('')
      expect(field(wrapper, '检验模板').props('modelValue')).toBe('')
      await submit(wrapper)
      expect(qualityApi.createIncomingInspection).not.toHaveBeenCalled()
    } finally { wrapper.unmount() }
  })
})
