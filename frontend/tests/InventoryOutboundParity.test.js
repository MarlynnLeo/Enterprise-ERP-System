import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, h, inject, provide } from 'vue'
import InventoryOutbound from '@/views/inventory/InventoryOutbound.vue'
import { getInboundOutboundStatusColor, getInboundOutboundStatusText } from '@/constants/systemConstants'

const mocks = vi.hoisted(() => ({
  get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn(), confirm: vi.fn(),
  success: vi.fn(), error: vi.fn(), warning: vi.fn(), loadLocationOptions: vi.fn(),
  generateByDefaultTemplate: vi.fn(), previewDocument: vi.fn(),
}))

// Preserve the API wrapper so these checks include the request sent to the server.
vi.mock('@/services/axiosInstance', () => ({ api: { get: mocks.get, put: mocks.put, post: mocks.post, delete: mocks.delete } }))
vi.mock('@/api', async () => ({
  inventoryApi: (await import('@/api/inventory')).inventoryApi,
  productionApi: { getProductionTasks: async () => ({ data: [] }) },
  systemApi: { getDepartments: async () => ({ data: [] }) },
  baseDataApi: {},
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 7 }, realName: '仓库管理员', hasPermission: () => true, canViewInventoryApproval: false }),
}))
vi.mock('@/stores/dictionary', () => ({
  useDictionaryStore: () => ({ getOptions: () => [], fetchDictionary: async () => {} }),
}))
vi.mock('@/services/printService', () => ({ default: {
  generateByDefaultTemplate: mocks.generateByDefaultTemplate, previewDocument: mocks.previewDocument,
} }))
vi.mock('@/utils/optionLoaders', () => ({ loadLocationOptions: mocks.loadLocationOptions }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: mocks.confirm } }))

const slotStub = { template: '<div><slot /></div>' }
const formStub = { methods: { validate: async () => true, resetFields: () => {} }, template: '<div><slot /></div>' }
const buttonStub = {
  props: ['loading', 'disabled'], emits: ['click'],
  template: '<button :disabled="loading || disabled" @click="$emit(\'click\')"><slot /></button>',
}
const popconfirmStub = {
  name: 'PopconfirmStub', props: ['title'], emits: ['confirm'],
  template: '<div class="confirmation"><slot name="reference" /></div>',
}
const queryCardStub = {
  name: 'QueryCardStub', props: ['model'], emits: ['search', 'reset'],
  template: '<div><slot name="basic" /><slot name="advanced" /></div>',
}
const paginationStub = {
  name: 'PaginationStub', props: ['currentPage', 'pageSize', 'total'], emits: ['size-change', 'current-change'],
  template: '<div />',
}
const tableStub = defineComponent({
  props: ['data'],
  setup(props, { slots }) {
    provide('testTableRows', computed(() => props.data || []))
    return () => h('div', { class: 'rendered-table' }, slots.default?.())
  },
})
const columnStub = defineComponent({
  props: ['prop', 'label'],
  setup(props, { slots }) {
    const rows = inject('testTableRows', computed(() => []))
    return () => h('div', { 'data-column': props.prop || props.label }, rows.value.map(row =>
      h('div', { 'data-row-id': row.id }, slots.default ? slots.default({ row }) : String(row[props.prop] ?? '')),
    ))
  },
})

let wrapper
let rows
let statistics
const listResponse = () => ({ data: { list: structuredClone(rows), total: rows.length, statistics } })
const listCalls = () => mocks.get.mock.calls.filter(([url]) => url === '/inventory/outbound')
const latestQuery = () => listCalls().at(-1)[1].params
const mainTable = () => wrapper.find('.rendered-table')
const detailDialog = () => wrapper.find('[data-dialog="出库单详情"]')
const detailButtons = () => detailDialog().findAll('footer button').map(button => button.text())

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset())
  rows = [{ id: 11, outboundNo: 'OUT-TEST-11', status: 'draft', items: [] }]
  statistics = undefined
  mocks.loadLocationOptions.mockResolvedValue([])
  mocks.confirm.mockResolvedValue('confirm')
  mocks.get.mockImplementation(async (url) => {
    if (url === '/inventory/outbound') return listResponse()
    const id = Number(url.match(/^\/inventory\/outbound\/(\d+)$/)?.[1])
    const row = rows.find(row => row.id === id)
    if (row) return { data: structuredClone(row) }
    throw new Error(`Unexpected GET ${url}`)
  })
  mocks.put.mockImplementation(async (url, { newStatus }) => {
    const id = Number(url.match(/\/outbound\/(\d+)\/status$/)?.[1])
    rows.find(row => row.id === id).status = newStatus
    return { data: {} }
  })
})

