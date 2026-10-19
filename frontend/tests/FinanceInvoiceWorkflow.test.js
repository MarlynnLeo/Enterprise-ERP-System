import { createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import ARInvoices from '@/views/finance/ar/Invoices.vue'
import APInvoices from '@/views/finance/ap/Invoices.vue'
import CreditNoteActions from '@/views/finance/components/CreditNoteActions.vue'
import InvoiceSettlementHistory from '@/views/finance/components/InvoiceSettlementHistory.vue'
import { clickButton, fillField, financeDirectives, financeStubs } from './helpers/financeFormHarness'

const mocks = vi.hoisted(() => ({
  api: Object.fromEntries(['getARInvoices', 'getARInvoice', 'getARInvoicePayments', 'updateARInvoice', 'updateARInvoiceStatus', 'getAPInvoices', 'getAPInvoice', 'getAPInvoicePayments', 'updateAPInvoice', 'updateAPInvoiceStatus', 'getBankAccounts', 'createReceipt', 'createPayment', 'createCreditNoteRefund'].map(name => [name, vi.fn()])),
  message: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  confirm: vi.fn(), originals: vi.fn(), redLetter: vi.fn(),
  route: { query: {} },
}))
vi.mock('@/api/finance', () => ({ financeApi: { ...mocks.api, tax: { getRedLetterOriginals: mocks.originals, createRedLetter: mocks.redLetter } } }))
vi.mock('@/api', () => ({ financeApi: { settings: { getOptions: async () => ({ data: {} }) } }, purchaseApi: {} }))
vi.mock('@/api/sales', () => ({ salesApi: {} }))
vi.mock('@/utils/optionLoaders', () => ({
  searchSupplierOptions: async () => [{ id: 9, name: '测试供应商' }],
  searchCustomerPageOptions: async () => [{ id: 9, name: '测试客户' }],
  searchMaterialPageOptions: async () => [{ id: 501, name: '测试商品', price: 100 }],
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => mocks.route }))
vi.mock('@/services/printService', () => ({ default: {} }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks.message }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: mocks.confirm } }))

