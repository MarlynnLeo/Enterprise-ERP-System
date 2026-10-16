import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import FinalInspection from '@/views/quality/FinalInspection.vue'

const mocks = vi.hoisted(() => ({
  list: vi.fn(), detail: vi.fn(), update: vi.fn(), rework: vi.fn(), push: vi.fn(),
  success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn()
}))
vi.mock('@/api', () => ({
  qualityApi: { getFinalInspections: mocks.list, getFinalInspection: mocks.detail,
    updateFinalInspection: mocks.update, getReworkStatusByInspectionIds: mocks.rework,
    getFinalInspectionStats: async () => ({ data: { total: 1, partial: 1 } }) },
  productionApi: { getProductionTasks: async () => ({ data: [] }) }, purchaseApi: {}
}))
vi.mock('@/api/quality', () => ({ qualityApi: { getAqlStandards: vi.fn(async () => ({ data: { list: [], total: 0 } })) } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: { realName: '检验员' } }) }))
vi.mock('@/stores/dictionary', () => ({ useDictionaryStore: () => ({ groups: {}, isLoaded: false, fetchDictionary: async () => {} }) }))
vi.mock('@/services/printService', () => ({ default: {} }))
vi.mock('@/components/AttachmentUpload.vue', () => ({ default: { template: '<div />' } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: mocks }))

let wrapper
const original = { isFullInspection: true, sampleQuantity: 100, id: 7, inspectionNo: 'FQC-7', quantity: 100, qualifiedQuantity: 90,
  unqualifiedQuantity: 10, status: 'partial', unit: '只', batchNo: 'B-7',
  items: [{ itemName: '外观', actualValue: '10只划伤', result: 'failed' }] }
beforeEach(async () => {
  mocks.list.mockResolvedValue({ data: { list: [{ ...original }], total: 1 } })
  mocks.detail.mockResolvedValue({ data: { ...original } })
  mocks.update.mockResolvedValue({ data: {} })
  mocks.rework.mockResolvedValue({ data: { 7: { allowReinspection: true, reinspectionId: 70, reinspectionStatus: 'pending' } } })
  wrapper = shallowMount(FinalInspection, { global: {
    config: { warnHandler: () => {} }, directives: { permission: () => {} },
    stubs: { AppDialog: true, PageHeader: true, FinanceQueryCard: true, ElTable: true,
      ElDescriptions: true, ElForm: true, ElTableColumn: true }
  } })
  await flushPromises()
})
afterEach(() => wrapper?.unmount())

test('submits 90 good and 10 defective as partial and keeps the defect count', async () => {
  await wrapper.vm.handleInspect({ id: 7 })
  wrapper.vm.$.setupState.inspectFormRef = { validate: async () => true }
  await wrapper.vm.submitInspection()
  expect(mocks.update).toHaveBeenCalledWith(7, expect.objectContaining({ status: 'partial', quantity: 100,
    qualifiedQuantity: 90, unqualifiedQuantity: 10 }))
  expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('90 只合格品入库草稿'))
})
test('opens a separate ten-unit reinspection without editing the original', async () => {
  mocks.detail.mockResolvedValue({ data: { ...original, id: 70, inspectionNo: 'FQC-70',
    quantity: 10, qualifiedQuantity: 0, unqualifiedQuantity: 0, status: 'pending' } })
  await wrapper.vm.handleReview(original)
  expect(mocks.detail).toHaveBeenCalledWith(70)
  expect(wrapper.vm.inspectForm.id).toBe(70)
  expect(wrapper.vm.inspectForm.quantity).toBe(10)
  expect(mocks.update).not.toHaveBeenCalled()
})
test('missing reinspection cannot fall back to overwriting original evidence', async () => {
  mocks.rework.mockResolvedValue({ data: { 7: { allowReinspection: true, reinspectionId: null } } })
  await wrapper.vm.handleReview(original)
  expect(mocks.detail).not.toHaveBeenCalled()
  expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining('未找到返修复检单'))
})
test('opens defect disposition filtered to the original inspection', async () => {
  wrapper.vm.handleDefectDisposition(original)
  expect(mocks.push).toHaveBeenCalledWith({ path: '/quality/nonconforming', query: { inspection_id: 7 } })
})
