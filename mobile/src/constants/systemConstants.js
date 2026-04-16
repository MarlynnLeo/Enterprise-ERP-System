/**
 * 系统统一常量配置
 *
 * 统一管理整个系统中使用的所有状态映射、中文翻译和常量定义
 * 避免在各个页面重复定义，确保一致性
 *
 * 注意：此文件已合并前后端常量，包含：
 * - 共享常量：前后端通用的状态映射和业务规则
 * - 前端专用：颜色映射、UI相关配置
 * - 后端专用：数据验证规则、业务规则配置
 *
 * @author 系统开发团队
 * @version 2.0.0 - 合并前后端常量
 * @since 2025-08-13
 */

// ==================== 库存事务类型映射 ====================
export const INVENTORY_TRANSACTION_TYPES = {
  // 基础类型
  inbound: '生产入库',
  outbound: '生产出库',
  in: '生产入库',
  out: '生产出库',

  // 调拨类型
  transfer: '调拨',
  transfer_in: '调拨入库',
  transfer_out: '调拨出库',

  // 业务类型
  purchase_inbound: '采购入库',
  purchase_return: '采购退货',
  production_inbound: '生产入库',
  production_outbound: '生产出库',
  outsourced_inbound: '委外入库',
  outsourced_outbound: '委外出库',
  sale: '销售出库',
  sales_outbound: '销售出库',
  sales_return: '销售退货',
  sales_exchange_return: '销售换退',
  sales_exchange_out: '销售换出',

  // 管理类型
  check: '盘点',
  adjust: '调整',
  adjustment: '库存调整',
  adjustment_in: '调整入库',
  adjustment_out: '调整出库',
  outbound_cancel: '撤销出库',
  initial_import: '初始导入',
  manual_adjustment: '手动调整',
  other: '其他',

  // 中文类型（兼容后端已返回中文的情况）
  入库: '生产入库',
  出库: '生产出库',
  调拨: '调拨',
  调拨入库: '调拨入库',
  调拨出库: '调拨出库',
  采购入库: '采购入库',
  采购退货: '采购退货',
  生产入库: '生产入库',
  生产出库: '生产出库',
  委外入库: '委外入库',
  委外出库: '委外出库',
  销售出库: '销售出库',
  销售退货: '销售退货',
  销售换退: '销售换退',
  销售换出: '销售换出',
  盘点: '盘点',
  调整: '调整',
  库存调整: '库存调整',
  初始导入: '初始导入',
  手动调整: '手动调整',
  其他: '其他'
}

// 库存事务类型颜色映射
export const INVENTORY_TRANSACTION_COLORS = {
  // 英文类型
  inbound: 'success',
  outbound: 'danger',
  transfer: 'warning',
  transfer_in: 'success',
  transfer_out: 'warning',
  check: 'info',
  adjust: 'info',
  adjustment_in: 'success', // 调整入库 - 绿色
  adjustment_out: 'danger', // 调整出库 - 红色
  outbound_cancel: 'success', // 撤销出库 - 绿色（库存回退）
  initial_import: 'success', // 初始导入 - 绿色
  manual_adjustment: 'warning', // 手动调整 - 橙色
  other: 'info',
  purchase_inbound: 'success',
  purchase_return: 'warning',
  production_inbound: 'success',
  production_outbound: 'danger',
  outsourced_inbound: 'success',
  outsourced_outbound: 'danger',
  sale: 'danger',
  sales_outbound: 'danger',
  sales_return: 'warning',
  sales_exchange_return: 'success', // 销售换退 - 绿色（入库）
  sales_exchange_out: 'danger', // 销售换出 - 红色（出库）

  // 中文类型（后端返回的中文状态）
  入库: 'success',
  出库: 'danger',
  调拨: 'warning',
  调拨入库: 'success',
  调拨出库: 'warning',
  采购入库: 'success',
  采购退货: 'warning',
  生产入库: 'success',
  生产出库: 'danger',
  委外入库: 'success',
  委外出库: 'danger',
  销售出库: 'danger',
  销售退货: 'warning',
  销售换退: 'success', // 销售换退 - 绿色（入库）
  销售换出: 'danger', // 销售换出 - 红色（出库）
  盘点: 'info',
  调整: 'info',
  库存调整: 'info',
  调整入库: 'success', // 调整入库 - 绿色
  调整出库: 'danger', // 调整出库 - 红色
  其他: 'info'
}

