import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import ProductionDataView from '@/views/production/ProductionDataView.vue'

const getDashboardStatistics = vi.hoisted(() => vi.fn())
vi.mock('@/api/production', () => ({
  productionApi: {
    getDashboardStatistics,
    getPendingTasks: vi.fn(async () => ({ data: [] })),
    getProcessCompletionRates: vi.fn(async () => ({ data: [] })),
    getDashboardTrends: vi.fn(async () => ({ data: { days: [], plannedData: [], completedData: [] } })),
    getSchedulingGanttData: vi.fn(async () => ({ data: { groups: [] } }))
  }
}))
vi.mock('@/utils/echartsCore', () => ({
  echarts: { init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() })) }
}))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { success: vi.fn(), error: vi.fn() } }))

const Passthrough = defineComponent({ template: '<div><slot/></div>' })
const mountDashboard = () => mount(ProductionDataView, {
  global: {
    stubs: {
      PageHeader: true,
      ElRow: Passthrough,
      ElCol: Passthrough,
      ElIcon: true,
      ElTable: true,
      ElTableColumn: true,
      ElRadioGroup: true,
      ElRadioButton: true,
      ElButton: true,
      ElTag: true,
      ElDatePicker: true,
      EmptyState: true
    },
    directives: { loading: () => {} }
  }
})

describe('production dashboard statistics contract', () => {
  test('renders camelCase quality rate and in-progress plan count from the API', async () => {
    getDashboardStatistics.mockResolvedValue({ data: {
      plans: { total: 8, pending: 7, completed: 1, inProgress: 7 },
      tasks: { total: 8, inProgress: 6, completed: 1, pending: 1 },
      processes: { completed: 2, total: 2, rate: '100.0%' },
      reports: { total: 2, today: 2 },
      production: { totalQuantity: 20, qualifiedQuantity: 20, qualityRate: 100 }
    } })
    const wrapper = mountDashboard()
    await flushPromises()

    expect(wrapper.findAll('.stat-card__value').map(card => card.text())).toEqual(['8', '8', '2 / 2', '100%'])
    expect(wrapper.findAll('.stat-card__sub em')[0].text()).toBe('7')
    expect(wrapper.text()).not.toContain('undefined')
    wrapper.unmount()
  })

  test('keeps zero defaults when an endpoint returns partial statistics', async () => {
    getDashboardStatistics.mockResolvedValue({ data: { plans: { total: 3 }, production: {} } })
    const wrapper = mountDashboard()
    await flushPromises()

    expect(wrapper.findAll('.stat-card__value').map(card => card.text())).toEqual(['3', '0', '0 / 0', '0%'])
    expect(wrapper.findAll('.stat-card__sub em')[0].text()).toBe('0')
    expect(wrapper.text()).not.toContain('undefined')
    wrapper.unmount()
  })
})
