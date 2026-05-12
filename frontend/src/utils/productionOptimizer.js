/**
 * 生产计划性能优化工具
 */

import { baseDataApi } from '@/api/baseData'
import { parseListData } from '@/utils/responseParser'
import logger from './logger'

/**
 * 批量获取物料信息的优化器
 */
export class MaterialBatchLoader {
  constructor() {
    this.cache = new Map()
    this.pendingRequests = new Map()
    this.batchSize = 50
    this.batchTimeout = 100 // 100ms
  }

  /**
   * 批量获取物料信息
   * @param {Array} materialIds - 物料ID数组
   * @returns {Promise<Map>} 物料信息映射
   */
  async batchLoadMaterials(materialIds) {
    const uniqueIds = [...new Set(materialIds)]
    const uncachedIds = uniqueIds.filter(id => !this.cache.has(id))

    if (uncachedIds.length === 0) {
      // 全部命中缓存
      const result = new Map()
      uniqueIds.forEach(id => {
        if (this.cache.has(id)) {
          result.set(id, this.cache.get(id))
        }
      })
      return result
    }

    // 分批加载未缓存的物料
    const batches = this.chunkArray(uncachedIds, this.batchSize)
    const batchPromises = batches.map(batch => this.loadMaterialBatch(batch))

    try {
      await Promise.all(batchPromises)

      // 返回所有请求的物料信息
      const result = new Map()
      uniqueIds.forEach(id => {
        if (this.cache.has(id)) {
          result.set(id, this.cache.get(id))
        }
      })

      logger.debug('批量加载物料完成', {
        total: uniqueIds.length,
        cached: uniqueIds.length - uncachedIds.length,
        loaded: uncachedIds.length
      })

      return result
    } catch (error) {
      logger.error('批量加载物料失败', error)
      throw error
    }
  }

  /**
   * 加载单个批次的物料
   * @param {Array} materialIds - 物料ID数组
   */
  async loadMaterialBatch(materialIds) {
    const batchKey = materialIds.sort().join(',')

    // 避免重复请求
    if (this.pendingRequests.has(batchKey)) {
      return this.pendingRequests.get(batchKey)
    }

    const promise = this.fetchMaterialBatch(materialIds)
    this.pendingRequests.set(batchKey, promise)

    try {
      const materials = await promise

      // 缓存结果
      materials.forEach(material => {
        this.cache.set(material.id, material)
      })

      return materials
    } finally {
      this.pendingRequests.delete(batchKey)
    }
  }

  /**
   * 实际的API调用
   * @param {Array} materialIds - 物料ID数组
   */
  async fetchMaterialBatch(materialIds) {
    const response = await baseDataApi.getMaterialsByIds(materialIds)
    return parseListData(response, { enableLog: false })
  }

  /**
   * 数组分块
   * @param {Array} array - 原数组
   * @param {number} size - 块大小
   */
  chunkArray(array, size) {
    const chunks = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear()
    logger.debug('物料缓存已清除')
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      pendingRequests: this.pendingRequests.size
    }
  }
}

/**
 * 生产计划数据处理优化器
 */
export class ProductionPlanOptimizer {
  constructor() {
    this.materialLoader = new MaterialBatchLoader()
  }

  /**
   * 优化生产计划列表数据处理
   * @param {Array} plans - 生产计划列表
   * @returns {Promise<Array>} 优化后的计划列表
   */
  async optimizePlanList(plans) {
    if (!plans || plans.length === 0) {
      return plans
    }

    const startTime = performance.now()

    try {
      // 1. 提取所有需要的物料ID
      const materialIds = plans
        .map(plan => plan.product_id)
        .filter(Boolean)

      // 2. 批量获取物料信息
      const materialsMap = await this.materialLoader.batchLoadMaterials(materialIds)

      // 3. 并行处理计划数据
      const optimizedPlans = await Promise.all(
        plans.map(plan => this.optimizeSinglePlan(plan, materialsMap))
      )

      const endTime = performance.now()
      logger.debug('生产计划列表优化完成', {
        count: plans.length,
        duration: `${(endTime - startTime).toFixed(2)}ms`
      })

      return optimizedPlans
    } catch (error) {
      logger.error('生产计划列表优化失败', error)
      return plans // 返回原始数据作为降级方案
    }
  }

  /**
   * 优化单个生产计划
   * @param {Object} plan - 生产计划
   * @param {Map} materialsMap - 物料信息映射
   */
  async optimizeSinglePlan(plan, materialsMap) {
    const material = materialsMap.get(plan.product_id)

    if (material) {
      return {
        ...plan,
        productName: material.name || plan.productName || '未知产品',
        specification: material.specs || material.specification || plan.specification || ''
      }
    }

    return plan
  }

  /**
   * 清除所有缓存
   */
  clearCache() {
    this.materialLoader.clearCache()
  }

  /**
   * 获取优化器统计信息
   */
  getStats() {
    return {
      materialLoader: this.materialLoader.getCacheStats()
    }
  }
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} limit - 限制时间（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(func, limit) {
  let inThrottle
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

/**
 * 重试机制
 * @param {Function} fn - 要重试的函数
 * @param {number} retries - 重试次数
 * @param {number} delay - 重试延迟（毫秒）
 */
export async function retry(fn, retries = 3, delay = 1000) {
  try {
    return await fn()
  } catch (error) {
    if (retries > 0) {
      logger.debug(`操作失败，${delay}ms后重试，剩余重试次数: ${retries}`)
      await new Promise(resolve => setTimeout(resolve, delay))
      return retry(fn, retries - 1, delay * 2) // 指数退避
    }
    throw error
  }
}

// 创建全局实例
export const globalProductionOptimizer = new ProductionPlanOptimizer()

export default {
  MaterialBatchLoader,
  ProductionPlanOptimizer,
  debounce,
  throttle,
  retry,
  globalProductionOptimizer
}