const fixture = (kind, status = '草稿') => ({ id: 7, invoiceNumber: `${kind}-7`, customerId: 9, supplierId: 9,
  customerName: '测试客户', supplierName: '测试供应商', status, invoiceDate: '2026-10-17', dueDate: '2026-10-31',
  totalAmount: 113, paidAmount: 0, balanceAmount: 113, taxRate: 0.13, taxAmount: 13,
  items: [{ id: 71, productId: 501, materialId: 501, materialName: '测试商品', productName: '测试商品', quantity: 1, unitPrice: 100, amount: 100 }],
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
let wrapper
const open = async (component, props = {}) => {
  wrapper = mount(component, { props, global: { plugins: [createPinia()], stubs: financeStubs, directives: financeDirectives } })
  await flushPromises()
}
const button = (scope, label) => scope.findAll('button').find(item => item.text().trim() === label)
const doubleClick = async (scope, label) => {
  const target = button(scope, label)
  target.element.click(); target.element.click()
  await flushPromises()
}
const viewDetails = async kind => {
  if (kind === 'AP') await clickButton(wrapper, '查看')
  else { wrapper.findAllComponents(financeStubs.ElTable)[0].vm.$emit('row-click', fixture('AR'), {}, { target: { closest: () => null } }); await flushPromises() }
  return wrapper.get(`[data-dialog="${kind === 'AP' ? '发票详情查看' : '发票详情'}"]`)
}
beforeEach(() => {
  window.__erpUserId = 77
  sessionStorage.clear()
  mocks.route.query = {}
  Object.values(mocks.api).forEach(mock => mock.mockReset().mockResolvedValue({ data: {} }))
  Object.values(mocks.message).forEach(mock => mock.mockReset())
  mocks.confirm.mockReset().mockResolvedValue('confirm')
  mocks.originals.mockReset().mockResolvedValue({ data: [{ id: 90, invoiceNumber: '原票', totalAmount: 113 }] })
  mocks.redLetter.mockReset().mockResolvedValue({ data: {} })
  for (const kind of ['AR', 'AP']) {
    mocks.api[`get${kind}Invoices`].mockResolvedValue({ data: { list: [fixture(kind)], total: 1 } })
    mocks.api[`get${kind}Invoice`].mockResolvedValue({ data: fixture(kind) })
    mocks.api[`get${kind}InvoicePayments`].mockResolvedValue({ data: [] })
  }
  mocks.api.getBankAccounts.mockResolvedValue({ data: [{ id: 3, accountName: '人民币银行', currencyCode: 'CNY' }] })
})
afterEach(() => { wrapper?.unmount(); delete window.__erpUserId; sessionStorage.clear() })

describe.each([
  { kind: 'AR', component: ARInvoices, editTitle: '编辑销售发票', submit: '确认', settle: '收款', create: 'createReceipt' },
  { kind: 'AP', component: APInvoices, editTitle: '编辑采购发票', submit: '保存', settle: '付款', create: 'createPayment' },
])('$kind 发票交互与完整历史', ({ kind, component, editTitle, submit, settle, create }) => {
  test('从凭证批量结果的invoiceId链接直接打开对应发票详情', async () => {
    mocks.route.query = { invoiceId: '7' }
    await open(component)
    expect(mocks.api[`get${kind}Invoice`]).toHaveBeenCalledExactlyOnceWith(7)
    expect(wrapper.find(`[data-dialog="${kind === 'AP' ? '发票详情查看' : '发票详情'}"]`).exists()).toBe(true)
  })
  test('同步双击保存仅写入一次，失败后可保留原输入重试', async () => {
    const pending = deferred()
    mocks.api[`update${kind}Invoice`].mockReturnValueOnce(pending.promise)
    await open(component); await clickButton(wrapper, '编辑')
    const form = wrapper.get(`[data-dialog="${editTitle}"]`)
    await doubleClick(form, submit)
    expect(mocks.api[`update${kind}Invoice`]).toHaveBeenCalledOnce()
    expect(button(form, '取消').element.disabled).toBe(true)
    pending.reject(new Error('保存连接失败'))
    await flushPromises()
    expect(wrapper.find(`[data-dialog="${editTitle}"]`).exists()).toBe(true)
    expect(button(form, '取消').element.disabled).toBe(false)
    await clickButton(form, submit)
    expect(mocks.api[`update${kind}Invoice`]).toHaveBeenCalledTimes(2)
    expect(wrapper.find(`[data-dialog="${editTitle}"]`).exists()).toBe(false)
  })

  test('同步双击收付款仅登记一次，失败后解锁并允许重试', async () => {
    mocks.api[`get${kind}Invoices`].mockResolvedValue({ data: { list: [fixture(kind, '已确认')], total: 1 } })
    const pending = deferred()
    mocks.api[create].mockReturnValueOnce(pending.promise)
    await open(component); await clickButton(wrapper, settle)
    const form = wrapper.get(`[data-dialog="记录${settle}"]`)
    await fillField(form, 'bankAccountId', 3)
    await doubleClick(form, '确认')
    expect(mocks.api[create]).toHaveBeenCalledOnce()
    expect(button(form, '取消').element.disabled).toBe(true)
    pending.reject(new Error('登记失败'))
    await flushPromises()
    expect(button(form, '取消').element.disabled).toBe(false)
    expect(form.text()).toContain('上次登记结果尚未确认')
    await fillField(form, 'amount', 20)
    await clickButton(form, '确认')
    expect(mocks.api[create]).toHaveBeenCalledOnce()
    expect(mocks.message.error).toHaveBeenCalledWith(expect.stringContaining('不能更改内容后重发'))
    await clickButton(form, '取消')
    await clickButton(wrapper, settle)
    const restored = wrapper.get(`[data-dialog="核对未确认的${settle}"]`)
    expect(restored.text()).toContain('¥113.00')
    await clickButton(restored, '重试原登记')
    expect(mocks.api[create]).toHaveBeenCalledTimes(2)
    expect(mocks.api[create].mock.calls[1]).toEqual(mocks.api[create].mock.calls[0])
    await clickButton(wrapper, settle)
    const fresh = wrapper.get(`[data-dialog="记录${settle}"]`)
    await fillField(fresh, 'bankAccountId', 3); await clickButton(fresh, '确认')
    expect(mocks.api[create].mock.calls[2][1].headers['Idempotency-Key']).not.toBe(mocks.api[create].mock.calls[0][1].headers['Idempotency-Key'])
  })

  test.each(['确认', '取消'])('%s状态修改期间只出现一次确认和一次写入', async action => {
    const pending = deferred()
    mocks.confirm.mockReturnValueOnce(pending.promise)
    mocks.api[`update${kind}InvoiceStatus`].mockRejectedValueOnce(new Error('状态更新失败'))
    await open(component)
    await doubleClick(wrapper.get('[data-column="操作"]'), action)
    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect(mocks.api[`update${kind}InvoiceStatus`]).not.toHaveBeenCalled()
    pending.resolve('confirm'); await flushPromises()
    expect(mocks.api[`update${kind}InvoiceStatus`]).toHaveBeenCalledExactlyOnceWith(7, { status: action === '确认' ? '已确认' : '已取消' })
    expect(button(wrapper.get('[data-column="操作"]'), action).element.disabled).toBe(false)
  })

  test('银行账户加载失败有重试入口，恢复后可登记', async () => {
    mocks.api[`get${kind}Invoices`].mockResolvedValue({ data: { list: [fixture(kind, '已确认')], total: 1 } })
    mocks.api.getBankAccounts.mockRejectedValueOnce(new Error('银行连接失败'))
    await open(component); await clickButton(wrapper, settle)
    const form = wrapper.get(`[data-dialog="记录${settle}"]`)
    expect(form.get('[role="alert"]').text()).toContain('银行连接失败')
    await clickButton(form, '确认'); expect(mocks.api[create]).not.toHaveBeenCalled()
    await clickButton(form, '重新加载银行账户')
    expect(form.find('[role="alert"]').exists()).toBe(false)
    await fillField(form, 'bankAccountId', 3); await clickButton(form, '确认')
    expect(mocks.api[create]).toHaveBeenCalledOnce()
  })

  test('刷新后即使发票余额已归零仍能原样核对已提交登记', async () => {
    mocks.api[`get${kind}Invoices`].mockResolvedValue({ data: { list: [fixture(kind, '已确认')], total: 1 } })
    mocks.api[create].mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({ data: { id: 91, replayed: true } })
    await open(component); await clickButton(wrapper, settle)
    const form = wrapper.get(`[data-dialog="记录${settle}"]`)
    await fillField(form, 'bankAccountId', 3); await clickButton(form, '确认')
    wrapper.unmount()
    mocks.api[`get${kind}Invoices`].mockResolvedValue({ data: { list: [{ ...fixture(kind, '已付款'), paidAmount: 113, balanceAmount: 0 }], total: 1 } })
    await open(component)
    const recovery = wrapper.get(`[data-dialog="核对未确认的${settle}"]`)
    expect(recovery.text()).toContain(`${kind}-7`)
    await doubleClick(recovery, '重试原登记')
    expect(mocks.api[create]).toHaveBeenCalledTimes(2)
    expect(mocks.api[create].mock.calls[1]).toEqual(mocks.api[create].mock.calls[0])
    expect(sessionStorage.length).toBe(0)
  })

  test('所有发票明细与核销记录均可查看，作废和本位尾差明确显示', async () => {
    const invoice = { ...fixture(kind), currencyCode: 'USD', exchangeRate: 6.66666667,
      items: Array.from({ length: 60 }, (_, i) => ({ ...fixture(kind).items[0], id: i, productName: `商品${i}`, materialName: `商品${i}` })),
    }
    const records = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, itemId: i + 100,
      receiptNumber: `R-${i + 1}`, paymentNumber: `P-${i + 1}`, paymentDate: '2026-10-17',
      status: i === 1 ? 'void' : 'normal', amount: 0.02, settlementAmount: 0.02,
      currencyCode: 'USD', baseSettlementAmount: 0.13, voidReason: '原记录有误',
    }))
    mocks.api[`get${kind}Invoice`].mockResolvedValue({ data: invoice })
    mocks.api[`get${kind}InvoicePayments`].mockResolvedValue({ data: kind === 'AP' ? { data: records, total: 23, invoice } : records })
    await open(component)
    const detail = await viewDetails(kind)
    expect(detail.text()).toContain('商品59')
    const history = detail.getComponent(InvoiceSettlementHistory)
    expect(history.props('records')).toHaveLength(23)
    expect(history.text()).toContain('共 23 条记录')
    expect(history.text()).toContain('已作废')
    expect(history.text()).toContain('原记录有误')
    expect(history.text()).toContain('US$0.02')
    expect(history.text()).toContain('¥0.13')
    await clickButton(history, '下一页')
    expect(history.text()).toContain(kind === 'AR' ? 'R-11' : 'P-11')
    history.getComponent(financeStubs.ElPagination).vm.$emit('update:currentPage', 3)
    await flushPromises()
    expect(history.text()).toContain(kind === 'AR' ? 'R-23' : 'P-23')
  })

  test('核销历史失败不冒充无记录，重试不丢失发票详情', async () => {
    mocks.api[`get${kind}InvoicePayments`].mockRejectedValueOnce(new Error('历史连接失败'))
    await open(component)
    const detail = await viewDetails(kind)
    expect(detail.get('[role="alert"]').text()).toContain('历史连接失败')
    expect(detail.getComponent(InvoiceSettlementHistory).find('empty-state-stub').exists()).toBe(false)
    await clickButton(detail, '重新加载核销记录')
    expect(detail.find('[role="alert"]').exists()).toBe(false)
    expect(mocks.api[`get${kind}Invoice`]).toHaveBeenCalledOnce()
    expect(mocks.api[`get${kind}InvoicePayments`]).toHaveBeenCalledTimes(2)
  })
})

