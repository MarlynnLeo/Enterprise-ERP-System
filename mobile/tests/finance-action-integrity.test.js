import { reactive } from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Button, Field, Form, showConfirmDialog } from 'vant'
import CreateCashTransaction from '@/views/finance/CreateCashTransaction.vue'
import ARInvoiceDetail from '@/views/finance/ARInvoiceDetail.vue'
import APInvoiceDetail from '@/views/finance/APInvoiceDetail.vue'
import ARReceiptDetail from '@/views/finance/ARReceiptDetail.vue'
import APPaymentDetail from '@/views/finance/APPaymentDetail.vue'
import { permission } from '@/directives/permission'

const state = vi.hoisted(() => ({ auth: null, api: Object.fromEntries([
  'createCashTransaction', 'getARInvoiceById', 'getAPInvoiceById', 'getARReceiptById', 'getAPPaymentById',
  'updateARInvoiceStatus', 'updateAPInvoiceStatus', 'voidARReceipt', 'voidAPPayment'
].map(name => [name, vi.fn()])) }))
vi.mock('@/api', () => ({ financeApi: state.api }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 1 } }), useRouter: () => ({ replace: vi.fn(), back: vi.fn() }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => state.auth }))
vi.mock('vant', async original => ({ ...await original(), showConfirmDialog: vi.fn().mockResolvedValue(true), showToast: vi.fn() }))
let wrapper
const open = async component => {
  wrapper = shallowMount(component, { global: { renderStubDefaultSlot: true, directives: { permission } } })
  await flushPromises()
}
const field = label => wrapper.findAllComponents(Field).find(item => item.props('label') === label)
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
beforeEach(() => {
  for (const fn of Object.values(state.api)) fn.mockReset().mockResolvedValue({ data: { id: 1, status: '草稿' } })
  showConfirmDialog.mockClear()
  state.auth = reactive({ permissionsLoaded: true, permissions: [],
    hasPermission(code) { return this.permissions.includes(code) }, hasChildPermission: () => false })
})
afterEach(() => wrapper?.unmount())

describe('cash transaction writes', () => {
  test.each(['NaN', 'Infinity', '-1', '0'])('rejects invalid amount %s before sending the request', async amount => {
    await open(CreateCashTransaction)
    field('金额').vm.$emit('update:modelValue', amount)
    field('交易说明').vm.$emit('update:modelValue', '现金支出')
    wrapper.findComponent(Form).vm.$emit('submit')
    await flushPromises()
    expect(state.api.createCashTransaction).not.toHaveBeenCalled()
  })

  test('duplicate submit events send one financial transaction', async () => {
    const pending = deferred()
    state.api.createCashTransaction.mockReturnValueOnce(pending.promise)
    await open(CreateCashTransaction)
    field('金额').vm.$emit('update:modelValue', '25')
    field('交易说明').vm.$emit('update:modelValue', '现金支出')
    wrapper.findComponent(Form).vm.$emit('submit')
    wrapper.findComponent(Form).vm.$emit('submit')
    await flushPromises()
    expect(state.api.createCashTransaction).toHaveBeenCalledOnce()
    pending.resolve({ data: { id: 9 } })
    await flushPromises()
  })
})

describe.each([
  [ARInvoiceDetail, 'finance:ar:approve', 'finance:ar:update'],
  [APInvoiceDetail, 'finance:ap:approve', 'finance:ap:update'],
  [ARReceiptDetail, 'finance:ar:receive', 'finance:ar:update'],
  [APPaymentDetail, 'finance:ap:pay', 'finance:ap:update']
])('finance action permissions', (component, required, unrelated) => {
  test(`requires ${required} and responds to its revocation`, async () => {
    state.auth.permissions = [unrelated]
    await open(component)
    expect(wrapper.get('.action-section').element.style.display).toBe('none')
    state.auth.permissions = [required]
    await flushPromises()
    expect(wrapper.get('.action-section').element.style.display).not.toBe('none')
    state.auth.permissions = []
    await flushPromises()
    expect(wrapper.get('.action-section').element.style.display).toBe('none')
  })
})

test('invoice confirmation is locked while the confirmation dialog is pending', async () => {
  const pending = deferred()
  showConfirmDialog.mockReturnValueOnce(pending.promise)
  await open(ARInvoiceDetail)
  const confirm = wrapper.findAllComponents(Button).find(button => button.text() === '确认发票')
  confirm.vm.$emit('click'); confirm.vm.$emit('click')
  await flushPromises()
  expect(showConfirmDialog).toHaveBeenCalledOnce()
  pending.resolve(true)
  await flushPromises()
  expect(state.api.updateARInvoiceStatus).toHaveBeenCalledExactlyOnceWith(1, '已确认')
})
