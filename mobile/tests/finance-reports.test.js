import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { Button, DatePicker, Empty } from 'vant'
import BalanceSheet from '@/views/finance/BalanceSheet.vue'
import IncomeStatement from '@/views/finance/IncomeStatement.vue'
import { financeApi } from '@/api'

vi.mock('@/api', () => ({ financeApi: { getBalanceSheet: vi.fn(), getIncomeStatement: vi.fn() } }))
const balance = {
  summary: { assetsTotal: 1200.5, liabilitiesTotal: 200.5, equityTotal: 1000, isBalanced: true, balanceDifference: 0 },
  assets: { title: '资产', totalAmount: 1200.5, items: [
    { id: 1, code: '1001', name: '库存现金', amount: 0 },
    { id: 2, code: '1002', name: '银行存款', amount: 1200.5 },
  ] },
  liabilities: { title: '负债', totalAmount: 200.5, items: [{ id: 3, code: '2202', name: '应付账款', amount: 200.5 }] },
  equity: { title: '所有者权益', totalAmount: 1000, items: [{ id: 4, code: '3001', name: '实收资本', amount: 1000 }] },
}
const income = [
  { id: 'income-total', code: 'INCOME', name: '一、营业收入', amount: 200, children: [{ id: 'income-1', code: '5001', name: '主营业务收入', amount: 200 }] },
  { id: 'cost-total', code: 'COST', name: '减：营业成本', amount: -80, children: [{ id: 'cost-1', code: '5401', name: '主营业务成本', amount: -80 }] },
  { id: 'gross-profit', code: 'GROSS_PROFIT', name: '二、毛利润', amount: 120, isCalculated: true },
  { id: 'expense-total', code: 'EXPENSE', name: '减：营业费用', amount: -40, children: [{ id: 'expense-1', code: '5602', name: '管理费用', amount: -40 }] },
  { id: 'net-income', code: 'NET_INCOME', name: '三、净利润', amount: 80, isCalculated: true },
]
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
let wrapper
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  financeApi.getBalanceSheet.mockReset().mockResolvedValue({ data: { data: balance } })
  financeApi.getIncomeStatement.mockReset().mockResolvedValue({ data: income })
})
afterEach(() => wrapper?.unmount())
const open = async component => {
  wrapper = shallowMount(component, { global: { renderStubDefaultSlot: true } })
  await flushPromises()
}

test('balance sheet renders backend summary and all account sections, preserving zero amounts', async () => {
  await open(BalanceSheet)
  expect(wrapper.findAll('.metric-value').map(item => item.text())).toEqual(['¥1,200.50', '¥200.50', '¥1,000.00'])
  expect(wrapper.findAll('.item-name').map(item => item.text())).toEqual(['库存现金', '银行存款', '应付账款', '实收资本'])
  expect(wrapper.findAll('.item-amount').map(item => item.text())).toEqual(['¥0.00', '¥1,200.50', '¥200.50', '¥1,000.00'])
  expect(wrapper.findComponent(Empty).exists()).toBe(false)
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})

test('an unbalanced report visibly preserves the backend accounting difference', async () => {
  financeApi.getBalanceSheet.mockResolvedValueOnce({ data: {
    ...balance, summary: { ...balance.summary, isBalanced: false, balanceDifference: 5067900.32 },
  } })
  await open(BalanceSheet)
  expect(wrapper.get('[role="alert"]').text()).toContain('资产负债表不平衡，差额 ¥5,067,900.32')
  expect(wrapper.findAll('.metric-value').map(item => item.text())).toEqual(['¥1,200.50', '¥200.50', '¥1,000.00'])
})

test('income statement reads the actual row array with signed deductions and calculated totals', async () => {
  await open(IncomeStatement)
  expect(wrapper.findAll('.metric-value').map(item => item.text())).toEqual(['¥200.00', '¥80.00', '¥80.00'])
  expect(wrapper.findAll('.section-title').map(item => item.text())).toEqual(income.map(row => row.name))
  expect(wrapper.findAll('.item-amount').map(item => item.text())).toEqual(['¥200.00', '¥-80.00', '¥-40.00'])
  expect(wrapper.findAll('.section-total > span:last-child').map(item => item.text())).toEqual(['¥200.00', '¥-80.00', '¥120.00', '¥-40.00', '¥80.00'])
  expect(wrapper.findComponent(Empty).exists()).toBe(false)
})

test('zero activity retains the calculated report rows and never formats a negative zero cost', async () => {
  financeApi.getIncomeStatement.mockResolvedValueOnce({ data: income.filter(row => row.isCalculated).map(row => ({ ...row, amount: 0 })) })
  await open(IncomeStatement)
  expect(wrapper.findAll('.metric-value').map(item => item.text())).toEqual(['¥0.00', '¥0.00', '¥0.00'])
  expect(wrapper.findAll('.section-title')).toHaveLength(2)
})

test.each([BalanceSheet, IncomeStatement])('malformed or unavailable reports show a retry, never fabricated zero totals', async component => {
  const api = component === BalanceSheet ? financeApi.getBalanceSheet : financeApi.getIncomeStatement
  api.mockResolvedValueOnce({ data: {} })
  await open(component)
  expect(wrapper.findAll('.metric-value')).toHaveLength(0)
  expect(wrapper.findComponent(Empty).props('description')).toContain('数据不完整')
  wrapper.findComponent(Button).vm.$emit('click')
  await flushPromises()
  expect(wrapper.findAll('.metric-value')).toHaveLength(3)
  expect(wrapper.findComponent(Empty).exists()).toBe(false)
})

test('nonfinite report amounts fail visibly instead of becoming zero', async () => {
  financeApi.getBalanceSheet.mockResolvedValueOnce({ data: { ...balance, summary: { ...balance.summary, assetsTotal: null } } })
  await open(BalanceSheet)
  expect(wrapper.findAll('.metric-value')).toHaveLength(0)
  expect(wrapper.findComponent(Empty).props('description')).toContain('金额不完整')
})

test('changing dates ignores an older balance sheet response that finishes last', async () => {
  const old = deferred()
  financeApi.getBalanceSheet.mockReturnValueOnce(old.promise)
  await open(BalanceSheet)
  wrapper.findComponent(DatePicker).vm.$emit('confirm', { selectedValues: ['2026', '09', '30'] })
  await flushPromises()
  expect(financeApi.getBalanceSheet).toHaveBeenLastCalledWith({ reportDate: '2026-09-30' })
  expect(wrapper.find('.date-value').text()).toBe('2026-09-30')
  old.resolve({ data: { ...balance, summary: { assetsTotal: 9, liabilitiesTotal: 8, equityTotal: 1 } } })
  await flushPromises()
  expect(wrapper.findAll('.metric-value').map(item => item.text())).toEqual(['¥1,200.50', '¥200.50', '¥1,000.00'])
})
