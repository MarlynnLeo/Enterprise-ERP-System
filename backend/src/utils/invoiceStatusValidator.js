/**
 * 发票状态转换规则验证器
 * 定义并验证发票状态转换的合法性
 */

/**
 * 发票状态转换规则
 * 定义了每个状态可以转换到哪些状态
 */
const STATUS_TRANSITION_RULES = {
  草稿: ['已确认', '已取消'],
  已确认: ['部分付款', '已付款', '逾期', '已取消'],
  部分付款: ['已付款', '逾期', '已取消'],
  已付款: [], // 已付款是终态,不能再转换
  逾期: ['部分付款', '已付款', '已取消'],
  已取消: [], // 已取消是终态,不能再转换
};

/**
 * 验证状态转换是否合法
 * @param {string} currentStatus - 当前状态
 * @param {string} newStatus - 新状态
 * @returns {Object} { valid: boolean, message: string }
 */
function validateStatusTransition(currentStatus, newStatus) {
  // 如果状态没有变化,允许
  if (currentStatus === newStatus) {
    return { valid: true, message: '状态未变化' };
  }

  // 检查当前状态是否存在
  if (!Object.prototype.hasOwnProperty.call(STATUS_TRANSITION_RULES, currentStatus)) {
    return {
      valid: false,
      message: `无效的当前状态: ${currentStatus}`,
    };
  }

  // 检查新状态是否存在
  if (!Object.prototype.hasOwnProperty.call(STATUS_TRANSITION_RULES, newStatus)) {
    return {
      valid: false,
      message: `无效的新状态: ${newStatus}`,
    };
  }

  // 检查是否允许转换
  const allowedTransitions = STATUS_TRANSITION_RULES[currentStatus];
  if (!allowedTransitions.includes(newStatus)) {
    return {
      valid: false,
      message: `不允许从 "${currentStatus}" 转换到 "${newStatus}"`,
    };
  }

  return { valid: true, message: '状态转换合法' };
}

/**
 * 获取状态可以转换到的所有状态
 * @param {string} currentStatus - 当前状态
 * @returns {Array<string>} 可转换的状态列表
 */
function getAllowedTransitions(currentStatus) {
  return STATUS_TRANSITION_RULES[currentStatus] || [];
}

/**
 * 检查状态是否为终态
 * @param {string} status - 状态
 * @returns {boolean} 是否为终态
 */
function isFinalStatus(status) {
  const allowedTransitions = STATUS_TRANSITION_RULES[status] || [];
  return allowedTransitions.length === 0;
}

/**
 * 获取所有有效状态
 * @returns {Array<string>} 所有有效状态列表
 */
function getAllValidStatuses() {
  return Object.keys(STATUS_TRANSITION_RULES);
}

/**
 * 验证状态值是否有效
 * @param {string} status - 状态值
 * @returns {boolean} 是否有效
 */
function isValidStatus(status) {
  return Object.prototype.hasOwnProperty.call(STATUS_TRANSITION_RULES, status);
}

/**
 * 获取状态转换流程图(Mermaid格式)
 * @returns {string} Mermaid流程图代码
 */
function getStatusFlowDiagram() {
  return `
graph LR
    草稿 --> 已确认
    草稿 --> 已取消
    已确认 --> 部分付款
    已确认 --> 已付款
    已确认 --> 逾期
    已确认 --> 已取消
    部分付款 --> 已付款
    部分付款 --> 逾期
    部分付款 --> 已取消
    逾期 --> 部分付款
    逾期 --> 已付款
    逾期 --> 已取消
    
    style 已付款 fill:#90EE90
    style 已取消 fill:#FFB6C1
    style 逾期 fill:#FFD700
  `.trim();
}

module.exports = {
  validateStatusTransition,
  getAllowedTransitions,
  isFinalStatus,
  getAllValidStatuses,
  isValidStatus,
  getStatusFlowDiagram,
  STATUS_TRANSITION_RULES,
};
