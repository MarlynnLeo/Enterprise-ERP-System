import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  getOutsourcedSupplierOptions: vi.fn(),
  getOutsourcedMaterialOptions: vi.fn(),
  getOutsourcedReceiptWarehouseOptions: vi.fn(),
  getOutsourcedReceiptProcessingOptions: vi.fn(),
}))

vi.mock('@/api/baseData', () => ({
  baseDataApi: {
    getSuppliers: vi.fn(),
    getMaterials: vi.fn(),
    getCustomers: vi.fn(),
    getLocations: vi.fn(),
    getBomOptions: vi.fn(),
  },
}))

vi.mock('@/api/production', () => ({
  productionApi: { getProductionProcesses: vi.fn() },
}))

vi.mock('@/api/quality', () => ({
  qualityApi: { getTemplates: vi.fn() },
}))

vi.mock('@/api/system', () => ({
  systemApi: {
    getUsers: vi.fn(),
    getUsersList: vi.fn(),
    getDepartments: vi.fn(),
    getDepartmentsList: vi.fn(),
  },
}))

vi.mock('@/api/purchase', () => ({
  purchaseApi: {
    outsourcedProcessing: {
      getSupplierOptions: (...args) => apiMocks.getOutsourcedSupplierOptions(...args),
      getMaterialOptions: (...args) => apiMocks.getOutsourcedMaterialOptions(...args),
    },
    outsourcedReceipts: {
      getWarehouseOptions: (...args) => apiMocks.getOutsourcedReceiptWarehouseOptions(...args),
      getProcessingOptions: (...args) => apiMocks.getOutsourcedReceiptProcessingOptions(...args),
    },
    getOrders: vi.fn(),
  },
}))

import {
  clearOptionLoaderCache,
  loadUserListOptions,
  loadCustomerOptions,
  loadMaterialOptions,
  loadSupplierOptions,
  loadCustomerPageOptions,
  loadMaterialPageOptions,
  searchMaterialPageOptions,
  loadOutsourcedMaterialOptions,
  loadOutsourcedReceiptProcessingOptions,
  loadOutsourcedReceiptWarehouseOptions,
  searchOutsourcedMaterialOptions,
  searchOutsourcedReceiptProcessingOptions,
  searchOutsourcedSupplierOptions,
} from '@/utils/optionLoaders'
import { baseDataApi } from '@/api/baseData'
import { systemApi } from '@/api/system'
import { setRequestCacheUserId } from '@/utils/requestOptimizer'

const paginatedResponse = (list) => ({
  data: {
    list,
    total: list.length,
    page: 1,
    pageSize: 100,
  },
})

const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const optionRows = (start, length) => Array.from({ length }, (_, index) => ({
  id: start + index, name: `选项-${start + index}`, price: '123.4500', costPrice: '98.7654',
}))

