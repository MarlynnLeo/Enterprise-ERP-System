import { parseListData } from '@/utils/responseParser'

export const SEARCH_CONFIG = {
  DEFAULT_PAGE_SIZE: 50,
  REMOTE_SEARCH_PAGE_SIZE: 50,
  MAX_REMOTE_RESULTS: 50,
  SEARCH_DEBOUNCE_DELAY: 300,
  LOCAL_SEARCH_THRESHOLD: 5,
  MIN_SEARCH_LENGTH: 1,
}

const normalizePageSize = (pageSize) => {
  const parsed = Number(pageSize) || SEARCH_CONFIG.REMOTE_SEARCH_PAGE_SIZE
  return Math.min(Math.max(parsed, 1), SEARCH_CONFIG.MAX_REMOTE_RESULTS)
}

const pushUnique = (target, source) => {
  source.forEach(material => {
    if (material?.id && !target.some(existing => existing.id === material.id)) {
      target.push(material)
    }
  })
}

export async function searchMaterials(baseDataApi, searchTerm, options = {}) {
  const keyword = String(searchTerm || '').trim()
  if (!keyword) return []

  const {
    pageSize = SEARCH_CONFIG.REMOTE_SEARCH_PAGE_SIZE,
    category = null,
    type = null,
    material_type = null,
    includeAll = true,
  } = options

  const normalizedPageSize = normalizePageSize(pageSize)
  const commonParams = {
    page: 1,
    ...(type && { type }),
    ...(material_type && { material_type }),
  }

  const searchEndpoints = [
    {
      pageSize: Math.min(normalizedPageSize, 20),
      code: keyword,
      ...(category && { category }),
      ...commonParams,
    },
    {
      pageSize: normalizedPageSize,
      search: keyword,
      ...(category && { category }),
      ...commonParams,
    },
  ]

  if (includeAll && category) {
    searchEndpoints.push({
      pageSize: normalizedPageSize,
      search: keyword,
      ...commonParams,
    })
  }

  const responses = await Promise.allSettled(
    searchEndpoints.map(async params => {
      const response = await baseDataApi.getMaterials(params)
      return parseListData(response, { enableLog: false })
    })
  )

  const allResults = []
  responses.forEach(result => {
    if (result.status === 'fulfilled') {
      pushUnique(allResults, result.value)
    }
  })

  const keywordLower = keyword.toLowerCase()
  allResults.sort((a, b) => {
    const aCode = String(a.code || '').toLowerCase()
    const bCode = String(b.code || '').toLowerCase()
    const aName = String(a.name || a.materialName || '').toLowerCase()
    const bName = String(b.name || b.materialName || '').toLowerCase()

    if (aCode === keywordLower && bCode !== keywordLower) return -1
    if (bCode === keywordLower && aCode !== keywordLower) return 1
    if (aCode.startsWith(keywordLower) && !bCode.startsWith(keywordLower)) return -1
    if (bCode.startsWith(keywordLower) && !aCode.startsWith(keywordLower)) return 1
    if (aCode.includes(keywordLower) && !bCode.includes(keywordLower)) return -1
    if (bCode.includes(keywordLower) && !aCode.includes(keywordLower)) return 1
    if (aName.startsWith(keywordLower) && !bName.startsWith(keywordLower)) return -1
    if (bName.startsWith(keywordLower) && !aName.startsWith(keywordLower)) return 1
    return aCode.localeCompare(bCode)
  })

  return allResults.slice(0, normalizedPageSize)
}

export async function loadMaterials(baseDataApi, options = {}) {
  const {
    pageSize = SEARCH_CONFIG.DEFAULT_PAGE_SIZE,
    category = null,
    type = null,
    material_type = null,
  } = options

  const response = await baseDataApi.getMaterials({
    page: 1,
    pageSize: normalizePageSize(pageSize),
    ...(category && { category }),
    ...(type && { type }),
    ...(material_type && { material_type }),
  })

  return parseListData(response, { enableLog: false })
}

export function mapMaterialData(materials = []) {
  if (!Array.isArray(materials)) return []

  return materials.map(material => ({
    ...material,
    id: material.id,
    code: material.code || '无编码',
    name: material.name || material.materialName || '未命名',
    specification: material.specs || material.specification || '',
    // API 只认 camel
    hasBom: Boolean(material.hasBom || material.withBom || material.bomId),
    bomId: material.bomId || null,
    unitId: material.unitId,
    unitName: material.unitName || '个',
    price: material.price || 0,
    stockQuantity: material.stockQuantity ?? material.quantity ?? 0,
  }))
}
