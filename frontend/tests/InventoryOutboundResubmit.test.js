import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import InventoryOutbound from '@/views/inventory/InventoryOutbound.vue'

const mocks = vi.hoisted(() => ({
  get: vi.fn(), put: vi.fn(), getBySource: vi.fn(),
  success: vi.fn(), error: vi.fn(), warning: vi.fn(),
}))

// Keep the real inventory API wrapper so the test covers the outgoing request body.
vi.mock('@/services/axiosInstance', () => ({ api: { get: mocks.get, put: mocks.put } }))
vi.mock('@/api', async () => ({
  inventoryApi: (await import('@/api/inventory')).inventoryApi,
  productionApi: { getProductionTasks: async () => ({ data: [] }) },
  systemApi: { getDepartments: async () => ({ data: [] }) },
  baseDataApi: {},
}))
vi.mock('@/api/finance', () => ({ financeApi: { inventoryPostings: { getBySource: mocks.getBySource } } }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 7 }, realName: '财务审核员', hasPermission: () => true,
    canViewInventoryApproval: true, canApproveInventoryApproval: true, canReverseInventoryApproval: false,
  }),
}))
vi.mock('@/stores/dictionary', () => ({
  useDictionaryStore: () => ({ getOptions: () => [], fetchDictionary: async () => {} }),
}))
vi.mock('@/services/printService', () => ({ default: {} }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))

const slotStub = { template: '<div><slot /></div>' }
const buttonStub = {
  props: ['loading', 'disabled'], emits: ['click'],
  template: '<button :disabled="loading || disabled" @click="$emit(\'click\')"><slot /></button>',
}
let wrapper
let outbound
let financeStatus

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset())
  outbound = { id: 5362, outboundNo: 'OUT-RESUBMIT-TEST', status: 'completed', items: [] }
  financeStatus = 'rejected'
  mocks.get.mockImplementation(async (url) => {
    if (url === '/inventory/outbound/5362') return { data: structuredClone(outbound) }
    if (url === '/inventory/outbound') return { data: { list: [structuredClone(outbound)], total: 1 } }
    throw new Error(`Unexpected GET ${url}`)
  })
  mocks.getBySource.mockImplementation(async () => ({
    data: { movement: { id: 101, financeStatus, businessApprovedById: 2 }, events: [], postings: [] },
  }))
  mocks.put.mockImplementation(async () => {
    financeStatus = 'pending'
    return { data: {} }
  })
})
afterEach(() => wrapper?.unmount())

const openOutbound = async () => {
  wrapper = mount(InventoryOutbound, {
    global: {
      stubs: {
        PageHeader: true, FinanceQueryCard: true, EmptyState: true, TableRowActions: true,
        AppDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' },
        ElTable: true, ElTableColumn: true, ElPagination: true,
        ElRow: slotStub, ElCol: slotStub, ElCard: slotStub, ElButton: buttonStub,
        ElIcon: true, ElTag: slotStub, ElInput: true, ElAutocomplete: true,
        ElSelect: true, ElOption: true, ElDatePicker: true, ElForm: true, ElFormItem: true,
        ElPopconfirm: true, ElDivider: true, ElDescriptions: slotStub, ElDescriptionsItem: slotStub,
        ElSteps: slotStub, ElStep: true, ElTimeline: slotStub, ElTimelineItem: slotStub,
      },
      directives: { loading: () => {}, permission: () => {} },
    },
  })
  await flushPromises()
  await wrapper.vm.handleView({ id: outbound.id })
  await flushPromises()
}

const clickResubmit = async () => {
  const button = wrapper.findAll('button').find(button => button.text() === '重新提交审核')
  expect(button).toBeDefined()
  await button.trigger('click')
  await flushPromises()
}

describe('outbound finance approval resubmission', () => {
  test.each(['completed', 'partial_completed'])('sends a flat status payload for a rejected %s outbound and refreshes approval', async (status) => {
    outbound.status = status
    await openOutbound()
    await clickResubmit()

    expect(mocks.put).toHaveBeenCalledExactlyOnceWith('/inventory/outbound/5362/status', { newStatus: 'completed' })
    expect(mocks.success).toHaveBeenCalledWith('已重新提交财务审核')
    expect(mocks.error).not.toHaveBeenCalled()
    expect(mocks.get.mock.calls.filter(([url]) => url === '/inventory/outbound')).toHaveLength(2)
    expect(mocks.get.mock.calls.filter(([url]) => url === '/inventory/outbound/5362')).toHaveLength(2)
    expect(mocks.getBySource).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('待财务审核')
    expect(wrapper.text()).not.toContain('重新提交审核')
  })

  test('shows the server error and keeps the rejected document available for retry', async () => {
    mocks.put.mockRejectedValueOnce({ response: { data: { message: '出库单已变更，请刷新后重试' } } })
    await openOutbound()
    await clickResubmit()

    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith('出库单已变更，请刷新后重试')
    expect(wrapper.text()).toContain('重新提交审核')
    expect(mocks.getBySource).toHaveBeenCalledTimes(1)
  })
})
