import { createRequire } from 'node:module'
import { reactive, ref } from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import Entries from '@/views/finance/gl/Entries.vue'

const require = createRequire(import.meta.url)
const { toGlEntryApi, toGlEntryItemApi } = require('../../backend/src/utils/finance/glFieldMap')
const state = vi.hoisted(() => ({
  api: { getEntries: vi.fn(), getEntry: vi.fn(), getEntryItems: vi.fn(), periods: { getList: vi.fn() } },
  route: null
}))
vi.mock('@/api', () => ({ financeApi: state.api }))
vi.mock('vue-router', () => ({ useRoute: () => state.route }))
vi.mock('@/stores/finance', () => ({ useFinanceStore: () => ({ glConfig: ref({ documentTypes: [], entryStatuses: [] }), loadSettings: vi.fn() }) }))
vi.mock('@/services/printService', () => ({ default: {} }))
vi.mock('@/views/finance/gl/entries/EntryFormDialog.vue', () => ({ default: { template: '<div />' } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: vi.fn() } }))

const entry = id => toGlEntryApi({ id: Number(id), entry_number: `GL-${id}`, is_posted: 1, entry_date: '2026-01-01', posting_date: '2026-01-01', total_debit: 2500, total_credit: 2500 })
const items = id => [toGlEntryItemApi({ id: 1, entry_id: Number(id), account_code: '1001', account_name: '库存现金', debit_amount: 2500, credit_amount: 0 })]
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
let wrapper
const open = async () => {
  wrapper = shallowMount(Entries, { global: { directives: { permission() {}, loading() {} }, stubs: {
    PageHeader: true, FinanceQueryCard: true, EmptyState: true, EntryVoucherSheet: false,
    AppDialog: { name: 'AppDialog', props: ['modelValue', 'title', 'loading'], emits: ['update:modelValue'], template: '<section v-if="modelValue" :data-dialog="title"><slot name="header" /><slot /></section>' },
    ElAlert: { props: ['title'], template: '<aside>{{ title }}<slot /></aside>' },
    ElButton: { props: ['disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
    ElCard: true, ElTable: true, ElTableColumn: true, ElPagination: true,
    ElInput: true, ElFormItem: true, ElDatePicker: true, ElOption: true,
    ElSelect: true, ElTag: { template: '<span><slot /></span>' }, ElIcon: true,
    ElDescriptionsItem: true, ElDescriptions: true, ElForm: true
  } } })
  await flushPromises()
}
const retry = async () => {
  await wrapper.findAll('button').find(button => button.text() === '重新加载凭证').trigger('click')
  await flushPromises()
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  state.route = reactive({ query: { entryId: '900' } })
  state.api.getEntries.mockResolvedValue({ data: { entries: [], pagination: { total: 100 } } })
  state.api.getEntry.mockImplementation(id => Promise.resolve({ data: { entry: entry(id) } }))
  state.api.getEntryItems.mockImplementation(id => Promise.resolve({ data: items(id) }))
  state.api.periods.getList.mockResolvedValue({ data: { periods: [] } })
})
afterEach(() => wrapper?.unmount())

test('opens an off-page voucher using the current backend detail and item mappers', async () => {
  await open()
  expect(state.api.getEntry).toHaveBeenCalledWith('900')
  expect(state.api.getEntryItems).toHaveBeenCalledWith(900)
  expect(wrapper.text()).toContain('GL-900')
  expect(wrapper.text()).toContain('已过账')
  expect(wrapper.text()).toContain('2,500.00')
})

test('entryId-only navigation loads a different voucher without reloading the list', async () => {
  await open()
  state.route.query.entryId = '901'
  await flushPromises()
  expect(state.api.getEntryItems.mock.calls).toEqual([[900], [901]])
  expect(state.api.getEntries).toHaveBeenCalledOnce()
  expect(wrapper.text()).toContain('GL-901')
  expect(wrapper.text()).not.toContain('GL-900')
})

test.each(['getEntry', 'getEntryItems'])('a failed %s request leaves a working retry for the same route', async method => {
  state.api[method].mockRejectedValueOnce(new Error('暂时无法取得凭证'))
  await open()
  expect(wrapper.text()).toContain('暂时无法取得凭证')
  expect(wrapper.findAll('button').find(button => button.text() === '打印凭证').attributes('disabled')).toBeDefined()
  await retry()
  expect(wrapper.text()).toContain('GL-900')
  expect(wrapper.find('aside').exists()).toBe(false)
  expect(state.api[method]).toHaveBeenCalledTimes(2)
})

test.each(['getEntry', 'getEntryItems'])('a late %s response cannot replace the current voucher', async method => {
  const old = deferred()
  state.api[method].mockReturnValueOnce(old.promise)
  await open()
  state.route.query.entryId = '901'
  await flushPromises()
  old.resolve(method === 'getEntry' ? { data: { entry: entry(900) } } : { data: items(900) })
  await flushPromises()
  expect(wrapper.text()).toContain('GL-901')
  expect(wrapper.text()).not.toContain('GL-900')
  if (method === 'getEntry') expect(state.api.getEntryItems.mock.calls).toEqual([[901]])
})

test('closing the detail dialog discards an in-flight response', async () => {
  const pending = deferred()
  state.api.getEntry.mockReturnValueOnce(pending.promise)
  await open()
  wrapper.findAllComponents({ name: 'AppDialog' })[0].vm.$emit('update:modelValue', false)
  await flushPromises()
  pending.resolve({ data: { entry: entry(900) } })
  await flushPromises()
  expect(wrapper.find('[data-dialog="凭证明细"]').exists()).toBe(false)
  expect(state.api.getEntryItems).not.toHaveBeenCalled()
})

test('unmounting discards the pending header and does not start an items request', async () => {
  const pending = deferred()
  state.api.getEntry.mockReturnValueOnce(pending.promise)
  await open()
  wrapper.unmount()
  pending.resolve({ data: { entry: entry(900) } })
  await flushPromises()
  expect(state.api.getEntryItems).not.toHaveBeenCalled()
})

test('a list failure does not block a direct voucher link', async () => {
  state.api.getEntries.mockRejectedValueOnce(new Error('列表暂时不可用'))
  await open()
  expect(wrapper.text()).toContain('GL-900')
  expect(state.api.getEntryItems).toHaveBeenCalledWith(900)
})

test('a malformed header cannot request items with an undefined identifier', async () => {
  state.api.getEntry.mockResolvedValueOnce({ data: { entry: {} } })
  await open()
  expect(state.api.getEntryItems).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('凭证详情数据不完整')
})
