import { createRequire } from 'node:module'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { Search } from 'vant'
import ARInvoices from '@/views/finance/ARInvoices.vue'
import APInvoices from '@/views/finance/APInvoices.vue'
import { financeApi } from '@/api'

const require = createRequire(import.meta.url)
const { toInvoiceApi, fromInvoiceListQuery } = require('../../backend/src/utils/finance/invoiceFieldMap')
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }), useRoute: () => ({ query: {} }) }))
vi.mock('@/api', () => ({ financeApi: { getARInvoices: vi.fn(), getAPInvoices: vi.fn() } }))
const rows = ['已确认', '部分付款', '已付款', '已逾期'].map((status, index) => ({
  id: index + 1, status, invoice_number: `INV-${index + 1}`, total_amount: index ? 100 : 0,
  paid_amount: 0, supplier_name: '供应商甲', customer_name: '客户甲',
}))
let wrapper
beforeEach(() => {
  for (const [kind, method] of [['ap', 'getAPInvoices'], ['ar', 'getARInvoices']]) {
    financeApi[method].mockReset().mockImplementation(async query => {
      const filters = fromInvoiceListQuery(query, kind)
      const list = rows.filter(row => !filters.status || row.status === filters.status).map(row => toInvoiceApi(row, kind))
      return { data: { list, total: list.length } }
    })
  }
})
afterEach(() => { wrapper?.unmount(); vi.useRealTimers() })
const open = async component => {
  wrapper = shallowMount(component, { global: {
    renderStubDefaultSlot: true, stubs: { UniversalListPage: false }, directives: { permission() {} },
  } })
  await flushPromises()
}

test.each([ARInvoices, APInvoices])('invoice cards show the actual totalAmount including a real zero', async component => {
  await open(component)
  expect(wrapper.findAll('.list-card').map(card => card.findAll('.detail-item')[0].text())).toEqual([
    '发票金额¥0.00', '发票金额¥100.00', '发票金额¥100.00', '发票金额¥100.00',
  ])
})

test('AR collection tabs query actual Chinese invoice statuses and preserve partial receipts', async () => {
  await open(ARInvoices)
  for (const [label, status, invoiceNumber] of [
    ['待收款', '已确认', 'INV-1'], ['部分收款', '部分付款', 'INV-2'],
    ['已收款', '已付款', 'INV-3'], ['逾期', '已逾期', 'INV-4'],
  ]) {
    await wrapper.findAll('.filter-chip').find(chip => chip.text().startsWith(label)).trigger('click')
    await flushPromises()
    expect(financeApi.getARInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ status, page: 1 }))
    expect(wrapper.findAll('.item-subtitle').map(item => item.text())).toEqual([invoiceNumber + ' ·'])
  }
})

test.each([['ap', APInvoices, 'getAPInvoices'], ['ar', ARInvoices, 'getARInvoices']])('%s search uses the backend keyword contract for counterparties or invoice number', async (kind, component, method) => {
  await open(component)
  vi.useFakeTimers()
  wrapper.findComponent(Search).vm.$emit('update:modelValue', '  供应商甲  ')
  await vi.advanceTimersByTimeAsync(301)
  await flushPromises()
  const query = financeApi[method].mock.lastCall[0]
  expect(query.keyword).toBe('供应商甲')
  expect(query).not.toHaveProperty('search')
  expect(fromInvoiceListQuery(query, kind).keyword).toBe('供应商甲')
})
