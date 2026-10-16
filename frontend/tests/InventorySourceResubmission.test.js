import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import InventoryTransfer from '@/views/inventory/InventoryTransfer.vue'
import OutsourcedProcessing from '@/views/purchase/OutsourcedProcessing.vue'
import InventoryApprovalPanel from '@/components/inventory/InventoryApprovalPanel.vue'

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), getBySource: vi.fn(), success: vi.fn(), error: vi.fn() }))
const auth = reactive({
  user: { id: 7 }, realName: '业务经办人', permissions: [],
  hasPermission: permission => auth.permissions.includes(permission),
  canViewInventoryApproval: false, canApproveInventoryApproval: false, canReverseInventoryApproval: false,
})
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/services/axiosInstance', () => ({ api: { get: mocks.get, put: mocks.put }, fastApi: {} }))
vi.mock('@/api', async () => ({
  inventoryApi: { ...(await import('@/api/inventory')).inventoryApi, getLocations: async () => ({ data: [] }) },
  purchaseApi: (await import('@/api/purchase')).purchaseApi,
}))
vi.mock('@/api/finance', () => ({ financeApi: { inventoryPostings: { getBySource: mocks.getBySource } } }))
vi.mock('@/stores/dictionary', () => ({ useDictionaryStore: () => ({ getOptions: () => [], fetchDictionary: async () => {} }) }))
vi.mock('@/utils/searchConfig', () => ({ SEARCH_CONFIG: {}, searchMaterials: async () => [], mapMaterialData: value => value }))
vi.mock('@/services/printService', () => ({ default: {} }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))

const slot = { template: '<div><slot /><slot name="description" /></div>' }
const global = {
  directives: { loading: () => {}, permission: () => {} },
  stubs: {
    PageHeader: true, FinanceQueryCard: true, EmptyState: true, TableRowActions: true,
    AppDialog: { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><footer><slot name="footer" /></footer></section>' },
    ElButton: { props: ['loading', 'disabled'], emits: ['click'], template: '<button :disabled="loading || disabled" @click="$emit(\'click\')"><slot /></button>' },
    ElTable: true, ElTableColumn: true, ElPagination: true, ElForm: true, ElFormItem: true,
    ElCard: slot, ElTag: slot, ElIcon: true, ElRow: slot, ElCol: slot,
    ElInput: true, ElSelect: true, ElOption: true, ElDatePicker: true, ElInputNumber: true,
    ElDescriptions: slot, ElDescriptionsItem: slot, ElTooltip: slot,
    ElSteps: slot, ElStep: slot, ElTimeline: slot, ElTimelineItem: slot,
    ElAlert: true, ElDropdown: true, ElDropdownItem: true, ElDropdownMenu: true,
  },
}
const cases = [
  { name: 'transfer', component: InventoryTransfer, path: '/inventory/transfer', permission: 'inventory:transfer:update', status: 'completed',
    detail: 'transferDetail', retry: 'handleResubmitTransfer', busy: 'resubmittingTransfer', open: (vm, id) => vm.viewTransfer(id), payload: { newStatus: 'completed' } },
  { name: 'outsourced material', component: OutsourcedProcessing, path: '/purchase/outsourced-processings', permission: 'purchase:processing:update', status: 'in_progress',
    detail: 'viewData', retry: 'handleResubmitProcessing', busy: 'resubmittingProcessing', open: (vm, id) => vm.handleViewProcessing({ id }), payload: { status: 'in_progress' } },
]
const deferred = () => {
  let resolve
  const promise = new Promise(yes => { resolve = yes })
  return { promise, resolve }
}
let wrapper
let sourceDocument
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset())
  Object.assign(auth, { permissions: [], canViewInventoryApproval: false, canApproveInventoryApproval: false })
})
afterEach(() => wrapper?.unmount())
const retryButton = () => wrapper.findAll('button').find(button => button.text() === '重新提交审核')