// ==================== 库存盘点状态映射 ====================
export const INVENTORY_CHECK_STATUS = {
  draft: '草稿',
  in_progress: '进行中',
  pending: '待审核',
  completed: '已完成',
  cancelled: '已取消'
}

// 库存盘点状态颜色映射
export const INVENTORY_CHECK_STATUS_COLORS = {
  draft: 'info',
  in_progress: 'warning',
  pending: 'primary',
  completed: 'success',
  cancelled: 'info'
}

// ==================== 调拨单状态映射 ====================
export const TRANSFER_STATUS = {
  draft: '草稿',
  pending: '待审核',
  approved: '已审核',
  in_transit: '运输中',
  completed: '已完成',
  cancelled: '已取消',
  rejected: '已拒绝'
}

// 调拨单状态颜色映射
export const TRANSFER_STATUS_COLORS = {
  draft: 'info',
  pending: 'warning',
  confirmed: 'primary',
  approved: 'primary',
  in_progress: 'warning',
  in_transit: 'warning',
  completed: 'success',
  cancelled: 'danger',
  rejected: 'danger'
}

// ==================== 订单状态映射 ====================
export const ORDER_STATUS = {
  draft: '草稿',
  pending: '待确认',
  confirmed: '已确认',
  approved: '已批准',
  processing: '处理中',
  in_production: '生产中',
  ready_to_ship: '待发货',
  shipped: '已发货',
  delivered: '已交付',
  completed: '已完成',
  cancelled: '已取消',
  rejected: '已拒绝'
}

// 订单状态颜色映射
export const ORDER_STATUS_COLORS = {
  draft: 'info',
  pending: 'warning',
  confirmed: 'primary',
  approved: 'success',
  processing: 'warning',
  in_production: 'primary',
  ready_to_ship: 'warning',
  shipped: 'primary',
  delivered: 'success',
  completed: 'success',
  cancelled: 'danger',
  rejected: 'danger'
}

// ==================== 采购状态映射 ====================
export const PURCHASE_STATUS = {
  draft: '草稿',
  pending: '待处理',
  submitted: '待审批',
  approved: '已批准',
  confirmed: '已确认',
  processing: '处理中',
  partial_received: '部分收货',
  completed: '已完成',
  cancelled: '已取消',
  rejected: '已拒绝'
}

// 采购状态颜色映射
export const PURCHASE_STATUS_COLORS = {
  draft: 'info',
  pending: 'warning',
  submitted: 'warning',
  approved: 'success',
  confirmed: 'primary',
  processing: 'warning',
  partial_received: 'warning',
  completed: 'success',
  cancelled: 'danger',
  rejected: 'danger'
}

// ==================== 销售状态映射 ====================
export const SALES_STATUS = {
  draft: '草稿',
  pending: '待处理',
  confirmed: '已确认',
  processing: '处理中',
  in_production: '生产中',
  in_procurement: '采购中',
  ready_to_ship: '可发货',
  shortage: '缺料', // 表示订单有缺料
  partial_shipped: '部分发货',
  shipped: '已发货',
  delivered: '已交付',
  completed: '已完成',
  cancelled: '已取消'
}

// ==================== 订单锁定状态映射 ====================
export const ORDER_LOCK_STATUS = {
  unlocked: '未锁定',
  locked: '已锁定'
}

