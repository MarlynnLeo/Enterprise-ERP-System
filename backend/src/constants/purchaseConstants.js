/**
 * purchaseConstants.js
 * @description 采购模块常量定义 (后端)
 * @date 2025-11-12
 */

/**
 * 采购订单状态枚举
 */
const PURCHASE_STATUS = {
  DRAFT: 'draft', // 草稿
  PENDING: 'pending', // 待处理
  CONFIRMED: 'confirmed', // 已确认（主管审批通过）
  APPROVED: 'approved', // 已批准（工作流审批通过）
  RECEIVED: 'received', // 已收货
  INSPECTING: 'inspecting', // 检验中
  INSPECTED: 'inspected', // 检验完成
  WAREHOUSING: 'warehousing', // 入库中
  PARTIAL_RECEIVED: 'partial_received', // 部分收货
  COMPLETED: 'completed', // 已完成
  CANCELLED: 'cancelled', // 已取消
};

/**
 * 采购订单状态标签
 */
const PURCHASE_STATUS_LABELS = {
  [PURCHASE_STATUS.DRAFT]: '草稿',
  [PURCHASE_STATUS.PENDING]: '待处理',
  [PURCHASE_STATUS.CONFIRMED]: '已确认',
  [PURCHASE_STATUS.APPROVED]: '已批准',
  [PURCHASE_STATUS.RECEIVED]: '已收货',
  [PURCHASE_STATUS.INSPECTING]: '检验中',
  [PURCHASE_STATUS.INSPECTED]: '检验完成',
  [PURCHASE_STATUS.WAREHOUSING]: '入库中',
  [PURCHASE_STATUS.PARTIAL_RECEIVED]: '部分收货',
  [PURCHASE_STATUS.COMPLETED]: '已完成',
  [PURCHASE_STATUS.CANCELLED]: '已取消',
};

/**
 * 采购订单状态流转规则
 * 定义每个状态可以转换到哪些状态
 *
 * 注意: 为了支持灵活的业务流程,允许跨状态跳转
 * 例如: received可以直接跳到completed(如果不需要检验)
 */
const PURCHASE_STATUS_TRANSITIONS = {
  [PURCHASE_STATUS.DRAFT]: [PURCHASE_STATUS.PENDING, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.PENDING]: [PURCHASE_STATUS.CONFIRMED, PURCHASE_STATUS.APPROVED, PURCHASE_STATUS.DRAFT, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.CONFIRMED]: [
    PURCHASE_STATUS.RECEIVED,
    PURCHASE_STATUS.PARTIAL_RECEIVED,
    PURCHASE_STATUS.COMPLETED,
    PURCHASE_STATUS.CANCELLED,
  ],
  [PURCHASE_STATUS.APPROVED]: [
    PURCHASE_STATUS.RECEIVED,
    PURCHASE_STATUS.PARTIAL_RECEIVED,
    PURCHASE_STATUS.CANCELLED,
  ],
  // ✅ 修复：允许 received -> partial_received (数据修正或退货场景)
  [PURCHASE_STATUS.RECEIVED]: [
    PURCHASE_STATUS.PARTIAL_RECEIVED,
    PURCHASE_STATUS.INSPECTING,
    PURCHASE_STATUS.COMPLETED,
    PURCHASE_STATUS.CANCELLED,
  ],
  [PURCHASE_STATUS.INSPECTING]: [
    PURCHASE_STATUS.INSPECTED,
    PURCHASE_STATUS.COMPLETED,
    PURCHASE_STATUS.CANCELLED,
  ], // ✅ 允许直接完成
  [PURCHASE_STATUS.INSPECTED]: [
    PURCHASE_STATUS.WAREHOUSING,
    PURCHASE_STATUS.COMPLETED,
    PURCHASE_STATUS.CANCELLED,
  ], // ✅ 允许直接完成
  [PURCHASE_STATUS.WAREHOUSING]: [PURCHASE_STATUS.COMPLETED, PURCHASE_STATUS.CANCELLED],
  [PURCHASE_STATUS.PARTIAL_RECEIVED]: [
    PURCHASE_STATUS.RECEIVED,
    PURCHASE_STATUS.INSPECTING,
    PURCHASE_STATUS.COMPLETED,
    PURCHASE_STATUS.CANCELLED,
  ],
  [PURCHASE_STATUS.COMPLETED]: [],
  [PURCHASE_STATUS.CANCELLED]: [],
};

/**
 * 检查状态转换是否有效
 * @param {string} currentStatus - 当前状态
 * @param {string} newStatus - 新状态
 * @returns {boolean} 是否允许转换
 */
const isValidStatusTransition = (currentStatus, newStatus) => {
  const allowedTransitions = PURCHASE_STATUS_TRANSITIONS[currentStatus];
  return allowedTransitions && allowedTransitions.includes(newStatus);
};

/**
 * 获取状态标签
 * @param {string} status - 状态值
 * @returns {string} 状态标签
 */
const getStatusLabel = (status) => {
  return PURCHASE_STATUS_LABELS[status] || status;
};

/**
 * 获取允许的下一步状态
 * @param {string} currentStatus - 当前状态
 * @returns {Array} 允许的状态列表
 */
const getAllowedNextStatuses = (currentStatus) => {
  return PURCHASE_STATUS_TRANSITIONS[currentStatus] || [];
};

/**
 * 采购申请状态
 */
const REQUISITION_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
};

/**
 * 采购收货状态
 */
const RECEIPT_STATUS = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

module.exports = {
  PURCHASE_STATUS,
  PURCHASE_STATUS_LABELS,
  PURCHASE_STATUS_TRANSITIONS,
  isValidStatusTransition,
  getStatusLabel,
  getAllowedNextStatuses,
  REQUISITION_STATUS,
  RECEIPT_STATUS,
};
