import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import SalesExchanges from '@/views/sales/SalesExchanges.vue'
import { salesApi } from '@/api'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'

vi.mock('@/api', () => ({ salesApi: { getExchanges: vi.fn(), updateExchangeStatus: vi.fn(async () => ({})) }, baseDataApi: {} }))
vi.mock('@/stores/dictionary', () => ({ useDictionaryStore: () => ({ getOptions: () => [], getLabel: () => '', getColor: () => '' }) }))
vi.mock('@/components/inventory/InventoryPostingStatusPanel.vue', () => ({ default: { template: '<div />' } }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: vi.fn(async () => true) } }))
let wrapper
afterEach(() => wrapper?.unmount())

test('keeps the rejected approval action through list mapping and resubmits only the status', async () => {
  const row = { id: 7, exchangeNo: 'EX-7', status: 'completed', canResubmitInventory: true }
  salesApi.getExchanges.mockResolvedValueOnce({ data: { items: [row], total: 1 } })
    .mockResolvedValue({ data: { items: [{ ...row, canResubmitInventory: false }], total: 1 } })
  const source = readFileSync(resolve(process.cwd(), 'src/views/sales/SalesExchanges.vue'), 'utf8')
  const tags = [...source.matchAll(/<((?:el-|[A-Z])[\w-]+)/g)].map(match => match[1])
  const stubs = Object.fromEntries(tags.map(tag => [tag, true]))
  wrapper = shallowMount(SalesExchanges, { global: { stubs, directives: { permission() {}, loading() {} } } })
  await flushPromises()
  expect(wrapper.vm.exchangeRecords[0].canResubmitInventory).toBe(true)
  wrapper.vm.handleComplete(wrapper.vm.exchangeRecords[0])
  await flushPromises()
  expect(ElMessageBox.confirm).toHaveBeenCalledWith(expect.stringContaining('已驳回'), '重新提交审批', expect.any(Object))
  expect(salesApi.updateExchangeStatus).toHaveBeenCalledWith(7, 'completed')
  expect(wrapper.vm.exchangeRecords[0].canResubmitInventory).toBe(false)
});
