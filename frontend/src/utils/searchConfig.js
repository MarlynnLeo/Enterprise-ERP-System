/**
 * 统一搜索配置
 * 用于统一所有页面的物料搜索逻辑和参数
 */

import { parseListData } from '@/utils/responseParser'

// 统一的搜索配置
export const SEARCH_CONFIG = {
  // 默认页面大小 - 优化性能，按需加载
  DEFAULT_PAGE_SIZE: 100,

  // 远程搜索页面大小 - 增加以支持大量数据搜索
  REMOTE_SEARCH_PAGE_SIZE: 500,

  // 搜索防抖延迟（毫秒）
  SEARCH_DEBOUNCE_DELAY: 300,

  // 本地搜索阈值 - 当本地结果少于此数量时触发远程搜索
  LOCAL_SEARCH_THRESHOLD: 5,

  // 最小搜索长度
  MIN_SEARCH_LENGTH: 1
}

/**
 * 统一的物料搜索函数
 * @param {Object} baseDataApi - API实例
 * @param {string} searchTerm - 搜索关键词
 * @param {Object} options - 搜索选项
 * @returns {Promise<Array>} 搜索结果
 */
export async function searchMaterials(baseDataApi, searchTerm, options = {}) {
  // 空值防护：searchTerm 可能为 undefined/null
  if (!searchTerm || typeof searchTerm !== 'string') {
    searchTerm = String(searchTerm || '')
  }
  searchTerm = searchTerm.trim()
  if (!searchTerm) return []

  const {
    pageSize = SEARCH_CONFIG.REMOTE_SEARCH_PAGE_SIZE,
    category = null,
    type = null,
    material_type = null,
    includeAll = true // 是否包含所有物料类型的搜索
    // withBom 参数已移除，后端现在默认返回 BOM 信息
  } = options

  const searchEndpoints = []

  // 精确编码搜索
  searchEndpoints.push({
    params: {
      page: 1,
      pageSize,
      code: searchTerm,
      ...(category && { category }),
      ...(type && { type }),
      ...(material_type && { material_type })
    },
    name: '精确编码搜索'
  })

  // 模糊搜索
  searchEndpoints.push({
    params: {
      page: 1,
      pageSize,
      search: searchTerm,
      ...(category && { category }),
      ...(type && { type }),
      ...(material_type && { material_type })
    },
    name: '模糊搜索'
  })

  // 如果指定了类别，添加其他类别的搜索
  if (includeAll) {
    // 产品类型搜索
    searchEndpoints.push({
      params: {
        page: 1,
        pageSize,
        search: searchTerm,
        category: 'product'
      },
      name: '产品类型搜索'
    })

    // 全物料搜索
    searchEndpoints.push({
      params: {
        page: 1,
        pageSize,
        search: searchTerm
      },
      name: '全物料搜索'
    })
  }

  let allResults = []

  for (const endpoint of searchEndpoints) {
    try {
      const response = await baseDataApi.getMaterials(endpoint.params)

      // 使用统一工具解析列表数据
      const materials = parseListData(response, { enableLog: false })

      // 合并结果，去重
      materials.forEach(material => {
        if (!allResults.find(existing => existing.id === material.id)) {
          allResults.push(material)
        }
      })

    } catch (error) {
      // 搜索失败时静默处理，继续尝试其他端点
    }
  }

  // 按匹配度排序
  const searchTermLower = searchTerm.toLowerCase()
  allResults.sort((a, b) => {
    const aCode = (a.code || '').toLowerCase()
    const bCode = (b.code || '').toLowerCase()
    const aName = (a.name || '').toLowerCase()
    const bName = (b.name || '').toLowerCase()

    // 编码精确匹配优先
    if (aCode === searchTermLower && bCode !== searchTermLower) return -1
    if (bCode === searchTermLower && aCode !== searchTermLower) return 1

    // 编码开头匹配
    if (aCode.startsWith(searchTermLower) && !bCode.startsWith(searchTermLower)) return -1
    if (bCode.startsWith(searchTermLower) && !aCode.startsWith(searchTermLower)) return 1

    // 编码包含匹配
    if (aCode.includes(searchTermLower) && !bCode.includes(searchTermLower)) return -1
    if (bCode.includes(searchTermLower) && !aCode.includes(searchTermLower)) return 1

    // 名称开头匹配
    if (aName.startsWith(searchTermLower) && !bName.startsWith(searchTermLower)) return -1
    if (bName.startsWith(searchTermLower) && !aName.startsWith(searchTermLower)) return 1

    // 默认按编码排序
    return aCode.localeCompare(bCode)
  })

  return allResults
}

/**
 * 统一的物料数据加载函数
 * @param {Object} baseDataApi - API实例
 * @param {Object} options - 加载选项
 * @returns {Promise<Array>} 物料列表
 */
export async function loadMaterials(baseDataApi, options = {}) {
  const {
    pageSize = SEARCH_CONFIG.DEFAULT_PAGE_SIZE,
    category = null,
    type = null,
    material_type = null
    // withBom 参数已移除，后端现在默认返回 BOM 信息
  } = options

  try {

    const response = await baseDataApi.getMaterials({
      page: 1,
      pageSize,
      ...(category && { category }),
      ...(type && { type }),
      ...(material_type && { material_type })
    })

    // 使用统一工具解析列表数据
    return parseListData(response, { enableLog: false })

  } catch (error) {
    console.error('❌ 加载物料数据失败:', error)
    throw error
  }
}

/**
 * 统一的物料数据映射函数
 * @param {Array} materials - 原始物料数据
 * @returns {Array} 映射后的物料数据
 */
export function mapMaterialData(materials) {
  return materials.map(material => {
    // 先展开原始数据,再覆盖处理后的字段,确保默认值不会被null覆盖
    const mapped = {
      ...material,
      id: material.id,
      code: material.code || '无编码',
      name: material.name || material.material_name || '未命名',
      specification: material.specs || material.specification || '',
      // 尝试多种可能的BOM字段名
      hasBom: material.hasBom || material.has_bom || material.withBom ||
        (material.bom_id && material.bom_id !== null) ||
        (material.bomId && material.bomId !== null) ||
        false,
      bomId: material.bomId || material.bom_id || null,
      unit_id: material.unit_id,
      unit_name: material.unit_name || '个',
      price: material.price || 0,
      stock_quantity: material.stock_quantity || material.quantity || 0
    }
    return mapped
  })
}
