import { createRequire } from 'node:module'
import { reactive, ref } from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import Entries from '@/views/finance/gl/Entries.vue'
import { buildJournalRows, formatJournalAmount, JOURNAL_COLUMNS, journalCellValue } from '@/views/finance/gl/entries/journalGrid'

const require = createRequire(import.meta.url)
const { toGlEntryApi } = require('../../backend/src/utils/finance/glFieldMap')
const state = vi.hoisted(() => ({
  api: {
    getEntries: vi.fn(), getEntry: vi.fn(), getEntryItems: vi.fn(),
    postEntry: vi.fn(), deleteEntry: vi.fn(), periods: { getList: vi.fn() }
  },
  confirm: vi.fn(),
  route: null
}))
vi.mock('@/api', () => ({ financeApi: state.api }))
vi.mock('vue-router', () => ({ useRoute: () => state.route }))
vi.mock('@/stores/finance', () => ({ useFinanceStore: () => ({ glConfig: ref({ documentTypes: [], entryStatuses: [] }), loadSettings: vi.fn() }) }))
vi.mock('@/services/printService', () => ({ default: {} }))
vi.mock('@/views/finance/gl/entries/EntryFormDialog.vue', () => ({ default: { template: '<div />' } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: state.confirm } }))

const voucher = (id = 11) => toGlEntryApi({
  id, entry_number: `GL-${id}`, voucher_word: '付', voucher_number: String(id).padStart(6, '0'),
  entry_date: '2026-09-04', posting_date: '2026-09-04', period_name: '2026-09',
  document_type: 'payment', document_number: 'PAY-090063', description: '付款凭证摘要',
  is_posted: 0, total_debit: 900, total_credit: 900,
  items: [
    { id: 201, entry_id: id, account_code: '220202', account_name: '应付账款-人民币', description: '材料采购', debit_amount: 650, credit_amount: 0, department_name: '生产部', supplier_name: '材料供应商', currency_code: 'CNY' },
    { id: 202, entry_id: id, account_code: '100203', account_name: '银行存款-工行', description: '银行付款', debit_amount: 0, credit_amount: 650, customer_name: '客户甲', currency_code: 'USD', exchange_rate: 7.12 }
  ]
})
const column = prop => JOURNAL_COLUMNS.find(candidate => candidate.prop === prop)
const cell = (row, prop) => journalCellValue(row, column(prop))
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
const legacyVoucher = id => { const entry = voucher(id); delete entry.items; return entry }
let wrapper
const button = text => wrapper.findAll('button').find(candidate => candidate.text() === text)
const grid = () => wrapper.findComponent({ name: 'ElTable' })
const selectLine = async (index = 1) => {
  grid().vm.$emit('row-click', grid().props('data')[index])
  await flushPromises()
}
const open = async () => {
  wrapper = shallowMount(Entries, { global: { directives: { permission() {}, loading() {} }, stubs: {
    PageHeader: true,
    FinanceQueryCard: { name: 'FinanceQueryCard', props: ['model'], emits: ['search', 'reset'], template: '<div />' },
    EmptyState: true, EntryVoucherSheet: false,
    AppDialog: { name: 'AppDialog', props: ['modelValue', 'title', 'loading'], emits: ['update:modelValue'], template: '<section v-if="modelValue" :data-dialog="title"><slot name="header" /><slot /></section>' },
    ElAlert: { props: ['title'], template: '<aside>{{ title }}<slot /></aside>' },
    ElButton: { props: ['disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
    ElCard: { template: '<section><slot /></section>' },
    ElTable: { name: 'ElTable', props: ['data'], emits: ['row-click', 'row-dblclick'], template: '<div><slot /></div>' },
    ElTableColumn: true,
    ElPagination: { name: 'ElPagination', props: ['total', 'currentPage', 'pageSize'], emits: ['current-change', 'size-change'], template: '<div />' },
    ElInput: true, ElFormItem: true, ElDatePicker: true, ElOption: true,
    ElSelect: true, ElTag: { template: '<span><slot /></span>' }, ElIcon: true,
    ElDescriptionsItem: true, ElDescriptions: true, ElForm: true
  } } })
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  state.route = reactive({ query: {} })
  state.api.getEntries.mockResolvedValue({ data: { entries: [voucher()], pagination: { total: 37 } } })
  state.api.getEntry.mockImplementation(id => Promise.resolve({ data: { entry: voucher(id) } }))
  state.api.getEntryItems.mockImplementation(id => Promise.resolve({ data: voucher(id).items }))
  state.api.periods.getList.mockResolvedValue({ data: { periods: [] } })
  state.api.postEntry.mockResolvedValue({})
  state.api.deleteEntry.mockResolvedValue({})
  state.confirm.mockResolvedValue('confirm')
})
afterEach(() => { wrapper?.unmount(); wrapper = null })

test('each ledger row displays its own account, dimensions and amounts instead of voucher totals', () => {
  const entry = voucher()
  const rows = buildJournalRows([entry])
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({ accountCode: '220202', accountName: '应付账款-人民币', description: '材料采购', debitAmount: 650, creditAmount: 0, departmentName: '生产部', supplierName: '材料供应商', currencyName: '人民币' })
  expect(rows[1]).toMatchObject({ accountCode: '100203', accountName: '银行存款-工行', description: '银行付款', debitAmount: 0, creditAmount: 650, customerName: '客户甲', currencyName: '美元', exchangeRate: 7.12 })
  expect(rows.every(row => row.entry === entry)).toBe(true)
  expect(new Set(rows.map(row => row.rowKey)).size).toBe(2)
  expect(rows.map(row => cell(row, 'debitAmount'))).toEqual(['650.00', ''])
  expect(rows.map(row => cell(row, 'creditAmount'))).toEqual(['', '650.00'])
})

test('voucher identity is shown on the first line of every voucher and blank on continuation lines', () => {
  const rows = buildJournalRows([voucher(11), voucher(12)])
  expect(rows.map(row => cell(row, 'entryNumber'))).toEqual(['付-000011', '', '付-000012', ''])
  expect(['periodName', 'entryDate', 'voucherType'].map(prop => cell(rows[0], prop))).toEqual(['2026-09', '2026-09-04', '付款凭证'])
  expect(['periodName', 'entryDate', 'voucherType'].map(prop => cell(rows[1], prop))).toEqual(['', '', ''])
  expect(cell(rows[1], 'documentNumber')).toBe('PAY-090063')
  expect(cell(rows[1], 'accountCode')).toBe('100203')
})

test('zero and unavailable amounts are blank while negative reversal amounts remain visible', () => {
  expect([0, '0.00', null, undefined, '', Number.NaN, Infinity].map(formatJournalAmount)).toEqual(Array(7).fill(''))
  expect(formatJournalAmount(-1250.5)).toBe('-1,250.50')
  expect(formatJournalAmount('1250.50')).toBe('1,250.50')
  const entry = voucher()
  entry.items[0].debitAmount = -650
  expect(cell(buildJournalRows([entry])[0], 'debitAmount')).toBe('-650.00')
})

test.each([[], undefined])('a voucher without items remains selectable without inventing line amounts (%j)', items => {
  const entry = { ...voucher(), items }
  const rows = buildJournalRows([entry])
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ entry, firstLine: true, hasItem: false, description: '暂无分录', accountCode: '', accountName: '' })
  expect(['debitAmount', 'creditAmount', 'foreignAmount', 'exchangeRate'].map(prop => cell(rows[0], prop))).toEqual(['', '', '', ''])
})

