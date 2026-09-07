import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import Scan from '@/views/Scan.vue'
import { baseDataApi, inventoryApi, salesApi, qualityApi, productionApi } from '@/api'

const { route, router } = vi.hoisted(() => ({
  route: { query: {} },
  router: { push: vi.fn(), back: vi.fn() }
}))

vi.mock('@/api', () => ({
  baseDataApi: { getMaterials: vi.fn() },
  inventoryApi: { getLocations: vi.fn(), getCheckList: vi.fn(), addCheckItem: vi.fn() },
  salesApi: { getSalesOrders: vi.fn() },
  productionApi: { scanVerify: vi.fn(), getProductionTasks: vi.fn() },
  qualityApi: {
    getIncomingInspections: vi.fn(), getProcessInspections: vi.fn(), getFinalInspections: vi.fn()
  }
}))
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => router
}))
vi.mock('vant', () => ({
  showToast: vi.fn(), showLoadingToast: vi.fn(), closeToast: vi.fn()
}))
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: { getCameras: vi.fn().mockResolvedValue([]) },
  Html5QrcodeSupportedFormats: {}
}))

const ButtonStub = {
  emits: ['click'],
  template: '<button @click="$emit(\'click\', $event)"><slot /></button>'
}
const FieldStub = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
}
const PopupStub = { template: '<div><slot /></div>' }

describe('mobile scan lookup workflow', () => {
  let wrapper
  const mountScanner = () => mount(Scan, {
      global: {
        stubs: {
          Icon: true,
          'van-button': ButtonStub,
          'van-field': FieldStub,
          'van-popup': PopupStub,
          'van-loading': true
        }
      }
    })
  beforeEach(() => {
    vi.clearAllMocks()
    route.query = {}
    wrapper = mountScanner()
  })
  afterEach(() => wrapper.unmount())

  const selectType = async (label) => {
    await wrapper.findAll('.type-tab').find((tab) => tab.text() === label).trigger('click')
  }
  const scan = async (code) => {
    await wrapper.find('.input-card').trigger('click')
    await wrapper.find('.manual-input-popup input').setValue(code)
    await wrapper.find('.popup-actions button').trigger('click')
    await flushPromises()
  }

  test('uses the supported order search filter and picks an exact order number', async () => {
    salesApi.getSalesOrders.mockResolvedValue({
      data: { list: [
        { id: 1, orderNo: 'SO-420', customerName: '无关客户' },
        { id: 2, orderNo: 'SO-42', customerName: '正确客户', status: 'confirmed' }
      ], total: 2 }
    })
    await selectType('订单')
    await scan('SO-42')
    expect(salesApi.getSalesOrders).toHaveBeenCalledWith(expect.objectContaining({ search: 'SO-42' }))
    expect(wrapper.find('.scan-result').text()).toContain('正确客户')
    expect(wrapper.find('.scan-result').text()).not.toContain('无关客户')
  })

  test('never presents an unrelated order when the barcode is unknown', async () => {
    salesApi.getSalesOrders.mockResolvedValue({
      data: { list: [{ id: 1, orderNo: 'SO-420', customerName: '无关客户' }], total: 1 }
    })
    await selectType('订单')
    await scan('SO-42')
    expect(wrapper.find('.scan-result').exists()).toBe(false)
  })

  test('reads paginated locations and camel-case warehouse names', async () => {
    inventoryApi.getLocations.mockResolvedValue({
      data: { list: [{ id: 5, code: 'LOC-A', name: 'A库位', warehouseName: '原料仓' }], total: 1 }
    })
    await selectType('库位')
    await scan('LOC-A')
    expect(wrapper.find('.scan-result').text()).toContain('原料仓')
  })

  test('does not confuse a prefix-matching material with the scanned material', async () => {
    baseDataApi.getMaterials.mockResolvedValue({
      data: { list: [
        { id: 1, code: 'X-MAT-1', name: '相似物料' },
        { id: 2, code: 'MAT-1', name: '目标物料', unitName: '件' }
      ], total: 2 }
    })
    await scan('MAT-1')
    expect(wrapper.find('.scan-result').text()).toContain('目标物料')
    expect(wrapper.find('.scan-result').text()).not.toContain('相似物料')
  })

  test('finds an exact material on a later search page', async () => {
    baseDataApi.getMaterials.mockImplementation(async ({ page }) => ({
      data: {
        list: page === 1
          ? Array.from({ length: 100 }, (_, id) => ({ id, code: 'X-MAT-1-' + id, name: '相似物料' }))
          : [{ id: 101, code: 'MAT-1', name: '后页目标物料' }],
        total: 101
      }
    }))
    await scan('MAT-1')
    expect(baseDataApi.getMaterials).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.scan-result').text()).toContain('后页目标物料')
  })

  test('displays product information after a product scan', async () => {
    baseDataApi.getMaterials.mockResolvedValue({
      data: { list: [{ id: 2, code: 'PRODUCT-1', name: '成品名称' }], total: 1 }
    })
    await selectType('产品')
    await scan('PRODUCT-1')
    expect(wrapper.find('.scan-result').text()).toContain('成品名称')
  })

  test.each([
    ['inspection', 'incoming', 'getIncomingInspections'],
    ['inspection_process', 'process', 'getProcessInspections'],
    ['inspection_final', 'final', 'getFinalInspections'],
  ])('opens the exact inspection from the %s scan entry', async (type, kind, method) => {
    wrapper.unmount()
    route.query = { type }
    qualityApi[method].mockResolvedValue({
      data: { list: [{ id: 42, inspectionNo: 'QC-42', productName: '待检物料' }], total: 1 }
    })
    wrapper = mountScanner()
    await scan('QC-42')
    expect(qualityApi[method]).toHaveBeenCalledWith(expect.objectContaining({ keyword: 'QC-42' }))
    expect(baseDataApi.getMaterials).not.toHaveBeenCalled()
    expect(wrapper.find('.scan-result').text()).toContain('QC-42')
    await wrapper.find('.result-actions button').trigger('click')
    expect(router.push).toHaveBeenCalledWith('/quality/' + kind + '/42')
  })

  test('lets an operator select a production task and see assembly verification', async () => {
    productionApi.getProductionTasks.mockResolvedValue({
      data: { list: [{ id: 42, code: 'TASK-42', productName: '装配产品' }], total: 1 }
    })
    productionApi.scanVerify.mockResolvedValue({ data: { result: 'pass', material: { name: '正确零件' } } })
    await selectType('装配防错')
    await flushPromises()
    await wrapper.find('.assembly-task-select').setValue('42')
    await scan('MAT-42')
    expect(productionApi.scanVerify).toHaveBeenCalledWith({ taskId: 42, scannedBarcode: 'MAT-42' })
    expect(wrapper.find('.scan-result').text()).toContain('正确零件 匹配 BOM')
  })
})
