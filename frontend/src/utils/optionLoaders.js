import { baseDataApi } from '@/api/baseData'
import { productionApi } from '@/api/production'
import { purchaseApi } from '@/api/purchase'
import { qualityApi } from '@/api/quality'
import { systemApi } from '@/api/system'
import { parseListData } from '@/utils/responseParser'

export const OPTION_PAGE_SIZE = 50
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

export const loadSupplierOptions = (params = {}) =>
  loadCachedList('suppliers', baseDataApi.getSuppliers, params, { defaults: { status: 1 } })

export const searchSupplierOptions = (keyword = '', params = {}) =>
  loadSupplierOptions({ ...params, keyword: String(keyword || '').trim() || undefined })

const normalizeCustomerParams = (params = {}) => {
  const normalized = { ...(params || {}) }
  if (normalized.keyword && !normalized.search) {
    normalized.search = normalized.keyword
    delete normalized.keyword
  }
  return normalized
}

export const loadCustomerOptions = (params = {}) =>
  loadCachedList('customers', baseDataApi.getCustomers, normalizeCustomerParams(params), {
    defaults: {},
  })

export const searchCustomerOptions = (keyword = '', params = {}) =>
  loadCustomerOptions({ ...params, search: String(keyword || '').trim() || undefined })

export const loadLocationOptions = (params = {}) =>
  loadCachedList('locations', baseDataApi.getLocations, params, { defaults: { status: 1 } })

export const loadMaterialOptions = (params = {}) =>
  loadCachedList('materials', baseDataApi.getMaterials, params, { defaults: { status: 1 } })

export const searchMaterialOptions = (keyword = '', params = {}) =>
  loadMaterialOptions({ ...params, search: String(keyword || '').trim() || undefined })

export const loadProductionProcessOptions = (params = {}) =>
  loadCachedList('production-processes', productionApi.getProductionProcesses, params)

export const loadQualityTemplateOptions = (params = {}) =>
  loadCachedList('quality-templates', qualityApi.getTemplates, params, {
    defaults: { status: 'active' },
  })

export const loadPurchaseOrderOptions = (params = {}) =>
  loadCachedList('purchase-orders', purchaseApi.getOrders, params)
