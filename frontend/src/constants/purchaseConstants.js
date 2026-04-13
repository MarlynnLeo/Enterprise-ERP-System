/**
 * purchaseConstants.js
 * @description 采购模块常量定义
 * @date 2025-11-12
 */

/**
 * 采购订单业务常量
 */
/** 默认交期天数（新建订单时自动填入的预计到货日偏移量） */
export const DEFAULT_DELIVERY_DAYS = 21

/** 默认增值税率（兜底值，优先使用 finance store 中的配置） */
export const DEFAULT_VAT_RATE = 0.13

/** 采购订单打印模板ID（后台 print_templates 表中的主键） */
export const PURCHASE_ORDER_PRINT_TEMPLATE_ID = 8

/**
 * 采购订单状态枚举
 */
export const PURCHASE_STATUS = {
  DRAFT: 'draft',                      // 草稿
  PENDING: 'pending',                  // 待处理
  APPROVED: 'approved',                // 已批准
  RECEIVED: 'received',                // 已收货
  INSPECTING: 'inspecting',            // 检验中
  INSPECTED: 'inspected',              // 检验完成
  WAREHOUSING: 'warehousing',          // 入库中
  PARTIAL_RECEIVED: 'partial_received', // 部分收货
  COMPLETED: 'completed',              // 已完成
  CANCELLED: 'cancelled'               // 已取消
};

/**
 * 采购订单状态标签
 */
export const PURCHASE_STATUS_LABELS = {
  [PURCHASE_STATUS.DRAFT]: '草稿',
  [PURCHASE_STATUS.PENDING]: '待处理',
  [PURCHASE_STATUS.APPROVED]: '已批准',
  [PURCHASE_STATUS.RECEIVED]: '已收货',
  [PURCHASE_STATUS.INSPECTING]: '检验中',
  [PURCHASE_STATUS.INSPECTED]: '检验完成',
  [PURCHASE_STATUS.WAREHOUSING]: '入库中',
  [PURCHASE_STATUS.PARTIAL_RECEIVED]: '部分收货',
  [PURCHASE_STATUS.COMPLETED]: '已完成',
  [PURCHASE_STATUS.CANCELLED]: '已取消'
};

/**
 * 采购订单状态选项 (用于下拉框)
 */
export const PURCHASE_STATUS_OPTIONS = Object.keys(PURCHASE_STATUS).map(key => ({
  value: PURCHASE_STATUS[key],
  label: PURCHASE_STATUS_LABELS[PURCHASE_STATUS[key]]
}));

/**
 * 采购订单状态流转规则
 * 定义每个状态可以转换到哪些状态
 */
export const PURCHASE_STATUS_TRANSITIONS = {
  [PURCHASE_STATUS.DRAFT]: [PURCHASE_STATUS.PENDING, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.PENDING]: [PURCHASE_STATUS.APPROVED, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.APPROVED]: [PURCHASE_STATUS.RECEIVED, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.RECEIVED]: [PURCHASE_STATUS.INSPECTING, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.INSPECTING]: [PURCHASE_STATUS.INSPECTED, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.INSPECTED]: [PURCHASE_STATUS.WAREHOUSING, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.WAREHOUSING]: [PURCHASE_STATUS.COMPLETED, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.PARTIAL_RECEIVED]: [PURCHASE_STATUS.RECEIVED, PURCHASE_STATUS.COMPLETED, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.COMPLETED]: [],
  [PURCHASE_STATUS.CANCELLED]: []
};

/**
 * 采购订单状态操作文本映射
 */
export const PURCHASE_STATUS_ACTION_TEXT = {
  [PURCHASE_STATUS.DRAFT]: '设为草稿',
  [PURCHASE_STATUS.PENDING]: '设为待处理',
  [PURCHASE_STATUS.APPROVED]: '批准',
  [PURCHASE_STATUS.RECEIVED]: '设为已收货',
  [PURCHASE_STATUS.INSPECTING]: '设为检验中',
  [PURCHASE_STATUS.INSPECTED]: '设为检验完成',
  [PURCHASE_STATUS.WAREHOUSING]: '设为入库中',
  [PURCHASE_STATUS.COMPLETED]: '完成',
  [PURCHASE_STATUS.CANCELLED]: '取消'
};

/**
 * 检查状态转换是否有效
 * @param {string} currentStatus - 当前状态
 * @param {string} newStatus - 新状态
 * @returns {boolean} 是否允许转换
 */
export const isValidStatusTransition = (currentStatus, newStatus) => {
  const allowedTransitions = PURCHASE_STATUS_TRANSITIONS[currentStatus];
  return allowedTransitions && allowedTransitions.includes(newStatus);
};

/**
 * 获取状态标签
 * @param {string} status - 状态值
 * @returns {string} 状态标签
 */
export const getStatusLabel = (status) => {
  return PURCHASE_STATUS_LABELS[status] || status;
};

/**
 * 获取状态操作文本
 * @param {string} status - 状态值
 * @returns {string} 操作文本
 */
export const getStatusActionText = (status) => {
  return PURCHASE_STATUS_ACTION_TEXT[status] || status;
};

/**
 * 获取允许的下一步状态
 * @param {string} currentStatus - 当前状态
 * @returns {Array} 允许的状态列表
 */
export const getAllowedNextStatuses = (currentStatus) => {
  return PURCHASE_STATUS_TRANSITIONS[currentStatus] || [];
};

/**
 * 采购申请状态
 */
export const REQUISITION_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  COMPLETED: 'completed'
};

/**
 * 采购申请状态标签
 */
export const REQUISITION_STATUS_LABELS = {
  [REQUISITION_STATUS.DRAFT]: '草稿',
  [REQUISITION_STATUS.SUBMITTED]: '已提交',
  [REQUISITION_STATUS.APPROVED]: '已批准',
  [REQUISITION_STATUS.REJECTED]: '已拒绝',
  [REQUISITION_STATUS.COMPLETED]: '已完成'
};

/**
 * 采购收货状态
 */
export const RECEIPT_STATUS = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

/**
 * 采购收货状态标签
 */
export const RECEIPT_STATUS_LABELS = {
  [RECEIPT_STATUS.DRAFT]: '草稿',
  [RECEIPT_STATUS.CONFIRMED]: '已确认',
  [RECEIPT_STATUS.COMPLETED]: '已完成',
  [RECEIPT_STATUS.CANCELLED]: '已取消'
};