afterEach(() => wrapper?.unmount())

const openPage = async () => {
  wrapper = mount(InventoryOutbound, {
    global: {
      stubs: {
        PageHeader: true, FinanceQueryCard: queryCardStub, EmptyState: true, TableRowActions: slotStub,
        InventoryApprovalPanel: true,
        AppDialog: {
          props: ['modelValue', 'title'],
          template: '<section v-if="modelValue" :data-dialog="title"><slot /><footer><slot name="footer" /></footer></section>',
        },
        ElTable: tableStub, ElTableColumn: columnStub, ElPagination: paginationStub,
        ElRow: slotStub, ElCol: slotStub, ElCard: slotStub, ElButton: buttonStub,
        ElIcon: true, ElTag: { props: ['type'], template: '<span :data-tag-type="type"><slot /></span>' },
        ElInput: true, ElAutocomplete: true, ElSelect: true, ElOption: true, ElDatePicker: true,
        ElForm: formStub, ElFormItem: slotStub, ElPopconfirm: popconfirmStub, ElDivider: true,
        ElDescriptions: slotStub, ElDescriptionsItem: slotStub, ElTooltip: slotStub,
      },
      directives: {
        loading: () => {},
        permission: (element, binding) => { element.setAttribute('data-permission', binding.value) },
      },
    },
  })
  await flushPromises()
}