describe.each(cases)('$name source resubmission', config => {
  async function openPage(status = config.status) {
    auth.permissions = [config.permission]
    sourceDocument = { id: 11, transferNo: 'TR-11', processingNo: 'OP-11', status, financeStatus: 'rejected', items: [], materials: [], products: [] }
    mocks.get.mockImplementation(async url => {
      if (url.endsWith('/statistics')) return { data: {} }
      if (url === config.path) return { data: { list: [structuredClone(sourceDocument)], total: 1 } }
      if (url.startsWith(`${config.path}/`)) return { data: { ...structuredClone(sourceDocument), id: Number(url.split('/').at(-1)) } }
      throw new Error(`Unexpected GET ${url}`)
    })
    mocks.getBySource.mockImplementation(async () => ({ data: { movement: { id: 41, financeStatus: sourceDocument.financeStatus }, postings: [], events: [] } }))
    mocks.put.mockImplementation(async () => { sourceDocument.financeStatus = 'pending'; return { data: {} } })
    wrapper = mount(config.component, { global })
    await flushPromises()
    await config.open(wrapper.vm, 11)
    await flushPromises()
  }

  test('allows a business updater to resubmit without fetching finance-only details', async () => {
    await openPage()
    expect(retryButton()).toBeDefined()
    await retryButton().trigger('click')
    await flushPromises()
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith(`${config.path}/11/status`, config.payload)
    expect(mocks.getBySource).not.toHaveBeenCalled()
    expect(retryButton()).toBeUndefined()
    expect(wrapper.vm[config.detail].financeStatus).toBe('pending')
  })

  test('refreshes the inline approval after business resubmission', async () => {
    auth.canViewInventoryApproval = true
    await openPage()
    await retryButton().trigger('click')
    await flushPromises()
    expect(mocks.getBySource).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('未审核')
    expect(mocks.get.mock.calls.filter(([url]) => url === config.path)).toHaveLength(2)
    expect(mocks.get.mock.calls.filter(([url]) => url === `${config.path}/11`)).toHaveLength(2)
  })

  test('denies resubmission with finance approval permission alone', async () => {
    await openPage()
    auth.permissions = ['finance:inventory:approve']
    auth.canApproveInventoryApproval = true
    await flushPromises()
    expect(retryButton()).toBeUndefined()
    await wrapper.vm[config.retry](sourceDocument.status)
    expect(mocks.put).not.toHaveBeenCalled()
  })

  test('blocks duplicate submissions while a request is pending', async () => {
    await openPage()
    const pending = deferred()
    mocks.put.mockReturnValueOnce(pending.promise)
    const first = wrapper.vm[config.retry](sourceDocument.status)
    await wrapper.vm[config.retry](sourceDocument.status)
    expect(mocks.put).toHaveBeenCalledTimes(1)
    pending.resolve({ data: {} })
    await first
    expect(wrapper.vm[config.busy]).toBe(false)
  })

  test('retains the rejected document and server error when resubmission fails', async () => {
    await openPage()
    mocks.put.mockRejectedValueOnce({ response: { data: { message: '原单已变更，请刷新后重试' } } })
    await wrapper.vm[config.retry](sourceDocument.status)
    expect(mocks.error).toHaveBeenCalledWith('原单已变更，请刷新后重试')
    expect(mocks.success).not.toHaveBeenCalled()
    expect(retryButton()).toBeDefined()
    expect(wrapper.vm[config.detail].financeStatus).toBe('rejected')
  })

  test('clears stale actions while loading and ignores out-of-order detail responses', async () => {
    await openPage()
    const pending = deferred()
    mocks.get.mockReturnValueOnce(pending.promise)
    const old = config.open(wrapper.vm, 12)
    await flushPromises()
    expect(wrapper.vm[config.detail].id).toBeUndefined()
    expect(retryButton()).toBeUndefined()
    await config.open(wrapper.vm, 13)
    pending.resolve({ data: { ...sourceDocument, id: 12 } })
    await old
    expect(wrapper.vm[config.detail].id).toBe(13)
  })

  test('keeps the current document when a previous resubmission finishes', async () => {
    await openPage()
    const pending = deferred()
    mocks.put.mockReturnValueOnce(pending.promise)
    const save = wrapper.vm[config.retry](sourceDocument.status)
    await config.open(wrapper.vm, 12)
    pending.resolve({ data: {} })
    await save
    expect(wrapper.vm[config.detail].id).toBe(12)
  })

  test('refreshes business details after a finance reversal changes the source status', async () => {
    auth.canViewInventoryApproval = true
    await openPage()
    sourceDocument.status = 'cancelled'
    wrapper.findComponent(InventoryApprovalPanel).vm.$emit('changed')
    await flushPromises()
    expect(wrapper.vm[config.detail].status).toBe('cancelled')
    expect(retryButton()).toBeUndefined()
  })
})
