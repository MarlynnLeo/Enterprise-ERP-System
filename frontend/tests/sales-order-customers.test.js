import { effectScope } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useOrderForm } from '@/views/sales/composables/useOrderForm'

const mocks = vi.hoisted(() => ({
  getOrder: vi.fn(),
  getCustomer: vi.fn(),
  loadCustomers: vi.fn(),
  searchCustomers: vi.fn(),
}))

vi.mock('@/api', () => ({
  salesApi: { getOrder: (...args) => mocks.getOrder(...args) },
  baseDataApi: { getCustomer: (...args) => mocks.getCustomer(...args) },
  financeApi: {},
}))
vi.mock('@/utils/optionLoaders', () => ({
  loadCustomerPageOptions: (...args) => mocks.loadCustomers(...args),
  searchCustomerPageOptions: (...args) => mocks.searchCustomers(...args),
}))
vi.mock('@/utils/searchConfig', () => ({ searchMaterials: vi.fn() }))
vi.mock('@/composables/useInventoryCheck', () => ({ checkInventory: vi.fn() }))

let scope
const createForm = () => {
  scope = effectScope()
  return scope.run(() => useOrderForm(vi.fn(), vi.fn()))
}

describe('sales order customer selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mocks.loadCustomers.mockResolvedValue([{ id: 2, code: 'CUS-REAL-2', name: 'Current page customer' }])
    mocks.searchCustomers.mockResolvedValue([])
    mocks.getOrder.mockResolvedValue({ data: { id: 8, customerId: 501, customerName: 'Older customer', items: [] } })
    mocks.getCustomer.mockResolvedValue({ data: { id: 501, code: 'CUS-REAL-501', name: 'Older customer' } })
  })

  afterEach(() => scope?.stop())

  test('shows the API customer code when searching and selecting a customer', async () => {
    const form = createForm()
    await form.fetchCustomers()
    expect(form.filteredCustomers.value[0]).toMatchObject({ code: 'CUS-REAL-2', name: 'Current page customer' })
  })

  test('loads the selected customer outside the first option page and preserves it after a page refresh', async () => {
    const form = createForm()
    await form.fetchCustomers()
    await form.handleEdit({ id: 8 })
    await form.fetchCustomers()

    expect(mocks.getCustomer).toHaveBeenCalledWith(501)
    expect(form.form.customerId).toBe(501)
    expect(form.filteredCustomers.value).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 501, code: 'CUS-REAL-501', name: 'Older customer' }),
    ]))
  })

  test('reuses an already loaded selected customer without fetching it again', async () => {
    mocks.loadCustomers.mockResolvedValue([{ id: 501, code: 'CUS-REAL-501', name: 'Older customer' }])
    const form = createForm()
    await form.fetchCustomers()
    await form.handleEdit({ id: 8 })

    expect(mocks.getCustomer).not.toHaveBeenCalled()
    expect(form.filteredCustomers.value[0]).toMatchObject({ id: 501, code: 'CUS-REAL-501', name: 'Older customer' })
  })
})