test('应收编辑请求失败不打开空白覆盖表单；晚到响应不覆盖新增表单', async () => {
  mocks.api.getARInvoice.mockRejectedValueOnce(new Error('发票连接失败'))
  await open(ARInvoices); await clickButton(wrapper, '编辑')
  expect(wrapper.find('[data-dialog="编辑销售发票"]').exists()).toBe(false)
  const pending = deferred()
  mocks.api.getARInvoice.mockReturnValueOnce(pending.promise)
  await clickButton(wrapper, '编辑'); await clickButton(wrapper, '新增发票')
  pending.resolve({ data: fixture('AR') }); await flushPromises()
  expect(wrapper.find('[data-dialog="新增销售发票"]').exists()).toBe(true)
  expect(wrapper.find('[data-dialog="编辑销售发票"]').exists()).toBe(false)
  expect(wrapper.get('[data-dialog="新增销售发票"] [data-field="invoiceNumber"] input').element.value).toBe('')
})

describe.each(['ar', 'ap'])('%s 红字发票入口', kind => {
  const invoice = { id: 21, invoiceNumber: 'RED-21', status: '已确认', totalAmount: -113, taxAmount: -13, balanceAmount: -113 }
  test('美元禁用退款和红字税票且明确说明范围', async () => {
    await open(CreditNoteActions, { kind, invoice: { ...invoice, currencyCode: 'USD' } })
    expect(wrapper.text()).toContain('USD 退款及红字税票暂不支持')
    const refund = button(wrapper, kind === 'ar' ? '客户退款' : '收取退款')
    const red = button(wrapper, '红字税票')
    expect(refund.element.disabled).toBe(true); expect(red.element.disabled).toBe(true)
    refund.element.click(); red.element.click(); await flushPromises()
    expect(wrapper.find('[data-dialog]').exists()).toBe(false)
    expect(mocks.api.getBankAccounts).not.toHaveBeenCalled()
    expect(mocks.originals).not.toHaveBeenCalled()
  })
  test('人民币退款仅能选择人民币银行，连续点击仅写入一次', async () => {
    mocks.api.getBankAccounts.mockResolvedValue({ data: [{ id: 3, currencyCode: 'CNY' }, { id: 4, currencyCode: 'USD' }] })
    const pending = deferred(); mocks.api.createCreditNoteRefund.mockReturnValueOnce(pending.promise)
    await open(CreditNoteActions, { kind, invoice }); await clickButton(wrapper, kind === 'ar' ? '客户退款' : '收取退款')
    const form = wrapper.get('[data-dialog]')
    expect(form.find('option[value="4"]').exists()).toBe(false)
    await fillField(form, 'bankAccountId', 3)
    await doubleClick(form, '确认退款')
    expect(mocks.api.createCreditNoteRefund).toHaveBeenCalledOnce()
    expect(button(form, '取消').element.disabled).toBe(true)
    pending.resolve({ data: {} }); await flushPromises()
  })
})
