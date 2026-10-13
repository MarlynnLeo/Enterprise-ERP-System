import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { inject, nextTick, provide, reactive, ref, toRef } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import InventoryPostings from '@/views/finance/InventoryPostings.vue'
import { auditCsv, formatAmount, lastReview, normalizePosting, separationReason, signedMovementValue, sourceTarget } from '@/views/finance/inventoryPostingModel'

const mocks = vi.hoisted(() => ({
  list: vi.fn(), get: vi.fn(), approve: vi.fn(), reject: vi.fn(), reverse: vi.fn(), batchApprove: vi.fn(),
  confirm: vi.fn(), prompt: vi.fn(), warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn(), push: vi.fn(),
}))
const auth = reactive({ user: { id: 9, realName: '财务乙' }, canApproveInventoryApproval: true, canReverseInventoryApproval: true, hasPermission: () => true })
const route = reactive({ query: {} })
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/api/finance', () => ({ financeApi: { inventoryPostings: mocks } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: mocks }))
vi.mock('@/utils/themePageSize', () => ({ getThemeDefaultPageSize: () => 20 }))

const slot = { template: '<div><slot /></div>' }
const button = { props: ['loading', 'disabled'], emits: ['click'], template: '<button :disabled="loading || disabled" @click="$emit(\'click\', $event)"><slot /></button>' }
const table = {
  props: ['data'], emits: ['selection-change'],
  setup(props, { emit }) { provide('rows', toRef(props, 'data')); return { clearSelection: () => emit('selection-change', []) } },
  template: '<div class="table"><slot /></div>',
}
const column = { setup() { return { rows: inject('rows', []) } }, template: '<div><slot v-for="(row, index) in rows" :key="index" :row="row" /></div>' }
const stubs = {
  PageHeader: { template: '<header><slot name="actions" /></header>' },
  FinanceQueryCard: { template: '<div><slot name="basic" /></div>' },
  AppDialog: { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>' },
  ElButton: button, ElTable: table, ElTableColumn: column,
  ElAlert: { props: ['title'], template: '<aside>{{ title }}<slot /></aside>' },
  ElCard: slot, ElTag: slot, ElIcon: slot, ElFormItem: slot, ElSelect: slot, ElOption: true, ElInput: true,
  ElDescriptions: slot, ElDescriptionsItem: slot, ElDivider: slot, ElTimeline: slot, ElTimelineItem: slot, ElPagination: true,
  TableRowActions: slot, ElPopconfirm: slot, EmptyState: slot,
}
const posting = (id, extra = {}) => ({ id, postingNo: `POST-${id}`, postingKind: 'movement', sourceType: 'inbound', sourceId: id,
  sourceNo: `IN-${id}`, financeStatus: 'pending', businessApprovedById: 2, businessApprovedBy: '仓库甲', totalValue: '-123.45', locked: 0,
  lines: [], events: [], relatedPostings: [], capabilities: { reversalSupported: true }, ...extra })
const listResponse = (list, total = list.length) => ({ data: { list, total, page: 1, pageSize: 20, statistics: { total: 8, pending: 3, approved: 4, rejected: 1, reversed: 0 } } })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
let wrapper
const openPage = async () => {
  wrapper = mount(InventoryPostings, { global: { stubs, directives: { permission: () => {}, loading: () => {} } } })
  await flushPromises()
  return wrapper.vm
}
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset())
  auth.user = { id: 9, realName: '财务乙' }
  auth.canApproveInventoryApproval = true
  auth.canReverseInventoryApproval = true
  route.query = {}
  mocks.list.mockResolvedValue(listResponse([posting(1), posting(2)]))
  mocks.get.mockImplementation(async id => ({ data: posting(Number(id)) }))
  mocks.approve.mockResolvedValue({})
  mocks.reject.mockResolvedValue({})
  mocks.reverse.mockResolvedValue({})
  mocks.confirm.mockResolvedValue('confirm')
  mocks.prompt.mockResolvedValue({ value: '核对来源成本' })
})
afterEach(() => wrapper?.unmount())

