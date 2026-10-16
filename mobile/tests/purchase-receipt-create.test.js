import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { Checkbox, showToast } from 'vant'
import { inventoryApi, purchaseApi } from '@/api'
import { purchaseApi as receiptTransport } from '@/api/modules/purchase'
import api from '@/api/client'
import CreateReceipt from '@/views/purchase/CreateReceipt.vue'

const session = vi.hoisted(() => ({ route: { query: {} }, back: vi.fn(), validate: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => session.route, useRouter: () => ({ back: session.back }) }))
vi.mock('@/api', () => ({
  purchaseApi: { getOrders: vi.fn(), getOrder: vi.fn(), createReceipt: vi.fn() },
  inventoryApi: { getWarehouses: vi.fn() }
}))
vi.mock('@/api/client', () => ({ default: { post: vi.fn() } }))
vi.mock('vant', async importOriginal => ({
  ...await importOriginal(), showToast: vi.fn(), showLoadingToast: vi.fn(), closeToast: vi.fn()
}))

const order = (id = 7, overrides = {}) => ({
  id, orderNo: `PO-${id}`, status: 'approved', supplierId: 3, supplierName: '供应商甲',
  items: [70, 71].map(lineId => ({ id: lineId, materialId: 5, materialName: '原料甲',
    unitId: 1, unitName: '件', quantity: 10, receivedQuantity: 2, unitPrice: null })), ...overrides
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}
let wrapper
async function open() {
  wrapper = shallowMount(CreateReceipt, { global: {
    renderStubDefaultSlot: true,
    stubs: { VanForm: { template: '<form><slot /></form>', methods: { validate: () => session.validate() } } }
  } })
  await flushPromises()
  return wrapper
}
async function choose(id = 7) {
  wrapper.vm.selectOrder({ id })
  await wrapper.vm.confirmOrder()
  await flushPromises()
}
async function fill() {
  await choose()
  wrapper.vm.selectWarehouse({ id: 4, name: '原料仓' })
  wrapper.vm.confirmWarehouse()
  const checkbox = wrapper.findAllComponents(Checkbox)[1]
  checkbox.vm.$emit('update:modelValue', true)
  checkbox.vm.$emit('change', true)
  await flushPromises()
  wrapper.vm.receiptItems[1].batchNumber = 'BATCH-7'
}

beforeEach(() => {
  session.route.query = {}
  session.validate.mockReset().mockResolvedValue(undefined)
  session.back.mockClear()
  purchaseApi.getOrders.mockReset().mockResolvedValue({ data: { data: [order(), order(8, { status: 'draft' })], total: 2 } })
  purchaseApi.getOrder.mockReset().mockImplementation(async id => ({ data: order(Number(id)) }))
  purchaseApi.createReceipt.mockReset().mockResolvedValue({ data: { id: 22 } })
  inventoryApi.getWarehouses.mockReset().mockResolvedValue({ data: [{ id: 4, name: '原料仓' }] })
  showToast.mockClear()
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined })

describe('mobile receipt creation source and write contracts', () => {
  test('loads approved orders from the paginated envelope and opens query order outside the loaded page', async () => {
    session.route.query = { orderId: '93' }
    await open()
    expect(wrapper.vm.orderList.map(item => item.id)).toEqual([7])
    expect(purchaseApi.getOrder).toHaveBeenCalledWith('93')
    expect(wrapper.vm.receiptForm.orderId).toBe(93)
  })

  test('submits one exact order line, supplier, zero pending-inspection qualified quantity and a stable key', async () => {
    await open()
    await fill()
    await wrapper.vm.submitForm()
    expect(purchaseApi.createReceipt).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 7, supplierId: 3, warehouseId: 4,
      idempotencyKey: expect.stringMatching(/^purchase-receipt:/),
      items: [{ orderItemId: 71, materialId: 5, unitId: 1, receivedQuantity: 8,
        qualifiedQuantity: 0, batchNumber: 'BATCH-7', remarks: '' }]
    }))
    expect(session.back).toHaveBeenCalledOnce()
  })

  test('selecting another order line clears the earlier selection even for the same material', async () => {
    await open()
    await fill()
    const checkbox = wrapper.findAllComponents(Checkbox)[0]
    checkbox.vm.$emit('update:modelValue', true)
    checkbox.vm.$emit('change', true)
    await flushPromises()
    expect(wrapper.vm.selectedItems.map(item => item.orderItemId)).toEqual([70])
  })

  test('failed or empty source changes never keep a previous order line available for submission', async () => {
    await open()
    await fill()
    purchaseApi.getOrder.mockRejectedValueOnce(new Error('订单无权访问'))
    await choose(9)
    expect(wrapper.vm.receiptItems).toEqual([])
    expect(wrapper.vm.receiptForm.orderId).toBe('')
    await wrapper.vm.submitForm()
    expect(purchaseApi.createReceipt).not.toHaveBeenCalled()
    purchaseApi.getOrder.mockResolvedValueOnce({ data: order(10, { items: [] }) })
    await choose(10)
    expect(wrapper.vm.receiptItems).toEqual([])
  })

  test('ignores delayed details for an earlier selected order', async () => {
    await open()
    const old = deferred()
    purchaseApi.getOrder.mockReturnValueOnce(old.promise)
    wrapper.vm.selectOrder({ id: 7 })
    const pending = wrapper.vm.confirmOrder()
    await choose(9)
    old.resolve({ data: order(7) })
    await pending
    expect(wrapper.vm.receiptForm.orderId).toBe(9)
  })

  test.each(['NaN', 'Infinity', '3pieces', '-1', '0', '9'])(
    'blocks invalid or excessive receipt quantity %s before transport', async value => {
      await open()
      await fill()
      wrapper.vm.selectedItems[0].receiptQuantity = value
      await wrapper.vm.submitForm()
      expect(purchaseApi.createReceipt).not.toHaveBeenCalled()
      expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/原料甲：/))
    }
  )

  test('blocks a second save while asynchronous form validation is pending', async () => {
    await open()
    await fill()
    const validation = deferred()
    session.validate.mockReturnValue(validation.promise)
    const first = wrapper.vm.submitForm()
    const second = wrapper.vm.submitForm()
    validation.resolve()
    await Promise.all([first, second])
    expect(purchaseApi.createReceipt).toHaveBeenCalledOnce()
  })

  test('reuses the request identity after a network failure, and renews it when the payload changes', async () => {
    await open()
    await fill()
    purchaseApi.createReceipt.mockRejectedValue(new Error('Network Error'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await wrapper.vm.submitForm()
    await wrapper.vm.submitForm()
    const first = purchaseApi.createReceipt.mock.calls[0][0].idempotencyKey
    expect(purchaseApi.createReceipt.mock.calls[1][0].idempotencyKey).toBe(first)
    wrapper.vm.receiptForm.remarks = '补充说明'
    await wrapper.vm.submitForm()
    expect(purchaseApi.createReceipt.mock.calls[2][0].idempotencyKey).not.toBe(first)
  })

  test('passes the receipt request identity through the required HTTP header', async () => {
    const data = { orderId: 7, idempotencyKey: 'purchase-receipt:test-retry' }
    await receiptTransport.createReceipt(data)
    expect(api.post).toHaveBeenCalledWith('/purchase/receipts', data, {
      headers: { 'Idempotency-Key': data.idempotencyKey }
    })
  })
})
