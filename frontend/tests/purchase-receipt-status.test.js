import { createPinia, setActivePinia } from 'pinia'
import { createRequire } from 'node:module'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { useDictionaryStore } from '@/stores/dictionary'
import { purchaseApi as purchaseTransport } from '@/api/purchase'
import { qualityApi as qualityTransport } from '@/api/quality'
import CreateInspectionDialog from '@/views/quality/components/CreateInspectionDialog.vue'
import { clickButton, fillField, financeDirectives, financeStubs } from './helpers/financeFormHarness'

const mocks = vi.hoisted(() => {
  const methods = names => Object.fromEntries(names.map(name => [name, vi.fn()]))
  return {
    purchase: methods(['getReceipts', 'getReceipt', 'getOrders', 'getOrder', 'updateReceiptStatus', 'createReceipt', 'updateReceipt']),
    quality: methods(['getIncomingInspections', 'getIncomingInspection', 'createIncomingInspection']),
    baseData: methods(['getSuppliers', 'getMaterial']),
    locations: vi.fn(),
    batchNumber: vi.fn(),
    http: methods(['get', 'post', 'put']),
    print: methods(['generateByDefaultTemplate', 'previewDocument']),
    message: methods(['success', 'error', 'warning']),
  }
})
vi.mock('@/api', () => ({ purchaseApi: mocks.purchase, qualityApi: mocks.quality, baseDataApi: mocks.baseData }))
vi.mock('@/services/axiosInstance', () => ({ api: mocks.http, fastApi: {} }))
vi.mock('@/api/baseData', () => ({ baseDataApi: mocks.baseData }))
vi.mock('@/api/system', () => ({ systemApi: {} }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ realName: '收货员', fetchUserProfile: async () => {} }) }))
vi.mock('@/utils/optionLoaders', () => ({ loadLocationOptions: mocks.locations }))
vi.mock('vue-router', async (importOriginal) => ({ ...(await importOriginal()), useRoute: () => ({ query: {} }) }))
vi.mock('@/services/printService', () => ({ default: mocks.print }))
vi.mock('@/utils/inspectionHelpers', () => ({ generateBatchNumber: mocks.batchNumber }))
vi.mock('@/components/inventory/InventoryPostingStatusPanel.vue', () => ({ default: { template: '<div />' } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks.message }))

const pinia = createPinia()
const require = createRequire(import.meta.url)
const { qualityInspectionMap } = require('../../backend/src/utils/quality/qualityFieldMap.js')
const { purchaseReceiptItemMap } = require('../../backend/src/utils/purchase/purchaseFieldMap.js')
let PurchaseReceipts
let dictionary
let wrapper

const receipt = (id, status, extra = {}) => ({
  id, status, receiptNo: `GR-${id}`, receiptDate: '2026-09-20', orderId: 9,
  supplierId: 4, warehouseId: 3, qualifiedQuantity: status === 'draft' ? 0 : 10,
  supplierName: '供应商', warehouseName: '主仓库', receiver: '收货员',
  items: [{ id: id * 10, orderItemId: 91, materialId: 5, materialCode: 'M-5', materialName: '材料', specification: 'A', orderedQuantity: 20, receivedQuantity: 10, qualifiedQuantity: status === 'draft' ? 0 : 10 }],
  ...extra,
})
const records = () => [
  receipt(1, 'draft', { inspectionId: 7, inspectionStatus: 'passed' }),
  receipt(2, 'inspected'),
  receipt(3, 'completed', { inspectionId: 8, inspectionStatus: 'pending' }),
  receipt(4, 'cancelled', { inspectionId: 9, inspectionStatus: 'passed' }),
]
const open = async () => {
  wrapper = mount(PurchaseReceipts, {
    global: {
      plugins: [pinia], directives: financeDirectives,
      stubs: {
        ...financeStubs,
        FinanceQueryCard: { template: '<div><slot name="basic"/><slot name="advanced"/><button @click="$emit(\'search\')">查询</button><button @click="$emit(\'reset\')">重置</button></div>' },
        ElTag: { props: ['type'], template: '<span :data-tag-type="type"><slot/></span>' },
        ElDescriptionsItem: { props: ['label'], template: '<div :data-description="label"><slot/></div>' },
      },
    },
  })
  await flushPromises()
  return wrapper
}