test('loads all grid lines in the paginated list request and keeps the pagination total in vouchers', async () => {
  await open()
  expect(state.api.getEntries).toHaveBeenCalledOnce()
  expect(state.api.getEntries).toHaveBeenCalledWith(expect.objectContaining({ page: 1, includeItems: true }))
  expect(state.api.getEntry).not.toHaveBeenCalled()
  expect(state.api.getEntryItems).not.toHaveBeenCalled()
  expect(grid().props('data')).toHaveLength(2)
  expect(wrapper.findComponent({ name: 'ElPagination' }).props('total')).toBe(37)
  expect(wrapper.find('.journal-count').text()).toBe('本页 1 张凭证 · 2 条分录')
  wrapper.findComponent({ name: 'ElPagination' }).vm.$emit('current-change', 2)
  await flushPromises()
  expect(state.api.getEntries).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, includeItems: true }))
  expect(state.api.getEntryItems).not.toHaveBeenCalled()
})

test.each([undefined, null])('hydrates unavailable items from an older list response (%j)', async items => {
  state.api.getEntries.mockResolvedValueOnce({ data: { entries: [{ ...voucher(), items }], pagination: { total: 37 } } })
  await open()
  expect(state.api.getEntries).toHaveBeenCalledWith(expect.objectContaining({ includeItems: true }))
  expect(state.api.getEntryItems.mock.calls).toEqual([[11]])
  expect(wrapper.find('aside').exists()).toBe(false)
  expect(grid().props('data')).toHaveLength(2)
  expect(grid().props('data').map(row => cell(row, 'debitAmount'))).toEqual(['650.00', ''])
  expect(wrapper.findComponent({ name: 'ElPagination' }).props('total')).toBe(37)
})

