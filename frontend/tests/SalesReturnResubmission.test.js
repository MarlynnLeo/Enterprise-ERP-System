import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import SalesReturns from '@/views/sales/SalesReturns.vue'
import { salesApi } from '@/api'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
vi.mock('@/api', () => ({ salesApi: { getReturns: vi.fn(), updateReturn: vi.fn(async () => ({})) } }))
vi.mock('@/api/finance', () => ({ financeApi: {} }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasPermission: () => true }) }))
vi.mock('@/components/inventory/InventoryApprovalPanel.vue', () => ({ default: { template: '<div />' } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: vi.fn(async () => true) } }))
vi.mock('@/services/printService', () => ({ default: {} }))
let wrapper
afterEach(() => wrapper?.unmount())
test('a rejected sales return can submit its existing inventory snapshot through the page', async () => {
  const row = { id: 7, returnNo: 'SR-7', status: 'completed', financeStatus: 'rejected', canResubmitInventory: true }
  salesApi.getReturns.mockResolvedValueOnce({ data: { items: [row], total: 1 } })
    .mockResolvedValue({ data: { items: [{ ...row, financeStatus: 'pending', canResubmitInventory: false }], total: 1 } })
  const source = readFileSync(resolve(process.cwd(), 'src/views/sales/SalesReturns.vue'), 'utf8')
  const stubs = Object.fromEntries([...source.matchAll(/<((?:el-|[A-Z])[\w-]+)/g)].map(match => [match[1], true]))
  wrapper = shallowMount(SalesReturns, { global: { stubs, directives: { permission() {}, loading() {} } } })
  await flushPromises()
  expect(wrapper.vm.canResubmitReturn(wrapper.vm.returnRecords[0])).toBe(true)
  await wrapper.vm.handleComplete(wrapper.vm.returnRecords[0])
  expect(ElMessageBox.confirm).toHaveBeenCalledWith(expect.stringContaining('已驳回'), '重新提交入库审核', expect.any(Object))
  expect(salesApi.updateReturn).toHaveBeenCalledWith(7, { status: 'completed' })
  expect(wrapper.vm.returnRecords[0].financeStatus).toBe('pending')
  expect(wrapper.vm.canResubmitReturn(wrapper.vm.returnRecords[0])).toBe(false)
})