// 销售状态颜色映射
export const SALES_STATUS_COLORS = {
  draft: 'info',
  pending: 'warning',
  confirmed: 'primary',
  processing: 'warning',
  in_production: 'primary',
  in_procurement: 'warning',
  ready_to_ship: 'success',
  shortage: 'danger', // 缺料用红色标注
  partial_shipped: 'warning',
  shipped: 'primary',
  delivered: 'success',
  completed: 'success',
  cancelled: 'danger',
  // 中文状态映射（用于换货单等）
  待处理: 'warning',
  处理中: 'primary',
  已完成: 'success',
  已拒绝: 'danger',
  // 退货单状态映射
  草稿: 'info',
  待审批: 'warning',
  已审批: 'primary',
  已完成: 'success',
  已拒绝: 'danger'
}

// ==================== 销售报价单状态映射 ====================
export const SALES_QUOTATION_STATUS = {
  draft: '草稿',
  sent: '已发送',
  accepted: '已接受',
  rejected: '已拒绝',
  expired: '已过期'
}

// 销售报价单状态颜色映射
export const SALES_QUOTATION_STATUS_COLORS = {
  draft: 'info', // 草稿 - 灰色
  sent: 'warning', // 已发送 - 橙色
  accepted: 'success', // 已接受 - 绿色
  rejected: 'danger', // 已拒绝 - 红色
  expired: 'info' // 已过期 - 灰色
}

// ==================== 质量检验状态映射 ====================
export const QUALITY_STATUS = {
  pending: '待检验',
  in_progress: '检验中',
  passed: '合格',
  failed: '不合格',
  rework: '返工',
  review: '复检',
  partial: '部分合格',
  cancelled: '已取消'
}

// 质量检验状态颜色映射
export const QUALITY_STATUS_COLORS = {
  pending: 'warning',
  in_progress: 'primary',
  passed: 'success',
  failed: 'danger',
  rework: 'warning',
  review: 'warning',
  partial: 'warning',
  cancelled: 'info'
}

// 质量检验类型映射
export const QUALITY_INSPECTION_TYPES = {
  visual: '外观检查',
  dimension: '尺寸检查',
  quantity: '数量检查',
  function: '功能检查',
  weight: '重量检查',
  performance: '性能检查',
  safety: '安全检查',
  electrical: '电气检查',
  other: '其他检查'
}

// ==================== 生产状态映射 ====================
export const PRODUCTION_STATUS = {
  // 基础状态
  draft: '未开始',
  planned: '已计划',
  ready: '准备就绪',
  pending: '待处理',

  // 准备阶段
  preparing: '配料中',
  material_issuing: '发料中',
  material_issued: '已发料',
  materials_issued: '已发料',

  // 生产阶段
  in_progress: '生产中',
  inProgress: '生产中',
  processing: '生产中',
  wip: '生产中',
  doing: '生产中',
  started: '生产中',
  paused: '暂停',

  // 完成阶段
  inspection: '检验中',
  warehousing: '入库中',
  completed: '已完成',
  done: '已完成',
  finished: '已完成',

  // 取消状态
  cancelled: '已取消',
  cancel: '已取消'
}

// 生产状态颜色映射
export const PRODUCTION_STATUS_COLORS = {
  // 基础状态
  draft: 'info',
  planned: 'info',
  ready: 'warning',
  pending: 'warning',

  // 准备阶段
  preparing: 'warning',
  material_issuing: 'warning',
  material_issued: 'success',
  materials_issued: 'success',

  // 生产阶段
  in_progress: 'primary',
  inProgress: 'primary',
  processing: 'primary',
  wip: 'primary',
  doing: 'primary',
  started: 'primary',
  paused: 'warning',

  // 完成阶段
  inspection: 'primary',
  warehousing: 'warning',
  completed: 'success',
  done: 'success',
  finished: 'success',

  // 取消状态
  cancelled: 'danger',
  cancel: 'danger'
}

// ==================== 设备状态映射 ====================
export const EQUIPMENT_STATUS = {
  running: '运行中',
  idle: '空闲',
  maintenance: '维护中',
  fault: '故障',
  offline: '离线'
}

// 设备状态颜色映射
export const EQUIPMENT_STATUS_COLORS = {
  running: 'success',
  idle: 'warning',
  maintenance: 'primary',
  fault: 'danger',
  offline: 'info'
}