test('malformed non-null items produce a retryable list error rather than an empty voucher', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  state.api.getEntries.mockResolvedValueOnce({ data: { entries: [voucher(11), { ...voucher(12), items: {} }], pagination: { total: 37 } } })
  await open()
  expect(wrapper.find('aside').text()).toContain('凭证明细数据不完整，请重新加载')
  expect(grid().props('data')).toEqual([])
  expect(wrapper.findComponent({ name: 'ElPagination' }).props('total')).toBe(0)
  expect(wrapper.find('.journal-count').text()).toBe('本页 0 张凭证 · 0 条分录')
  expect(button('查看凭证').attributes('disabled')).toBeDefined()
  expect(state.api.getEntryItems).not.toHaveBeenCalled()
  await button('重新加载').trigger('click')
  await flushPromises()
  expect(state.api.getEntries).toHaveBeenCalledTimes(2)
  expect(wrapper.find('aside').exists()).toBe(false)
  expect(grid().props('data')).toHaveLength(2)
  expect(wrapper.findComponent({ name: 'ElPagination' }).props('total')).toBe(37)
})

test('a mixed response hydrates only absent items and preserves supplied and explicitly empty arrays', async () => {
  const entries = [voucher(11), legacyVoucher(12), { ...voucher(13), items: [] }, { ...voucher(14), items: null }]
  state.api.getEntries.mockResolvedValueOnce({ data: { entries, pagination: { total: 37 } } })
  await open()
  expect(state.api.getEntryItems.mock.calls).toEqual([[12], [14]])
  expect(grid().props('data').map(row => row.entry.id)).toEqual([11, 11, 12, 12, 13, 14, 14])
  expect(grid().props('data')[4]).toMatchObject({ hasItem: false, description: '暂无分录' })
  expect(wrapper.find('.journal-count').text()).toBe('本页 4 张凭证 · 6 条分录')
  expect(wrapper.findComponent({ name: 'ElPagination' }).props('total')).toBe(37)
})

