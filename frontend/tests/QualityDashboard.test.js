import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import QualityDashboard from '@/views/dataoverview/QualityDashboard.vue'

const { qualityApi, Chart, push, message } = vi.hoisted(() => ({
  qualityApi: {
    getQualityStatistics: vi.fn(),
    getDefectItems: vi.fn(),
    getQualityTrends: vi.fn(),
  },
  Chart: vi.fn(function (_context, config) {
    this.config = config
    this.destroy = vi.fn()
  }),
  push: vi.fn(),
  message: { error: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/api', () => ({ qualityApi }))
vi.mock('@/utils/chartCore', () => ({ default: Chart }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: message }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))

const Passthrough = defineComponent({ template: '<div><slot name="header"/><slot/></div>' })
const Table = defineComponent({
  props: ['data', 'emptyText'],
  emits: ['row-click'],
  setup: (props, { emit }) => () => h('div', Array.isArray(props.data) && props.data.length
    ? props.data.map(row => h('button', {
      onClick: () => emit('row-click', row, { type: 'default' }, { target: document.body }),
    }, row.inspectionNo))
    : props.emptyText),
})
const Pagination = defineComponent({
  props: ['total', 'currentPage', 'pageSize'],
  emits: ['current-change', 'size-change', 'update:currentPage', 'update:pageSize'],
  template: '<div/>',
})
const SearchInput = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>',
})
const RadioGroup = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<div><slot/></div>',
})
const EmptyState = defineComponent({ props: ['description'], template: '<p>{{ description }}</p>' })

const statistics = {
  incoming: { total: 20, passRate: '40.0%' },
  process: { total: 3, passRate: '100.0%' },
  final: { total: 3, passRate: '66.7%' },
  defects: { total: 4, types: 2 },
}
const trends = [
  { month: '2026-08', inspectionType: 'incoming', total: 10, passed: 5 },
  { month: '2026-09', inspectionType: 'incoming', total: 10, passed: 3 },
  { month: '2026-09', inspectionType: 'process', total: 2, passed: 2 },
  { month: '2026-09', inspectionType: 'final', total: 2, passed: 1 },
]
const inspection = id => ({ id, inspectionNo: `QC-${id}`, inspectionType: 'incoming' })
const paginated = (list, total = list.length) => ({ data: { list, total, page: 1, pageSize: 10 } })
const latestLine = () => Chart.mock.calls.filter(([, config]) => config.type === 'line').at(-1)?.[1]
let wrapper

const openDashboard = () => {
  wrapper = mount(QualityDashboard, { global: {
    stubs: {
      PageHeader: true,
      ElRow: Passthrough,
      ElCol: Passthrough,
      ElCard: Passthrough,
      ElTable: Table,
      ElTableColumn: true,
      ElPagination: Pagination,
      ElInput: SearchInput,
      ElRadioGroup: RadioGroup,
      ElRadioButton: true,
      ElTag: true,
      EmptyState,
    },
    directives: { loading: () => {} },
  } })
  return wrapper
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date(2026, 8, 14, 12))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  qualityApi.getQualityStatistics.mockReset().mockResolvedValue({ data: statistics })
  qualityApi.getDefectItems.mockReset().mockResolvedValue(paginated([inspection(1)], 23))
  qualityApi.getQualityTrends.mockReset().mockResolvedValue({ data: {
    trends,
    defectTypes: [{ defectType: '尺寸超差', count: 3 }, { defectType: '外观不良', count: 1 }],
  } })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
})

