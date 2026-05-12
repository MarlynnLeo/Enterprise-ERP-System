/**
 * 检验相关常量配置
 * @description 统一管理检验类型、状态等常量
 */

// 检验类型配置
export const INSPECTION_TYPES = {
  incoming: {
    text: '来料检验',
    prefix: '来料',
    value: 'incoming'
  },
  process: {
    text: '过程检验',
    prefix: '过程',
    value: 'process'
  },
  final: {
    text: '成品检验',
    prefix: '成品',
    value: 'final'
  }
}

// 检验项类型
export const INSPECTION_ITEM_TYPES = {
  visual: { text: '外观检验', value: 'visual' },
  dimension: { text: '尺寸检验', value: 'dimension' },
  performance: { text: '性能检验', value: 'performance' },
  other: { text: '其他', value: 'other' }
}

// 模板状态
export const TEMPLATE_STATUS = {
  active: { text: '启用', type: 'success', value: 'active' },
  inactive: { text: '停用', type: 'info', value: 'inactive' },
  draft: { text: '草稿', type: 'warning', value: 'draft' }
}

// 获取检验类型文本
export const getInspectionTypeText = (type) => {
  return INSPECTION_TYPES[type]?.text || type
}

// 获取检验类型前缀
export const getInspectionTypePrefix = (type) => {
  return INSPECTION_TYPES[type]?.prefix || ''
}

// 获取检验项类型文本
export const getInspectionItemTypeText = (type) => {
  return INSPECTION_ITEM_TYPES[type]?.text || type
}

// 获取模板状态配置
export const getTemplateStatus = (status) => {
  return TEMPLATE_STATUS[status] || { text: status, type: 'info', value: status }
}

// ==================== 通用模板查询配置 ====================
/**
 * 通用模板查询配置
 * @description 用于查询通用检验模板的默认参数
 *
 * 使用说明:
 * 1. 如果需要修改通用模板的查询条件,只需修改此配置
 * 2. 例如:如果想查询草稿状态的通用模板,将 status 改为 TEMPLATE_STATUS.draft.value
 * 3. 如果想查询过程检验的通用模板,将 inspection_type 改为 INSPECTION_TYPES.process.value
 */
export const GENERAL_TEMPLATE_QUERY_CONFIG = {
  // 来料检验通用模板查询配置
  incoming: {
    inspection_type: INSPECTION_TYPES.incoming.value,  // 检验类型: 来料检验
    status: TEMPLATE_STATUS.active.value,              // 模板状态: 启用
    is_general: true                                   // 是否通用: 是
  },

  // 过程检验通用模板查询配置
  process: {
    inspection_type: INSPECTION_TYPES.process.value,   // 检验类型: 过程检验
    status: TEMPLATE_STATUS.active.value,              // 模板状态: 启用
    is_general: true                                   // 是否通用: 是
  },

  // 成品检验通用模板查询配置
  final: {
    inspection_type: INSPECTION_TYPES.final.value,     // 检验类型: 成品检验
    status: TEMPLATE_STATUS.active.value,              // 模板状态: 启用
    is_general: true                                   // 是否通用: 是
  }
}

/**
 * 获取通用模板查询参数
 * @param {string} inspectionType - 检验类型 ('incoming' | 'process' | 'final')
 * @returns {Object} 查询参数对象
 *
 * @example
 * // 获取来料检验通用模板查询参数
 * const params = getGeneralTemplateQueryParams('incoming');
 * // 返回: { inspection_type: 'incoming', status: 'active', is_general: true }
 */
export const getGeneralTemplateQueryParams = (inspectionType = 'incoming') => {
  return GENERAL_TEMPLATE_QUERY_CONFIG[inspectionType] || GENERAL_TEMPLATE_QUERY_CONFIG.incoming
}