describe('inventory posting workbench', () => {
  test('reads rows and filter-scoped statistics in one request', async () => {
    const vm = await openPage()
    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(vm.statistics.total).toBe(8)
    expect(vm.postings).toHaveLength(2)
    vm.keywordQuery = ' IN-1 '
    vm.sourceTypeFilter = 'inbound'
    await vm.setStatusFilter('pending')
    expect(mocks.list).toHaveBeenLastCalledWith({ keyword: 'IN-1', sourceType: 'inbound', financeStatus: 'pending', page: 1, pageSize: 20 })
  })

  test('opens the exact posting supplied by a source page', async () => {
    route.query = { sourceType: 'inbound', sourceNo: 'IN-2', postingId: '2' }
    const vm = await openPage()
    expect(mocks.get).toHaveBeenCalledWith('2')
    expect(vm.currentDetail.id).toBe(2)
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'inbound', keyword: 'IN-2' }))
  })

  test('late detail responses cannot replace a newer document or reopen a closed dialog', async () => {
    const first = deferred(), second = deferred()
    mocks.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const vm = await openPage()
    const a = vm.openDetail({ id: 1 }), b = vm.openDetail({ id: 2 })
    second.resolve({ data: posting(2) }); await b
    first.resolve({ data: posting(1) }); await a
    expect(vm.currentDetail.id).toBe(2)
    const third = deferred()
    mocks.get.mockReturnValueOnce(third.promise)
    const c = vm.openDetail({ id: 3 })
    vm.detailVisible = false
    await flushPromises()
    third.resolve({ data: posting(3) }); await c
    expect(vm.currentDetail).toBeNull()
    expect(vm.detailVisible).toBe(false)
  })

  test('captures the confirmed posting and prevents duplicate submission or switching the dialog', async () => {
    const confirmation = deferred()
    mocks.confirm.mockReturnValue(confirmation.promise)
    const vm = await openPage()
    await vm.openDetail({ id: 1 })
    const submit = vm.handleReview(vm.currentDetail, 'approve')
    await vm.handleReview(posting(2), 'approve')
    await vm.openDetail({ id: 2 })
    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    expect(vm.currentDetail.id).toBe(1)
    confirmation.resolve('confirm'); await submit
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith(1)
    expect(vm.actionLoading).toBe(false)
  })

  test.each(['single', 'batch'])('invalidates an unconfirmed %s approval after leaving and returning to a cached page', async (mode) => {
    const confirmation = deferred()
    mocks.confirm.mockReturnValue(confirmation.promise)
    wrapper = mount({
      components: { InventoryPostings },
      setup: () => ({ visible: ref(true) }),
      template: '<keep-alive><InventoryPostings v-if="visible" /></keep-alive>',
    }, { global: { stubs, directives: { permission: () => {}, loading: () => {} } } })
    await flushPromises()
    const vm = wrapper.findComponent(InventoryPostings).vm
    await vm.openDetail({ id: 1 })
    vm.selectedRows = [posting(1)]
    const action = mode === 'single' ? vm.handleReview(vm.currentDetail, 'approve') : vm.handleBatchApprove()
    wrapper.vm.visible = false
    await nextTick()
    expect(vm.currentDetail).toBeNull()
    expect(vm.selectedRows).toHaveLength(0)
    route.query = { sourceType: 'inbound', sourceNo: 'IN-2', postingId: '2' }
    wrapper.vm.visible = true
    await nextTick()
    confirmation.resolve('confirm')
    await action
    expect(mocks.approve).not.toHaveBeenCalled()
    expect(mocks.batchApprove).not.toHaveBeenCalled()
    expect(vm.actionLoading).toBe(false)
    await flushPromises()
    expect(vm.currentDetail.id).toBe(2)
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ sourceType: 'inbound', keyword: 'IN-2' }))
  })

  test('a delayed source lookup cannot override a later navigation choice', async () => {
    const lookup = deferred()
    mocks.get.mockReturnValueOnce(lookup.promise)
    const vm = await openPage()
    const reversal = posting(3, { postingKind: 'reversal', originalPostingDocumentId: 1 })
    const first = vm.navigateToSource(reversal)
    await vm.navigateToSource(posting(2))
    lookup.resolve({ data: { ...reversal, relatedPostings: [posting(1)] } })
    await first
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ path: '/inventory/inbound', query: { sourceType: 'inbound', sourceId: '2', sourceNo: 'IN-2' } })
  })

  test('does not submit whitespace remarks and treats dialog close as cancellation', async () => {
    const vm = await openPage()
    mocks.prompt.mockResolvedValueOnce({ value: '   \n ' }).mockRejectedValueOnce('close')
    await vm.handleReview(posting(1), 'reject')
    await vm.handleReview(posting(1), 'reject')
    expect(mocks.reject).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
    expect(vm.actionLoading).toBe(false)
  })

  test('sends trimmed reasons and does not present a reversal request as a completed reversal', async () => {
    const vm = await openPage()
    mocks.prompt.mockResolvedValue({ value: '  核对来源成本  ' })
    await vm.handleReview(posting(1, { financeStatus: 'approved', locked: 1 }), 'reverse')
    expect(mocks.reverse).toHaveBeenCalledWith(1, { remark: '核对来源成本' })
    expect(mocks.success).toHaveBeenCalledWith('反审核申请已提交，待独立财务审核')
  })

  test('blocks self-review and hides reversal for unsupported or already requested sources', async () => {
    const vm = await openPage()
    expect(vm.canReview(posting(1, { businessApprovedById: 9 }))).toBe(false)
    auth.canApproveInventoryApproval = false
    expect(vm.canReview(posting(1))).toBe(false)
    const approved = posting(1, { financeStatus: 'approved', locked: 1 })
    expect(vm.canReverse(approved)).toBe(true)
    expect(vm.canReverse({ ...approved, capabilities: { reversalSupported: false } })).toBe(false)
    expect(vm.canReverse({ ...approved, relatedPostings: [posting(3, { postingKind: 'reversal' })] })).toBe(false)
    expect(vm.canReverse({ ...approved, postingKind: 'reversal' })).toBe(false)
  })

  test('reports individual batch failures without falsely marking a mixed batch successful', async () => {
    const vm = await openPage()
    vm.selectedRows = [posting(1), posting(2)]
    mocks.batchApprove.mockResolvedValue({ data: { totalCount: 2, successCount: 1, failureCount: 1, results: [{ id: 1, success: true }, { id: 2, success: false, error: '会计期间已关闭' }] } })
    await vm.handleBatchApprove()
    expect(mocks.batchApprove).toHaveBeenCalledWith({ ids: [1, 2] })
    expect(mocks.warning).toHaveBeenCalledWith('批量审核完成：成功 1 条，失败 1 条')
    expect(mocks.success).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('POST-2：会计期间已关闭')
    expect(vm.selectedRows).toHaveLength(0)
  })

  test('clears selection on filters and returns to the last valid page after rows disappear', async () => {
    const vm = await openPage()
    vm.selectedRows = [posting(1)]
    await vm.setStatusFilter('pending')
    expect(vm.selectedRows).toHaveLength(0)
    mocks.list.mockResolvedValueOnce(listResponse([], 20)).mockResolvedValueOnce(listResponse([posting(1)], 20))
    await vm.handlePageChange(2)
    expect(vm.pagination.current).toBe(1)
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }))
  })

  test('keeps a committed approval successful when the follow-up list request fails', async () => {
    const vm = await openPage()
    mocks.list.mockRejectedValue(new Error('网络断开'))
    await vm.handleReview(posting(1), 'approve')
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith(1)
    expect(mocks.success).toHaveBeenCalledWith('存货过账审核通过')
    expect(mocks.warning).toHaveBeenCalledWith('操作已完成，列表刷新失败，请刷新数据核对最新状态')
    expect(vm.isRowSelectable(posting(1))).toBe(false)
  })

  test('renders standardized row actions and triggers reversal from the row action button', async () => {
    const approved = posting(1, { financeStatus: 'approved', locked: 1 })
    mocks.list.mockResolvedValueOnce(listResponse([approved]))
    const vm = await openPage()
    expect(vm.postings[0].financeStatus).toBe('approved')
    expect(vm.canReverse(vm.postings[0])).toBe(true)
    mocks.prompt.mockResolvedValueOnce({ value: '行操作反审核' })
    await vm.handleReview(vm.postings[0], 'reverse')
    expect(mocks.reverse).toHaveBeenCalledWith(1, { remark: '行操作反审核' })
    expect(mocks.success).toHaveBeenCalledWith('反审核申请已提交，待独立财务审核')
  })

  test('renders business approver and review info in a single line with YYYY-MM-DD date format', async () => {
    const row = posting(1, {
      financeStatus: 'approved',
      businessApprovedBy: '业务员甲',
      businessApprovedAt: '2026-10-12T14:30:00.000Z',
      financeApprovedLabel: '财务员乙',
      financeApprovedAt: '2026-10-12T15:45:00.000Z',
    })
    mocks.list.mockResolvedValueOnce(listResponse([row]))
    await openPage()
    const text = wrapper.text()
    expect(text).toContain('业务员甲')
    expect(text).toContain('2026-10-12')
    expect(text).toContain('财务员乙')
    expect(text).not.toContain('14:30:00')
    expect(text).not.toContain('15:45:00')
  })

  test('keeps dialog tidy by removing audit hints and renders source document number as a direct clickable link', async () => {
    const detailRow = posting(1, {
      sourceType: 'inbound',
      sourceId: 101,
      sourceNo: 'IN-101',
      businessApprovedById: 9,
    })
    mocks.get.mockResolvedValueOnce({ data: detailRow })
    const vm = await openPage()
    await vm.openDetail(detailRow)
    await flushPromises()

    const text = wrapper.text()
    expect(text).not.toContain('请核对物料、数量、成本和业务日期')
    expect(text).not.toContain('制单/业务审核人与财务审核人必须分离')
    expect(text).not.toContain('会计凭证请在凭证管理中核对')
    expect(text).not.toContain('查看来源')
    expect(text).toContain('IN-101')

    await vm.navigateToSource(detailRow)
    expect(mocks.push).toHaveBeenCalledWith({
      path: '/inventory/inbound',
      query: { sourceType: 'inbound', sourceId: '101', sourceNo: 'IN-101' },
    })
  })
})

