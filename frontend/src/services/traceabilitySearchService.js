/**
 * 追溯搜索服务
 */
import { searchStrategies, apiConfig, errorMessages, performanceConfig } from '@/config/traceability'

class TraceabilitySearchService {
  constructor() {
    this.cache = new Map()
    this.searchHistory = JSON.parse(localStorage.getItem('traceability_search_history') || '[]')
  }

  /**
   * 智能搜索追溯链路
   * @param {string} keyword - 搜索关键词
   * @returns {Promise<Object>} - 搜索结果
   */
  async intelligentSearch(keyword) {
    if (!keyword || keyword.trim() === '') {
      throw new Error(errorMessages.invalidInput)
    }

    const trimmedKeyword = keyword.trim()
    
    // 检查缓存
    const cacheKey = `search:${trimmedKeyword}`
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)
      if (Date.now() - cached.timestamp < performanceConfig.cacheExpireTime) {
        return cached.data
      }
      this.cache.delete(cacheKey)
    }

    // 确定搜索策略
    const strategy = this.determineSearchStrategy(trimmedKeyword)

    try {
      let result
      
      switch (strategy.type) {
        case 'product_code':
          result = await this.searchByProductCode(trimmedKeyword)
          break
        case 'chain_no':
          result = await this.searchByChainNo(trimmedKeyword)
          break
        case 'batch_number':
          result = await this.searchByBatchNumber(trimmedKeyword)
          break
        case 'sales_order':
          result = await this.searchBySalesOrder(trimmedKeyword)
          break
        default:
          result = await this.generalSearch(trimmedKeyword)
      }

      // 缓存结果
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      })

      // 添加到搜索历史
      this.addToSearchHistory(trimmedKeyword)

      return result
    } catch (error) {
      console.error('搜索失败:', error)
      throw this.handleSearchError(error)
    }
  }

  /**
   * 确定搜索策略
   * @param {string} keyword - 搜索关键词
   * @returns {Object} - 搜索策略
   */
  determineSearchStrategy(keyword) {
    return searchStrategies
      .sort((a, b) => a.priority - b.priority)
      .find(strategy => strategy.condition(keyword)) || searchStrategies[searchStrategies.length - 1]
  }

  /**
   * 按产品编码搜索
   */
  async searchByProductCode(keyword) {
    try {
      // 使用全链路追溯API进行反向追溯
      const response = await this.fetchWithTimeout(
        `${apiConfig.baseUrl}/full-chain?type=backward&code=${encodeURIComponent(keyword)}&batchNumber=BATCH-${keyword}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
      )
      const result = await response.json()

      if (result.success && result.traceability) {
        // 转换为前端期望的格式
        const traceabilityData = this.convertToTraceabilityFormat(result.traceability, keyword)
        return {
          type: 'single',
          data: traceabilityData
        }
      } else {
        // 如果是追溯记录不存在，提供更友好的错误信息
        if (result.message && result.message.includes('追溯记录不存在')) {
          throw new Error(`未找到产品编码 "${keyword}" 的追溯记录。\n\n可能的原因：\n1. 该产品尚未建立追溯链路\n2. 产品编码输入错误\n3. 批次号不匹配\n\n建议：\n- 检查产品编码是否正确\n- 确认采购、生产、质检、出入库单据已完成追溯建档`)
        }

        throw new Error(result.message || errorMessages.notFound)
      }
    } catch (error) {
      console.error('搜索产品编码失败:', error)
      if (error.message.includes('追溯记录不存在')) {
        throw new Error('未找到该产品的追溯记录，可能该产品尚未建立追溯链路')
      }
      throw error
    }
  }

  /**
   * 按追溯链路编号搜索
   */
  async searchByChainNo(keyword) {
    const response = await this.fetchWithTimeout(
      `${apiConfig.baseUrl}?chain_no=${encodeURIComponent(keyword)}&limit=10`
    )
    const result = await response.json()

    if (result.success && result.data?.list?.length > 0) {
      const detailResponse = await this.fetchWithTimeout(
        `${apiConfig.baseUrl}/${result.data.list[0].id}`
      )
      const detailResult = await detailResponse.json()
      
      if (detailResult.success) {
        return {
          type: 'single',
          data: detailResult.data
        }
      }
    }
    
    throw new Error(errorMessages.notFound)
  }

  /**
   * 按批次号搜索
   */
  async searchByBatchNumber(keyword) {
    // 从批次号中提取产品编码
    let productCode = '105201006' // 默认产品编码
    if (keyword.includes('BATCH-')) {
      const parts = keyword.split('-')
      if (parts.length >= 2) {
        productCode = parts[1]
      }
    }

    // 使用全链路追溯API进行反向追溯
    const response = await this.fetchWithTimeout(
      `${apiConfig.baseUrl}/full-chain?type=backward&code=${encodeURIComponent(productCode)}&batchNumber=${encodeURIComponent(keyword)}`
    )
    const result = await response.json()

    if (result.success && result.traceability) {
      // 转换为前端期望的格式
      const traceabilityData = this.convertToTraceabilityFormat(result.traceability, productCode)
      return {
        type: 'single',
        data: traceabilityData
      }
    }

    throw new Error(errorMessages.notFound)
  }

  /**
   * 按销售订单号搜索
   */
  async searchBySalesOrder(keyword) {
    const response = await this.fetchWithTimeout(
      `${apiConfig.baseUrl}/search/sales-order?sales_order_no=${encodeURIComponent(keyword)}`
    )
    const result = await response.json()

    if (result.success && result.data?.id) {
      return {
        type: 'single',
        data: result.data
      }
    }
    
    throw new Error(errorMessages.notFound)
  }

  /**
   * 通用搜索
   */
  async generalSearch(keyword) {
    const response = await this.fetchWithTimeout(
      `${apiConfig.baseUrl}?limit=10`
    )
    const result = await response.json()

    if (result.success && result.data?.list?.length > 0) {
      const matchedChain = result.data.list.find(chain =>
        chain.product_code?.includes(keyword) ||
        chain.product_name?.includes(keyword) ||
        chain.batch_number?.includes(keyword) ||
        chain.chain_no?.includes(keyword)
      )

      if (matchedChain) {
        const detailResponse = await this.fetchWithTimeout(
          `${apiConfig.baseUrl}/${matchedChain.id}`
        )
        const detailResult = await detailResponse.json()
        
        if (detailResult.success) {
          return {
            type: 'single',
            data: detailResult.data
          }
        }
      }
    }
    
    throw new Error(errorMessages.notFound)
  }

  /**
   * 带超时的 fetch
   */
  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), performanceConfig.requestTimeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      })

      // 对于追溯API，即使状态码不是200，也可能有有用的JSON响应
      if (!response.ok) {
        // 尝试解析错误响应的JSON
        try {
          const errorData = await response.json()
          if (errorData.message) {
            throw new Error(errorData.message)
          }
        } catch {
          // 如果不是JSON响应，使用原始错误信息
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return response
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(errorMessages.timeout)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * 转换后端数据为前端期望的格式
   * @param {Object} traceabilityData - 后端返回的追溯数据
   * @param {string} keyword - 搜索关键词
   * @returns {Object} - 前端格式的追溯数据
   */
  convertToTraceabilityFormat(traceabilityData, keyword) {
    const steps = []

    // 构建追溯步骤
    if (traceabilityData.purchase && traceabilityData.purchase.length > 0) {
      steps.push({
        step_type: 'PURCHASE_RECEIVE',
        step_name: '采购到货',
        status: 'completed',
        execution_time: traceabilityData.purchase[0].receipt_date,
        data: traceabilityData.purchase
      })
    }

    if (traceabilityData.quality && traceabilityData.quality.length > 0) {
      const incomingInspections = traceabilityData.quality.filter(q => q.inspection_type === 'incoming')
      if (incomingInspections.length > 0) {
        steps.push({
          step_type: 'IQC_INSPECTION',
          step_name: '来料检验',
          status: 'completed',
          execution_time: incomingInspections[0].checkTime,
          data: incomingInspections
        })
      }
    }

    if (traceabilityData.production && traceabilityData.production.length > 0) {
      steps.push({
        step_type: 'PRODUCTION',
        step_name: '生产过程',
        status: 'completed',
        execution_time: traceabilityData.production[0].start_time,
        data: traceabilityData.production
      })
    }

    if (traceabilityData.outbound && traceabilityData.outbound.length > 0) {
      steps.push({
        step_type: 'SALES_OUT',
        step_name: '销售出库',
        status: 'completed',
        execution_time: traceabilityData.outbound[0].outbound_date,
        data: traceabilityData.outbound
      })
    }

    return {
      id: traceabilityData.id || globalThis.crypto?.randomUUID?.() || `trace_${keyword}`,
      chain_no: traceabilityData.chain_no || traceabilityData.product?.traceability_no || '',
      product_code: keyword,
      product_name: traceabilityData.product?.name || '未知产品',
      batch_number: traceabilityData.product?.batch || '',
      status: 'active',
      steps: steps
    }
  }

  /**
   * 处理搜索错误
   */
  handleSearchError(error) {
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      return new Error(errorMessages.network)
    }
    if (error.message.includes('timeout')) {
      return new Error(errorMessages.timeout)
    }
    if (error.message.includes('404')) {
      return new Error(errorMessages.notFound)
    }
    if (error.message.includes('500')) {
      return new Error(errorMessages.server)
    }
    return error
  }

  /**
   * 添加到搜索历史
   */
  addToSearchHistory(keyword) {
    const history = this.searchHistory.filter(item => item !== keyword)
    history.unshift(keyword)
    this.searchHistory = history.slice(0, performanceConfig.maxSearchHistory)
    localStorage.setItem('traceability_search_history', JSON.stringify(this.searchHistory))
  }

  /**
   * 获取搜索历史
   */
  getSearchHistory() {
    return this.searchHistory
  }

  /**
   * 清空搜索历史
   */
  clearSearchHistory() {
    this.searchHistory = []
    localStorage.removeItem('traceability_search_history')
  }

  /**
   * 清空缓存
   */
  clearCache() {
    this.cache.clear()
  }
}

export default new TraceabilitySearchService()
