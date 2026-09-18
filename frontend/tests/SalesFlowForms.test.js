import { defineComponent, h, inject, provide, toRef } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import SalesOutbound from '@/views/sales/SalesOutbound.vue'
import SalesReturns from '@/views/sales/SalesReturns.vue'
import SalesExchanges from '@/views/sales/SalesExchanges.vue'
import SalesQuotations from '@/views/sales/SalesQuotations.vue'

const mocks = vi.hoisted(() => ({
  sales: Object.fromEntries([
    'getOutbounds', 'getOutbound', 'getOutboundStats', 'getOrders', 'getOrderUnshippedItems',
    'getCustomers', 'getCustomer', 'createOutbound', 'updateOutbound', 'deleteOutbound',
    'getReturns', 'getReturnDetails', 'createReturn', 'updateReturn',
    'getExchanges', 'getExchange', 'createExchange', 'updateExchange', 'updateExchangeStatus',
    'getQuotations', 'getQuotation', 'getQuotationStatistics', 'createQuotation', 'updateQuotation',
    'convertQuotationToOrder', 'createOrder',
  ].map(name => [name, vi.fn()])),
  inventory: { getMaterialsWithStock: vi.fn() },
  baseData: { getMaterials: vi.fn() },
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  confirm: vi.fn(), push: vi.fn(), creditNote: vi.fn(),
  options: vi.fn(), materialOptions: vi.fn(), materialSearch: vi.fn(), clearCache: vi.fn(),
}))
vi.mock('@/api', () => ({ salesApi: mocks.sales, inventoryApi: mocks.inventory, baseDataApi: mocks.baseData }))
vi.mock('@/api/finance', () => ({ financeApi: { integration: { generateARCreditNoteFromSalesReturn: mocks.creditNote } } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }), useRoute: () => ({ query: {} }) }))
vi.mock('@/stores/dictionary', () => ({ useDictionaryStore: () => ({ groups: {}, isLoaded: false, getOptions: () => [] }) }))
vi.mock('@/utils/requestOptimizer', () => ({ clearAllRequestCaches: mocks.clearCache }))
vi.mock('@/utils/optionLoaders', () => ({
  loadCustomerOptions: mocks.options, searchCustomerOptions: mocks.options,
  loadMaterialPageOptions: mocks.materialOptions, searchMaterialPageOptions: mocks.materialSearch,
}))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks.message }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: mocks.confirm, prompt: mocks.confirm } }))
vi.mock('@/components/inventory/InventoryApprovalPanel.vue', () => ({ default: { template: '<div/>' } }))
vi.mock('@/services/printService', () => ({ default: {} }))