// ==================== 库存状态映射 ====================
export const INVENTORY_STATUS = {
  available: '可用',
  reserved: '已预留',
  locked: '已锁定',
  expired: '已过期',
  inspection: '待检验',
  defective: '不良品',
  quarantine: '隔离',
  damaged: '损坏'
}

// 库存状态颜色映射
export const INVENTORY_STATUS_COLORS = {
  available: 'success',
  reserved: 'warning',
  locked: 'danger',
  expired: 'danger',
  inspection: 'info',
  defective: 'danger',
  quarantine: 'warning',
  damaged: 'danger'
}

// ==================== 入库出库状态映射 ====================
export const INBOUND_OUTBOUND_STATUS = {
  draft: '草稿',
  confirmed: '已确认',
  completed: '已完成',
  cancelled: '已取消'
}

// 入库出库状态颜色映射
export const INBOUND_OUTBOUND_STATUS_COLORS = {
  draft: 'info',
  confirmed: 'warning',
  completed: 'success',
  cancelled: 'danger'
}

// ==================== 通用状态映射 ====================
export const COMMON_STATUS = {
  active: '启用',
  inactive: '禁用',
  enabled: '启用',
  disabled: '禁用',
  normal: '正常',
  abnormal: '异常',
  online: '在线',
  offline: '离线',
  valid: '有效',
  invalid: '无效',
  available: '可用',
  unavailable: '不可用',
  locked: '锁定',
  unlocked: '解锁'
}

// 通用状态颜色映射
export const COMMON_STATUS_COLORS = {
  active: 'success',
  inactive: 'info',
  enabled: 'success',
  disabled: 'info',
  normal: 'success',
  abnormal: 'danger',
  online: 'success',
  offline: 'info',
  valid: 'success',
  invalid: 'danger',
  available: 'success',
  unavailable: 'info',
  locked: 'danger',
  unlocked: 'success'
}

// ==================== 工具函数 ====================

/**
 * 获取库存事务类型的中文名称
 * @param {string} type - 事务类型
 * @returns {string} 中文名称
 */
export const getInventoryTransactionTypeText = (type) => {
  return INVENTORY_TRANSACTION_TYPES[type] || type
}

/**
 * 获取库存事务类型的颜色
 * @param {string} type - 事务类型
 * @returns {string} 颜色类型
 */
export const getInventoryTransactionTypeColor = (type) => {
  return INVENTORY_TRANSACTION_COLORS[type] || 'info'
}

/**
 * 获取调拨单状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
export const getTransferStatusText = (status) => {
  return TRANSFER_STATUS[status] || status
}

/**
 * 获取调拨单状态的颜色
 * @param {string} status - 状态
 * @returns {string} 颜色类型
 */
export const getTransferStatusColor = (status) => {
  return TRANSFER_STATUS_COLORS[status] || 'info'
}

/**
 * 获取订单状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
export const getOrderStatusText = (status) => {
  return ORDER_STATUS[status] || status
}

/**
 * 获取订单状态的颜色
 * @param {string} status - 状态
 * @returns {string} 颜色类型
 */
export const getOrderStatusColor = (status) => {
  return ORDER_STATUS_COLORS[status] || 'info'
}

/**
 * 获取销售状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
export const getSalesStatusText = (status) => {
  return SALES_STATUS[status] || status
}

/**
 * 获取销售状态的颜色
 * @param {string} status - 状态
 * @returns {string} 颜色类型
 */
export const getSalesStatusColor = (status) => {
  return SALES_STATUS_COLORS[status] || 'info'
}

/**
 * 获取采购状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
export const getPurchaseStatusText = (status) => {
  return PURCHASE_STATUS[status] || status
}

/**
 * 获取采购状态的颜色
 * @param {string} status - 状态
 * @returns {string} 颜色类型
 */
export const getPurchaseStatusColor = (status) => {
  return PURCHASE_STATUS_COLORS[status] || 'info'
}

// ==================== 审批状态映射 ====================
export const APPROVAL_STATUS = {
  draft: '草稿',
  pending: '待审批',
  approved: '已审批',
  rejected: '已拒绝',
  cancelled: '已取消'
}

