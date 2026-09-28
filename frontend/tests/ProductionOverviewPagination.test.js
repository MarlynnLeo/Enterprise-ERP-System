import { afterEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createPinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import ProductionDashboard from '@/views/dataoverview/ProductionDashboard.vue'

const tasks = vi.hoisted(() => vi.fn())
const statistics = vi.hoisted(() => vi.fn(async () => ({ data: { plans: { total: 7 } } })))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/api/production', () => ({ productionApi: {
  getProductionTasks: tasks,
  getDashboardStatistics: statistics,
  getProcessCompletionRates: vi.fn(async () => ({ data: [] })),
  getDashboardTrends: vi.fn(async () => ({ data: { months: [], plannedData: [], completedData: [] } }))
} }))
vi.mock('@/utils/chartCore', () => {
  const instances = new Map()
  return { default: class {
    constructor(context, config) { this.data = config.data; this.canvas = context.canvas; instances.set(this.canvas, this) }
    update() {}
    destroy() { instances.delete(this.canvas) }
    static getChart(canvas) { return instances.get(canvas) }
  } }
})
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { warning: vi.fn(), error: vi.fn() } }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))

const passthrough = { template: '<div><slot/><slot name="header"/></div>' }
const Table = defineComponent({ name: 'ElTable', props: ['data'], setup: () => () => h('div') })
const Pagination = defineComponent({
  name: 'ElPagination', props: ['total', 'pageSize', 'currentPage'],
  emits: ['update:currentPage', 'current-change'], setup: () => () => h('div')
})
let wrapper
afterEach(() => { wrapper?.unmount(); document.documentElement.removeAttribute('data-theme') })

describe('production overview task query', () => {
  test('paginates beyond the first 50 tasks and searches the complete dataset', async () => {
    document.documentElement.dataset.theme = 'workspace'
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () { return { canvas: this } })
    tasks.mockImplementation(async ({ page, pageSize }) => ({ data: {
      items: Array.from({ length: pageSize }, (_, index) => ({ id: (page - 1) * pageSize + index + 1, specification: 'M8' })), total: 80
    } }))
    wrapper = mount(ProductionDashboard, { global: {
      plugins: [createPinia()], directives: { loading: {} },
      stubs: { PageHeader: true, ElRow: passthrough, ElCol: passthrough, ElCard: passthrough, ElTable: Table,
        ElPagination: Pagination, ElInput: true, ElTableColumn: true, ElTag: true, ElRadioGroup: true, ElRadioButton: true }
    } })
    await flushPromises()
    const pagination = wrapper.getComponent(Pagination)
    expect(pagination.props()).toMatchObject({ total: 80, pageSize: 25, currentPage: 1 })
    pagination.vm.$emit('update:currentPage', 3)
    pagination.vm.$emit('current-change', 3)
    await flushPromises()
    expect(tasks).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3, pageSize: 25 }))
    expect(wrapper.getComponent(Table).props('data')[0]).toMatchObject({ id: 51, specs: 'M8' })
    wrapper.vm.search = '生产中'
    await wrapper.vm.$nextTick()
    wrapper.vm.searchTasks.flush()
    await flushPromises()
    expect(tasks).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, keyword: '生产中', keywordStatuses: expect.stringContaining('in_progress') }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const updated = wrapper.vm.lastUpdated
    statistics.mockRejectedValueOnce(new Error('statistics unavailable'))
    await expect(wrapper.vm.loadData()).rejects.toThrow('statistics unavailable')
    expect(wrapper.vm.statistics.plans.total).toBe(7)
    expect(wrapper.vm.lastUpdated).toBe(updated)
  })
})