const Slot = { template: '<div><slot name="header"/><slot name="actions"/><slot/><slot name="footer"/></div>' }
const Button = {
  props: ['loading', 'disabled'], emits: ['click'],
  template: '<button :disabled="loading || disabled" @click="$emit(\'click\')"><slot/></button>',
}
const Input = {
  props: ['modelValue', 'type'], emits: ['update:modelValue', 'input', 'change'],
  template: '<input :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value); $emit(\'input\', $event.target.value)" @change="$emit(\'change\', $event.target.value)"/>',
}
const DatePicker = {
  props: ['modelValue', 'valueFormat'], emits: ['update:modelValue'],
  template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', valueFormat === \'YYYY-MM-DD\' ? $event.target.value : new Date($event.target.value))"/>',
}
const Form = defineComponent({
  setup(_props, { slots, expose }) {
    expose({ validate: async callback => { await callback?.(true); return true }, clearValidate() {}, resetFields() {} })
    return () => h('form', { onSubmit: e => e.preventDefault() }, slots.default?.())
  },
})
const FormItem = { props: ['label'], template: '<label :data-field="label"><span>{{ label }}</span><slot/></label>' }
const Select = {
  props: ['modelValue', 'remoteMethod'], emits: ['update:modelValue', 'change'],
  template: '<div><input v-if="remoteMethod" aria-label="搜索选项" @input="remoteMethod($event.target.value)"/><select :value="modelValue" @change="$emit(\'update:modelValue\', Number($event.target.value) || $event.target.value); $emit(\'change\', Number($event.target.value) || $event.target.value)"><slot/></select></div>',
}
const Option = { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' }
const Table = defineComponent({
  props: ['data'], emits: ['selection-change', 'row-click'],
  setup(props, { slots, emit }) {
    provide('table', { rows: toRef(props, 'data'), select: row => emit('selection-change', [row]) })
    return () => h('div', { class: 'table' }, [
      ...(props.data || []).map(row => h('button', {
        class: 'view-record', onClick: event => emit('row-click', row, { property: 'id' }, event),
      }, `查看记录:${row.id}`)),
      slots.default?.(),
    ])
  },
})
const Column = defineComponent({
  props: ['prop', 'label', 'type'],
  setup(props, { slots }) {
    const table = inject('table')
    return () => props.type === 'expand' ? null : h('div', { 'data-column': props.label }, (table.rows.value || []).map((row, index) =>
      h('div', props.type === 'selection'
        ? h('button', { onClick: () => table.select(row) }, `选中物料:${row.id}`)
        : slots.default ? slots.default({ row, $index: index }) : String(row[props.prop] ?? ''))))
  },
})
const Dialog = { props: ['modelValue', 'title'], template: '<section v-if="modelValue" :data-dialog="title"><slot/><slot name="footer"/></section>' }
const stubs = {
  PageHeader: Slot, FinanceQueryCard: Slot, ElCard: Slot, ElRow: Slot, ElCol: Slot,
  ElButton: Button, ElInput: Input, ElDatePicker: DatePicker, ElInputNumber: Input,
  ElForm: Form, ElFormItem: FormItem, ElSelect: Select, ElOption: Option,
  ElTable: Table, ElTableColumn: Column, AppDialog: Dialog,
  ElDescriptions: Slot, ElDescriptionsItem: FormItem, ElTag: Slot, ElDivider: Slot,
  ElIcon: true, ElPagination: true, ElTooltip: Slot, ElAlert: Slot, ElEmpty: true,
  ElPopconfirm: { emits: ['confirm'], template: '<span @click="$emit(\'confirm\')"><slot name="reference"/></span>' },
  EmptyState: true, InventoryApprovalPanel: true,
}

const outbound = {
  id: 7, outboundNo: 'SOB-7', orderId: 10, orderNo: 'SO-10', customerId: 9, customerName: '测试客户',
  deliveryDate: '2026-09-14', status: 'draft', contactPerson: '测试联系人', contactPhone: '13900000000',
  items: [{ id: 71, productId: 100, materialId: 100, materialCode: 'P-100', materialName: '测试物料',
    productName: '测试物料', quantity: 2, orderedQuantity: 10, remainingQuantity: 10, returnableQuantity: 4,
    unitPrice: 30.1234, unitName: '件', sourceOrderId: 10, sourceOrderNo: 'SO-10' }],
}
const returned = {
  id: 20, returnNo: 'SRT-20', orderId: 10, orderNo: 'SO-10', customerName: '测试客户',
  returnDate: '2026-09-14', returnReason: '外观问题', status: 'completed', totalAmount: 30.12,
  createdAt: '2026-09-14 14:30:00', remarks: '保留退货备注', items: [{ ...outbound.items[0], quantity: 1 }],
}
const exchange = {
  id: 30, exchangeNo: 'SE-30', orderId: 10, orderNo: 'SO-10', customerName: '测试客户',
  contactPhone: '13900000000', exchangeDate: '2026-09-14', exchangeReason: '更换规格', status: 'pending',
  returnAmount: 30, newAmount: 20, differenceAmount: -10,
  items: [
    { itemType: 'return', productCode: 'P-100', productName: '原商品', originalQuantity: 10, returnableQuantity: 4, quantity: 1, unitPrice: 30, unitName: '件', reason: '原行原因' },
    { itemType: 'new', productCode: 'P-101', productName: '换出商品', quantity: 1, unitPrice: 20, unitName: '件', reason: '新行说明' },
  ],
}
const quotation = {
  id: 40, quotationNo: 'SQ-40', customerId: 9, customerName: '测试客户', validityDate: '2026-10-14',
  status: 'draft', totalAmount: 60.25, remarks: '报价备注', createdAt: '2026-09-14 14:30:00',
  items: [{ productId: 100, productName: '测试物料', quantity: 2, unitPrice: 30.1234, taxPercent: 0 }],
}
const copy = value => structuredClone(value)
let wrapper
beforeEach(() => {
  for (const group of [mocks.sales, mocks.inventory, mocks.baseData, mocks.message]) Object.values(group).forEach(fn => fn.mockReset())
  mocks.confirm.mockReset().mockResolvedValue('confirm')
  mocks.options.mockReset().mockResolvedValue([])
  mocks.materialOptions.mockReset().mockResolvedValue([])
  mocks.materialSearch.mockReset().mockResolvedValue([])
  mocks.creditNote.mockReset().mockResolvedValue({ message: '红字应收已生成' })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 14, 12))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.sales.getOutbounds.mockResolvedValue({ data: { list: [copy(outbound)], total: 50 } })
  mocks.sales.getOutbound.mockResolvedValue({ data: copy(outbound) })
  mocks.sales.getOutboundStats.mockResolvedValue({ data: { total: 50, draftCount: 20, processingCount: 10, completedCount: 20 } })
  mocks.sales.getOrders.mockResolvedValue({ data: { list: [{ id: 10, status: 'ready_to_ship' }], total: 1 } })
  mocks.inventory.getMaterialsWithStock.mockResolvedValue({ data: [{ id: 100, stockQuantity: 1234 }] })
  mocks.baseData.getMaterials.mockResolvedValue({ data: { list: [{ id: 101, code: 'P-101', name: '换出商品', unitName: '件', stockQuantity: 400, price: 20, costPrice: 8 }], total: 1 } })
  mocks.sales.getReturns.mockResolvedValue({ data: { items: [copy(returned)], total: 21, statusStats: { pendingCount: 10, approvedCount: 10, completedCount: 1 } } })
  mocks.sales.getExchanges.mockResolvedValue({ data: { items: [copy(exchange)], total: 30, statusStats: { total: 30, pending: 20, processing: 5, completed: 5 } } })
  mocks.sales.getExchange.mockResolvedValue({ data: copy(exchange) })
  mocks.sales.getQuotations.mockResolvedValue({ data: { list: [copy(quotation)], total: 1 } })
  mocks.sales.getQuotation.mockResolvedValue({ data: copy(quotation) })
  mocks.sales.getQuotationStatistics.mockResolvedValue({ data: {} })
  mocks.sales.convertQuotationToOrder.mockResolvedValue({ data: { orderId: 50 } })
  for (const name of ['updateOutbound', 'createReturn', 'updateReturn', 'createExchange', 'updateExchange', 'updateExchangeStatus', 'updateQuotation']) mocks.sales[name].mockResolvedValue({ data: { id: 99 } })
})
afterEach(() => { wrapper?.unmount(); vi.useRealTimers() })
const open = async component => {
  wrapper = mount(component, { global: { stubs, directives: { loading: () => {}, permission: () => {} } } })
  await flushPromises()
}
const click = async label => {
  const button = wrapper.findAll('button').find(button => button.text().trim() === label)
  expect(button, `button ${label}`).toBeDefined()
  await button.trigger('click'); await flushPromises()
}

