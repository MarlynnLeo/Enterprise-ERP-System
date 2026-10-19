import { createPinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import Payments from '@/views/finance/ap/Payments.vue'
import Receipts from '@/views/finance/ar/Receipts.vue'
import { clickButton, fillField, financeDirectives, financeStubs } from './helpers/financeFormHarness'

const mocks = vi.hoisted(() => ({
  api: Object.fromEntries([
    'getPayments', 'getReceipts', 'getBankAccounts', 'getUnpaidAPInvoices',
    'getUnpaidReceiptInvoices', 'getAPInvoice', 'getARInvoice',
    'createPayment', 'createReceipt', 'generateReceiptNumber', 'voidPayment', 'voidReceipt', 'getPayment', 'getReceipt'
  ].map(name => [name, vi.fn()])),
  message: Object.fromEntries(['success', 'error', 'warning'].map(name => [name, vi.fn()]))
}))
vi.mock('@/api/finance', () => ({ financeApi: mocks.api }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasPermission: () => true, user: { id: 1 } }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks.message }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))
vi.mock('@/components/common/PrintDialog.vue', () => ({ default: { template: '<div />' } }))

let wrapper
const invoice = (id = 7, totalAmount = 100, balanceAmount = 80) => ({
  id, invoiceNumber: `INV-${id}`, supplierName: `Supplier ${id}`, customerName: `Customer ${id}`,
  totalAmount, paidAmount: totalAmount - balanceAmount, balanceAmount
})

