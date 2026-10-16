import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, h, inject, provide } from 'vue'
import InventoryInbound from '@/views/inventory/InventoryInbound.vue'
import { getInboundOutboundStatusText } from '@/constants/systemConstants'

const mocks = vi.hoisted(() => ({
  get: vi.fn(), put: vi.fn(), post: vi.fn(), getTask: vi.fn(), getMaterial: vi.fn(),
  success: vi.fn(), error: vi.fn(), warning: vi.fn(), getBySource: vi.fn(),
  generateByDefaultTemplate: vi.fn(), previewDocument: vi.fn(),
  auth: { user: { realName: '仓库员' }, hasPermission: vi.fn(), canViewInventoryApproval: true, canApproveInventoryApproval: true },
}))
vi.mock('@/services/axiosInstance', () => ({ api: { get: mocks.get, put: mocks.put, post: mocks.post } }))
vi.mock('@/api', async () => ({
  inventoryApi: (await import('@/api/inventory')).inventoryApi,
  productionApi: { getProductionTasks: async () => ({ data: [] }), getProductionTask: mocks.getTask },
  baseDataApi: { getMaterial: mocks.getMaterial, getMaterials: async () => ({ data: [] }), getUnits: async () => ({ data: [{ id: 1, name: '个' }] }) },
}))
vi.mock('vue-router', async (importOriginal) => ({ ...(await importOriginal()), useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('@/stores/dictionary', () => ({ useDictionaryStore: () => ({ groups: {}, isLoaded: false, fetchDictionary: async () => {} }) }))
vi.mock('@/utils/optionLoaders', () => ({ loadLocationOptions: async () => [{ id: 3, name: '成品仓' }] }))
vi.mock('@/api/finance', () => ({ financeApi: { inventoryPostings: { getBySource: mocks.getBySource } } }))
vi.mock('@/services/printService', () => ({ default: { generateByDefaultTemplate: mocks.generateByDefaultTemplate, previewDocument: mocks.previewDocument } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))

const slotStub = { template: '<div><slot /></div>' }
const formStub = defineComponent({
  setup(_props, { slots, expose }) {
    expose({ validate: async () => true, clearValidate: () => {} })
    return () => h('form', slots.default?.())
  },
})
const buttonStub = { props: ['loading', 'disabled'], emits: ['click'], template: '<button :disabled="loading || disabled" @click="$emit(\'click\')"><slot /></button>' }
const tableStub = defineComponent({
  props: ['data'],
  emits: ['selection-change', 'row-click'],
  setup(props, { slots, emit, expose }) {
    expose({ clearSelection: () => emit('selection-change', []) })
    provide('rows', computed(() => props.data || []))
    return () => h('div', { class: 'table' }, slots.default?.())
  },
})
const columnStub = defineComponent({
  props: ['prop', 'label', 'type', 'selectable'],
  setup(props, { slots }) {
    const rows = inject('rows', computed(() => []))
    return () => h('div', { 'data-column': props.prop || props.label }, rows.value.map((row, index) =>
      h('div', slots.default ? slots.default({ row, $index: index }) : String(row[props.prop] ?? ''))))
  },
})
let wrapper
let inbound
let records
let financeStatus
const detail = () => wrapper.find('[data-dialog="入库单详情"]')
const editor = () => wrapper.find('[data-dialog="编辑入库单"]')

beforeEach(() => {
  for (const mock of Object.values(mocks)) if (vi.isMockFunction(mock)) mock.mockReset()
  mocks.auth.hasPermission.mockReset().mockReturnValue(true)
  mocks.auth.canViewInventoryApproval = true
  mocks.auth.canApproveInventoryApproval = true
  inbound = {
    id: 11, inboundNo: 'IN-11', inboundDate: '2026-09-30', status: 'draft', inboundType: 'other',
    locationId: 3, operator: '仓库员', remarks: '保留主备注', financeStatus: 'rejected',
    items: [{ materialId: 2, materialCode: 'FG-2', materialName: '产品', quantity: 4, unitId: 1, unitName: '个', batchNo: 'OLD', locationId: 3, remarks: '保留明细备注' }],
  }
  records = [
    { materialId: 2, materialCode: 'MAT-2', unitId: 1, batchNumber: 'BATCH-A', defaultLocationId: 3, maxReturnableQuantity: 8 },
    { materialId: 2, materialCode: 'MAT-2', unitId: 1, batchNumber: 'BATCH-B', defaultLocationId: 4, maxReturnableQuantity: 5 },
  ]
  financeStatus = 'rejected'
  mocks.get.mockImplementation(async (url) => {
    if (url === '/inventory/inbound') return { data: { list: [structuredClone(inbound)], total: 1 } }
    if (url === '/inventory/inbound/statistics') return { data: { total: 1 } }
    if (url === '/inventory/inbound/11') return { data: structuredClone(inbound) }
    if (url === '/inventory/task/7/release-sources') return { data: [{ id: 31, inspectionNo: 'FQC-31', referenceId: 7, batchNo: 'PROD-BATCH', status: 'passed', qualifiedQuantity: 4, availableQuantity: 4 }] }
    if (url === '/inventory/task/7/material-issues') return { data: { records: structuredClone(records) } }
    throw new Error(`Unexpected GET ${url}`)
  })
  mocks.getTask.mockResolvedValue({ data: { id: 7, code: 'TASK-7', productId: 2, productName: '产品', quantity: 10 } })
  mocks.getMaterial.mockResolvedValue({ data: { id: 2, code: 'FG-2', name: '产品', unitId: 1, unitName: '个' } })
  mocks.put.mockImplementation(async () => { financeStatus = 'pending'; inbound.financeStatus = 'pending'; return { data: {} } })
  mocks.post.mockResolvedValue({ data: { id: 12 } })
  mocks.getBySource.mockImplementation(async () => ({ data: { movement: { id: 1, financeStatus, businessApprovedById: 99 }, events: [], postings: [] } }))
})
afterEach(() => wrapper?.unmount())

const openPage = async () => {
  wrapper = mount(InventoryInbound, {
    global: {
      stubs: {
        PageHeader: { template: '<div><slot name="actions" /></div>' },
        FinanceQueryCard: { template: '<div><slot name="basic" /><slot name="advanced" /></div>' },
        EmptyState: true, TableRowActions: slotStub, InventoryBatchApproval: true,
        AppDialog: { props: ['modelValue', 'title'], template: '<section v-if="modelValue" :data-dialog="title"><slot /><footer><slot name="footer" /></footer></section>' },
        ElTable: tableStub, ElTableColumn: columnStub, ElPagination: true,
        ElRow: slotStub, ElCol: slotStub, ElCard: slotStub, ElButton: buttonStub,
        ElIcon: true, ElTag: slotStub, ElInput: true, ElAutocomplete: true, ElTooltip: slotStub,
        ElSelect: true, ElOption: true, ElDatePicker: true, ElForm: formStub, ElFormItem: slotStub,
        ElPopconfirm: true, ElDivider: true, ElDescriptions: slotStub, ElDescriptionsItem: slotStub,
        ElSteps: slotStub, ElStep: true, ElTimeline: slotStub, ElTimelineItem: slotStub, ElAlert: true, ElInputNumber: true,
      },
      directives: { loading: () => {}, permission: () => {} },
    },
  })
  await flushPromises()
}
const beginCreate = async (type) => {
  wrapper.vm.handleCreate()
  wrapper.vm.form.inboundType = type
  wrapper.vm.form.locationId = 3
  await flushPromises()
}
const chooseTask = async () => {
  await wrapper.vm.openTaskSelectDialog()
  await wrapper.vm.selectTask({ id: 7 })
  wrapper.vm.selectedInspectionId = 31
  await flushPromises()
}

describe('inbound workflows', () => {
  test('offers batch selection only for completed inbounds awaiting financial approval', async () => {
    await openPage()
    const table = wrapper.findComponent(tableStub)
    const selection = table.findAllComponents(columnStub).find(column => column.props('type') === 'selection')
    expect(table.attributes('row-key')).toBe('id')
    const selectable = selection.props('selectable')
    expect(selectable({ status: 'completed', financeStatus: 'pending' })).toBe(true)
    expect(selectable({ status: 'completed' })).toBe(true)
    for (const row of [
      { status: 'draft' }, { status: 'confirmed' }, { status: 'reversed' },
      { status: 'completed', financeStatus: 'approved' },
      { status: 'completed', financeStatus: 'rejected' },
    ]) expect(selectable(row)).toBe(false)
    const selected = [{ ...inbound, status: 'completed', financeStatus: 'pending' }]
    table.vm.$emit('selection-change', selected)
    await flushPromises()
    const batch = wrapper.findComponent({ name: 'InventoryBatchApproval' })
    expect(batch.props()).toMatchObject({ selectedRows: selected, sourceType: 'inbound', sourceNoKey: 'inboundNo', disabled: false })
    table.vm.$emit('row-click', selected[0], { type: 'selection' }, { target: document.createElement('div') })
    await flushPromises()
    expect(wrapper.vm.viewDialogVisible).toBe(false)
    batch.vm.$emit('clear')
    expect(wrapper.vm.selectedInbounds).toEqual([])
  })

  test.each(['canViewInventoryApproval', 'canApproveInventoryApproval'])('hides inbound checkboxes without %s', async permission => {
    mocks.auth[permission] = false
    await openPage()
    const table = wrapper.findComponent(tableStub)
    expect(table.findAllComponents(columnStub).some(column => column.props('type') === 'selection')).toBe(false)
  })

  test('clears inbound selections on filter changes, replacement data, loading, and leaving the page', async () => {
    inbound.status = 'completed'
    inbound.financeStatus = 'pending'
    await openPage()
    const select = () => wrapper.vm.handleInboundSelectionChange([inbound])
    select()
    wrapper.vm.searchForm.inboundNo = 'IN-12'
    expect(wrapper.vm.selectedInbounds).toEqual([])
    select()
    wrapper.vm.tableData = [{ ...inbound, id: 12 }]
    expect(wrapper.vm.selectedInbounds).toEqual([])
    select()
    let finish
    mocks.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    wrapper.vm.handleCurrentChange(2)
    expect(wrapper.vm.selectedInbounds).toEqual([])
    select()
    expect(wrapper.vm.selectedInbounds).toEqual([])
    await flushPromises()
    expect(wrapper.findComponent({ name: 'InventoryBatchApproval' }).props('disabled')).toBe(true)
    expect(wrapper.vm.canSelectInbound(inbound)).toBe(false)
    finish({ data: { list: [inbound], total: 1 } })
    await flushPromises()
    select()
    expect(wrapper.vm.selectedInbounds).toHaveLength(1)
    const vm = wrapper.vm
    wrapper.unmount()
    expect(vm.selectedInbounds).toEqual([])
  })

  test('refreshes the inbound list, statistics, and open detail after batch approval changes', async () => {
    await openPage()
    await wrapper.vm.handleView(11)
    mocks.get.mockClear()
    wrapper.findComponent({ name: 'InventoryBatchApproval' }).vm.$emit('changed')
    await flushPromises()
    for (const url of ['/inventory/inbound', '/inventory/inbound/statistics', '/inventory/inbound/11']) {
      expect(mocks.get.mock.calls.some(([requestedUrl]) => requestedUrl === url)).toBe(true)
    }
  })

  test('clears all prior details and blocks printing while another inbound loads', async () => {
    await openPage()
    await wrapper.vm.handleView(11)
    let finish
    mocks.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const view = wrapper.vm.handleView(12)
    await flushPromises()
    expect(wrapper.vm.currentInbound.id).toBeNull()
    expect(wrapper.vm.currentInbound.remarks).toBeUndefined()
    expect(wrapper.vm.currentInbound.operator).toBeUndefined()
    await wrapper.vm.handlePrintInbound()
    expect(mocks.generateByDefaultTemplate).not.toHaveBeenCalled()
    finish({ data: { id: 12, inboundNo: 'IN-12', status: 'draft', items: [] } })
    await view
    expect(wrapper.vm.currentInbound.remarks).toBeUndefined()
  })

  test('keeps the newer editor when earlier detail requests finish out of order', async () => {
    await openPage()
    let finish
    mocks.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const old = wrapper.vm.handleEdit(inbound)
    mocks.get.mockResolvedValueOnce({ data: { ...inbound, id: 12 } })
    await wrapper.vm.handleEdit({ ...inbound, id: 12 })
    finish({ data: structuredClone(inbound) })
    await old
    expect(wrapper.vm.form.id).toBe(12)
  })

  test('does not reopen an editor after its source detail has closed', async () => {
    await openPage()
    await wrapper.vm.handleView(11)
    let finish
    mocks.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const edit = wrapper.vm.handleEdit(wrapper.vm.currentInbound)
    wrapper.vm.viewDialogVisible = false
    await flushPromises()
    finish({ data: structuredClone(inbound) })
    await edit
    expect(wrapper.vm.dialogVisible).toBe(false)
  })

  test('filters and resets status, returns to first page when page size changes, and displays remarks', async () => {
    await openPage()
    expect(wrapper.find('[data-column="remarks"]').text()).toBe('保留主备注')
    wrapper.vm.searchForm.status = 'confirmed'
    wrapper.vm.pagination.currentPage = 4
    wrapper.vm.handleSizeChange(50)
    await flushPromises()
    expect(mocks.get).toHaveBeenCalledWith('/inventory/inbound', { params: expect.objectContaining({ status: 'confirmed', page: 1, pageSize: 50 }) })
    expect(mocks.get).toHaveBeenCalledWith('/inventory/inbound/statistics', { params: expect.objectContaining({ status: 'confirmed' }) })
    wrapper.vm.resetSearch()
    await flushPromises()
    expect(wrapper.vm.searchForm.status).toBe('')
  })

  test.each(['draft', 'confirmed'])('opens %s for editing and saves batch and remarks without changing status', async (status) => {
    inbound.status = status
    await openPage()
    await wrapper.vm.handleView(11)
    await flushPromises()
    await detail().findAll('button').find(button => button.text() === '编辑').trigger('click')
    await flushPromises()
    expect(editor().exists()).toBe(true)
    wrapper.vm.form.items[0].batchNo = ' FIXED '
    await wrapper.vm.handleSubmit()
    expect(mocks.put).toHaveBeenCalledWith('/inventory/inbound/11', expect.objectContaining({
      status, remarks: '保留主备注', items: [expect.objectContaining({ batchNo: 'FIXED', remarks: '保留明细备注', locationId: 3 })],
    }))
    expect(inbound.items[0].batchNo).toBe('OLD')
  })

  test('hides edit for completed records and users without update permission', async () => {
    await openPage()
    expect(wrapper.vm.canEditInbound({ status: 'completed' })).toBe(false)
    wrapper.unmount()
    mocks.auth.hasPermission.mockReturnValue(false)
    await openPage()
    expect(wrapper.findAll('button').some(button => button.text() === '编辑')).toBe(false)
  })

  test('keeps a quality-generated inbound source fixed while allowing batch repairs', async () => {
    Object.assign(inbound, { inboundType: 'production', inspectionId: 31, referenceType: 'quality_inspection', referenceId: 31 })
    await openPage()
    await wrapper.vm.handleEdit(inbound)
    await flushPromises()
    await wrapper.vm.openTaskSelectDialog()
    expect(wrapper.vm.productionTaskDialogVisible).toBe(false)
    wrapper.vm.form.items[0].batchNo = 'QUALITY-BATCH'
    await wrapper.vm.handleSubmit()
    expect(mocks.put).toHaveBeenCalledWith('/inventory/inbound/11', expect.objectContaining({
      inboundType: 'production', referenceType: 'quality_inspection', referenceId: 31,
      items: [expect.objectContaining({ batchNo: 'QUALITY-BATCH' })],
    }))
  })

  test('selecting a production task derives its product without fetching return materials and submits the task link', async () => {
    await openPage()
    await beginCreate('production')
    await chooseTask()
    wrapper.vm.confirmTaskSelection()
    await flushPromises()
    expect(wrapper.vm.form.items).toMatchObject([{ materialId: 2, quantity: 4, unitId: 1 }])
    expect(mocks.get.mock.calls.some(([url]) => url.includes('material-issues'))).toBe(false)
    wrapper.vm.form.items[0].quantity = 4
    wrapper.vm.form.items[0].batchNo = 'PROD-BATCH'
    await wrapper.vm.handleSubmit()
    expect(mocks.post).toHaveBeenCalledWith('/inventory/inbound', expect.objectContaining({
      inboundType: 'production', inspectionId: 31, referenceType: 'production_task', referenceId: 7, referenceNo: 'TASK-7',
      items: [expect.objectContaining({ materialId: 2, quantity: 4, batchNo: 'PROD-BATCH' })],
    }))
  })

  test.each(['missing-task', 'wrong-product', 'over-plan', 'zero', 'infinite'])('rejects invalid production entry: %s', async (problem) => {
    await openPage()
    await beginCreate('production')
    await chooseTask()
    wrapper.vm.confirmTaskSelection()
    await flushPromises()
    wrapper.vm.form.items[0].quantity = 3
    if (problem === 'missing-task') wrapper.vm.form.referenceId = null
    if (problem === 'wrong-product') wrapper.vm.form.items[0].materialId = 3
    if (problem === 'over-plan') wrapper.vm.form.items[0].quantity = 11
    if (problem === 'zero') wrapper.vm.form.items[0].quantity = 0
    if (problem === 'infinite') wrapper.vm.form.items[0].quantity = Infinity
    await wrapper.vm.handleSubmit()
    expect(mocks.post).not.toHaveBeenCalled()
    expect(mocks.warning).toHaveBeenCalled()
  })

  test('returns only checked rows and preserves each original batch and warehouse', async () => {
    await openPage()
    await beginCreate('production_return')
    await chooseTask()
    wrapper.vm.handleReturnMaterialSelection([wrapper.vm.taskMaterialRecords[1]])
    wrapper.vm.confirmTaskSelection()
    await flushPromises()
    expect(wrapper.vm.form.items).toMatchObject([{ materialId: 2, quantity: 5, batchNo: 'BATCH-B', locationId: 4 }])
    await wrapper.vm.handleSubmit()
    expect(mocks.post.mock.calls[0][1].items).toHaveLength(1)
    expect(mocks.post.mock.calls[0][1].items[0]).toMatchObject({ batchNo: 'BATCH-B', locationId: 4 })
  })

  test('requires an explicit return selection and clears selection on task reopening', async () => {
    await openPage()
    await beginCreate('production_return')
    await chooseTask()
    wrapper.vm.confirmTaskSelection()
    expect(wrapper.vm.form.items).toEqual([])
    wrapper.vm.handleReturnMaterialSelection([wrapper.vm.taskMaterialRecords[0]])
    await chooseTask()
    wrapper.vm.confirmTaskSelection()
    expect(wrapper.vm.form.items).toEqual([])
  })

  test('keeps distinct batches of the same material when both rows are checked', async () => {
    await openPage()
    await beginCreate('production_return')
    await chooseTask()
    wrapper.vm.handleReturnMaterialSelection([...wrapper.vm.taskMaterialRecords])
    wrapper.vm.confirmTaskSelection()
    await flushPromises()
    await wrapper.vm.handleSubmit()
    expect(mocks.post.mock.calls[0][1].items).toMatchObject([
      { materialId: 2, quantity: 8, batchNo: 'BATCH-A', locationId: 3 },
      { materialId: 2, quantity: 5, batchNo: 'BATCH-B', locationId: 4 },
    ])
  })

  test('preserves the committed production task if the task picker is cancelled', async () => {
    await openPage()
    await beginCreate('production')
    await chooseTask()
    wrapper.vm.confirmTaskSelection()
    const committed = wrapper.vm.selectedTask
    wrapper.vm.form.items[0].quantity = 2
    await wrapper.vm.openTaskSelectDialog()
    wrapper.vm.productionTaskDialogVisible = false
    expect(wrapper.vm.selectedTask).toEqual(committed)
    await wrapper.vm.handleSubmit()
    expect(mocks.post).toHaveBeenCalledWith('/inventory/inbound', expect.objectContaining({ referenceId: 7 }))
  })

  test('rejects a selected return quantity over the available amount', async () => {
    await openPage()
    await beginCreate('production_return')
    await chooseTask()
    wrapper.vm.taskMaterialRecords[0].returnQuantity = 9
    wrapper.vm.handleReturnMaterialSelection([wrapper.vm.taskMaterialRecords[0]])
    wrapper.vm.confirmTaskSelection()
    expect(wrapper.vm.form.items).toEqual([])
    expect(mocks.warning).toHaveBeenCalledWith('退料数量不能超过该批次的可退数量')
  })

  test('excludes the edited return document when loading available quantities', async () => {
    Object.assign(inbound, { inboundType: 'production_return', referenceType: 'production_task', referenceId: 7 })
    await openPage()
    await wrapper.vm.handleEdit(inbound)
    await chooseTask()
    expect(mocks.get).toHaveBeenCalledWith('/inventory/task/7/material-issues', { params: { excludeInboundId: 11 } })
  })

  test('refreshes the same approval panel after a successful resubmission', async () => {
    inbound.status = 'completed'
    await openPage()
    await wrapper.vm.handleView(11)
    await flushPromises()
    expect(detail().text()).toContain('重新提交审核')
    await detail().findAll('button').find(button => button.text() === '重新提交审核').trigger('click')
    await flushPromises()
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith('/inventory/inbound/status/11', { newStatus: 'completed' })
    expect(mocks.getBySource).toHaveBeenCalledTimes(2)
    expect(detail().text()).toContain('未审核')
    expect(detail().text()).not.toContain('重新提交审核')
  })

  test('keeps rejection and the retry action after a failed resubmission', async () => {
    inbound.status = 'completed'
    mocks.put.mockRejectedValueOnce({ response: { data: { message: '单据已变更，请重试' } } })
    await openPage()
    await wrapper.vm.handleView(11)
    await flushPromises()
    await wrapper.vm.handleResubmitInbound('completed')
    expect(mocks.error).toHaveBeenCalledWith('单据已变更，请重试')
    expect(mocks.getBySource).toHaveBeenCalledTimes(1)
    expect(mocks.success).not.toHaveBeenCalled()
    expect(detail().text()).toContain('重新提交审核')
  })

  test('offers business-only resubmission without querying financial details and prevents duplicate requests', async () => {
    mocks.auth.canViewInventoryApproval = false
    inbound.status = 'completed'
    let finish
    mocks.put.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await openPage()
    await wrapper.vm.handleView(11)
    await flushPromises()
    expect(detail().text()).toContain('重新提交审核')
    const request = wrapper.vm.handleResubmitInbound('completed')
    await wrapper.vm.handleResubmitInbound('completed')
    expect(mocks.put).toHaveBeenCalledTimes(1)
    expect(mocks.getBySource).not.toHaveBeenCalled()
    finish({ data: {} })
    await request
  })

  test('does not resubmit without the inventory update permission', async () => {
    mocks.auth.hasPermission.mockReturnValue(false)
    inbound.status = 'completed'
    await openPage()
    await wrapper.vm.handleView(11)
    await flushPromises()
    await wrapper.vm.handleResubmitInbound('completed')
    expect(mocks.put).not.toHaveBeenCalled()
    expect(detail().text()).not.toContain('重新提交审核')
  })

  test('reloads source detail after inline reversal so status and print use current data', async () => {
    inbound.status = 'completed'
    await openPage()
    await wrapper.vm.handleView(11)
    await flushPromises()
    inbound.status = 'reversed'
    inbound.remarks = '冲销后备注'
    await wrapper.vm.handleView(11)
    await flushPromises()
    expect(wrapper.vm.currentInbound.status).toBe('reversed')
    expect(detail().text()).toContain(getInboundOutboundStatusText('reversed'))
    await wrapper.vm.handlePrintInbound()
    expect(mocks.generateByDefaultTemplate).toHaveBeenCalledWith('inventory', 'inbound', expect.objectContaining({ remarks: '冲销后备注' }))
  })
})
