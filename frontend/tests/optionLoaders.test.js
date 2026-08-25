import { beforeEach, describe, expect, test, vi } from 'vitest'

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
  loadOutsourcedMaterialOptions,
  loadOutsourcedReceiptProcessingOptions,
  loadOutsourcedReceiptWarehouseOptions,
  searchOutsourcedMaterialOptions,
  searchOutsourcedReceiptProcessingOptions,
  searchOutsourcedSupplierOptions,
} from '@/utils/optionLoaders'

const paginatedResponse = (list) => ({
  data: {
    list,
    total: list.length,
    page: 1,
    pageSize: 100,
  },
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
