import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, test, vi } from 'vitest'
import BudgetExecution from '@/views/finance/budget/BudgetExecution.vue'

const Chart = vi.hoisted(() => vi.fn(function () { return { destroy: vi.fn() } }))
vi.mock('@/utils/chartCore', () => ({ default: Chart }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: '1' } }) }))
vi.mock('@/api/finance', () => ({
  financeApi: { budgets: {
    getList: vi.fn(async () => ({ data: { list: [{ id: 1, budgetName: 'Audit budget' }] } })),
    getAnalysis: vi.fn(async () => ({ data: {
      summary: { totalBudget: 120, totalActual: 30, totalVariance: 90, totalExecutionRate: 25 },
      details: [
        { accountName: 'Small', budgetAmount: 20, actualAmount: 10, variance: 10, executionRate: 50 },
        { accountName: 'Large', budgetAmount: 100, actualAmount: 20, variance: 80, executionRate: 20 }
      ]
    } }))
  } }
}))

const Passthrough = defineComponent({ template: '<div><slot/></div>' })
const Progress = defineComponent({ props: ['percentage'], template: '<div />' })
let wrapper
afterEach(() => wrapper?.unmount())

describe('budget execution API contract', () => {
  test('renders camelCase totals and ranks chart accounts by budget amount', async () => {
    wrapper = mount(BudgetExecution, {
      attachTo: document.body,
      global: {
        stubs: {
          PageHeader: true,
          FinanceQueryCard: true,
          ElRow: Passthrough,
          ElCol: Passthrough,
          ElCard: Passthrough,
          ElTable: true,
          ElTableColumn: true,
          ElFormItem: true,
          ElSelect: true,
          ElOption: true,
          ElTag: true,
          ElProgress: Progress,
          EmptyState: true
        },
        directives: { loading: () => {} }
      }
    })
    await flushPromises()

    expect(wrapper.findAll('.stat-value').map(card => card.text())).toEqual(['¥120.00', '¥30.00', '¥90.00'])
    expect(wrapper.findComponent(Progress).props('percentage')).toBe(25)
    expect(Chart).toHaveBeenCalledOnce()
    expect(Chart.mock.calls[0][1].data.labels).toEqual(['Large', 'Small'])
    expect(Chart.mock.calls[0][1].data.datasets[0].data).toEqual([100, 20])
  })
})