describe.each([
  [Payments, 'getPayments', 'voidPayment', '作废付款记录'],
  [Receipts, 'getReceipts', 'voidReceipt', '作废收款记录']
])('settlement reversal submission', (component, listMethod, voidMethod, title) => {
  test('displays original USD separately from persisted CNY base amount in list and detail', async () => {
    const receipt = listMethod === 'getReceipts'
    const record = {
      id: 9, amount: 20, totalAmount: 20, status: 'normal', paymentNumber: 'PAY-USD', receiptNumber: 'REC-USD',
      currencyCode: 'USD', exchangeRate: 7.12345678, baseAmount: 142.46
    }
    mocks.api[listMethod].mockResolvedValue({ data: { list: [record], total: 1 } })
    mocks.api[receipt ? 'getReceipt' : 'getPayment'].mockResolvedValue({ data: record })
    wrapper = mount(component, { global: {
      plugins: [createPinia()], stubs: { ...financeStubs, PrintDialog: true, ElSwitch: true }, directives: financeDirectives
    } })
    await flushPromises()
    expect(wrapper.get(`[data-column="${receipt ? '收款金额' : '金额'}"]`).text()).toContain('US$20.00')
    expect(wrapper.get('[data-column="本位金额 (CNY)"]').text()).toContain('¥142.46')
    expect(wrapper.findAll('button').some(button => button.text() === '打印')).toBe(false)
    await wrapper.get(`[data-column="${receipt ? '收' : '付'}款编号"] span`).trigger('click')
    await flushPromises()
    const detail = wrapper.get(`[data-dialog="${receipt ? '收' : '付'}款记录详情"]`)
    expect(detail.text()).toContain('US$20.00')
    expect(detail.text()).toContain('¥142.46')
    expect(detail.text()).toContain('7.12345678')
  })

  test('validates before reversal and locks duplicate submissions until the request completes', async () => {
    mocks.api[listMethod].mockResolvedValue({ data: { list: [{ id: 9, amount: 25, totalAmount: 25, status: 'normal' }], total: 1 } })
    wrapper = mount(component, { global: {
      plugins: [createPinia()], stubs: { ...financeStubs, PrintDialog: true, ElSwitch: true }, directives: financeDirectives
    } })
    await flushPromises()
    await clickButton(wrapper, '作废')
    const form = wrapper.get(`[data-dialog="${title}"]`)
    await clickButton(form, '确认作废')
    expect(mocks.api[voidMethod]).not.toHaveBeenCalled()
    await fillField(form, 'voidReason', '原始财务记录存在录入错误')
    const pending = deferred()
    mocks.api[voidMethod].mockReturnValueOnce(pending.promise)
    const confirm = form.findAll('button').find(button => button.text() === '确认作废')
    confirm.element.click(); confirm.element.click()
    await flushPromises()
    expect(mocks.api[voidMethod]).toHaveBeenCalledExactlyOnceWith(9, { voidReason: '原始财务记录存在录入错误' })
    pending.resolve({ data: {} })
    await flushPromises()
    expect(wrapper.find(`[data-dialog="${title}"]`).exists()).toBe(false)
  })
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
const settlementRequestOptions = { headers: { 'Idempotency-Key': expect.any(String) } }

beforeEach(() => {
  window.__erpUserId = 1
  sessionStorage.clear()
  Object.values(mocks.api).forEach(mock => mock.mockReset().mockResolvedValue({ data: {} }))
  Object.values(mocks.message).forEach(mock => mock.mockReset())
  for (const method of ['getPayments', 'getReceipts']) {
    mocks.api[method].mockResolvedValue({ data: { list: [], total: 0 } })
  }
  for (const method of ['getUnpaidAPInvoices', 'getUnpaidReceiptInvoices']) {
    mocks.api[method].mockResolvedValue({ data: [invoice(), invoice(8, 60, 40)] })
  }
  for (const method of ['getAPInvoice', 'getARInvoice']) {
    mocks.api[method].mockResolvedValue({ data: invoice() })
  }
  mocks.api.getBankAccounts.mockResolvedValue({ data: [{ id: 3, accountName: '银行', accountNumber: '1234' }] })
  mocks.api.generateReceiptNumber.mockResolvedValue({ data: { receiptNumber: 'REC-1' } })
})
afterEach(() => { wrapper?.unmount(); delete window.__erpUserId; sessionStorage.clear() })

describe.each([
  { title: '例外付款录入', component: Payments, detailMethod: 'getAPInvoice', createMethod: 'createPayment' },
  { title: '例外收款录入', component: Receipts, detailMethod: 'getARInvoice', createMethod: 'createReceipt' }
])('$title', ({ title, component, detailMethod, createMethod }) => {
  const open = async () => {
    wrapper = mount(component, { global: {
      plugins: [createPinia()],
      stubs: { ...financeStubs, PrintDialog: true, ElSwitch: true },
      directives: financeDirectives
    } })
    await flushPromises()
    await clickButton(wrapper, title)
    return wrapper.get(`[data-dialog="${title}"]`)
  }

  test('uses canonical total and remaining amounts, then submits the selected invoice', async () => {
    const form = await open()
    expect(form.get('[data-field="invoiceId"] option[value="7"]').text()).toContain('80.00')
    await fillField(form, 'invoiceId', 7)
    expect(form.get('[data-field="amount"] input').element.value).toBe('80')
    expect(form.get('[data-field="发票金额"] input').element.value).toContain('100.00')
    await fillField(form, 'bankAccountId', 3)
    await clickButton(form, '确认')
    expect(mocks.api[createMethod]).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ invoiceId: 7, amount: 80, bankAccountId: 3 }), settlementRequestOptions)
  })

  test('settles USD using the invoice confirmation rate and a USD bank, with explicit original and base amounts', async () => {
    const usd = { ...invoice(), currencyCode: 'USD', exchangeRate: '7.12345678' }
    mocks.api[detailMethod].mockResolvedValue({ data: usd })
    for (const method of ['getUnpaidAPInvoices', 'getUnpaidReceiptInvoices']) mocks.api[method].mockResolvedValue({ data: [usd] })
    mocks.api.getBankAccounts.mockResolvedValue({ data: [
      { id: 3, accountName: '人民币户', currencyCode: 'CNY' },
      { id: 4, accountName: '美元户', currency: 'USD' }
    ] })
    const form = await open()
    expect(form.get('[data-field="invoiceId"] option[value="7"]').text()).toContain('US$80.00')
    await fillField(form, 'invoiceId', 7)
    expect(form.get('[data-field="发票金额"] input').element.value).toBe('US$100.00')
    expect(form.text()).toContain('1 USD = 7.12345678 CNY')
    expect(form.text()).toContain('¥569.88 CNY')
    expect(form.find('[data-field="bankAccountId"] option[value="3"]').exists()).toBe(false)
    expect(form.find('[data-field="bankAccountId"] option[value="4"]').exists()).toBe(true)
    expect(form.find('[data-field="paymentMethod"] option[value="cash"]').exists()).toBe(false)
    await fillField(form, 'amount', 20)
    expect(form.text()).toContain('¥142.47 CNY')
    await fillField(form, 'bankAccountId', 4)
    await clickButton(form, '确认')
    expect(mocks.api[createMethod]).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      invoiceId: 7, amount: 20, currencyCode: 'USD', exchangeRate: '7.12345678', bankAccountId: 4
    }), settlementRequestOptions)
  })

  test('blocks a USD invoice without a confirmed exchange rate', async () => {
    mocks.api[detailMethod].mockResolvedValue({ data: { ...invoice(), currencyCode: 'USD', exchangeRate: null } })
    mocks.api.getBankAccounts.mockResolvedValue({ data: [{ id: 4, accountName: '美元户', currencyCode: 'USD' }] })
    const form = await open()
    await fillField(form, 'invoiceId', 7)
    await fillField(form, 'bankAccountId', 4)
    await clickButton(form, '确认')
    expect(mocks.api[createMethod]).not.toHaveBeenCalled()
    expect(mocks.message.warning).toHaveBeenCalledWith(expect.stringContaining('确认汇率'))
  })

  test('changing from a CNY invoice to USD clears the old bank selection', async () => {
    mocks.api[detailMethod].mockResolvedValueOnce({ data: invoice() }).mockResolvedValueOnce({
      data: { ...invoice(8), currencyCode: 'USD', exchangeRate: 7.2 }
    })
    const form = await open()
    await fillField(form, 'invoiceId', 7)
    await fillField(form, 'bankAccountId', 3)
    await fillField(form, 'invoiceId', 8)
    await clickButton(form, '确认')
    expect(mocks.api[createMethod]).not.toHaveBeenCalled()
    expect(mocks.message.warning).toHaveBeenCalledWith('请选择 USD 同币种银行账户')
  })

  test('a slower earlier invoice cannot overwrite the current selection', async () => {
    const old = deferred()
    mocks.api[detailMethod].mockReturnValueOnce(old.promise).mockResolvedValueOnce({ data: invoice(8, 60, 40) })
    const form = await open()
    await fillField(form, 'invoiceId', 7)
    expect(form.findAll('button').find(button => button.text() === '确认').element.disabled).toBe(true)
    await fillField(form, 'invoiceId', 8)
    old.resolve({ data: invoice(7, 100, 80) })
    await flushPromises()
    expect(form.get('[data-field="amount"] input').element.value).toBe('40')
    await fillField(form, 'bankAccountId', 3)
    await clickButton(form, '确认')
    expect(mocks.api[createMethod]).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ invoiceId: 8, amount: 40 }), settlementRequestOptions)
  })

  test('a failed replacement detail clears the previous amount and blocks submission', async () => {
    const form = await open()
    await fillField(form, 'invoiceId', 7)
    await fillField(form, 'bankAccountId', 3)
    mocks.api[detailMethod].mockRejectedValueOnce(new Error('detail unavailable'))
    await fillField(form, 'invoiceId', 8)
    expect(form.get('[data-field="amount"] input').element.value).toBe('0')
    await fillField(form, 'amount', 20)
    await clickButton(form, '确认')
    expect(mocks.api[createMethod]).not.toHaveBeenCalled()
  })

  test('reopening the form invalidates a pending invoice response', async () => {
    const old = deferred()
    mocks.api[detailMethod].mockReturnValueOnce(old.promise)
    const form = await open()
    await fillField(form, 'invoiceId', 7)
    await clickButton(form, '取消')
    await clickButton(wrapper, title)
    old.resolve({ data: invoice() })
    await flushPromises()
    const reopened = wrapper.get(`[data-dialog="${title}"]`)
    expect(reopened.get('[data-field="amount"] input').element.value).toBe('0')
    expect(reopened.get('[data-field="invoiceId"] select').element.value).toBe('')
  })

  test('clearing the invoice invalidates its pending response', async () => {
    const old = deferred()
    mocks.api[detailMethod].mockReturnValueOnce(old.promise)
    const form = await open()
    await fillField(form, 'invoiceId', 7)
    await fillField(form, 'invoiceId', '')
    old.resolve({ data: invoice() })
    await flushPromises()
    expect(form.get('[data-field="amount"] input').element.value).toBe('0')
    await clickButton(form, '确认')
    expect(mocks.api[createMethod]).not.toHaveBeenCalled()
  })

  test.each([0, -1, 81])('rejects invalid amount %s before sending a financial write', async amount => {
    const form = await open()
    await fillField(form, 'invoiceId', 7)
    await fillField(form, 'bankAccountId', 3)
    await fillField(form, 'amount', amount)
    await clickButton(form, '确认')
    expect(mocks.api[createMethod]).not.toHaveBeenCalled()
    await fillField(form, 'amount', 20)
    await clickButton(form, '确认')
    expect(mocks.api[createMethod]).toHaveBeenCalledOnce()
  })

  test('two synchronous submit events produce one financial write', async () => {
    const pending = deferred()
    mocks.api[createMethod].mockReturnValueOnce(pending.promise)
    const form = await open()
    await fillField(form, 'invoiceId', 7)
    await fillField(form, 'bankAccountId', 3)
    const confirm = form.findAll('button').find(button => button.text() === '确认')
    confirm.element.click()
    confirm.element.click()
    await flushPromises()
    expect(mocks.api[createMethod]).toHaveBeenCalledOnce()
    pending.resolve({ data: {} })
    await flushPromises()
  })

  test('unknown outcomes retain the same payload and key, and a new form gets a new key', async () => {
    mocks.api[createMethod].mockRejectedValueOnce(new Error('timeout'))
    const form = await open()
    await fillField(form, 'invoiceId', 7); await fillField(form, 'bankAccountId', 3)
    await clickButton(form, '确认')
    expect(form.text()).toContain('上次登记结果尚未确认')
    await fillField(form, 'amount', 20); await clickButton(form, '确认')
    expect(mocks.api[createMethod]).toHaveBeenCalledOnce()
    expect(mocks.message.error).toHaveBeenCalledWith(expect.stringContaining('不能更改内容后重发'))
    await clickButton(form, '取消'); await clickButton(wrapper, title)
    const restored = wrapper.get(`[data-dialog="核对未确认的${createMethod === 'createReceipt' ? '收款' : '付款'}"]`)
    expect(restored.text()).toContain('¥80.00')
    await clickButton(restored, '重试原登记')
    expect(mocks.api[createMethod].mock.calls[1]).toEqual(mocks.api[createMethod].mock.calls[0])
    await clickButton(wrapper, title)
    const fresh = wrapper.get(`[data-dialog="${title}"]`)
    await fillField(fresh, 'invoiceId', 7); await fillField(fresh, 'bankAccountId', 3); await clickButton(fresh, '确认')
    expect(mocks.api[createMethod].mock.calls[2][1]).not.toEqual(mocks.api[createMethod].mock.calls[0][1])
  })

  test('failed bank loading offers retry and only permits a valid loaded account', async () => {
    mocks.api.getBankAccounts.mockRejectedValue(new Error('账户连接失败'))
    const form = await open()
    await fillField(form, 'invoiceId', 7)
    expect(form.get('[role="alert"]').text()).toContain('账户连接失败')
    await clickButton(form, '确认'); expect(mocks.api[createMethod]).not.toHaveBeenCalled()
    mocks.api.getBankAccounts.mockResolvedValue({ data: [{ id: 3, accountName: '恢复的银行', currencyCode: 'CNY' }] })
    await clickButton(form, '重新加载银行账户')
    expect(form.find('[role="alert"]').exists()).toBe(false)
    await fillField(form, 'bankAccountId', 3); await clickButton(form, '确认')
    expect(mocks.api[createMethod]).toHaveBeenCalledOnce()
  })

  test('switching to cash removes the previously selected bank account', async () => {
    const form = await open()
    await fillField(form, 'invoiceId', 7)
    await fillField(form, 'bankAccountId', 3)
    await fillField(form, 'paymentMethod', 'cash')
    await clickButton(form, '确认')
    expect(mocks.api[createMethod]).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ paymentMethod: 'cash', bankAccountId: null }), settlementRequestOptions)
  })
})
