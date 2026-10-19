import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import ProductionReport from '@/views/production/ProductionReport.vue'
import { productionApi } from '@/api/production'
vi.mock('@/api/production', () => ({ productionApi: {
  getProductionTasks: vi.fn(async () => ({ data: [{ id: 42, code: 'PT-42', quantity: 100 }] })),
  getProductionReportSummary: vi.fn(async () => ({ data: [] })),
  getProductionReportDetail: vi.fn(async () => ({ data: [] })),
  getProductionReportStatistics: vi.fn(async () => ({ data: {} })),
  getTaskProcesses: vi.fn(async () => ({ data: [
    { id: 1, sequence: 1, quantity: 100, processName: '前道', status: 'completed' },
    { id: 2, sequence: 2, quantity: 100, processName: '末道', status: 'in_progress' },
  ] })),
  getTaskReportStats: vi.fn(),
  createProductionReport: vi.fn(async () => ({ data: { id: 101 } })),
} }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: { username: 'operator' }, hasPermission: () => true }) }))
vi.mock('@/composables/useFormKeyboardNav', () => ({ useFormKeyboardNav: () => ({}) }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: {} }))
vi.mock('@/services/printService', () => ({ default: {} }))
let wrapper
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks() })
async function mountReport() {
  const source = readFileSync(resolve(process.cwd(), 'src/views/production/ProductionReport.vue'), 'utf8')
  const stubs = Object.fromEntries([...source.matchAll(/<((?:el-|[A-Z])[\w-]+)/g)].map(match => [match[1], true]))
  wrapper = shallowMount(ProductionReport, { global: { stubs, directives: { permission() {}, loading() {} } } })
  await flushPromises()
  wrapper.vm.formData.taskId = 42
}
test('selects the next process and loads its own remaining quantity', async () => {
  productionApi.getTaskReportStats.mockImplementation(async (_, params) => ({ data: {
    reportingMode: 'process', outputProcessId: 2, planQuantity: 100,
    reportedQuantity: params?.processId === 1 ? 100 : 0,
    remainingQuantity: params?.processId === 1 ? 0 : 100,
  } }))
  await mountReport()
  await wrapper.vm.handleTaskFormChange(42)
  expect(wrapper.vm.formData).toMatchObject({ processId: 2, completedQuantity: 100, plannedQuantity: 100 })
  expect(productionApi.getTaskReportStats).toHaveBeenCalledWith(42, { processId: 2 })
  wrapper.vm.formData.processId = 1
  await wrapper.vm.handleProcessChange(1)
  expect(wrapper.vm.formData.completedQuantity).toBe(0)
})
test('zero task remainder stays zero instead of resetting to the plan quantity', async () => {
  productionApi.getTaskReportStats.mockResolvedValue({ data: { reportingMode: 'task', planQuantity: 100, remainingQuantity: 0, reportedQuantity: 100 } })
  await mountReport()
  await wrapper.vm.handleTaskFormChange(42)
  expect(wrapper.vm.formData.completedQuantity).toBe(0)
})

test('the HTTP camelCase statistics allow the first process report to be submitted', async () => {
  productionApi.getTaskReportStats.mockResolvedValue({ data: {
    reportingMode: 'task', planQuantity: 100, remainingQuantity: 100, reportedQuantity: 0,
  } })
  await mountReport()
  await wrapper.vm.handleTaskFormChange(42)
  wrapper.vm.formData.processId = 2
  await wrapper.vm.handleProcessChange(2)
  expect(wrapper.vm.formData).toMatchObject({ plannedQuantity: 100, completedQuantity: 100, qualifiedQuantity: 100 })
  wrapper.vm.formRef = { validate: vi.fn().mockResolvedValue(true) }
  await wrapper.vm.handleReportSubmit()
  expect(productionApi.createProductionReport).toHaveBeenCalledWith(expect.objectContaining({
    task_id: 42, process_id: 2, completed_quantity: 100, qualified_quantity: 100,
  }))
})