describe('quality dashboard API contract', () => {
  test('renders response.data statistics and camelCase trend and defect fields', async () => {
    openDashboard()
    await flushPromises()

    expect(wrapper.findAll('.stat-value').map(card => card.text())).toEqual(['20', '3', '3', '4'])
    expect(wrapper.findAll('.stat-secondary-value').map(card => card.text()))
      .toEqual(['40.0%', '100.0%', '66.7%', '2'])
    const line = latestLine()
    expect(line.data.datasets.map(dataset => dataset.data)).toEqual([
      [null, null, null, null, 50, 30],
      [null, null, null, null, null, 100],
      [null, null, null, null, null, 50],
    ])
    expect(line.options.elements.point.radius).toBeGreaterThan(0)
    const pie = Chart.mock.calls.find(([, config]) => config.type === 'pie')[1]
    expect(pie.data.labels).toEqual(['尺寸超差', '外观不良'])
    expect(pie.data.datasets[0].data).toEqual([3, 1])
  })

  test('uses server rows and totals when changing pages and page size', async () => {
    openDashboard()
    await flushPromises()
    expect(wrapper.findComponent(Table).props('data')).toEqual([inspection(1)])
    expect(wrapper.findComponent(Pagination).props('total')).toBe(23)

    qualityApi.getDefectItems.mockResolvedValue(paginated([inspection(11)], 23))
    wrapper.findComponent(Pagination).vm.$emit('current-change', 2)
    await flushPromises()
    expect(qualityApi.getDefectItems).toHaveBeenLastCalledWith({ page: 2, pageSize: 10 })
    expect(wrapper.findComponent(Table).text()).toContain('QC-11')

    wrapper.findComponent(Pagination).vm.$emit('size-change', 20)
    await flushPromises()
    expect(qualityApi.getDefectItems).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
  })

  test('searches on the server, resets the page, and clears the keyword', async () => {
    openDashboard()
    await flushPromises()
    wrapper.findComponent(Pagination).vm.$emit('current-change', 2)
    await flushPromises()

    qualityApi.getDefectItems.mockResolvedValue(paginated([inspection(22)]))
    await wrapper.find('input').setValue(' QC-22 ')
    expect(wrapper.findComponent(SearchInput).props('modelValue')).toBe(' QC-22 ')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(qualityApi.getDefectItems).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, keyword: 'QC-22' })
    expect(wrapper.findComponent(Table).text()).toContain('QC-22')

    await wrapper.find('input').setValue('')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(qualityApi.getDefectItems).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, keyword: undefined })
  })

  test('shows explicit empty states for successful empty responses', async () => {
    qualityApi.getQualityStatistics.mockResolvedValue({ data: { incoming: { total: 2 } } })
    qualityApi.getDefectItems.mockResolvedValue(paginated([]))
    qualityApi.getQualityTrends.mockResolvedValue({ data: { trends: [], defectTypes: [] } })
    openDashboard()
    await flushPromises()

    expect(wrapper.findAll('.stat-value').map(card => card.text())).toEqual(['2', '0', '0', '0'])
    expect(wrapper.findComponent(Table).text()).toBe('暂无不合格项目')
    expect(wrapper.text()).toContain('所选时段暂无检验数据')
    expect(wrapper.text()).toContain('近6个月暂无不良原因记录')
    expect(wrapper.findAll('canvas')).toHaveLength(0)
    expect(wrapper.findComponent(Pagination).exists()).toBe(false)
    expect(message.error).not.toHaveBeenCalled()
  })

  test('keeps successful statistics and charts when the defect list fails', async () => {
    qualityApi.getDefectItems.mockRejectedValue(new Error('列表服务暂时不可用'))
    openDashboard()
    await flushPromises()

    expect(wrapper.findAll('.stat-value').map(card => card.text())).toEqual(['20', '3', '3', '4'])
    expect(latestLine().data.datasets[0].data.at(-1)).toBe(30)
    expect(wrapper.findComponent(Table).text()).toContain('加载失败')
    expect(message.error).toHaveBeenCalled()
  })

  test('still loads defects and trends when statistics fail', async () => {
    qualityApi.getQualityStatistics.mockRejectedValue(new Error('统计服务暂时不可用'))
    openDashboard()
    await flushPromises()

    expect(wrapper.findComponent(Table).text()).toContain('QC-1')
    expect(latestLine().data.datasets[0].data.at(-1)).toBe(30)
    expect(message.error).toHaveBeenCalled()
  })

  test('distinguishes failed trends from empty data and recovers on a range change', async () => {
    qualityApi.getQualityTrends.mockRejectedValue(new Error('趋势服务暂时不可用'))
    openDashboard()
    await flushPromises()

    expect(wrapper.text()).toContain('合格率趋势加载失败')
    expect(wrapper.text()).toContain('不良原因分类加载失败')
    expect(wrapper.text()).not.toContain('所选时段暂无检验数据')
    expect(wrapper.findAll('canvas')).toHaveLength(0)
    expect(wrapper.findAll('.stat-value').map(card => card.text())).toEqual(['20', '3', '3', '4'])
    expect(wrapper.findComponent(Table).text()).toContain('QC-1')

    qualityApi.getQualityTrends.mockResolvedValue({ data: { trends } })
    wrapper.findComponent(RadioGroup).vm.$emit('update:modelValue', '12')
    await flushPromises()
    expect(latestLine().data.labels).toHaveLength(12)
    expect(latestLine().data.datasets[0].data.at(-1)).toBe(30)
    expect(wrapper.text()).not.toContain('合格率趋势加载失败')
  })

  test('matches full year-month keys across the new year and keeps missing months empty', async () => {
    vi.setSystemTime(new Date(2027, 0, 14, 12))
    qualityApi.getQualityTrends.mockResolvedValue({ data: { trends: [
      { month: '2026-01', inspectionType: 'incoming', total: 10, passed: 5 },
      { month: '2026-08', inspectionType: 'incoming', total: 10, passed: 2 },
      { month: '2027-01', inspectionType: 'incoming', total: 10, passed: 9 },
    ], defectTypes: [] } })
    openDashboard()
    await flushPromises()
    expect(latestLine().data.labels).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01'])
    expect(latestLine().data.datasets[0].data).toEqual([20, null, null, null, null, 90])
  })

  test('opens the inspection from a defect row', async () => {
    openDashboard()
    await flushPromises()
    await wrapper.findComponent(Table).find('button').trigger('click')
    expect(push).toHaveBeenCalledWith('/quality/incoming?id=1')
  })

  test('does not overwrite the current chart with an older time range response', async () => {
    openDashboard()
    await flushPromises()
    const pending = []
    qualityApi.getQualityTrends.mockImplementation(params => new Promise(resolve => pending.push({ params, resolve })))

    wrapper.findComponent(RadioGroup).vm.$emit('update:modelValue', '12')
    await flushPromises()
    wrapper.findComponent(RadioGroup).vm.$emit('update:modelValue', '6')
    await flushPromises()
    expect(pending.map(request => request.params.months)).toEqual([12, 6])

    pending[1].resolve({ data: { trends: [{ month: '2026-09', inspectionType: 'incoming', total: 10, passed: 9 }] } })
    await flushPromises()
    pending[0].resolve({ data: { trends: [{ month: '2026-09', inspectionType: 'incoming', total: 10, passed: 1 }] } })
    await flushPromises()
    expect(latestLine().data.labels).toHaveLength(6)
    expect(latestLine().data.datasets[0].data.at(-1)).toBe(90)
  })

  test('does not create charts after leaving the dashboard during loading', async () => {
    const pending = []
    qualityApi.getQualityTrends.mockImplementation(() => new Promise(resolve => pending.push(resolve)))
    openDashboard()
    await flushPromises()
    wrapper.unmount()
    wrapper = undefined
    pending.forEach(resolve => resolve({ data: { trends, defectTypes: [] } }))
    await flushPromises()
    expect(Chart).not.toHaveBeenCalled()
  })
})
