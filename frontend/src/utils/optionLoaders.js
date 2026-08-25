import { baseDataApi } from '@/api/baseData'
import { productionApi } from '@/api/production'
import { purchaseApi } from '@/api/purchase'
import { qualityApi } from '@/api/quality'
import { systemApi } from '@/api/system'
import { parseListData, parsePaginatedData } from '@/utils/responseParser'

export const OPTION_PAGE_SIZE = 50
/** 下拉全量拉取时的单页大小（与后端上限对齐） */
export const OPTION_FETCH_PAGE_SIZE = 100
export const OPTION_CACHE_TTL_MS = 5 * 60 * 1000

const cache = new Map()
const inflight = new Map()

const stableSerialize = (value) => {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`

  return Object.keys(value)
    .sort()
    .map(key => `${key}:${stableSerialize(value[key])}`)
    .join('|')
}

const clampPageSize = (value, fallback = OPTION_PAGE_SIZE) => {
  const parsed = Number(value || fallback)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), OPTION_PAGE_SIZE) : fallback
}

const normalizePagedParams = (params = {}, defaults = {}) => ({
  page: 1,
  pageSize: OPTION_PAGE_SIZE,
  ...defaults,
  ...(params || {}),
  pageSize: clampPageSize(params.pageSize ?? params.limit ?? defaults.pageSize ?? defaults.limit),
})

const withOptionCache = async (key, loader, ttl = OPTION_CACHE_TTL_MS) => {
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) return cached.data

  const running = inflight.get(key)
  if (running) return running

  const promise = loader()
    .then(data => {
      cache.set(key, { data, expiresAt: Date.now() + ttl })
      return data
    })
    .finally(() => inflight.delete(key))

  inflight.set(key, promise)
  return promise
}

const loadCachedList = (namespace, request, params = {}, options = {}) => {
  const normalizedParams = options.rawParams ? { ...(params || {}) } : normalizePagedParams(params, options.defaults)
  const key = `${namespace}:${stableSerialize(normalizedParams)}`
  return withOptionCache(key, async () => {
    const response = await request(normalizedParams)
    return parseListData(response, { enableLog: false })
  }, options.ttl)
}

export const clearOptionLoaderCache = () => {
  cache.clear()
  inflight.clear()
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('erp:api-mutated', clearOptionLoaderCache)
}

export const loadUserOptions = (params = {}) =>
  loadCachedList('users', systemApi.getUsers, params, { defaults: { status: 1 } })

export const loadUserListOptions = () =>
  loadCachedList('users-list', systemApi.getUsersList, {}, { rawParams: true })

export const searchUserOptions = (keyword = '', params = {}) =>
  loadUserOptions({ ...params, keyword: String(keyword || '').trim() || undefined })

export const loadDepartmentOptions = (params = {}) => {
  const normalizedParams = { ...(params || {}) }
  const useListEndpoint = Object.keys(normalizedParams).length === 0
  return loadCachedList(
    useListEndpoint ? 'departments-list' : 'departments',
    useListEndpoint ? systemApi.getDepartmentsList : systemApi.getDepartments,
    normalizedParams,
    { rawParams: useListEndpoint, defaults: { status: 1 } }
  )
}

/**
 * 分页拉全量列表（下拉选项用，避免只显示第一页 50 条）
 * @param {Function} request - API 方法
 * @param {Object} baseParams - 查询参数（不含 page/pageSize）
 */
const fetchAllOptionPages = async (request, baseParams = {}) => {
  const pageSize = OPTION_FETCH_PAGE_SIZE
  let page = 1
  const all = []
  let total = Infinity

  while (all.length < total && page <= 50) {
    const response = await request({
      ...baseParams,
      page,
      pageSize,
    })
    const { list, total: t } = parsePaginatedData(response, { enableLog: false })
    const chunk = Array.isArray(list) && list.length ? list : parseListData(response, { enableLog: false })
    all.push(...chunk)
    const knownTotal = Number(t)
    total = Number.isFinite(knownTotal) && knownTotal >= 0 ? knownTotal : all.length
    if (!chunk.length || chunk.length < pageSize || all.length >= total) break
    page += 1
  }

  return all
}

const normalizeKeywordSearch = (params = {}) => {
  const normalized = { ...(params || {}) }
  if (normalized.keyword && !normalized.search) {
    normalized.search = normalized.keyword
    delete normalized.keyword
  }
  return normalized
}

/**
 * 统一供应商选项结构。
 * API 仍保留完整字段，选项消费者只依赖这些稳定的显示/联动字段。
 */
export const normalizeSupplierOption = (supplier = {}) => {
  const contactPerson = supplier.contactPerson || supplier.contact || ''
  const contactPhone = supplier.contactPhone || supplier.phone || ''

  return {
    ...supplier,
    id: supplier.id,
    code: supplier.code || supplier.supplierCode || '',
    name: supplier.name || supplier.supplierName || '',
    contactPerson,
    contactPhone,
    contact: contactPerson,
    phone: contactPhone,
  }
}

/**
 * 统一物料选项结构。
 * 物料列表接口字段以 camelCase 为主，这里在选项层提供稳定的显示/联动字段。
 */
export const normalizeMaterialOption = (material = {}) => ({
  ...material,
  id: material.id,
  code: material.code || material.materialCode || '',
  name: material.name || material.materialName || '',
  specification: material.specification || material.specs || '',
  specs: material.specs || material.specification || '',
  unitId: material.unitId ?? material.unit_id ?? null,
  unitName: material.unitName || material.unit_name || material.unit || '',
  materialType: material.materialType || material.material_type || '',
})

/** 供应商下拉：默认启用，分页拉全 */
export const loadSupplierOptions = (params = {}) => {
  const { status, page: _p, pageSize: _ps, limit: _l, search: _search, ...rest } = params || {}
  const base = {
    ...rest,
    status: status !== undefined && status !== '' ? status : 1,
  }
  const key = `suppliers:all:${stableSerialize(base)}`
  return withOptionCache(key, async () => {
    const suppliers = await fetchAllOptionPages(baseDataApi.getSuppliers, base)
    return suppliers.map(normalizeSupplierOption)
  })
}

export const searchSupplierOptions = (keyword = '', params = {}) => {
  const kw = String(keyword || '').trim()
  return loadSupplierOptions({
    ...params,
    keyword: kw || undefined,
  })
}

const loadSingleOptionPage = (namespace, request, params = {}) => {
  const normalizedParams = {
    page: 1,
    pageSize: OPTION_FETCH_PAGE_SIZE,
    ...(params || {}),
  }
  const key = `${namespace}:${stableSerialize(normalizedParams)}`
  return withOptionCache(key, async () => {
    const response = await request(normalizedParams)
    return parseListData(response, { enableLog: false })
  })
}

/**
 * 委外加工厂选项使用采购领域接口，不依赖基础资料页面权限。
 * 接口只暴露单据联动需要的字段。
 */
export const loadOutsourcedSupplierOptions = (params = {}) => {
  const { page: _p, pageSize: _ps, limit: _l, ...base } = params || {}
  return loadSingleOptionPage(
    'outsourced:suppliers',
    purchaseApi.outsourcedProcessing.getSupplierOptions,
    base
  ).then((suppliers) => suppliers.map(normalizeSupplierOption))
}

export const searchOutsourcedSupplierOptions = (keyword = '', params = {}) =>
  loadOutsourcedSupplierOptions({
    ...params,
    keyword: String(keyword || '').trim() || undefined,
  })

const normalizeCustomerParams = (params = {}) => normalizeKeywordSearch(params)

/** 客户下拉：默认 active，分页拉全 */
export const loadCustomerOptions = (params = {}) => {
  const { status, page: _p, pageSize: _ps, limit: _l, ...rest } = normalizeCustomerParams(params)
  const base = {
    ...rest,
    status: status !== undefined && status !== '' ? status : 'active',
  }
  const key = `customers:all:${stableSerialize(base)}`
  return withOptionCache(key, () => fetchAllOptionPages(baseDataApi.getCustomers, base))
}

export const searchCustomerOptions = (keyword = '', params = {}) => {
  const search = String(keyword || '').trim()
  return loadCustomerOptions({
    ...params,
    search: search || undefined,
  })
}

export const loadLocationOptions = (params = {}) =>
  loadCachedList('locations', baseDataApi.getLocations, params, { defaults: { status: 1 } })

/** 物料下拉：默认启用，分页拉全 */
export const loadMaterialOptions = (params = {}) => {
  const { status, page: _p, pageSize: _ps, limit: _l, ...rest } = normalizeKeywordSearch(params)
  const base = {
    ...rest,
    status: status !== undefined && status !== '' ? status : 1,
  }
  const key = `materials:all:${stableSerialize(base)}`
  return withOptionCache(key, async () => {
    const materials = await fetchAllOptionPages(baseDataApi.getMaterials, base)
    return materials.map(normalizeMaterialOption)
  })
}

export const searchMaterialOptions = (keyword = '', params = {}) => {
  const search = String(keyword || '').trim()
  return loadMaterialOptions({
    ...params,
    search: search || undefined,
  })
}

/**
 * 委外发料/成品是单据行角色，不等同于物料主数据类型。
 * 因此这里返回全部启用物料，不按 raw_material / finished_goods 强制过滤。
 */
export const loadOutsourcedMaterialOptions = (params = {}) => {
  const { page: _p, pageSize: _ps, limit: _l, ...base } = params || {}
  return loadSingleOptionPage(
    'outsourced:materials',
    purchaseApi.outsourcedProcessing.getMaterialOptions,
    base
  ).then((materials) => materials.map(normalizeMaterialOption))
}

export const searchOutsourcedMaterialOptions = (keyword = '', params = {}) =>
  loadOutsourcedMaterialOptions({
    ...params,
    keyword: String(keyword || '').trim() || undefined,
  })

export const loadOutsourcedReceiptWarehouseOptions = (params = {}) => {
  const { page: _p, pageSize: _ps, limit: _l, ...base } = params || {}
  return loadSingleOptionPage(
    'outsourced-receipts:warehouses',
    purchaseApi.outsourcedReceipts.getWarehouseOptions,
    base
  )
}

export const loadOutsourcedReceiptProcessingOptions = (params = {}) => {
  const { page: _p, pageSize: _ps, limit: _l, ...base } = params || {}
  return loadSingleOptionPage(
    'outsourced-receipts:processings',
    purchaseApi.outsourcedReceipts.getProcessingOptions,
    base
  )
}

export const searchOutsourcedReceiptProcessingOptions = (keyword = '', params = {}) =>
  loadOutsourcedReceiptProcessingOptions({
    ...params,
    keyword: String(keyword || '').trim() || undefined,
  })

/**
 * 统一 BOM 下拉数据结构。
 * 所有 BOM 选择器统一显示：产品编码 - 产品名称 - 型号。
 */
export const normalizeBomOption = (bom = {}) => {
  const productCode = bom.productCode || ''
  const productName = bom.productName || '未知产品'
  const productSpecs = bom.productSpecs || '无型号'

  return {
    ...bom,
    productCode,
    productName,
    productSpecs,
    label: `${productCode} - ${productName} - ${productSpecs}`,
  }
}

/** BOM 下拉：使用轻量选项接口，避免加载 BOM 明细。 */
export const loadBomOptions = async (params = {}) => {
  const options = await loadCachedList('boms-options', baseDataApi.getBomOptions, params)
  return options.map(normalizeBomOption)
}

export const searchBomOptions = (keyword = '', params = {}) =>
  loadBomOptions({
    ...params,
    keyword: String(keyword || '').trim() || undefined,
  })

export const loadProductionProcessOptions = (params = {}) =>
  loadCachedList('production-processes', productionApi.getProductionProcesses, params)

export const loadQualityTemplateOptions = (params = {}) =>
  loadCachedList('quality-templates', qualityApi.getTemplates, params, {
    defaults: { status: 'active' },
  })

export const loadPurchaseOrderOptions = (params = {}) =>
  loadCachedList('purchase-orders', purchaseApi.getOrders, params)
