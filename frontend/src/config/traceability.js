/**
 * 追溯系统配置文件
 */

// 搜索策略配置
export const searchStrategies = [
  {
    type: 'product_code',
    condition: (keyword) => /^[A-Z0-9]+$/.test(keyword) && keyword.length >= 6,
    priority: 1
  },
  {
    type: 'chain_no',
    condition: (keyword) => keyword.includes('TC') && keyword.length > 10,
    priority: 2
  },
  {
    type: 'batch_number',
    condition: (keyword) => keyword.includes('BATCH-') || keyword.includes('TC2025'),
    priority: 3
  },
  {
    type: 'sales_order',
    condition: (keyword) => keyword.includes('SO') || /^[A-Z]{2}\d+/.test(keyword),
    priority: 4
  },
  {
    type: 'general',
    condition: () => true,
    priority: 5
  }
]

// 步骤配置
export const stepConfig = {
  'PURCHASE_RECEIVE': { 
    name: '采购到货', 
    color: '#409EFF', 
    icon: '🚚', 
    x: 100, 
    y: 100 
  },
  'IQC_INSPECTION': { 
    name: '来料检验', 
    color: '#67C23A', 
    icon: '🔍', 
    x: 300, 
    y: 100 
  },
  'MATERIAL_IN': { 
    name: '原料入库', 
    color: '#E6A23C', 
    icon: '📦', 
    x: 500, 
    y: 100 
  },
  'MATERIAL_ISSUE': { 
    name: '生产领料', 
    color: '#F56C6C', 
    icon: '📤', 
    x: 100, 
    y: 300 
  },
  'PRODUCTION': { 
    name: '生产过程', 
    color: '#909399', 
    icon: '⚙️', 
    x: 300, 
    y: 300 
  },
  'IPQC_INSPECTION': { 
    name: '过程检验', 
    color: '#67C23A', 
    icon: '🔬', 
    x: 500, 
    y: 300 
  },
  'FQC_INSPECTION': { 
    name: '成品检验', 
    color: '#67C23A', 
    icon: '✅', 
    x: 700, 
    y: 300 
  },
  'PRODUCT_IN': { 
    name: '成品入库', 
    color: '#E6A23C', 
    icon: '📥', 
    x: 700, 
    y: 100 
  },
  'SALES_OUT': { 
    name: '销售出库', 
    color: '#409EFF', 
    icon: '🚛', 
    x: 900, 
    y: 200 
  }
}

// 错误处理配置
export const errorMessages = {
  network: '网络连接失败，请检查网络连接',
  notFound: '未找到相关追溯数据，请检查输入的编码是否正确',
  server: '服务器错误，请稍后重试',
  timeout: '请求超时，请稍后重试',
  invalidInput: '请输入有效的产品编码、批次号或订单号'
}

// 性能配置
export const performanceConfig = {
  searchDebounceDelay: 300,
  cacheExpireTime: 5 * 60 * 1000, // 5分钟
  maxSearchHistory: 10,
  requestTimeout: 30000 // 30秒
}

// API 配置
export const apiConfig = {
  baseUrl: '/api/quality/traceability',
  endpoints: {
    search: '/search',
    list: '',
    detail: '/:id',
    searchByBatch: '/search/batch',
    searchBySalesOrder: '/search/sales-order',
    fullChain: '/full-chain'
  }
}