describe('销售出库页面回归', () => {
  test('编辑保留来源、四位单价，加载真实库存且数量可以增加', async () => {
    await open(SalesOutbound); await click('编辑')
    const form = wrapper.get('[data-dialog="编辑出库单"]')
    expect(form.text()).toContain('1234')
    await form.get('[data-column="发货数量"] input').setValue('7')
    await click('确认')
    expect(mocks.sales.updateOutbound).toHaveBeenCalledWith(7, expect.objectContaining({
      orderId: 10, relatedOrders: [10], deliveryDate: '2026-09-14',
      items: [expect.objectContaining({ productId: 100, quantity: '7', unitPrice: 30.1234, sourceOrderId: 10 })],
    }))
    expect(mocks.message.success).toHaveBeenCalledWith('出库单更新成功')
  })
  test('拆分明细合计超量会在页面阻止提交', async () => {
    const detail = copy(outbound)
    detail.items = [1, 2].map(id => ({ ...detail.items[0], id, quantity: 3, remainingQuantity: 5, orderedQuantity: 5 }))
    mocks.sales.getOutbound.mockResolvedValue({ data: detail })
    await open(SalesOutbound); await click('编辑'); await click('确认')
    expect(mocks.sales.updateOutbound).not.toHaveBeenCalled()
    expect(mocks.message.warning).toHaveBeenCalledWith(expect.stringContaining('发货合计超过剩余数量'))
  })
  test('状态按钮只发送状态并重新加载全部单据统计', async () => {
    await open(SalesOutbound)
    mocks.sales.getOutboundStats.mockClear()
    await click('开始处理')
    expect(mocks.sales.updateOutbound).toHaveBeenCalledWith(7, { status: 'processing' })
    expect(mocks.sales.getOutboundStats).toHaveBeenCalledTimes(1)
  })
})