test('an older server page loads at most four details concurrently and publishes ordered rows only after all complete', async () => {
  const ids = [11, 12, 13, 14, 15, 16, 17, 18]
  const pending = new Map(ids.map(id => [id, deferred()]))
  let active = 0
  let peak = 0
  state.api.getEntries.mockResolvedValueOnce({ data: { entries: ids.map(legacyVoucher), pagination: { total: 37 } } })
  state.api.getEntryItems.mockImplementation(id => {
    active++
    peak = Math.max(peak, active)
    return pending.get(id).promise.finally(() => { active-- })
  })
  await open()
  expect(state.api.getEntryItems.mock.calls).toEqual([[11], [12], [13], [14]])
  expect(grid().props('data')).toEqual([])
  for (const id of [14, 12, 11, 13, 18, 16, 15]) {
    pending.get(id).resolve({ data: voucher(id).items })
    await flushPromises()
    expect(grid().props('data')).toEqual([])
  }
  expect(state.api.getEntryItems).toHaveBeenCalledTimes(8)
  expect(peak).toBe(4)
  expect(active).toBe(1)
  pending.get(17).resolve({ data: voucher(17).items })
  await flushPromises()
  expect(active).toBe(0)
  expect(grid().props('data').map(row => row.entry.id)).toEqual(ids.flatMap(id => [id, id]))
  expect(wrapper.find('.journal-count').text()).toBe('本页 8 张凭证 · 16 条分录')
  expect(wrapper.findComponent({ name: 'ElPagination' }).props('total')).toBe(37)
})

test.each(['failure', 'malformed response'])('a detail %s stops queued work, publishes no partial rows and can be retried', async failure => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const ids = [11, 12, 13, 14, 15, 16, 17]
  const pending = new Map(ids.map(id => [id, deferred()]))
  state.api.getEntries.mockResolvedValue({ data: { entries: ids.map(legacyVoucher), pagination: { total: 37 } } })
  state.api.getEntryItems.mockImplementation(id => pending.get(id).promise)
  await open()
  expect(state.api.getEntryItems).toHaveBeenCalledTimes(4)
  if (failure === 'failure') pending.get(11).reject(new Error('凭证明细暂时无法加载'))
  else pending.get(11).resolve({ data: { items: [] } })
  await flushPromises()
  for (const id of [12, 13, 14]) pending.get(id).resolve({ data: voucher(id).items })
  await flushPromises()
  expect(state.api.getEntryItems).toHaveBeenCalledTimes(4)
  expect(wrapper.find('aside').text()).toContain('凭证')
  expect(grid().props('data')).toEqual([])
  expect(button('查看凭证').attributes('disabled')).toBeDefined()
  state.api.getEntryItems.mockImplementation(id => Promise.resolve({ data: voucher(id).items }))
  await button('重新加载').trigger('click')
  await flushPromises()
  expect(wrapper.find('aside').exists()).toBe(false)
  expect(state.api.getEntryItems).toHaveBeenCalledTimes(11)
  expect(grid().props('data')).toHaveLength(14)
  expect(wrapper.findComponent({ name: 'ElPagination' }).props('total')).toBe(37)
})

