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
    'createPayment', 'createReceipt', 'generateReceiptNumber', 'voidPayment', 'voidReceipt'
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

beforeEach(() => {
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
afterEach(() => wrapper?.unmount())

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
    expect(mocks.api[createMethod]).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ invoiceId: 7, amount: 80, bankAccountId: 3 }))
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
    expect(mocks.api[createMethod]).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ invoiceId: 8, amount: 40 }))
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

  test('switching to cash removes the previously selected bank account', async () => {
    const form = await open()
    await fillField(form, 'invoiceId', 7)
    await fillField(form, 'bankAccountId', 3)
    await fillField(form, 'paymentMethod', 'cash')
    await clickButton(form, '确认')
    expect(mocks.api[createMethod]).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ paymentMethod: 'cash', bankAccountId: null }))
  })
})