beforeAll(async () => {
  setActivePinia(pinia)
  dictionary = useDictionaryStore()
  PurchaseReceipts = (await import('@/views/purchase/PurchaseReceipts.vue')).default
})
beforeEach(() => {
  setActivePinia(pinia)
  for (const group of Object.values(mocks)) {
    if (vi.isMockFunction(group)) group.mockReset()
    else for (const mock of Object.values(group)) mock.mockReset().mockResolvedValue({ data: {} })
  }
  dictionary.groups = { purchase_receipt_status: [
    { code: 'draft', name: '草稿', tagType: 'info' },
    { code: 'inspected', name: '已检验', tagType: 'primary' },
    { code: 'completed', name: '已完成', tagType: 'success' },
    { code: 'cancelled', name: '已取消', tagType: 'danger' },
  ] }
  dictionary.isLoaded = true
  mocks.purchase.getReceipts.mockResolvedValue({ data: {
    list: records(), total: 73,
    statistics: { total: 73, draftCount: 11, inspectedCount: 22, completedCount: 33, cancelledCount: 7, totalAmount: 980 },
  } })
  mocks.purchase.getReceipt.mockImplementation(async id => ({ data: records().find(item => item.id === id) }))
  mocks.purchase.getOrders.mockResolvedValue({ data: [{ id: 9, orderNo: 'PO-9', status: 'approved', supplierId: 4, supplierName: '供应商', supplierCode: 'SUP-4' }] })
  mocks.purchase.getOrder.mockResolvedValue({ data: {
    id: 9, orderNo: 'PO-9', supplierId: 4, supplierName: '供应商', warehouseId: 3,
    items: [{ id: 91, materialId: 5, materialCode: 'M-5', materialName: '材料', specification: 'A', unitId: 2, unitName: '个', quantity: 20 }],
  } })
  mocks.quality.getIncomingInspections.mockResolvedValue({ data: [] })
  mocks.baseData.getSuppliers.mockResolvedValue({ data: [{ id: 4, name: '供应商' }] })
  mocks.locations.mockResolvedValue([{ id: 3, name: '主仓库' }])
  mocks.batchNumber.mockResolvedValue('B-7')
})
afterEach(() => wrapper?.unmount())