test.each(['pagination', 'unmount'])('%s stops stale queued details and ignores late success and failure responses', async action => {
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
  const ids = [11, 12, 13, 14, 15, 16, 17]
  const pending = new Map(ids.map(id => [id, deferred()]))
  state.api.getEntries.mockResolvedValueOnce({ data: { entries: ids.map(legacyVoucher), pagination: { total: 37 } } })
  state.api.getEntryItems.mockImplementation(id => pending.get(id).promise)
  await open()
  expect(state.api.getEntryItems).toHaveBeenCalledTimes(4)
  if (action === 'pagination') {
    state.api.getEntries.mockResolvedValueOnce({ data: { entries: [voucher(99)], pagination: { total: 37 } } })
    wrapper.findComponent({ name: 'ElPagination' }).vm.$emit('current-change', 2)
    await flushPromises()
    expect(grid().props('data').map(row => row.entry.id)).toEqual([99, 99])
  } else {
    wrapper.unmount()
    wrapper = null
  }
  pending.get(11).reject(new Error('旧页面明细请求失败'))
  for (const id of [12, 13, 14]) pending.get(id).resolve({ data: voucher(id).items })
  await flushPromises()
  expect(state.api.getEntryItems).toHaveBeenCalledTimes(4)
  expect(errorLog).not.toHaveBeenCalled()
  if (action === 'pagination') {
    expect(grid().props('data').map(row => row.entry.id)).toEqual([99, 99])
    expect(wrapper.find('aside').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ElPagination' }).props('total')).toBe(37)
  }
})

test('an explicitly empty items array is a valid selectable voucher with zero detail rows', async () => {
  state.api.getEntries.mockResolvedValueOnce({ data: { entries: [{ ...voucher(), items: [] }], pagination: { total: 1 } } })
  await open()
  expect(wrapper.find('aside').exists()).toBe(false)
  expect(grid().props('data')).toHaveLength(1)
  expect(grid().props('data')[0]).toMatchObject({ hasItem: false, description: '暂无分录' })
  expect(['debitAmount', 'creditAmount'].map(prop => cell(grid().props('data')[0], prop))).toEqual(['', ''])
  expect(wrapper.find('.journal-count').text()).toBe('本页 1 张凭证 · 0 条分录')
  expect(wrapper.findComponent({ name: 'ElPagination' }).props('total')).toBe(1)
  await selectLine(0)
  expect(button('查看凭证').attributes('disabled')).toBeUndefined()
  expect(wrapper.find('.journal-selection').text()).toContain('付-000011')
})

test('viewing a selected continuation line opens its parent voucher with its header description', async () => {
  await open()
  expect(button('查看凭证').attributes('disabled')).toBeDefined()
  await selectLine()
  expect(wrapper.find('.journal-selection').text()).toContain('付-000011')
  expect(button('查看凭证').attributes('disabled')).toBeUndefined()
  await button('查看凭证').trigger('click')
  await flushPromises()
  expect(state.api.getEntry).toHaveBeenCalledWith(11)
  expect(state.api.getEntryItems).not.toHaveBeenCalled()
  expect(wrapper.find('[data-dialog="凭证明细"] .entry-description').text()).toContain('付款凭证摘要')
})

test.each([
  [{ is_reversed: 1 }, 'isReversed', true, '已冲销'],
  [{ reversal_entry_id: 99 }, 'reversalEntryId', 99, '已冲销'],
  [{ is_reversal_entry: 1 }, 'isReversalEntry', true, '冲销凭证（已过账）'],
  [{ reversal_of_entry_id: 9 }, 'reversalOfEntryId', 9, '冲销凭证（已过账）'],
])('backend-mapped reversal metadata keeps repeat reversal disabled: %j', async (fields, property, value, status) => {
  const entry = toGlEntryApi({
    id: 11, entry_number: 'GL-11', document_type: 'manual_entry', is_posted: 1,
    ...fields,
    items: [{ id: 201, entry_id: 11, account_code: '1001', debit_amount: 100, credit_amount: 0 }],
  })
  expect(entry[property]).toBe(value)
  expect(Object.keys(entry).some(key => key.includes('_'))).toBe(false)
  state.api.getEntries.mockResolvedValueOnce({ data: { entries: [entry], pagination: { total: 1 } } })
  await open()
  await selectLine(0)
  expect(wrapper.find('.journal-selection').text()).toContain(status)
  expect(button('冲销').attributes('disabled')).toBeDefined()
})

test.each([['过账', 'postEntry'], ['删除', 'deleteEntry']])('%s from a continuation line acts on the parent voucher identifier', async (label, method) => {
  await open()
  await selectLine()
  await button(label).trigger('click')
  await flushPromises()
  expect(state.confirm).toHaveBeenCalledOnce()
  expect(state.api[method]).toHaveBeenCalledWith(11)
  expect(button('查看凭证').attributes('disabled')).toBeDefined()
})

test.each([['过账', 'postEntry'], ['删除', 'deleteEntry']])('%s locks before confirmation and until the mutation and refresh finish', async (label, method) => {
  const confirm = deferred(), mutation = deferred()
  state.confirm.mockReturnValueOnce(confirm.promise)
  state.api[method].mockReturnValueOnce(mutation.promise)
  await open()
  await selectLine()
  const operation = button(label)
  await operation.trigger('click')
  await operation.trigger('click')
  expect(state.confirm).toHaveBeenCalledOnce()
  expect(state.api[method]).not.toHaveBeenCalled()
  expect(button('过账').attributes('disabled')).toBeDefined()
  expect(button('删除').attributes('disabled')).toBeDefined()
  confirm.resolve('confirm')
  await flushPromises()
  await operation.trigger('click')
  expect(state.api[method]).toHaveBeenCalledOnce()
  mutation.resolve({})
  await flushPromises()
  expect(state.api.getEntries).toHaveBeenCalledTimes(2)
})

test('cancelling a pending posting confirmation releases the lock without posting', async () => {
  state.confirm.mockRejectedValueOnce('cancel')
  await open()
  await selectLine()
  await button('过账').trigger('click')
  await flushPromises()
  expect(state.api.postEntry).not.toHaveBeenCalled()
  expect(button('过账').attributes('disabled')).toBeUndefined()
})

test('detail opens a fresh complete snapshot even when the selected list header is stale', async () => {
  state.api.getEntry.mockResolvedValueOnce({ data: { entry: { ...voucher(), isPosted: true, isReversed: true, reversalEntryId: 99, description: '最新摘要', items: [{ ...voucher().items[0], description: '最新分录' }] } } })
  await open()
  await selectLine()
  await button('查看凭证').trigger('click')
  await flushPromises()
  const detail = wrapper.find('[data-dialog="凭证明细"]')
  expect(detail.text()).toContain('已冲销')
  expect(detail.text()).toContain('最新摘要')
  expect(detail.text()).toContain('最新分录')
  expect(state.api.getEntryItems).not.toHaveBeenCalled()
  await detail.find('button[type="button"]').trigger('click')
  await flushPromises()
  expect(state.api.getEntry).toHaveBeenLastCalledWith(99)
})

test.each([['current-change', 2], ['size-change', 50]])('pagination %s clears the previous voucher selection before and after loading', async (event, value) => {
  await open()
  await selectLine()
  const pending = deferred()
  state.api.getEntries.mockReturnValueOnce(pending.promise)
  wrapper.findComponent({ name: 'ElPagination' }).vm.$emit(event, value)
  await flushPromises()
  expect(wrapper.find('.journal-selection').text()).not.toContain('付-000011')
  expect(wrapper.find('.journal-selection').text()).toContain('请选择分录后操作凭证')
  expect(['查看凭证', '过账', '冲销', '删除'].every(label => button(label).attributes('disabled') !== undefined)).toBe(true)
  expect(state.api.getEntries).toHaveBeenLastCalledWith(expect.objectContaining(event === 'current-change' ? { page: 2 } : { page: 1, pageSize: 50 }))
  pending.resolve({ data: { entries: [voucher(12)], pagination: { total: 37 } } })
  await flushPromises()
  expect(grid().props('data')[0].entry.id).toBe(12)
  expect(button('查看凭证').attributes('disabled')).toBeDefined()
  await selectLine()
  expect(wrapper.find('.journal-selection').text()).toContain('付-000012')
  expect(button('查看凭证').attributes('disabled')).toBeUndefined()
})

test.each(['search', 'refresh'])('%s clears the selected line as soon as reloading begins', async action => {
  await open()
  await selectLine()
  expect(wrapper.find('.journal-selection').text()).toContain('付-000011')
  expect(button('查看凭证').attributes('disabled')).toBeUndefined()
  const pending = deferred()
  state.api.getEntries.mockReturnValueOnce(pending.promise)
  if (action === 'search') wrapper.findComponent({ name: 'FinanceQueryCard' }).vm.$emit('search')
  else await button('刷新').trigger('click')
  await flushPromises()
  expect(wrapper.find('.journal-selection').text()).toContain('请选择分录后操作凭证')
  expect(button('查看凭证').attributes('disabled')).toBeDefined()
  pending.resolve({ data: { entries: [voucher()], pagination: { total: 37 } } })
  await flushPromises()
  expect(grid().props('data')).toHaveLength(2)
  expect(button('查看凭证').attributes('disabled')).toBeDefined()
})
