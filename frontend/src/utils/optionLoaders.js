import { baseDataApi } from '@/api/baseData'
import { productionApi } from '@/api/production'
import { purchaseApi } from '@/api/purchase'
import { qualityApi } from '@/api/quality'
import { systemApi } from '@/api/system'
import { parseListData, parsePaginatedData } from '@/utils/responseParser'
import { normalizeCustomerStatus } from '@/utils/customerStatus'

export const OPTION_PAGE_SIZE = 50
/** 下拉全量拉取时的单页大小（与后端上限对齐） */
export const OPTION_FETCH_PAGE_SIZE = 100
export const OPTION_CACHE_TTL_MS = 5 * 60 * 1000
const OPTION_PAGE_CONCURRENCY = 3
const OPTION_MAX_PAGES = 50

const cache = new Map()
const inflight = new Map()
let cacheGeneration = 0
let sessionGeneration = 0

const getSessionScope = () => JSON.stringify([
  sessionGeneration,
  typeof window === 'undefined' ? null : String(window.__erpUserId ?? ''),
])

const stableSerialize = (value) => {
  if (value === undefined) return '["undefined"]'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return JSON.stringify(['array', value.map(stableSerialize)])
  return JSON.stringify(['object', Object.keys(value).sort().map(key => [key, stableSerialize(value[key])])])
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
  const scope = getSessionScope()
  key = `${scope}:${key}`
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) return cached.data

  const running = inflight.get(key)
  if (running) return running

  const generation = cacheGeneration
  const assertSession = () => {
    if (scope !== getSessionScope()) throw new Error('登录状态已变更，请重新加载选项')
  }
  const promise = loader(assertSession)
    .then(data => {
      assertSession()
      if (generation === cacheGeneration) cache.set(key, { data, expiresAt: Date.now() + ttl })
      return data
    })
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key)
    })

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
  cacheGeneration++
  cache.clear()
  inflight.clear()
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('erp:api-mutated', clearOptionLoaderCache)
  window.addEventListener('erp:session-changed', () => {
    sessionGeneration++
    clearOptionLoaderCache()
  })
}

export const loadUserOptions = (params = {}) =>
  loadCachedList('users', systemApi.getUsers, params, { defaults: { status: 1 } })

export const loadUserListOptions = (params = {}) =>
  loadCachedList('users-list', systemApi.getUsersList, params, { rawParams: true })

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
 * @param {Function} assertSession - 在分页请求前确认仍属于原会话
 */
const fetchAllOptionPages = async (request, baseParams = {}, assertSession = () => {}) => {
  let pageSize = OPTION_FETCH_PAGE_SIZE
  const all = []
  const seenIds = new Set()
  const seenPages = new Set()
  const fetchPage = async (page) => {
    assertSession()
    const response = await request({ ...baseParams, page, pageSize })
    assertSession()
    const parsed = parsePaginatedData(response, { enableLog: false, pageSize })
    return { response, ...parsed, list: Array.isArray(response) ? parseListData(response, { enableLog: false }) : parsed.list }
  }
  const appendPage = (chunk) => {
    if (!chunk.length) return false
    // Some legacy endpoints ignore page. Stop on a repeated page instead of
    // filling the selector with duplicates or making all 50 requests.
    const fingerprint = JSON.stringify(chunk.map(row => row?.id == null ? row : String(row.id)))
    if (seenPages.has(fingerprint)) return false
    seenPages.add(fingerprint)
    for (const row of chunk) {
      if (row?.id != null) {
        const id = String(row.id)
        if (seenIds.has(id)) continue
        seenIds.add(id)
      }
      all.push(row)
    }
    return chunk.length >= pageSize
  }

  const first = await fetchPage(1)
  pageSize = Math.min(first.pageSize, OPTION_FETCH_PAGE_SIZE)
  if (!appendPage(first.list)) return all

  // The shared parser falls back to list.length when total is absent. Only
  // explicit totals may determine concurrent page ranges; otherwise probe
  // sequentially until an empty/short/repeated page or the existing limit.
  const data = first.response?.data
  const rawTotal = data?.total ?? data?.totalCount ?? data?.pagination?.total ?? data?.pagination?.totalCount
  const total = typeof rawTotal === 'number' || (typeof rawTotal === 'string' && rawTotal.trim())
    ? Number(rawTotal) : NaN
  const hasTotal = Number.isSafeInteger(total) && total >= 0
  const lastPage = hasTotal ? Math.min(Math.ceil(total / pageSize), OPTION_MAX_PAGES) : OPTION_MAX_PAGES
  const concurrency = hasTotal ? OPTION_PAGE_CONCURRENCY : 1

  for (let page = 2; page <= lastPage; page += concurrency) {
    const count = Math.min(concurrency, lastPage - page + 1)
    const batch = await Promise.all(Array.from({ length: count }, (_, offset) => fetchPage(page + offset)))
    // Promise.all retains page order even when the responses arrive out of order.
    for (const result of batch) {
      if (!appendPage(result.list)) return all
    }
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
  unitName: material.unitName || material.unit || '',
  materialType: material.materialType || '',
})

