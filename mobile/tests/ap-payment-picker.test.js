import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { ActionSheet, Button, Cell, Field, Form, Search, showToast } from 'vant'
import CreateAPPayment from '@/views/finance/CreateAPPayment.vue'
import { financeApi } from '@/api'

const router = vi.hoisted(() => ({ replace: vi.fn(), back: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => router }))
vi.mock('@/api', () => ({ financeApi: { getAPInvoices: vi.fn(), createAPPayment: vi.fn() } }))
vi.mock('vant', async importOriginal => ({ ...await importOriginal(), showToast: vi.fn() }))
const invoice = id => ({ id, invoiceNumber: `AP-${id}`, supplierName: '供应商甲', balanceAmount: 25, status: '已确认' })
const page = (ids, total) => ({ data: { list: ids.map(invoice), total } })
const field = label => wrapper.findAllComponents(Field).find(item => item.props('label') === label)
const button = text => wrapper.findAllComponents(Button).find(item => item.text() === text)
let wrapper
async function open() {
  wrapper = shallowMount(CreateAPPayment, { global: { renderStubDefaultSlot: true } })
  field('应付发票').vm.$emit('click')
  await flushPromises()
}
beforeEach(() => {
  financeApi.getAPInvoices.mockReset().mockResolvedValue(page([1], 1))
  financeApi.createAPPayment.mockReset().mockResolvedValue({ data: { id: 42 } })
})
afterEach(() => wrapper?.unmount())

describe('AP payment invoice selection', () => {
  test('requests payable invoices and reaches a selectable invoice beyond page one', async () => {
    financeApi.getAPInvoices.mockResolvedValueOnce(page(Array.from({ length: 20 }, (_, index) => index + 1), 21))
      .mockResolvedValueOnce(page([21], 21))
    await open()
    expect(financeApi.getAPInvoices).toHaveBeenLastCalledWith({ payableOnly: true, keyword: undefined, page: 1, pageSize: 20, limit: 20 })
    button('加载更多').vm.$emit('click')
    await flushPromises()
    expect(financeApi.getAPInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, limit: 20, payableOnly: true }))
    wrapper.findAllComponents(Cell).find(cell => cell.props('title') === 'AP-21').vm.$emit('click')
    await flushPromises()
    expect(field('应付发票').props('modelValue')).toBe('AP-21 · 供应商甲')
    wrapper.findComponent(Form).vm.$emit('submit')
    await flushPromises()
    expect(financeApi.createAPPayment).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: 21, amount: 25 }))
    expect(router.replace).toHaveBeenCalledWith('/finance/ap/payments/42')
  })

  test('search owns its results and later pages even when an older request finishes last', async () => {
    let resolveOld
    financeApi.getAPInvoices.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
      .mockResolvedValueOnce(page([100], 2)).mockResolvedValueOnce(page([101], 2))
    await open()
    const search = wrapper.findComponent(Search)
    search.vm.$emit('update:modelValue', '供应商甲')
    search.vm.$emit('search')
    await flushPromises()
    resolveOld(page([1], 1))
    await flushPromises()
    expect(wrapper.findAllComponents(Cell).map(cell => cell.props('title'))).toEqual(['AP-100'])
    search.vm.$emit('update:modelValue', '尚未提交的关键词')
    button('加载更多').vm.$emit('click')
    await flushPromises()
    expect(financeApi.getAPInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: '供应商甲', page: 2, payableOnly: true }))
    expect(wrapper.findAllComponents(Cell).map(cell => cell.props('title'))).toEqual(['AP-100', 'AP-101'])
  })

  test('keeps the selected identity when a new search replaces the option list', async () => {
    await open()
    wrapper.findComponent(Cell).vm.$emit('click')
    await flushPromises()
    financeApi.getAPInvoices.mockResolvedValueOnce(page([2], 1))
    field('应付发票').vm.$emit('click')
    await flushPromises()
    expect(field('应付发票').props('modelValue')).toBe('AP-1 · 供应商甲')
    field('付款金额').vm.$emit('update:modelValue', '26')
    wrapper.findComponent(Form).vm.$emit('submit')
    await flushPromises()
    expect(financeApi.createAPPayment).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('付款金额不能超过发票未付余额')
  })

  test('offers only the cash method supported by this form and submits the displayed method', async () => {
    await open()
    expect(field('支付方式').props()).toMatchObject({ modelValue: '现金', readonly: true, isLink: false })
    expect(wrapper.findComponent(ActionSheet).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('电子支付')
    wrapper.findComponent(Cell).vm.$emit('click')
    await flushPromises()
    wrapper.findComponent(Form).vm.$emit('submit')
    await flushPromises()
    expect(financeApi.createAPPayment).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: 1, paymentMethod: 'cash' }))
  })

  test('can retry a failed page without clearing an existing selection', async () => {
    financeApi.getAPInvoices.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page([3], 1))
    await open()
    button('加载失败，点击重试').vm.$emit('click')
    await flushPromises()
    expect(financeApi.getAPInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, payableOnly: true }))
    expect(wrapper.findComponent(Cell).props('title')).toBe('AP-3')
  })
})