describe('outbound interaction parity with inbound', () => {
  test('preserves planned quantity, task clearing, and remarks when saving an edited outbound', async () => {
    Object.assign(rows[0], {
      outboundDate: '2026-09-30', productionTaskId: 12, remarks: '保留主备注',
      items: [{ id: 61, materialId: 2, materialCode: 'MAT-2', quantity: 6, plannedQuantity: 10, locationId: 3 }],
    })
    mocks.put.mockResolvedValue({ data: {} })
    await openPage()
    wrapper.vm.handleEdit(rows[0])
    await flushPromises()
    expect(wrapper.vm.outboundForm.items[0].plannedQuantity).toBe(10)
    wrapper.vm.outboundForm.productionTaskId = null
    await wrapper.vm.handleSubmit()
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith('/inventory/outbound/11', expect.objectContaining({
      productionTaskId: null, remarks: '保留主备注',
      items: [expect.objectContaining({ id: 61, materialId: 2, quantity: 6, plannedQuantity: 10 })],
    }))
  })

  test('submits a supplement using the original detail identifiers and only the requested quantity', async () => {
    Object.assign(rows[0], {
      status: 'partial_completed', outboundDate: '2026-09-30T00:00:00.000Z', productionTaskId: 12,
      items: [{ id: 61, materialId: 2, materialCode: 'MAT-2', quantity: 10, shortageQuantity: 10, locationId: 3 }],
    })
    mocks.post.mockResolvedValue({ data: {} })
    await openPage()
    await wrapper.vm.handleSupplementIssue(rows[0])
    await flushPromises()
    expect(wrapper.vm.outboundForm.outboundDate).toBe('2026-09-30')
    expect(wrapper.find('[data-dialog="补发出库单"]').text()).not.toContain('添加物料')
    wrapper.vm.outboundForm.items[0].quantity = 5
    await wrapper.vm.handleSubmit()
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/inventory/outbound/11/supplement', expect.objectContaining({
      items: [{ materialId: 2, quantity: 5, outboundItemId: 61 }],
    }))
  })

  test('closes an unavailable supplement instead of retaining a previous document for submission', async () => {
    await openPage()
    wrapper.vm.outboundForm.id = 99
    await wrapper.vm.handleSupplementIssue(rows[0])
    expect(wrapper.vm.dialogVisible).toBe(false)
    expect(wrapper.vm.outboundForm.id).toBeNull()
    expect(mocks.post).not.toHaveBeenCalled()
  })
  test('searches all business filters and resets the filters and current page', async () => {
    await openPage()
    wrapper.vm.currentPage = 4
    Object.assign(wrapper.vm.searchForm, {
      materialName: '铜线', outboundNo: 'OUT-202609', locationId: 3,
      status: 'confirmed', productionGroupId: 9, dateRange: ['2026-09-01', '2026-09-29'],
    })
    wrapper.findComponent(queryCardStub).vm.$emit('search')
    await flushPromises()

    expect(latestQuery()).toMatchObject({
      page: 1, limit: wrapper.vm.pageSize, materialName: '铜线', outboundNo: 'OUT-202609',
      locationId: 3, status: 'confirmed', statusMode: 'business', productionGroupId: 9,
      startDate: '2026-09-01', endDate: '2026-09-29',
    })
    expect(latestQuery()).not.toHaveProperty('keyword')

    wrapper.findComponent(paginationStub).vm.$emit('current-change', 3)
    await flushPromises()
    expect(latestQuery().page).toBe(3)

    wrapper.findComponent(queryCardStub).vm.$emit('reset')
    await flushPromises()
    expect(latestQuery()).toMatchObject({
      page: 1, materialName: '', outboundNo: '', locationId: '', status: '', statusMode: 'business', productionGroupId: '',
    })
    expect(latestQuery().startDate).toBeUndefined()
    expect(latestQuery().endDate).toBeUndefined()
    expect(wrapper.vm.searchForm.dateRange).toEqual([])
  })

  test('changing page size returns to page one and keeps active filters', async () => {
    await openPage()
    wrapper.vm.currentPage = 5
    wrapper.vm.searchForm.materialName = '铜线'
    wrapper.findComponent(paginationStub).vm.$emit('size-change', 50)
    await flushPromises()
    expect(latestQuery()).toMatchObject({ page: 1, limit: 50, materialName: '铜线', statusMode: 'business' })
  })

  test('renders outbound material and warehouse values rather than the task product', async () => {
    Object.assign(rows[0], {
      materialCode: 'MAT-023', materialName: '镀锡铜线', materialSpecs: '0.5 mm',
      firstItemQuantity: 6.5, locationName: '原料一仓', itemsCount: 1,
      productCode: 'FINISHED-999', productName: '不应显示的生产成品',
    })
    await openPage()
    for (const [column, value] of Object.entries({
      materialCode: 'MAT-023', materialName: '镀锡铜线', materialSpecs: '0.5 mm',
      firstItemQuantity: '6.5', locationName: '原料一仓',
    })) expect(mainTable().find(`[data-column="${column}"]`).text()).toBe(value)
    expect(mainTable().text()).not.toContain('FINISHED-999')
    expect(mainTable().text()).not.toContain('不应显示的生产成品')
  })

  test('keeps business status text and colors consistent with inbound regardless of finance status', async () => {
    rows = ['pending', 'approved', 'rejected'].flatMap((financeStatus, index) => [
      { id: index * 2 + 1, status: 'completed', financeStatus },
      { id: index * 2 + 2, status: 'partial_completed', financeStatus },
    ])
    await openPage()
    const cells = mainTable().find('[data-column="status"]')
    for (const row of rows) {
      const tag = cells.find(`[data-row-id="${row.id}"] [data-tag-type]`)
      expect(tag.text()).toBe(getInboundOutboundStatusText(row.status))
      expect(tag.attributes('data-tag-type')).toBe(getInboundOutboundStatusColor(row.status))
    }
    expect(cells.text()).not.toMatch(/财务|已审核|驳回/)
  })

  test('shows five standard statistics and preserves partial completion and reversal counts', async () => {
    statistics = { total: 31, draftCount: 2, confirmedCount: 3, completedCount: 17, cancelledCount: 4, partialCompletedCount: 4, reversedCount: 1 }
    await openPage()
    expect(wrapper.findAll('.stat-card').map(card => ({
      label: card.find('.stat-label').text(), value: card.find('.stat-value').text(),
    }))).toEqual([
      { label: '出库单总数', value: '31' }, { label: '草稿状态', value: '2' },
      { label: '已确认', value: '3' }, { label: '已完成', value: '17' }, { label: '已取消', value: '4' },
    ])
    expect(wrapper.find('.outbound-extra-stats').text()).toContain('部分完成：4')
    expect(wrapper.find('.outbound-extra-stats').text()).toContain('已冲销：1')
  })

  test.each([
    ['draft', 'confirmed', '确定要确认该出库单吗？', 'inventory:outbound:update'],
    ['confirmed', 'completed', '确定要完成该出库单吗？', 'inventory:outbound:update'],
    ['draft', 'cancelled', '确定要取消该出库单吗？', 'inventory:outbound:cancel'],
  ])('confirms %s → %s once, enforces the action permission, and refreshes the list', async (status, nextStatus, title, permission) => {
    rows[0].status = status
    await openPage()
    const confirmation = wrapper.findAllComponents(popconfirmStub).find(item => item.props('title') === title)
    expect(confirmation.find('button').attributes('data-permission')).toBe(permission)
    confirmation.vm.$emit('confirm')
    await flushPromises()
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith('/inventory/outbound/11/status', { newStatus: nextStatus })
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(listCalls()).toHaveLength(2)
    expect(wrapper.vm.outboundList[0].status).toBe(nextStatus)
    expect(mocks.error).not.toHaveBeenCalled()
  })

  test('waits for the refreshed list before the status action resolves', async () => {
    await openPage()
    let finishRefresh
    mocks.get.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve }))
    let finished = false
    const update = wrapper.vm.handleUpdateStatus(rows[0], 'confirmed').then(() => { finished = true })
    await flushPromises()
    expect(finished).toBe(false)
    expect(wrapper.vm.loading).toBe(true)
    finishRefresh(listResponse())
    await update
    expect(finished).toBe(true)
    expect(wrapper.vm.loading).toBe(false)
    expect(wrapper.vm.outboundList[0].status).toBe('confirmed')
  })

  test('shows the server status error and leaves the document available for retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.put.mockRejectedValueOnce({ response: { data: { message: '出库单已变更，请刷新后重试' } } })
    await openPage()
    await wrapper.vm.handleUpdateStatus(rows[0], 'confirmed')
    expect(mocks.error).toHaveBeenCalledWith('出库单已变更，请刷新后重试')
    expect(mocks.success).not.toHaveBeenCalled()
    expect(listCalls()).toHaveLength(1)
    expect(wrapper.vm.outboundList[0].status).toBe('draft')
  })

  test.each(['cancel', 'close'])('retains the stock shortage warning and aborts on %s', async (dismissal) => {
    rows[0].status = 'confirmed'
    rows[0].items = [{ materialCode: 'MAT-023', materialName: '镀锡铜线', quantity: 5, stockQuantity: 2 }]
    mocks.confirm.mockRejectedValueOnce(dismissal)
    await openPage()
    await wrapper.vm.handleUpdateStatus(rows[0], 'completed')
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('MAT-023'), '库存预检警告', expect.any(Object),
    )
    expect(mocks.put).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
  })

  test.each([
    ['draft', undefined, ['编辑', '删除', '关闭', '打印']],
    ['confirmed', undefined, ['编辑', '关闭', '打印']],
    ['partial_completed', 'pending', ['补发', '关闭', '打印']],
    ['completed', 'approved', ['申请撤销', '关闭', '打印']],
  ])('offers the appropriate detail footer for %s / %s', async (status, financeStatus, expected) => {
    Object.assign(rows[0], { status, financeStatus })
    await openPage()
    await wrapper.vm.handleView(rows[0])
    await flushPromises()
    expect(detailButtons()).toEqual(expected)
  })

  test('clears the previous details and finance actions while another document loads', async () => {
    Object.assign(rows[0], { outboundNo: 'OUT-OLD', status: 'completed', financeStatus: 'approved', productionTaskCode: 'TASK-OLD' })
    await openPage()
    await wrapper.vm.handleView(rows[0])
    await flushPromises()
    expect(detailButtons()).toContain('申请撤销')
    let finishDetail
    mocks.get.mockImplementationOnce(() => new Promise(resolve => { finishDetail = resolve }))
    const view = wrapper.vm.handleView({ id: 12 })
    await flushPromises()
    expect(wrapper.vm.currentOutbound.id).toBeUndefined()
    expect(wrapper.vm.currentOutbound.financeStatus).toBeUndefined()
    expect(detailDialog().text()).not.toContain('OUT-OLD')
    expect(detailButtons()).not.toContain('申请撤销')
    finishDetail({ data: { id: 12, outboundNo: 'OUT-NEW', status: 'draft', items: [] } })
    await view
    await flushPromises()
    expect(detailDialog().text()).toContain('OUT-NEW')
    expect(wrapper.vm.currentOutbound.productionTaskCode).toBeUndefined()
    expect(detailButtons()).toEqual(['编辑', '删除', '关闭', '打印'])
  })

  test.each([
    ['manual', 'outbound'], ['bom_issue', 'production_outbound'],
  ])('prints %s documents from the detail with the appropriate %s template', async (outboundType, template) => {
    Object.assign(rows[0], { outboundType, outboundDate: '2026-09-29', status: 'completed', financeStatus: 'approved' })
    mocks.generateByDefaultTemplate.mockResolvedValue('<html>出库单</html>')
    await openPage()
    await wrapper.vm.handleView(rows[0])
    await flushPromises()
    await detailDialog().findAll('footer button').find(button => button.text() === '打印').trigger('click')
    await flushPromises()
    expect(mocks.generateByDefaultTemplate).toHaveBeenCalledExactlyOnceWith('inventory', template, expect.objectContaining({
      outboundNo: 'OUT-TEST-11', documentNo: 'OUT-TEST-11', date: '2026-09-29',
      status: getInboundOutboundStatusText('completed'), items: [],
    }))
    expect(mocks.previewDocument).toHaveBeenCalledExactlyOnceWith('<html>出库单</html>')
    expect(wrapper.vm.printLoading).toBe(false)
    expect(mocks.error).not.toHaveBeenCalled()
  })
})
