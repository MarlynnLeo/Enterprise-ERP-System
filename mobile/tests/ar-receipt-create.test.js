import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { Form, Field, Cell, Button } from 'vant'
import Receipt from '@/views/finance/CreateARReceipt.vue'

const mocks = vi.hoisted(() => ({ invoices: vi.fn(), accounts: vi.fn(), create: vi.fn(), toast: vi.fn(), replace: vi.fn(), leave: vi.fn(), update: vi.fn() }))
vi.mock('@/api', () => ({ financeApi: { getARUnpaidInvoices: mocks.invoices, getARReceiptAccounts: mocks.accounts, createARReceipt: mocks.create } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ back: vi.fn(), replace: mocks.replace }), onBeforeRouteLeave: mocks.leave, onBeforeRouteUpdate: mocks.update }))
vi.mock('vant', async original => ({ ...await original(), showToast: mocks.toast }))
let wrapper
const invoice = (id = 1) => ({ id, invoiceNumber: `AR-${id}`, customerName: '客户', balanceAmount: 100 })
beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset())
  mocks.invoices.mockImplementation(async ({ page }) => ({ data: { list: [invoice(page)], total: 2 } }))
  mocks.accounts.mockResolvedValue({ data: { list: [{ id: 8, accountName: '收款账户', accountNumber: '1234' }], total: 1 } })
  mocks.create.mockResolvedValue({ data: { id: 9 } })
  wrapper = shallowMount(Receipt, { global: { renderStubDefaultSlot: true } })
})
afterEach(() => wrapper?.unmount())
const field = label => wrapper.findAllComponents(Field).find(f => f.props('label') === label)
async function chooseInvoice() {
  await field('应收发票').trigger('click')
  await flushPromises()
  await wrapper.findAllComponents(Cell).find(c => c.props('title') === 'AR-1').trigger('click')
}
test('picker loads the next page, searches remotely, and retains selected invoice outside current results', async () => {
  await chooseInvoice()
  await wrapper.vm.loadMoreInvoices()
  expect(mocks.invoices).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  expect(wrapper.vm.invoices.map(i => i.id)).toEqual([1, 2])
  wrapper.vm.invoiceKeyword = 'AR-51'
  mocks.invoices.mockResolvedValueOnce({ data: { list: [invoice(51)], total: 1 } })
  await wrapper.vm.searchInvoices()
  expect(mocks.invoices).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, keyword: 'AR-51' }))
  expect(field('应收发票').props('modelValue')).toContain('AR-1')
  expect(wrapper.vm.invoices[0].id).toBe(51)
})
test.each(['bank_transfer', 'check', 'electronic'])('%s requires an account then sends its id and clears the unsaved guard after success', async method => {
  await chooseInvoice()
  wrapper.vm.selectMethod({ value: method })
  await wrapper.vm.submitForm()
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.toast).toHaveBeenLastCalledWith('请选择收款账户')
  await wrapper.vm.openAccountSheet()
  await flushPromises()
  await wrapper.findAllComponents(Cell).find(c => c.props('title') === '收款账户').trigger('click')
  await wrapper.findComponent(Form).vm.$emit('submit')
  await flushPromises()
  expect(mocks.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ invoiceId: 1, amount: 100, paymentMethod: method, bankAccountId: 8 }))
  expect(await mocks.leave.mock.calls[0][0]()).toBe(true)
  expect(mocks.replace).toHaveBeenCalledWith('/finance/ar/receipts/9')
})
test('cash switch drops the old bank account and submits once while an earlier save is pending', async () => {
  await chooseInvoice()
  wrapper.vm.selectMethod({ value: 'electronic' })
  wrapper.vm.selectAccount({ id: 8, accountName: '账户' })
  wrapper.vm.selectMethod({ value: 'cash' })
  let finish
  mocks.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const first = wrapper.vm.submitForm()
  await wrapper.vm.submitForm()
  expect(mocks.create).toHaveBeenCalledTimes(1)
  expect(mocks.create.mock.calls[0][0]).toEqual(expect.objectContaining({ paymentMethod: 'cash', bankAccountId: undefined }))
  finish({ data: { id: 9 } })
  await first
  await wrapper.vm.submitForm()
  expect(mocks.create).toHaveBeenCalledTimes(1)
})
test('pending receipt blocks leaving and picker mutations while the form is disabled', async () => {
  await chooseInvoice()
  let finish
  mocks.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const save = wrapper.vm.submitForm()
  await flushPromises()
  expect(wrapper.findComponent(Form).props('disabled')).toBe(true)
  expect(wrapper.attributes()).toHaveProperty('inert')
  expect(await mocks.leave.mock.calls[0][0]()).toBe(false)
  expect(await mocks.update.mock.calls[0][0]()).toBe(false)
  wrapper.vm.selectInvoice(invoice(9))
  wrapper.vm.selectMethod({ value: 'electronic' })
  wrapper.vm.selectAccount({ id: 8, accountName: '账户' })
  expect(wrapper.vm.form).toEqual(expect.objectContaining({ invoiceId: 1, paymentMethod: 'cash', bankAccountId: '' }))
  finish({ data: { id: 9 } })
  await save
  expect(await mocks.leave.mock.calls[0][0]()).toBe(true)
  expect(mocks.replace).toHaveBeenCalledTimes(1)
})
test('an unmounted receipt form ignores a late save response', async () => {
  await chooseInvoice()
  let finish
  mocks.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const save = wrapper.vm.submitForm()
  wrapper.unmount()
  mocks.toast.mockClear()
  finish({ data: { id: 9 } })
  await save
  expect(mocks.replace).not.toHaveBeenCalled()
  expect(mocks.toast).not.toHaveBeenCalled()
})
test('navigation failure after successful receipt creation cannot be retried as a new receipt', async () => {
  await chooseInvoice()
  mocks.replace.mockRejectedValueOnce(new Error('route component load failed'))
  await wrapper.vm.submitForm()
  expect(mocks.toast).toHaveBeenLastCalledWith('收款已创建，页面跳转失败，请从收款列表查看')
  expect(wrapper.vm.submitted).toBe(true)
  await wrapper.vm.submitForm()
  expect(mocks.create).toHaveBeenCalledTimes(1)
})
test.each(['NaN', 'Infinity', '-1', '0', '101'])('invalid or excessive amount %s is rejected before saving', async amount => {
  await chooseInvoice()
  wrapper.vm.form.amount = amount
  await wrapper.vm.submitForm()
  expect(mocks.create).not.toHaveBeenCalled()
})
test('load failure leaves a retry control and save failure retains input', async () => {
  mocks.invoices.mockRejectedValueOnce(new Error('offline'))
  await field('应收发票').trigger('click')
  await flushPromises()
  const retry = wrapper.findAllComponents(Button).find(b => b.text().includes('加载失败'))
  expect(retry).toBeDefined()
  await retry.trigger('click')
  await flushPromises()
  await wrapper.findAllComponents(Cell).find(c => c.props('title') === 'AR-1').trigger('click')
  wrapper.vm.form.notes = '保留备注'
  mocks.create.mockRejectedValueOnce(new Error('保存失败'))
  await wrapper.vm.submitForm()
  expect(wrapper.vm.form.notes).toBe('保留备注')
  expect(wrapper.vm.form.invoiceId).toBe(1)
  expect(mocks.replace).not.toHaveBeenCalled()
  expect(wrapper.vm.submitting).toBe(false)
  await wrapper.vm.submitForm()
  expect(mocks.create).toHaveBeenCalledTimes(2)
  expect(mocks.replace).toHaveBeenCalledTimes(1)
})
