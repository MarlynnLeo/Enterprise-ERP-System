import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { Button } from 'vant'
import Requisitions from '@/views/purchase/Requisitions.vue'
import RequisitionDetail from '@/views/purchase/RequisitionDetail.vue'

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), toast: vi.fn(), confirm: vi.fn(), push: vi.fn() }))
vi.mock('@/api/client', () => ({ default: { get: mocks.get, put: mocks.put } }))
vi.mock('@/api/modules/baseData', () => ({ baseDataApi: {} }))
vi.mock('@/api', async () => ({ purchaseApi: (await import('@/api/modules/purchase')).purchaseApi }))
vi.mock('vant', async original => ({ ...await original(), showToast: mocks.toast, showConfirmDialog: mocks.confirm }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '42' } }),
  useRouter: () => ({ push: mocks.push, back: vi.fn() }),
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasPermission: () => true }) }))

let wrapper
let requisition
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset())
  requisition = {
    id: 42, requisitionNumber: 'PR-42', status: 'draft',
    materials: [{ materialCode: 'MAT-8', quantity: 2, unit: '件' }],
  }
  mocks.get.mockImplementation(async url => ({ data: url.endsWith('/42')
    ? structuredClone(requisition)
    : { list: [structuredClone(requisition)], total: 1 } }))
  mocks.put.mockImplementation(async () => {
    Object.assign(requisition, { status: 'completed', isFullyOrdered: true })
    return { data: { ...requisition, generatedOrders: [{ orderNo: 'PO-42' }] } }
  })
})
afterEach(() => wrapper?.unmount())

async function open(component) {
  wrapper = shallowMount(component, {
    global: { renderStubDefaultSlot: true, directives: { permission: () => {} } },
  })
  await flushPromises()
}
async function clickSubmit(label = '提交并生成采购订单') {
  const button = wrapper.findAllComponents(Button).find(item => item.text() === label)
  expect(button).toBeDefined()
  await button.trigger('click')
  await flushPromises()
}

test.each(['draft', 'submitted', 'pending', 'approved', 'rejected'])('mobile %s detail submits directly and shows generated orders', async status => {
  requisition.status = status
  await open(RequisitionDetail)
  expect(wrapper.text()).not.toMatch(/审批|审核|拒绝|退回草稿/)
  expect(wrapper.findAll('.item-card')).toHaveLength(1)
  await clickSubmit()
  expect(mocks.put).toHaveBeenCalledExactlyOnceWith('/purchase/requisitions/42/status', { newStatus: 'submitted' })
  expect(mocks.confirm).not.toHaveBeenCalled()
  expect(mocks.toast).toHaveBeenCalledWith('已提交并生成采购订单')
  expect(wrapper.text()).toContain('已生成订单')
  expect(wrapper.text()).not.toContain('提交并生成采购订单')
})

test('mobile list refreshes the completed state and exposes generated orders', async () => {
  requisition.status = 'rejected'
  await open(Requisitions)
  expect(wrapper.text()).not.toMatch(/审批|审核|拒绝|退回草稿/)
  await clickSubmit()
  expect(mocks.put).toHaveBeenCalledExactlyOnceWith('/purchase/requisitions/42/status', { newStatus: 'submitted' })
  expect(mocks.confirm).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('已生成订单')
  expect(wrapper.text()).toContain('查看订单')
  expect(wrapper.text()).not.toContain('提交并生成采购订单')
  expect(mocks.get).toHaveBeenCalledTimes(2)
})

test('mobile detail keeps a failed application available for retry', async () => {
  mocks.put.mockRejectedValueOnce({ response: { data: { message: '物料未设置供应商' } } })
  await open(RequisitionDetail)
  await clickSubmit()
  expect(mocks.toast).toHaveBeenCalledWith('物料未设置供应商')
  expect(wrapper.text()).toContain('提交并生成采购订单')
  await clickSubmit()
  expect(mocks.put).toHaveBeenCalledTimes(2)
})

test('mobile detail prevents duplicate submissions and supports remaining order quantities', async () => {
  Object.assign(requisition, { status: 'submitted', isPartiallyOrdered: true })
  await open(RequisitionDetail)
  expect(wrapper.text()).toContain('生成剩余订单')
  let finish
  mocks.put.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const first = wrapper.vm.handleSubmit()
  await wrapper.vm.handleSubmit()
  expect(mocks.put).toHaveBeenCalledTimes(1)
  finish({ data: {} })
  await first
  expect(wrapper.vm.actionLoading).toBe(false)
})