/** 供应商下拉：默认启用，分页拉全 */
export const loadSupplierOptions = (params = {}) => {
  const { status, page: _p, pageSize: _ps, limit: _l, search: _search, ...rest } = params || {}
  const base = {
    ...rest,
    status: status !== undefined && status !== '' ? status : 1,
  }
  const key = `suppliers:all:${stableSerialize(base)}`
  return withOptionCache(key, async (assertSession) => {
    const suppliers = await fetchAllOptionPages(baseDataApi.getSuppliers, base, assertSession)
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

const normalizeCustomerParams = (params = {}) => {
  const normalized = normalizeKeywordSearch(params)
  if (normalized.status != null && normalized.status !== '') {
    normalized.status = normalizeCustomerStatus(normalized.status)
  }
  return normalized
}

/** 客户下拉：默认启用（1），分页拉全 */
export const loadCustomerOptions = (params = {}) => {
  const { status, page: _p, pageSize: _ps, limit: _l, ...rest } = normalizeCustomerParams(params)
  const base = {
    ...rest,
    status: status !== undefined && status !== '' ? status : 1,
  }
  const key = `customers:all:${stableSerialize(base)}`
  return withOptionCache(key, (assertSession) => fetchAllOptionPages(baseDataApi.getCustomers, base, assertSession))
}

export const searchCustomerOptions = (keyword = '', params = {}) => {
  const search = String(keyword || '').trim()
  return loadCustomerOptions({
    ...params,
    search: search || undefined,
  })
}

/**
 * 客户下拉的分页选项：表单远程搜索只需要当前页，不应拉取全部客户。
 */
export const loadCustomerPageOptions = (params = {}) => {
  const normalized = normalizeCustomerParams(params)
  return loadCachedList('customers:page', baseDataApi.getCustomers, normalized, {
    defaults: { status: 1 },
  })
}

export const searchCustomerPageOptions = (keyword = '', params = {}) =>
  loadCustomerPageOptions({
    ...params,
    search: String(keyword || '').trim() || undefined,
  })

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
  return withOptionCache(key, async (assertSession) => {
    const materials = await fetchAllOptionPages(baseDataApi.getMaterials, base, assertSession)
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

/** 表单物料远程搜索只取一页，避免全量加载覆盖较新的搜索结果。 */
export const loadMaterialPageOptions = (params = {}) =>
  loadCachedList('materials:page', baseDataApi.getMaterials, normalizeKeywordSearch(params), {
    defaults: { status: 1 },
  }).then(materials => materials.map(normalizeMaterialOption))

export const searchMaterialPageOptions = (keyword = '', params = {}) =>
  loadMaterialPageOptions({ ...params, search: String(keyword || '').trim() || undefined })

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