describe('inventory audit data semantics', () => {
  test.each([
    ['normal receipt', 2, '20', '20.00'],
    ['normal issue', -2, '20', '-20.00'],
    ['reversed receipt', -2, '-20', '-20.00'],
    ['reversed issue', 2, '-20', '20.00'],
    ['missing cost', 2, null, '-'],
    ['zero cost', -2, 0, '0.00'],
  ])('shows %s value using the quantity direction', (_, signedQuantity, totalValue, expected) => {
    expect(formatAmount(signedMovementValue({ signedQuantity, totalValue }))).toBe(expected)
  })

  test('normalizes once and preserves missing and signed costs', () => {
    const row = normalizePosting({ posting_no: 'P1', finance_status: 'reversed', total_value: null, lines: [{ signed_quantity: -2, unit_cost: '0.123456', total_value: '-0.246912' }] })
    expect(row.postingNo).toBe('P1')
    expect(row).not.toHaveProperty('posting_no')
    expect(row.lines[0].signedQuantity).toBe(-2)
    expect(formatAmount(row.totalValue)).toBe('-')
    expect(formatAmount(row.lines[0].unitCost, 6)).toBe('0.123456')
    expect(formatAmount(row.lines[0].totalValue)).toBe('-0.25')
    expect(formatAmount(0)).toBe('0.00')
  })

  test('uses the current lifecycle event actor and timestamp for audit exports', () => {
    const row = posting(1, { financeStatus: 'reversed', financeApprovedLabel: '旧审核人', financeApprovedAt: '2026-01-01', reversedLabel: '冲销审核人', reversedAt: '2026-10-12' })
    expect(lastReview(row)).toEqual({ label: '冲销审核人', time: '2026-10-12' })
    expect(auditCsv([row])).toContain('冲销审核人')
    expect(auditCsv([row])).not.toContain('旧审核人')
  })

  test.each([
    { businessApprovedById: 9 }, { originalBusinessApprovedById: 9 }, { originalFinanceApprovedBy: 9 },
    { originalBusinessApprovedLabel: '财务乙' }, { originalFinanceApprovedLabel: '财务乙' },
  ])('enforces all reversal actor separation identities: %j', (identity) => {
    expect(separationReason(posting(1, { postingKind: 'reversal', ...identity }), { id: 9, realName: '财务乙' })).toContain('分离')
  })

  test('links reversal documents to the original business identity rather than the REV number', () => {
    const original = posting(1)
    const reversal = posting(3, { postingKind: 'reversal', originalPostingDocumentId: 1, sourceNo: 'IN-1-REV-1', relatedPostings: [original] })
    expect(sourceTarget(reversal)).toEqual({ path: '/inventory/inbound', query: { sourceType: 'inbound', sourceId: '1', sourceNo: 'IN-1' } })
    expect(sourceTarget({ ...reversal, relatedPostings: [] })).toBeNull()
    expect(sourceTarget(posting(4, { sourceType: 'outsourced_processing_receipt' })).path).toBe('/purchase/processing-receipts')
  })

  test('escapes CSV delimiters, newlines and spreadsheet formulas while retaining negative numbers', () => {
    const text = auditCsv([posting(1, { postingNo: '=HYPERLINK("example")', sourceNo: '含,逗号\n换行', totalValue: '-12.5' })])
    expect(text).toContain('"\'=HYPERLINK(""example"")"')
    expect(text).toContain('"含,逗号\n换行"')
    expect(text).toContain('"-12.5"')
    expect(text.startsWith('\uFEFF')).toBe(true)
  })

  test('normalizes materialCode, materialName, materialSpecs, unitName, and locationName from API lines', async () => {
    const rawPosting = {
      id: 1,
      posting_no: 'PST-1',
      lines: [
        {
          line_no: 1,
          material_id: 100,
          material_code: 'MAT-001',
          material_name: '物料A',
          material_specs: 'SPEC-A',
          unit_name: '个',
          location_name: '成品仓',
          signed_quantity: 10,
          unit_cost: 5.5,
          total_value: 55,
        },
        {
          line_no: 2,
          material_id: 101,
          materialCode: 'MAT-002',
          materialName: '物料B',
          specs: 'SPEC-B',
          unitName: '件',
          locationName: '原料仓',
          signedQuantity: -2,
          unitCost: 10,
          totalValue: -20,
        },
      ],
    }

    const normalized = normalizePosting(rawPosting)
    expect(normalized.lines[0]).toMatchObject({
      lineNo: 1,
      materialCode: 'MAT-001',
      materialName: '物料A',
      materialSpecs: 'SPEC-A',
      unitName: '个',
      locationName: '成品仓',
    })
    expect(normalized.lines[1]).toMatchObject({
      lineNo: 2,
      materialCode: 'MAT-002',
      materialName: '物料B',
      materialSpecs: 'SPEC-B',
      unitName: '件',
      locationName: '原料仓',
    })

    mocks.get.mockResolvedValueOnce({ data: rawPosting })
    const vm = await openPage()
    await vm.openDetail({ id: 1 })
    expect(vm.currentDetail.lines).toHaveLength(2)
    expect(vm.currentDetail.lines[0].materialCode).toBe('MAT-001')
    expect(vm.currentDetail.lines[0].materialName).toBe('物料A')
    expect(vm.currentDetail.lines[0].materialSpecs).toBe('SPEC-A')
  })
})
