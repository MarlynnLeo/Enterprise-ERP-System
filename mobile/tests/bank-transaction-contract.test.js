import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { Tag } from 'vant'
import BankTransactions from '@/views/finance/BankTransactions.vue'
import BankTransactionDetail from '@/views/finance/BankTransactionDetail.vue'
import { financeApi } from '@/api'

const route = vi.hoisted(() => ({ path: '/finance/cash/bank-transactions/1', params: { id: 1 } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }), useRoute: () => route }))
vi.mock('@/api', () => ({ financeApi: {
  getBankTransactions: vi.fn(), getBankTransaction: vi.fn(), getCashTransaction: vi.fn()
} }))
const incoming = { id: 1, transactionNumber: 'BANK-IN', transactionType: '转入', relatedParty: '甲', isReconciled: true }
const outgoing = { id: 2, transactionNumber: 'BANK-OUT', transactionType: '转出', relatedParty: '乙', isReconciled: false }
let wrapper
beforeEach(() => {
  route.path = '/finance/cash/bank-transactions/1'
  financeApi.getBankTransactions.mockReset().mockImplementation(async params => {
    const list = [incoming, outgoing].filter(item => !params.transactionType || item.transactionType === params.transactionType)
    return { data: { list, total: list.length } }
  })
  financeApi.getBankTransaction.mockResolvedValue({ data: incoming })
  financeApi.getCashTransaction.mockResolvedValue({ data: { id: 1, amount: 20 } })
})
afterEach(() => wrapper?.unmount())

describe('bank transaction filtering and reconciliation', () => {
  test('transfer tabs query transactionType and retain matching cards independently of reconciliation', async () => {
    wrapper = shallowMount(BankTransactions, { global: {
      renderStubDefaultSlot: true, stubs: { UniversalListPage: false }, directives: { permission() {} }
    } })
    await flushPromises()
    expect(wrapper.findAll('.status-tag').map(tag => tag.text())).toEqual(['已对账', '未对账'])
    for (const [label, expected] of [['转入', 'BANK-IN'], ['转出', 'BANK-OUT']]) {
      await wrapper.findAll('.filter-chip').find(chip => chip.text().startsWith(label)).trigger('click')
      await flushPromises()
      expect(financeApi.getBankTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ transactionType: label, page: 1 }))
      expect(financeApi.getBankTransactions.mock.lastCall[0]).not.toHaveProperty('status')
      expect(wrapper.findAll('.item-subtitle').map(item => item.text())).toEqual([expected + ' ·'])
    }
  })

  test.each([true, false])('renders the actual camelCase reconciliation flag %s', async isReconciled => {
    financeApi.getBankTransaction.mockResolvedValueOnce({ data: { ...incoming, isReconciled } })
    wrapper = shallowMount(BankTransactionDetail, { global: { renderStubDefaultSlot: true } })
    await flushPromises()
    expect(wrapper.findComponent(Tag).text()).toBe(isReconciled ? '已对账' : '未对账')
  })

  test('cash details do not invent a bank reconciliation state', async () => {
    route.path = '/finance/cash/cash-transactions/1'
    wrapper = shallowMount(BankTransactionDetail, { global: { renderStubDefaultSlot: true } })
    await flushPromises()
    expect(financeApi.getCashTransaction).toHaveBeenCalledWith(1)
    expect(wrapper.findComponent(Tag).exists()).toBe(false)
  })
})
