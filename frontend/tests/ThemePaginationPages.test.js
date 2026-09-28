import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'
import ECNManagement from '@/views/baseData/ECNManagement.vue'
import Performance from '@/views/hr/Performance.vue'

const api = vi.hoisted(() => ({ ecn: vi.fn(), performance: vi.fn(), periods: vi.fn() }))
vi.mock('@/api', () => ({ ecnApi: { getList: api.ecn }, baseDataApi: {}, bomApi: {} }))
vi.mock('@/api/enhanced', () => ({ performanceApi: { getIndicators: api.performance, getPeriods: api.periods } }))
vi.mock('@/utils/optionLoaders', () => ({ searchBomOptions: vi.fn() }))
vi.mock('@/components/workflow/BusinessApprovalDialog.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/composables/useBusinessApproval', () => ({ useBusinessApproval: () => ({ approvalDialog: {}, openApprovalDialog: vi.fn(), handleApproval: vi.fn() }) }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { error: vi.fn() } }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: vi.fn() } }))

const Pagination = defineComponent({
  name: 'ElPagination',
  props: ['currentPage', 'pageSize', 'pageSizes', 'total'],
  emits: ['update:currentPage', 'update:pageSize', 'current-change', 'size-change'],
  setup: () => () => h('div')
})
const passthrough = { template: '<section><slot /></section>' }
const stubs = Object.fromEntries([
  'PageHeader', 'FinanceQueryCard', 'EmptyState', 'AppDialog',
  'el-button', 'el-input', 'el-input-number', 'el-form-item', 'el-option', 'el-select',
  'el-table', 'el-table-column', 'el-tag', 'el-icon', 'el-popconfirm', 'el-col', 'el-row',
  'el-date-picker', 'el-divider', 'el-form', 'el-radio-button', 'el-radio-group'
].map(name => [name, true]))
let wrapper
beforeEach(() => {
  document.documentElement.dataset.theme = 'workspace'
  api.ecn.mockResolvedValue({ data: { list: [], total: 1000 } })
  api.performance.mockResolvedValue({ data: { list: [], total: 1000 } })
})
afterEach(() => {
  wrapper?.unmount()
  document.documentElement.removeAttribute('data-theme')
})

describe('new theme pagination controls', () => {
  const mountPage = component => shallowMount(component, {
    global: {
      stubs: { ...stubs, 'el-card': passthrough, 'el-tabs': passthrough, 'el-tab-pane': passthrough, 'el-pagination': Pagination },
      directives: { loading: {}, permission: {} }
    }
  })

  test('ECN search starts at page one while ordinary refresh retains the selected page', async () => {
    wrapper = mountPage(ECNManagement)
    await flushPromises()
    wrapper.vm.page = 5
    await wrapper.vm.fetchList()
    expect(api.ecn).toHaveBeenLastCalledWith(expect.objectContaining({ page: 5 }))
    wrapper.vm.keyword = 'new filter'
    wrapper.findComponent({ name: 'FinanceQueryCard' }).vm.$emit('search')
    await flushPromises()
    expect(api.ecn).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, keyword: 'new filter' }))
  })

  test('performance periods page through the full endpoint result', async () => {
    api.periods.mockResolvedValue({ data: Array.from({ length: 31 }, (_, id) => ({ id })) })
    wrapper = mountPage(Performance)
    await flushPromises()
    wrapper.vm.activeTab = 'periods'
    wrapper.vm.onTabChange()
    await flushPromises()
    expect(wrapper.vm.tableData).toHaveLength(25)
    expect(wrapper.vm.total).toBe(31)
    const pagination = wrapper.getComponent(Pagination)
    pagination.vm.$emit('update:currentPage', 2)
    pagination.vm.$emit('current-change', 2)
    await flushPromises()
    expect(wrapper.vm.tableData.map(row => row.id)).toEqual([25, 26, 27, 28, 29, 30])
  })

  test('an old indicator request cannot overwrite a newly selected performance tab', async () => {
    let resolveOld
    api.performance.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
    api.periods.mockResolvedValue({ data: [{ id: 'period' }] })
    wrapper = mountPage(Performance)
    wrapper.vm.activeTab = 'periods'
    wrapper.vm.onTabChange()
    await flushPromises()
    resolveOld({ data: { list: [{ id: 'stale-indicator' }], total: 1 } })
    await flushPromises()
    expect(wrapper.vm.tableData).toEqual([{ id: 'period' }])
  })

  test.each([
    ['ECN management', ECNManagement, api.ecn],
    ['HR performance', Performance, api.performance]
  ])('%s uses the selected size on page one and retains it when the theme changes', async (_name, component, load) => {
    wrapper = shallowMount(component, {
      global: {
        stubs: { ...stubs, 'el-card': passthrough, 'el-tabs': passthrough, 'el-tab-pane': passthrough, 'el-pagination': Pagination },
        directives: { loading: {}, permission: {} }
      }
    })
    await flushPromises()
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 25 }))
    const pagination = wrapper.getComponent(Pagination)
    expect(pagination.props('pageSizes')).toContain(25)
    pagination.vm.$emit('update:currentPage', 5)
    pagination.vm.$emit('current-change', 5)
    await flushPromises()
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ page: 5, pageSize: 25 }))
    pagination.vm.$emit('update:pageSize', 50)
    pagination.vm.$emit('size-change', 50)
    await flushPromises()
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 50 }))
    document.documentElement.dataset.theme = 'dark'
    await flushPromises()
    expect(pagination.props('pageSize')).toBe(50)
    expect(pagination.props('currentPage')).toBe(1)
  })
})