describe('采购收货持久化状态', () => {
  test('列表按收货单状态展示并限制操作，不按检验元数据推导状态', async () => {
    await open()
    const statuses = wrapper.get('[data-column="状态"]')
    expect(statuses.findAll('[data-row]').map(row => row.text())).toEqual(['草稿', '已检验', '已完成', '已取消'])
    expect(statuses.get('[data-row="1"] [data-tag-type]').attributes('data-tag-type')).toBe('primary')

    const actions = wrapper.get('[data-column="操作"]').findAll('[data-row]')
    expect(actions[0].text()).toContain('编辑')
    expect(actions[0].text()).toContain('取消')
    expect(actions[0].text()).not.toContain('入库')
    expect(actions[1].text()).toContain('入库')
    expect(actions[1].text()).toContain('取消')
    expect(actions[1].text()).not.toContain('编辑')
    expect(actions[2].findAll('button')).toHaveLength(0)
    expect(actions[3].findAll('button')).toHaveLength(0)

    await clickButton(actions[1], '入库')
    expect(mocks.purchase.updateReceiptStatus).toHaveBeenCalledWith(2, expect.objectContaining({ status: 'completed' }))
    expect(mocks.purchase.getReceipts).toHaveBeenCalledTimes(2)
  })

  test('筛选提交统一字典中的状态，统计保留服务器汇总并支持重置', async () => {
    await open()
    expect(wrapper.get('[data-field="状态"]').findAll('option').map(option => option.element.value)).toEqual(['', 'draft', 'inspected', 'completed', 'cancelled'])
    expect(wrapper.findAll('.stat-card .stat-value').map(value => value.text()).slice(0, 5)).toEqual(['73', '11', '22', '33', '7'])

    await fillField(wrapper, '状态', 'inspected')
    await clickButton(wrapper, '查询')
    expect(mocks.purchase.getReceipts).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'inspected', page: 1 }))
    await clickButton(wrapper, '重置')
    expect(mocks.purchase.getReceipts).toHaveBeenLastCalledWith(expect.objectContaining({ status: undefined, page: 1 }))
    expect(wrapper.get('[data-field="状态"] select').element.value).toBe('')
  })

  test('详情与打印使用同一状态字典，已检验无需携带检验状态字段', async () => {
    await open()
    await wrapper.get('[data-column="收货单号"] [data-row="1"] span').trigger('click')
    await flushPromises()
    const dialog = wrapper.get('[data-dialog="收货单详情"]')
    expect(dialog.get('[data-description="状态"]').text()).toBe('已检验')
    await clickButton(dialog, '打印')
    expect(mocks.print.generateByDefaultTemplate).toHaveBeenCalledWith('inventory', 'inbound', expect.objectContaining({ status: '已检验' }))
  })

  test('草稿的零合格数量显示待检验，不提前判定不合格', async () => {
    await open()
    await wrapper.get('[data-column="收货单号"] [data-row="0"] span').trigger('click')
    await flushPromises()
    const dialog = wrapper.get('[data-dialog="收货单详情"]')
    expect(dialog.get('[data-description="状态"]').text()).toBe('草稿')
    expect(dialog.get('[data-column="检验结果"]').text()).toBe('待检验')
  })

  test('全不合格的已检验收货单保留状态且不提供入库操作', async () => {
    mocks.purchase.getReceipts.mockResolvedValue({ data: { list: [receipt(5, 'inspected', { qualifiedQuantity: 0 })], total: 1 } })
    await open()
    expect(wrapper.get('[data-column="状态"]').text()).toBe('已检验')
    expect(wrapper.get('[data-column="操作"]').text()).not.toContain('入库')
    expect(wrapper.get('[data-column="操作"]').text()).toContain('取消')
  })

  test('按采购订单新建未检验草稿，合格数量为零且不可手工填写', async () => {
    mocks.purchase.getOrder.mockResolvedValue({ data: {
      id: 9, orderNo: 'PO-9', supplierId: 4, supplierName: '供应商', warehouseId: 3,
      items: [
        { id: 91, materialId: 5, materialName: '材料A', quantity: 20 },
        { id: 92, materialId: 6, materialName: '材料B', quantity: 10 },
      ],
    } })
    await open()
    await clickButton(wrapper, '新建收货单')
    const dialog = wrapper.get('[data-dialog="新建收货单"]')
    await fillField(dialog, 'orderId', 9)
    expect(dialog.get('[data-column="实收数量"]').findAll('input')).toHaveLength(0)
    await fillField(dialog, 'orderItemId', 91)
    await dialog.get('[data-column="实收数量"] input').setValue('8')
    expect(dialog.get('[data-column="合格数量"]').find('input').exists()).toBe(false)
    expect(dialog.get('[data-column="合格数量"]').findAll('[data-row]').map(row => row.text())).toEqual(['0'])
    await clickButton(dialog, '确 定')
    expect(mocks.purchase.createReceipt).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 9, inspectionId: null,
      items: [expect.objectContaining({ orderItemId: 91, receivedQuantity: 8, qualifiedQuantity: 0 })],
    }))
    expect(mocks.purchase.createReceipt.mock.lastCall[0]).not.toHaveProperty('fromInspection')
    expect(mocks.purchase.createReceipt.mock.lastCall[0]).not.toHaveProperty('status')
  })

  test('重复物料明确选择采购源行，切换明细后只提交本次选择的正数量', async () => {
    mocks.purchase.getOrder.mockResolvedValue({ data: {
      id: 9, orderNo: 'PO-9', supplierId: 4, supplierName: '供应商', warehouseId: 3,
      items: [
        { id: 91, materialId: 5, materialName: '材料', quantity: 20 },
        { id: 92, materialId: 5, materialName: '材料', quantity: 10 },
      ],
    } })
    await open()
    await clickButton(wrapper, '新建收货单')
    const dialog = wrapper.get('[data-dialog="新建收货单"]')
    await fillField(dialog, 'orderId', 9)
    expect(dialog.get('[data-field="orderItemId"]').findAll('option').map(option => option.text())).toEqual(['', '第1行 · 材料 · 20', '第2行 · 材料 · 10'])
    expect(dialog.text()).toContain('不同明细或批次请分别建单')
    await fillField(dialog, 'orderItemId', 91)
    await dialog.get('[data-column="实收数量"] input').setValue('8')
    await fillField(dialog, 'orderItemId', 92)
    expect(dialog.get('[data-column="实收数量"]').findAll('input')).toHaveLength(1)
    expect(dialog.get('[data-column="实收数量"] input').element.value).toBe('0')
    await dialog.get('[data-column="实收数量"] input').setValue('3')
    await clickButton(dialog, '确 定')
    expect(mocks.purchase.createReceipt.mock.lastCall[0].items).toEqual([
      expect.objectContaining({ orderItemId: 92, materialId: 5, receivedQuantity: 3, qualifiedQuantity: 0 }),
    ])
  })

  test.each([
    ['pending', 5, 0],
    ['partial', 6, 6],
    ['failed', 0, 0],
  ])('编辑草稿可关联%s检验，保持源行和批次且只采用终检合格数量', async (status, inspectionQualified, savedQualified) => {
    const inspection = {
      id: 7, inspectionNo: 'IQC-7', sourceType: 'purchase_order', referenceId: 9,
      purchaseOrderItemId: 91, materialId: 5, status, quantity: 10,
      qualifiedQuantity: inspectionQualified, batchNo: 'B-7', itemName: '材料',
    }
    mocks.quality.getIncomingInspections.mockImplementation(async params => ({ data: params.status === status ? [inspection] : [] }))
    mocks.quality.getIncomingInspection.mockResolvedValue({ data: inspection })
    mocks.purchase.getReceipt.mockResolvedValue({ data: receipt(1, 'draft', { inspectionId: null }) })
    await open()
    await clickButton(wrapper.get('[data-column="操作"] [data-row="0"]'), '编辑')
    const dialog = wrapper.get('[data-dialog="编辑收货单"]')
    await fillField(dialog, 'inspectionId', 7)
    expect(dialog.get('[data-column="实收数量"] input').element.disabled).toBe(true)
    expect(dialog.get('[data-column="合格数量"]').text()).toBe(String(savedQualified))
    await clickButton(dialog, '确 定')
    expect(mocks.purchase.updateReceipt).toHaveBeenCalledWith(1, expect.objectContaining({
      inspectionId: 7,
      items: [expect.objectContaining({ id: 10, orderItemId: 91, materialId: 5, receivedQuantity: 10, qualifiedQuantity: savedQualified, batchNumber: 'B-7' })],
    }))
  })

  test('重复物料按检验源行关联，不静默选择第一行', async () => {
    const inspection = { id: 7, inspectionNo: 'IQC-7', sourceType: 'purchase_order', referenceId: 9, purchaseOrderItemId: 92, materialId: 5, status: 'pending', quantity: 10, batchNo: 'B-7', itemName: '材料' }
    mocks.quality.getIncomingInspections.mockResolvedValue({ data: [inspection] })
    mocks.quality.getIncomingInspection.mockResolvedValue({ data: inspection })
    mocks.purchase.getOrder.mockResolvedValue({ data: { id: 9, orderNo: 'PO-9', supplierId: 4, supplierName: '供应商', warehouseId: 3,
      items: [91, 92].map(id => ({ id, materialId: 5, materialName: '材料', quantity: 20 })),
    } })
    await open()
    await clickButton(wrapper, '新建收货单')
    const dialog = wrapper.get('[data-dialog="新建收货单"]')
    await fillField(dialog, 'inspectionId', 7)
    await clickButton(dialog, '确 定')
    expect(mocks.purchase.createReceipt).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ orderItemId: 92, materialId: 5, receivedQuantity: 10, qualifiedQuantity: 0 })],
    }))
  })

  test('已保存的检验关联不可解除或替换，保持交货来源一致', async () => {
    mocks.quality.getIncomingInspection.mockResolvedValue({ data: { id: 7, inspectionNo: 'IQC-7', status: 'pending' } })
    await open()
    await clickButton(wrapper.get('[data-column="操作"] [data-row="0"]'), '编辑')
    expect(wrapper.get('[data-dialog="编辑收货单"] [data-field="inspectionId"] select').element.disabled).toBe(true)
  })

  test('重复物料从新建检验到草稿绑定，经过真实HTTP映射仍保留同一采购源行与批次', async () => {
    const order = { id: 9, orderNo: 'PO-9', supplierId: 4, supplierName: '供应商', warehouseId: 3,
      items: [91, 92].map((id, index) => ({ id, materialId: 5, materialCode: 'M-5', materialName: '材料', specification: 'A', unitId: 2, unitName: '个', quantity: index ? 10 : 20 })),
    }
    mocks.purchase.getOrder.mockResolvedValue({ data: order })
    mocks.quality.createIncomingInspection.mockImplementation(qualityTransport.createIncomingInspection)
    let persistedInspection
    mocks.http.post.mockImplementation(async (url, data) => {
      expect(url).toBe('/quality/inspections')
      persistedInspection = { id: 7, inspection_no: 'IQC-7', ...qualityInspectionMap.fromApi(data) }
      return { data: qualityInspectionMap.toApi(persistedInspection) }
    })
    wrapper = mount(CreateInspectionDialog, { props: { visible: true }, global: {
      plugins: [pinia], directives: financeDirectives,
      stubs: { ...financeStubs, ElSelect: {
        ...financeStubs.ElSelect,
        emits: [...financeStubs.ElSelect.emits, 'focus'],
        template: '<select :disabled="disabled" :value="modelValue" @focus="$emit(\'focus\')" @change="choose"><option value=""/><slot/></select>',
      } },
    } })
    await wrapper.get('[data-field="purchaseOrderNo"] select').trigger('focus')
    await flushPromises()
    await fillField(wrapper, 'purchaseOrderNo', 'PO-9')
    expect(mocks.purchase.getOrder).toHaveBeenLastCalledWith(9)
    expect(wrapper.get('[data-field="purchaseOrderItemId"]').findAll('option').map(item => item.element.value)).toEqual(['', '91', '92'])
    await fillField(wrapper, 'purchaseOrderItemId', 92)
    await clickButton(wrapper, '确认')
    expect(persistedInspection).toMatchObject({
      reference_id: 9, purchase_order_item_id: 92, material_id: 5,
      source_type: 'purchase_order', quantity: 10, unit_id: 2, batch_no: 'B-7', status: 'pending',
    })
    expect(mocks.http.post.mock.lastCall[1]).not.toHaveProperty('qualifiedQuantity')

    wrapper.unmount()
    const inspection = qualityInspectionMap.toApi(persistedInspection)
    mocks.quality.getIncomingInspections.mockImplementation(async params => ({ data: params.status === 'pending' ? [inspection] : [] }))
    mocks.quality.getIncomingInspection.mockResolvedValue({ data: inspection })
    const draft = receipt(1, 'draft', { inspectionId: null })
    draft.items[0].orderItemId = 92
    mocks.purchase.getReceipt.mockResolvedValue({ data: draft })
    mocks.purchase.updateReceipt.mockImplementation(purchaseTransport.updateReceipt)
    await open()
    await clickButton(wrapper.get('[data-column="操作"] [data-row="0"]'), '编辑')
    const dialog = wrapper.get('[data-dialog="编辑收货单"]')
    await fillField(dialog, 'inspectionId', 7)
    await clickButton(dialog, '确 定')
    expect(mocks.http.put).toHaveBeenCalledWith('/purchase/receipts/1', expect.objectContaining({ inspectionId: 7 }))
    const receiptPayload = mocks.http.put.mock.lastCall[1]
    expect(purchaseReceiptItemMap.fromApi(receiptPayload.items[0])).toMatchObject({
      id: 10, order_item_id: 92, material_id: 5, received_quantity: 10, qualified_quantity: 0, batch_number: 'B-7',
    })
  })
})