describe('bounded full option pagination and cache ownership', () => {
  beforeEach(() => {
    clearOptionLoaderCache()
    vi.resetAllMocks()
    delete window.__erpUserId
  })

  afterEach(() => {
    vi.useRealTimers()
    delete window.__erpUserId
    clearOptionLoaderCache()
  })

  test('loads all pages with at most three concurrent requests and preserves row order and prices', async () => {
    vi.useFakeTimers()
    let active = 0, peak = 0
    const completed = []
    baseDataApi.getMaterials.mockImplementation(({ page, pageSize }) => {
      active++
      peak = Math.max(peak, active)
      return new Promise(resolve => setTimeout(() => {
        active--
        completed.push(page)
        resolve({ data: { list: optionRows((page - 1) * pageSize + 1, pageSize), total: 1000, page, pageSize } })
      }, page === 1 ? 80 : (5 - (page % 3)) * 10))
    })
    const first = loadMaterialOptions(), second = loadMaterialOptions()
    await vi.runAllTimersAsync()
    const [rows, concurrent] = await Promise.all([first, second])
    expect(peak).toBe(3)
    expect(baseDataApi.getMaterials).toHaveBeenCalledTimes(10)
    expect(completed.slice(0, 4)).toEqual([1, 2, 4, 3])
    expect(rows.map(row => row.id)).toEqual(Array.from({ length: 1000 }, (_, index) => index + 1))
    expect(rows.every(row => row.price === '123.4500' && row.costPrice === '98.7654')).toBe(true)
    expect(concurrent).toEqual(rows)
    expect(await loadMaterialOptions()).toEqual(rows)
    expect(baseDataApi.getMaterials).toHaveBeenCalledTimes(10)
  })

  test('honors a smaller server page size and nested numeric-string totals', async () => {
    baseDataApi.getCustomers.mockImplementation(({ page }) => Promise.resolve({ data: {
      data: optionRows((page - 1) * 20 + 1, page === 3 ? 5 : 20),
      pagination: { page, pageSize: '20', total: '45' },
    } }))
    const rows = await loadCustomerOptions({ status: 0 })
    expect(rows.map(row => row.id)).toEqual(Array.from({ length: 45 }, (_, index) => index + 1))
    expect(baseDataApi.getCustomers.mock.calls.map(([params]) => params)).toEqual([
      { status: 0, page: 1, pageSize: 100 }, { status: 0, page: 2, pageSize: 20 }, { status: 0, page: 3, pageSize: 20 },
    ])
  })

  test('falls back to sequential probes when a full first page has no total', async () => {
    baseDataApi.getSuppliers.mockImplementation(({ page }) => Promise.resolve({ data: {
      list: optionRows((page - 1) * 100 + 1, page === 3 ? 15 : 100),
    } }))
    const rows = await loadSupplierOptions()
    expect(rows).toHaveLength(215)
    expect(baseDataApi.getSuppliers.mock.calls.map(([params]) => params.page)).toEqual([1, 2, 3])
  })

  test('stops unknown-total endpoints that repeat the same page', async () => {
    baseDataApi.getCustomers.mockResolvedValue({ data: optionRows(1, 100) })
    expect(await loadCustomerOptions()).toHaveLength(100)
    expect(baseDataApi.getCustomers).toHaveBeenCalledTimes(2)
  })

  test('keeps the existing fifty-page safety limit when total is absent', async () => {
    baseDataApi.getCustomers.mockImplementation(({ page }) => Promise.resolve({ data: optionRows((page - 1) * 100 + 1, 100) }))
    expect(await loadCustomerOptions()).toHaveLength(5000)
    expect(baseDataApi.getCustomers).toHaveBeenCalledTimes(50)
  })

  test('keeps the existing fifty-page safety limit when total exceeds it', async () => {
    baseDataApi.getCustomers.mockImplementation(({ page }) => Promise.resolve({ data: {
      list: optionRows((page - 1) * 100 + 1, 100), total: 12000,
    } }))
    expect(await loadCustomerOptions()).toHaveLength(5000)
    expect(baseDataApi.getCustomers).toHaveBeenCalledTimes(50)
  })

  test('deduplicates overlapping ids in page order while retaining rows without an id', async () => {
    baseDataApi.getCustomers
      .mockResolvedValueOnce({ data: { list: [{ id: 1, price: '20.00' }, { name: 'first anonymous' }], total: 4, pageSize: 2 } })
      .mockResolvedValueOnce({ data: { list: [{ id: '1', price: '99.00' }, { name: 'second anonymous' }], total: 4, pageSize: 2 } })
    expect(await loadCustomerOptions()).toEqual([
      { id: 1, price: '20.00' }, { name: 'first anonymous' }, { name: 'second anonymous' },
    ])
  })

  test('does not continue scheduling pages after an observed short page', async () => {
    baseDataApi.getCustomers.mockImplementation(({ page }) => Promise.resolve({ data: {
      list: optionRows((page - 1) * 100 + 1, page === 2 ? 5 : 100), total: 1000,
    } }))
    expect(await loadCustomerOptions()).toHaveLength(105)
    expect(baseDataApi.getCustomers.mock.calls.map(([params]) => params.page)).toEqual([1, 2, 3, 4])
  })

  test('does not cache a partial list if a concurrent page fails, and allows a complete retry', async () => {
    let fail = true
    baseDataApi.getCustomers.mockImplementation(({ page }) => page === 3 && fail
      ? Promise.reject(new Error('page failed'))
      : Promise.resolve({ data: { list: optionRows((page - 1) * 100 + 1, 100), total: 400 } }))
    await expect(loadCustomerOptions()).rejects.toThrow('page failed')
    fail = false
    expect(await loadCustomerOptions()).toHaveLength(400)
    expect(baseDataApi.getCustomers).toHaveBeenCalledTimes(8)
  })

  test('an invalidated pending load cannot repopulate the cache or clear its replacement', async () => {
    const old = deferred(), current = deferred()
    systemApi.getUsersList.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const first = loadUserListOptions()
    window.dispatchEvent(new Event('erp:api-mutated'))
    const replacement = loadUserListOptions()
    old.resolve({ data: [{ id: 1 }] })
    expect(await first).toEqual([{ id: 1 }])
    const joined = loadUserListOptions()
    expect(systemApi.getUsersList).toHaveBeenCalledTimes(2)
    current.resolve({ data: [{ id: 2 }] })
    expect(await replacement).toEqual([{ id: 2 }])
    expect(await joined).toEqual([{ id: 2 }])
    expect(await loadUserListOptions()).toEqual([{ id: 2 }])
  })

  test('keeps prices from different accounts in separate caches', async () => {
    window.__erpUserId = 1
    baseDataApi.getCustomers.mockResolvedValueOnce(paginatedResponse([{ id: 1, price: 10 }]))
      .mockResolvedValueOnce(paginatedResponse([{ id: 1, price: 20 }]))
    expect((await loadCustomerOptions())[0].price).toBe(10)
    window.__erpUserId = 2
    expect((await loadCustomerOptions())[0].price).toBe(20)
    expect(baseDataApi.getCustomers).toHaveBeenCalledTimes(2)
  })

  test('rejects a previous-account load before scheduling more pages under the new session', async () => {
    const old = deferred()
    window.__erpUserId = 1
    baseDataApi.getCustomers.mockReturnValueOnce(old.promise)
    const first = loadCustomerOptions()
    window.__erpUserId = 2
    old.resolve({ data: { list: optionRows(1, 100), total: 1000 } })
    await expect(first).rejects.toThrow('登录状态已变更')
    expect(baseDataApi.getCustomers).toHaveBeenCalledTimes(1)
  })

  test('invalidates completed and pending options even when a new session uses the same account', async () => {
    const old = deferred()
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    setRequestCacheUserId(1)
    systemApi.getUsersList.mockResolvedValueOnce({ data: [{ id: 1 }] }).mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ data: [{ id: 2 }] })
    await loadUserListOptions()
    const first = loadUserListOptions({ roleCodes: 'warehouse' })
    setRequestCacheUserId(1)
    expect(await loadUserListOptions()).toEqual([{ id: 2 }])
    old.resolve({ data: [{ id: 1 }] })
    await expect(first).rejects.toThrow('登录状态已变更')
    expect(dispatch.mock.calls.filter(([event]) => event.type === 'erp:session-changed')).toHaveLength(2)
  })

  test('does not collide when filter values contain cache-key separators', async () => {
    systemApi.getUsersList.mockResolvedValueOnce({ data: [{ id: 1 }] }).mockResolvedValueOnce({ data: [{ id: 2 }] })
    expect(await loadUserListOptions({ a: 'b|c:d' })).toEqual([{ id: 1 }])
    expect(await loadUserListOptions({ a: 'b', c: 'd' })).toEqual([{ id: 2 }])
    expect(systemApi.getUsersList).toHaveBeenCalledTimes(2)
  })
})