describe('销售退货页面回归', () => {
  test('输入退货数量后按 camelCase 提交，保留来源订单', async () => {
    await open(SalesReturns); await click('增加退货单'); await click('选择出库单'); await click('选择')
    await wrapper.get('input[placeholder="请输入退货原因"]').setValue('尺寸异常')
    await wrapper.get('input[placeholder="请输入退货数量"]').setValue('1')
    await click('提交')
    expect(mocks.sales.createReturn).toHaveBeenCalledWith(expect.objectContaining({
      outboundId: 7, orderId: 10, returnDate: '2026-09-14', returnReason: '尺寸异常',
      items: [{ productId: 100, quantity: 1, reason: '' }],
    }))
  })
  test('列表显示退款金额，点击主表打开正确单据并保留详情抬头', async () => {
    await open(SalesReturns)
    expect(wrapper.text()).toContain('30.12')
    await click('查看记录:20')
    const detail = wrapper.get('[data-dialog="退货单详情"]')
    expect(detail.text()).toContain('SRT-20')
    expect(detail.text()).toContain('外观问题')
    expect(detail.text()).toContain('保留退货备注')
    expect(detail.text()).toContain('14:30:00')
  })
  test('手工生成红字应收错误显示业务原因且允许重试', async () => {
    mocks.creditNote.mockRejectedValueOnce({ response: { data: { message: '请先完成财务审核' } } })
    await open(SalesReturns); await click('生成红字应收')
    expect(mocks.message.error).toHaveBeenCalledWith('请先完成财务审核')
    await click('生成红字应收')
    expect(mocks.creditNote).toHaveBeenCalledTimes(2)
    expect(mocks.creditNote).toHaveBeenLastCalledWith(20)
  })
})

describe('销售换货页面回归', () => {
  test('编辑显示含税差价，保存时保留出库来源和明细税率', async () => {
    const detail = copy(exchange)
    detail.outboundId = 77
    Object.assign(detail.items[0], { unitPrice: 35.1234, taxPercent: 0.13 })
    Object.assign(detail.items[1], { unitPrice: 50, taxPercent: 0.06 })
    mocks.sales.getExchange.mockResolvedValue({ data: detail })
    await open(SalesExchanges); await click('编辑')
    const total = wrapper.get('[data-field="含税金额汇总"]')
    for (const amount of ['39.69', '53.00', '+￥13.31']) expect(total.text()).toContain(amount)
    await click('保存')
    expect(mocks.sales.updateExchange).toHaveBeenCalledWith(30, expect.objectContaining({
      outboundId: 77,
      returnItems: [expect.objectContaining({ unitPrice: 35.1234, taxPercent: 0.13 })],
      newItems: [expect.objectContaining({ unitPrice: 50, taxPercent: 0.06 })],
    }))
  })
  test('详情显示实际退回和换出数量、税额及价税合计', async () => {
    const detail = copy(exchange)
    Object.assign(detail.items[0], { quantity: 2, amount: 60, taxAmount: 7.8, totalAmount: 67.8 })
    Object.assign(detail.items[1], { quantity: 3, amount: 60, taxAmount: 3.6, totalAmount: 63.6 })
    mocks.sales.getExchange.mockResolvedValue({ data: detail })
    await open(SalesExchanges); await click('查看记录:30')
    expect(wrapper.get('[data-column="退回数量"]').text()).toBe('2')
    expect(wrapper.get('[data-column="换出数量"]').text()).toBe('3')
    const amounts = wrapper.findAll('[data-column="含税金额"]').map(column => column.text()).join(' ')
    expect(amounts).toContain('67.80'); expect(amounts).toContain('63.60')
  })
  test('同一出库的重复物料按实际发货加权价合并，并提交具体出库ID', async () => {
    mocks.sales.getOutbounds.mockResolvedValue({ data: { list: [{ ...copy(outbound), status: 'completed' }], total: 1 } })
    mocks.sales.getOutbound.mockResolvedValue({ data: { ...copy(outbound), items: [25,35].map(unitPrice => ({ ...outbound.items[0], quantity: 2, returnableQuantity: 2, unitPrice, taxPercent: 0.13 })) } })
    await open(SalesExchanges); await click('新增换货单'); await click('选择订单'); await click('选择')
    await wrapper.get('input[placeholder="选择换货日期"]').setValue('2026-09-14')
    await wrapper.get('input[placeholder="请输入换货原因"]').setValue('重复明细换货')
    await click('添加商品'); await click('选中物料:101'); await click('确定'); await click('保存')
    expect(mocks.sales.createExchange).toHaveBeenCalledWith(expect.objectContaining({
      outboundId: 7, returnItems: [expect.objectContaining({ productCode: 'P-100', unitPrice: 30, taxPercent: 0.13, originalQuantity: 4 })],
    }))
  })
  test('状态按钮使用状态专用接口，不把缺失日期回写', async () => {
    await open(SalesExchanges); await click('开始处理')
    expect(mocks.sales.updateExchangeStatus).toHaveBeenCalledWith(30, 'processing')
    expect(mocks.sales.updateExchange).not.toHaveBeenCalled()
  })
  test('编辑保留退回和换出两类明细、原因、单位与价格', async () => {
    await open(SalesExchanges); await click('编辑')
    const form = wrapper.get('[data-dialog="编辑换货单"]')
    expect(form.get('[data-field="换货原因"] input').element.value).toBe('更换规格')
    expect(form.get('[data-column="可退换数量"]').text()).toBe('4')
    await wrapper.get('input[placeholder="换出数量"]').setValue('2')
    await click('保存')
    expect(mocks.sales.updateExchange).toHaveBeenCalledWith(30, expect.objectContaining({
      orderNo: 'SO-10', exchangeDate: '2026-09-14',
      returnItems: [expect.objectContaining({ productCode: 'P-100', returnQuantity: 1, returnReason: '原行原因', unitName: '件', unitPrice: 30 })],
      newItems: [expect.objectContaining({ productCode: 'P-101', newQuantity: '2', newReason: '新行说明', unitName: '件', unitPrice: 20 })],
    }))
  })
  test('来源列表接受 list 包装，物料选择使用售价并提交日期字符串', async () => {
    mocks.sales.getOutbounds.mockResolvedValue({ data: { list: [{ ...copy(outbound), status: 'completed' }], total: 1 } })
    await open(SalesExchanges); await click('新增换货单'); await click('选择订单'); await click('选择')
    await wrapper.get('input[placeholder="选择换货日期"]').setValue('2026-09-14')
    await wrapper.get('input[placeholder="请输入换货原因"]').setValue('换规格')
    await click('添加商品'); await click('选中物料:101'); await click('确定'); await click('保存')
    expect(mocks.sales.createExchange).toHaveBeenCalledWith(expect.objectContaining({
      orderNo: 'SO-10', exchangeDate: '2026-09-14',
      newItems: [expect.objectContaining({ productCode: 'P-101', unitPrice: 20, newQuantity: 1 })],
    }))
  })
})