// 审批状态颜色映射
export const APPROVAL_STATUS_COLORS = {
  draft: 'info',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'info'
}

/**
 * 获取审批状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
export const getApprovalStatusText = (status) => {
  return APPROVAL_STATUS[status] || status
}

/**
 * 获取审批状态的颜色
 * @param {string} status - 状态
 * @returns {string} 颜色类型
 */
export const getApprovalStatusColor = (status) => {
  return APPROVAL_STATUS_COLORS[status] || 'info'
}

// ==================== 系统状态映射 ====================
export const SYSTEM_STATUS = {
  running: '运行正常',
  maintenance: '维护中',
  error: '异常',
  stopped: '已停止'
}

// 系统状态颜色映射
export const SYSTEM_STATUS_COLORS = {
  running: 'success',
  maintenance: 'warning',
  error: 'danger',
  stopped: 'info'
}

/**
 * 获取系统状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
export const getSystemStatusText = (status) => {
  return SYSTEM_STATUS[status] || status
}

/**
 * 获取系统状态的颜色
 * @param {string} status - 状态
 * @returns {string} 颜色类型
 */
export const getSystemStatusColor = (status) => {
  return SYSTEM_STATUS_COLORS[status] || 'info'
}

// ==================== 用户状态映射 ====================
export const USER_STATUS = {
  active: '正常',
  inactive: '禁用',
  disabled: '禁用',
  enabled: '启用',
  pending: '待激活',
  locked: '锁定',
  online: '在线',
  offline: '离线'
}

// 用户状态颜色映射
export const USER_STATUS_COLORS = {
  active: 'success',
  inactive: 'info',
  disabled: 'danger',
  enabled: 'success',
  pending: 'warning',
  locked: 'danger',
  online: 'success',
  offline: 'info'
}

/**
 * 获取用户状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
export const getUserStatusText = (status) => {
  return USER_STATUS[status] || status
}

/**
 * 获取用户状态的颜色
 * @param {string} status - 状态
 * @returns {string} 颜色类型
 */
export const getUserStatusColor = (status) => {
  return USER_STATUS_COLORS[status] || 'info'
}

// ==================== 导出默认对象 ====================
export default {
  INVENTORY_TRANSACTION_TYPES,
  INVENTORY_TRANSACTION_COLORS,
  INVENTORY_STATUS,
  INVENTORY_STATUS_COLORS,
  INBOUND_OUTBOUND_STATUS,
  INBOUND_OUTBOUND_STATUS_COLORS,
  TRANSFER_STATUS,
  TRANSFER_STATUS_COLORS,
  ORDER_STATUS,
  ORDER_STATUS_COLORS,
  PURCHASE_STATUS,
  PURCHASE_STATUS_COLORS,
  SALES_STATUS,
  SALES_STATUS_COLORS,
  SALES_QUOTATION_STATUS,
  SALES_QUOTATION_STATUS_COLORS,
  QUALITY_STATUS,
  QUALITY_STATUS_COLORS,
  QUALITY_INSPECTION_TYPES,
  PRODUCTION_STATUS,
  PRODUCTION_STATUS_COLORS,
  EQUIPMENT_STATUS,
  EQUIPMENT_STATUS_COLORS,
  COMMON_STATUS,
  COMMON_STATUS_COLORS,
  APPROVAL_STATUS,
  APPROVAL_STATUS_COLORS,
  SYSTEM_STATUS,
  SYSTEM_STATUS_COLORS,
  USER_STATUS,
  USER_STATUS_COLORS,

  // 工具函数
  getInventoryTransactionTypeText,
  getInventoryTransactionTypeColor,
  getTransferStatusText,
  getTransferStatusColor,
  getOrderStatusText,
  getOrderStatusColor,
  getSalesStatusText,
  getSalesStatusColor,
  getPurchaseStatusText,
  getPurchaseStatusColor,
  getApprovalStatusText,
  getApprovalStatusColor,
  getSystemStatusText,
  getSystemStatusColor,
  getUserStatusText,
  getUserStatusColor
}