describe('user list option filters', () => {
  beforeEach(() => {
    clearOptionLoaderCache()
    vi.clearAllMocks()
  })

  test('keeps filtered warehouse options separate from the full user list cache', async () => {
    const allUsers = [{ id: 1, realName: '仓管' }, { id: 2, realName: '销售' }]
    const warehouseUsers = [allUsers[0]]
    const params = { status: 1, roleCodes: 'inventory_manager,component_warehouse_operator' }
    systemApi.getUsersList
      .mockResolvedValueOnce({ data: allUsers })
      .mockResolvedValueOnce({ data: warehouseUsers })

    expect(await loadUserListOptions()).toEqual(allUsers)
    expect(await loadUserListOptions(params)).toEqual(warehouseUsers)
    expect(await loadUserListOptions({ ...params })).toEqual(warehouseUsers)
    expect(await loadUserListOptions()).toEqual(allUsers)
    expect(systemApi.getUsersList.mock.calls).toEqual([[{}], [params]])
  })

  test('invalidates filtered personnel options after a data change', async () => {
    const params = { status: 1, roleCodes: 'inventory_manager' }
    systemApi.getUsersList
      .mockResolvedValueOnce({ data: [{ id: 1 }] })
      .mockResolvedValueOnce({ data: [] })

    expect(await loadUserListOptions(params)).toEqual([{ id: 1 }])
    window.dispatchEvent(new Event('erp:api-mutated'))
    expect(await loadUserListOptions(params)).toEqual([])
    expect(systemApi.getUsersList).toHaveBeenCalledTimes(2)
  })
})

describe('quotation material options', () => {
  beforeEach(() => { clearOptionLoaderCache(); vi.clearAllMocks() })
  test('fetches one page and preserves the search term and sales price', async () => {
    baseDataApi.getMaterials.mockResolvedValue({ data: { list: [{ id: 9, code: 'P-9', name: '商品', price: 30.1234, costPrice: 8 }], total: 17000 } })
    const result = await searchMaterialPageOptions(' P-9 ')
    expect(baseDataApi.getMaterials).toHaveBeenCalledExactlyOnceWith({ page: 1, pageSize: 50, status: 1, search: 'P-9' })
    expect(result[0]).toMatchObject({ code: 'P-9', price: 30.1234 })
    await loadMaterialPageOptions()
    expect(baseDataApi.getMaterials).toHaveBeenCalledTimes(2)
  })
})