describe('销售报价页面回归', () => {
  test('较晚完成的初始物料加载不会覆盖用户搜索结果，列表客户名不依赖下拉结果', async () => {
    let finishInitial
    mocks.materialOptions.mockReturnValue(new Promise(resolve => { finishInitial = resolve }))
    mocks.materialSearch.mockResolvedValue([{ id: 101, code: 'P-101', name: '搜索到的商品', price: 30.1234 }])
    await open(SalesQuotations)
    expect(wrapper.find('[data-column="客户名称"]').text()).toContain('测试客户')
    await click('新增报价单')
    await wrapper.find('[data-column="产品"] input[aria-label="搜索选项"]').setValue('P-101')
    await flushPromises()
    finishInitial([{ id: 100, name: '较早请求的商品' }])
    await flushPromises()
    const products = wrapper.find('[data-column="产品"]')
    expect(products.text()).toContain('搜索到的商品')
    expect(products.text()).not.toContain('较早请求的商品')
    expect(mocks.materialSearch).toHaveBeenCalledWith('P-101')
  })
  test('确认报价保留标准字段和四位小数明细单价', async () => {
    await open(SalesQuotations); await click('确认')
    expect(mocks.sales.updateQuotation).toHaveBeenCalledWith(40, {
      quotation: expect.objectContaining({ customerId: 9, status: 'accepted', validityDate: '2026-10-14' }),
      items: quotation.items,
    })
  })
  test('一次转订单操作只调用专用转换接口一次', async () => {
    mocks.sales.getQuotations.mockResolvedValue({ data: { list: [{ ...copy(quotation), status: 'accepted' }], total: 1 } })
    await open(SalesQuotations); await click('转订单')
    expect(mocks.sales.convertQuotationToOrder).toHaveBeenCalledExactlyOnceWith(40)
    expect(mocks.sales.createOrder).not.toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith('/sales/orders?id=50')
  })
  test('报价详情显示实际单号、客户和日期', async () => {
    await open(SalesQuotations); await click('查看记录:40')
    const detail = wrapper.get('[data-dialog="报价单详情"]')
    expect(detail.text()).toContain('SQ-40')
    expect(detail.text()).toContain('测试客户')
    expect(detail.text()).toContain('2026-10-14')
  })
})
