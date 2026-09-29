import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest'
import ECNManagement from '@/views/baseData/ECNManagement.vue'
import { api } from '@/services/axiosInstance'
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { clickButton, financeStubs, financeDirectives } from './helpers/financeFormHarness'

vi.mock('@/services/axiosInstance', () => ({ api: { get: vi.fn(), put: vi.fn() } }))
vi.mock('@/api', async () => ({
  ...await import('@/api/enhanced'), baseDataApi: {}, bomApi: {}
}))
vi.mock('@/utils/optionLoaders', () => ({ searchBomOptions: vi.fn(async () => []) }))
vi.mock('@/utils/requestOptimizer', () => ({ clearAllRequestCaches: vi.fn() }))
vi.mock('@/composables/useBusinessApproval', () => ({ useBusinessApproval: () => ({
  approvalDialog: { row: null, visible: false }, openApprovalDialog: vi.fn(), handleApproval: vi.fn()
}) }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: vi.fn() } }))

let wrapper
const row = status => ({ id: 17, code: 'ECN-17', title: '物料变更', status, reason: '规格更新', items: [] })
async function open(status = 'draft') {
  api.get.mockImplementation(async url => ({ data: url.endsWith('/17') ? row(status) : { list: [row(status)], total: 1 } }))
  wrapper = mount(ECNManagement, { global: {
    stubs: { ...financeStubs, BusinessApprovalDialog: true }, directives: financeDirectives
  } })
  await flushPromises()
}
beforeEach(() => {
  api.get.mockReset()
  api.put.mockReset().mockResolvedValue({ data: null })
  ElMessageBox.confirm.mockReset().mockResolvedValue('confirm')
})
afterEach(() => wrapper?.unmount())

describe('ECN page with its real API module', () => {
  test('opens the selected draft through the detail endpoint and allows editing', async () => {
    await open()
    await wrapper.get('[data-column="ECN编号"] span').trigger('click')
    await flushPromises()
    expect(api.get).toHaveBeenCalledWith('/enhanced/ecn/17')
    expect(wrapper.find('[data-dialog="ECN编辑 - ECN-17"]').exists()).toBe(true)
    expect(wrapper.vm.formData.id).toBe(17)
  })

  test.each([
    ['draft', '提交审批', 'pending_approval'],
    ['approved', '开始实施', 'implementing'],
    ['implementing', '标记完成', 'completed'],
    ['rejected', '退回草稿', 'draft']
  ])('%s uses the backend workflow/state transition for %s', async (status, label, nextStatus) => {
    await open(status)
    await clickButton(wrapper, label)
    expect(api.put).toHaveBeenCalledExactlyOnceWith('/enhanced/ecn/17/status', { status: nextStatus })
    expect(api.get.mock.calls.filter(([url]) => url === '/enhanced/ecn')).toHaveLength(2)
  })

  test('surfaces workflow validation failures instead of swallowing them', async () => {
    await open()
    api.put.mockRejectedValueOnce({ response: { data: { message: '审批流程未配置完整' } } })
    await clickButton(wrapper, '提交审批')
    expect(ElMessage.error).toHaveBeenCalledWith('审批流程未配置完整')
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  test('a dismissed confirmation sends no status request', async () => {
    await open()
    ElMessageBox.confirm.mockRejectedValueOnce('cancel')
    await clickButton(wrapper, '提交审批')
    expect(api.put).not.toHaveBeenCalled()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })
})