describe('customer option status contract', () => {
  beforeEach(() => {
    clearOptionLoaderCache()
    vi.clearAllMocks()
    baseDataApi.getCustomers.mockResolvedValue(paginatedResponse([]))
  })

  test('requests enabled customers using the numeric status accepted by the API', async () => {
    await loadCustomerOptions()
    await loadCustomerPageOptions()
    expect(baseDataApi.getCustomers).toHaveBeenCalledTimes(2)
    for (const [params] of baseDataApi.getCustomers.mock.calls) expect(params.status).toBe(1)
  })

  test('preserves an explicit disabled status', async () => {
    await loadCustomerPageOptions({ status: 0 })
    expect(baseDataApi.getCustomers).toHaveBeenCalledWith(expect.objectContaining({ status: 0 }))
  })
})

describe('outsourced processing option loaders', () => {
  beforeEach(() => {
    clearOptionLoaderCache()
    vi.clearAllMocks()
  })

  test('searches processing suppliers through the purchase-domain option contract', async () => {
    apiMocks.getOutsourcedSupplierOptions.mockResolvedValue(paginatedResponse([
      {
        id: 472,
        code: 'G477',
        name: '北京英拓文远智能科技有限公司',
        contactPerson: '联系人',
        contactPhone: '13800000000',
      },
    ]))

    const result = await searchOutsourcedSupplierOptions(' 北京英拓 ')

    expect(apiMocks.getOutsourcedSupplierOptions).toHaveBeenCalledWith({
      keyword: '北京英拓',
      page: 1,
      pageSize: 100,
    })
    expect(result).toEqual([
      expect.objectContaining({
        id: 472,
        name: '北京英拓文远智能科技有限公司',
        contact: '联系人',
        phone: '13800000000',
      }),
    ])
  })

  test('keeps component materials available to both outsourced line roles', async () => {
    apiMocks.getOutsourcedMaterialOptions.mockResolvedValue(paginatedResponse([
      {
        id: 12147,
        code: '300300402024',
        name: '底座（钻孔）',
        specification: '钻孔',
        unitId: 2,
        unitName: '个',
        materialType: 'component',
      },
    ]))

    const initial = await loadOutsourcedMaterialOptions()
    clearOptionLoaderCache()
    const searched = await searchOutsourcedMaterialOptions('底座')

    expect(apiMocks.getOutsourcedMaterialOptions.mock.calls[0][0]).toEqual({
      page: 1,
      pageSize: 100,
    })
    expect(apiMocks.getOutsourcedMaterialOptions.mock.calls[1][0]).toEqual({
      keyword: '底座',
      page: 1,
      pageSize: 100,
    })
    expect(apiMocks.getOutsourcedMaterialOptions.mock.calls.flat()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ materialType: expect.anything() })])
    )
    expect(initial[0]).toEqual(expect.objectContaining({ materialType: 'component' }))
    expect(searched[0]).toEqual(expect.objectContaining({ materialType: 'component' }))
  })

  test('loads receipt warehouses through the receipt-domain option contract', async () => {
    apiMocks.getOutsourcedReceiptWarehouseOptions.mockResolvedValue(paginatedResponse([
      { id: 3, name: '成品库', type: 'finished_goods', isDefault: 1 },
    ]))

    const result = await loadOutsourcedReceiptWarehouseOptions()

    expect(apiMocks.getOutsourcedReceiptWarehouseOptions).toHaveBeenCalledWith({
      page: 1,
      pageSize: 100,
    })
    expect(result).toEqual([expect.objectContaining({ id: 3, name: '成品库' })])
  })

  test('searches receivable processing orders through the receipt domain', async () => {
    apiMocks.getOutsourcedReceiptProcessingOptions.mockResolvedValue(paginatedResponse([
      { id: 8, processingNo: 'WW260825003', supplierName: '北京英拓' },
    ]))

    const initial = await loadOutsourcedReceiptProcessingOptions()
    clearOptionLoaderCache()
    const searched = await searchOutsourcedReceiptProcessingOptions(' WW260825003 ')

    expect(apiMocks.getOutsourcedReceiptProcessingOptions.mock.calls[0][0]).toEqual({
      page: 1,
      pageSize: 100,
    })
    expect(apiMocks.getOutsourcedReceiptProcessingOptions.mock.calls[1][0]).toEqual({
      keyword: 'WW260825003',
      page: 1,
      pageSize: 100,
    })
    expect(initial).toHaveLength(1)
    expect(searched[0]).toEqual(expect.objectContaining({ id: 8 }))
  })
})
