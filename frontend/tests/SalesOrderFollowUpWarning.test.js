import { effectScope } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useOrderForm } from '@/views/sales/composables/useOrderForm'
import { useOrderImportExport } from '@/views/sales/composables/useOrderImportExport'

const mocks = vi.hoisted(() => ({
  createOrder: vi.fn(), updateOrder: vi.fn(), importOrders: vi.fn(), checkInventory: vi.fn(),
  confirm: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn(),
}))
vi.mock('@/api', () => ({ salesApi: {
  createOrder: (...args) => mocks.createOrder(...args),
  updateOrder: (...args) => mocks.updateOrder(...args),
  importOrders: (...args) => mocks.importOrders(...args),
}, baseDataApi: {}, financeApi: {} }))
vi.mock('@/utils/optionLoaders', () => ({ loadCustomerPageOptions: vi.fn(), searchCustomerPageOptions: vi.fn() }))
vi.mock('@/utils/searchConfig', () => ({ searchMaterials: vi.fn() }))
vi.mock('@/composables/useInventoryCheck', () => ({ checkInventory: (...args) => mocks.checkInventory(...args) }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: {
  success: (...args) => mocks.success(...args), warning: (...args) => mocks.warning(...args),
  error: (...args) => mocks.error(...args),
} }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: { confirm: (...args) => mocks.confirm(...args) } }))

let scope
beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  mocks.checkInventory.mockResolvedValue([{ materialName: '成品', quantity: 5, currentStock: 0 }])
  mocks.confirm.mockResolvedValue('confirm')
})
afterEach(() => scope?.stop())

const makeForm = () => {
  const refresh = vi.fn()
  scope = effectScope()
  const state = scope.run(() => useOrderForm(refresh, vi.fn()))
  Object.assign(state.form, {
    id: 42, customerId: 1, deliveryDate: '2026-10-17', status: 'shortage',
    items: [{ materialId: 1, quantity: 5, unitPrice: 100, taxRate: 0.13 }],
  })
  state.dialogVisible.value = true
  return { state, refresh }
}

test.each(['add', 'edit'])('saved %s order warns about downstream failure without inviting duplicate creation', async type => {
  const response = { data: { id: 42, status: 'shortage', followUp: {
    status: 'failed', message: '订单已保存，但备货处理失败：产品未找到有效的BOM配置',
  } } }
  mocks.createOrder.mockResolvedValue(response)
  mocks.updateOrder.mockResolvedValue(response)
  const { state, refresh } = makeForm()
  state.dialogType.value = type
  await state.handleSubmit()

  expect(type === 'add' ? mocks.createOrder : mocks.updateOrder).toHaveBeenCalledTimes(1)
  expect(mocks.warning).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('BOM'), showClose: true }))
  expect(mocks.success).not.toHaveBeenCalled()
  expect(mocks.error).not.toHaveBeenCalled()
  expect(state.dialogVisible.value).toBe(false)
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('successful generation retains the normal order-created feedback', async () => {
  mocks.createOrder.mockResolvedValue({ data: { id: 42, followUp: { status: 'completed' } } })
  const { state } = makeForm()
  await state.handleSubmit()
  expect(mocks.success).toHaveBeenCalledWith('订单创建成功')
  expect(mocks.warning).not.toHaveBeenCalled()
})

test('import preserves saved-order counts and shows downstream warnings separately from failed rows', async () => {
  const warning = '订单 SO-42 已导入，但备货处理失败：未找到BOM'
  mocks.importOrders.mockResolvedValue({ data: { successCount: 2, errorCount: 0, errors: [], warnings: [warning] } })
  const refresh = vi.fn()
  const state = useOrderImportExport(refresh)
  const file = new File(['test'], 'orders.xlsx')
  state.handleFileChange({ raw: file, name: file.name, size: file.size })
  mocks.success.mockClear()
  await state.submitImport()
  expect(state.importResult.value).toEqual({ success: 2, failed: 0, errors: [], warnings: [warning] })
  expect(mocks.warning).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('1 个订单备货失败') }))
  expect(mocks.success).not.toHaveBeenCalled()
  expect(refresh).toHaveBeenCalledTimes(1)
})
