import { shallowMount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import CheckDetail from '@/views/inventory/CheckDetail.vue'
import EditCheck from '@/views/inventory/EditCheck.vue'
import { inventoryApi } from '@/api'
import { showToast } from 'vant'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '9' } }),
  useRouter: () => ({ push: vi.fn() })
}))
vi.mock('@/api', () => ({
  inventoryApi: {
    getCheckDetail: vi.fn(), submitCheckResult: vi.fn(), updateCheckStatus: vi.fn(),
    adjustInventory: vi.fn(), updateCheck: vi.fn()
  },
  baseDataApi: { getMaterials: vi.fn(), getLocations: vi.fn() }
}))
vi.mock('vant', async (original) => ({
  ...await original(), showConfirmDialog: vi.fn(async () => {}), showToast: vi.fn()
}))

let wrapper
const item = (actualQuantity = 8, overrides = {}) => ({
  id: 90, materialId: 3, materialName: '物料甲', bookQuantity: 10,
  actualQuantity, remarks: '逐件盘点', ...overrides
})
const record = (items, status = 'in_progress') => ({
  id: 9, status, checkDate: '2026-10-15', checkType: 'full', locationId: 1, items
})
beforeEach(() => {
  inventoryApi.getCheckDetail.mockResolvedValue({ data: record([item()]) })
  inventoryApi.submitCheckResult.mockResolvedValue({})
  inventoryApi.updateCheck.mockResolvedValue({})
})
afterEach(() => wrapper?.unmount())
async function open(component = CheckDetail) {
  wrapper = shallowMount(component, { global: { renderStubDefaultSlot: true, directives: { permission: {} } } })
  await flushPromises()
  return wrapper.vm
}

test('displayed camelCase quantities are preserved by the complete action and keep adjustment available', async () => {
  const view = await open()
  expect(wrapper.text()).toContain('8')
  expect(view.totalDifference).toBe(-2)
  expect(wrapper.text()).toContain('录入实盘')
  await view.handleUpdateStatus('pending')
  expect(inventoryApi.submitCheckResult).toHaveBeenCalledWith(9, {
    items: [{ id: 90, materialId: 3, actualQuantity: 8, remarks: '逐件盘点' }]
  })
  expect(view.hasDifference).toBe(true)
  expect(inventoryApi.updateCheckStatus).not.toHaveBeenCalled()
})

test('a legitimate zero is sent as an explicit zero', async () => {
  inventoryApi.getCheckDetail.mockResolvedValue({ data: record([item(0)]) })
  const view = await open()
  await view.handleUpdateStatus('pending')
  expect(inventoryApi.submitCheckResult.mock.calls[0][1].items[0].actualQuantity).toBe(0)
})

test.each([undefined, null, '', ' ', 'abc', '8abc', Infinity, -1, false, []])(
  'completion rejects missing or invalid actual quantity %j without submitting', async (actualQuantity) => {
    inventoryApi.getCheckDetail.mockResolvedValue({ data: record([{ ...item(), actualQuantity }]) })
    const view = await open()
    expect(view.quantitiesComplete).toBe(false)
    await view.handleUpdateStatus('pending')
    expect(inventoryApi.submitCheckResult).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('实盘数量'))
  }
)

test('offsetting differences cannot expose or invoke no-difference completion', async () => {
  inventoryApi.getCheckDetail.mockResolvedValue({ data: record([
    item(8), item(12, { id: 91, materialId: 4 })
  ], 'pending') })
  const view = await open()
  expect(view.totalDifference).toBe(0)
  expect(view.hasDifference).toBe(true)
  expect(wrapper.text()).toContain('调整库存')
  expect(wrapper.text()).not.toContain('确认完成')
  await view.handleUpdateStatus('completed')
  expect(inventoryApi.updateCheckStatus).not.toHaveBeenCalled()
})

test('editing preserves an unrecorded quantity and refuses to silently save zero', async () => {
  inventoryApi.getCheckDetail.mockResolvedValue({ data: record([item(null)], 'draft') })
  const view = await open(EditCheck)
  expect(view.checkForm.items[0].actualQuantity).toBe(null)
  await view.submitCheckForm()
  expect(inventoryApi.updateCheck).not.toHaveBeenCalled()
  view.checkForm.items[0].actualQuantity = 0
  await view.submitCheckForm()
  expect(inventoryApi.updateCheck.mock.calls[0][1].items[0].actualQuantity).toBe(0)
})

test('in-progress editing offers quantity entry but cannot add or remove materials', async () => {
  const view = await open(EditCheck)
  expect(view.editableMaterials).toBe(false)
  expect(wrapper.text()).not.toContain('添加物料')
  view.checkForm.items[0].actualQuantity = 6
  await view.submitCheckForm()
  expect(inventoryApi.updateCheck.mock.calls[0][1].items[0].actualQuantity).toBe(6)
})
