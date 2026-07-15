/**
 * 状态映射验证工具
 *
 * 用于验证系统中所有状态映射是否使用统一的常量文件
 *
 * @author 系统开发团队
 * @version 1.0.0
 * @since 2025-08-13
 */

const {
  INVENTORY_TRANSACTION_TYPES,
  INVENTORY_CHECK_STATUS,
  TRANSFER_STATUS,
  TRANSFER_STATUS_FLOW,
  ORDER_STATUS,
  PURCHASE_STATUS,
  SALES_STATUS,
  QUALITY_STATUS,
  PRODUCTION_STATUS,
  EQUIPMENT_STATUS,
  COMMON_STATUS,
  APPROVAL_STATUS,
  USER_STATUS,
  ASSET_STATUS,
  SYSTEM_STATUS,
} = require('../constants/systemConstants');

/**
 * 验证状态值是否在指定的状态映射中
 * @param {string} status - 要验证的状态值
 * @param {string} type - 状态类型
 * @returns {boolean} 是否有效
 */
const validateStatus = (status, type) => {
  const statusMaps = {
    inventory_transaction: INVENTORY_TRANSACTION_TYPES,
    inventory_check: INVENTORY_CHECK_STATUS,
    transfer: TRANSFER_STATUS,
    order: ORDER_STATUS,
    purchase: PURCHASE_STATUS,
    sales: SALES_STATUS,
    quality: QUALITY_STATUS,
    production: PRODUCTION_STATUS,
    equipment: EQUIPMENT_STATUS,
    common: COMMON_STATUS,
    approval: APPROVAL_STATUS,
    user: USER_STATUS,
    asset: ASSET_STATUS,
    system: SYSTEM_STATUS,
  };

  const statusMap = statusMaps[type];
  if (!statusMap) {
    throw new Error(`未知的状态类型: ${type}`);
  }

  return Object.keys(statusMap).includes(status);
};

/**
 * 获取指定类型的所有有效状态值
 * @param {string} type - 状态类型
 * @returns {Array} 有效状态值数组
 */
const getValidStatuses = (type) => {
  const statusMaps = {
    inventory_transaction: INVENTORY_TRANSACTION_TYPES,
    inventory_check: INVENTORY_CHECK_STATUS,
    transfer: TRANSFER_STATUS,
    order: ORDER_STATUS,
    purchase: PURCHASE_STATUS,
    sales: SALES_STATUS,
    quality: QUALITY_STATUS,
    production: PRODUCTION_STATUS,
    equipment: EQUIPMENT_STATUS,
    common: COMMON_STATUS,
    approval: APPROVAL_STATUS,
    user: USER_STATUS,
    asset: ASSET_STATUS,
    system: SYSTEM_STATUS,
  };

  const statusMap = statusMaps[type];
  if (!statusMap) {
    throw new Error(`未知的状态类型: ${type}`);
  }

  return Object.keys(statusMap);
};

/**
 * 验证状态转换是否合法
 * @param {string} fromStatus - 原状态
 * @param {string} toStatus - 目标状态
 * @param {string} type - 状态类型
 * @returns {boolean} 是否合法
 */
const validateStatusTransition = (fromStatus, toStatus, type) => {
  // 状态流转规则
  const transitionRules = {
    inventory_check: {
      draft: ['in_progress', 'cancelled'],
      in_progress: ['pending', 'cancelled'],
      pending: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    },
    // 与 systemConstants.TRANSFER_STATUS_FLOW / statusRegistry 对齐
    transfer: TRANSFER_STATUS_FLOW,
    order: {
      draft: ['pending', 'cancelled'],
      pending: ['confirmed', 'cancelled'],
      confirmed: ['in_production', 'cancelled'],
      in_production: ['ready_to_ship', 'cancelled'],
      ready_to_ship: ['shipped', 'cancelled'],
      shipped: ['delivered'],
      delivered: ['completed'],
      completed: [],
      cancelled: [],
    },
    purchase: {
      draft: ['pending', 'cancelled'],
      pending: ['submitted', 'cancelled'],
      submitted: ['approved', 'rejected'],
      approved: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['partial_received', 'completed', 'cancelled'],
      partial_received: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
      rejected: ['draft'],
    },
    sales: {
      draft: ['pending', 'cancelled'],
      pending: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['in_production', 'cancelled'],
      in_production: ['ready_to_ship', 'cancelled'],
      ready_to_ship: ['shipped', 'cancelled'],
      shipped: ['delivered'],
      delivered: ['completed'],
      completed: [],
      cancelled: [],
    },
    production: {
      draft: ['planned', 'cancelled'],
      planned: ['ready', 'cancelled'],
      ready: ['in_progress', 'cancelled'],
      in_progress: ['paused', 'completed', 'cancelled'],
      paused: ['in_progress', 'cancelled'],
      completed: [],
      cancelled: [],
    },
  };

  const rules = transitionRules[type];
  if (!rules || !rules[fromStatus]) {
    return false;
  }

  return rules[fromStatus].includes(toStatus);
};

/**
 * 批量验证状态值
 * @param {Array} statuses - 状态值数组，格式：[{status, type}, ...]
 * @returns {Object} 验证结果
 */
const batchValidateStatuses = (statuses) => {
  const results = {
    valid: [],
    invalid: [],
    summary: {
      total: statuses.length,
      validCount: 0,
      invalidCount: 0,
    },
  };

  statuses.forEach((item, index) => {
    try {
      const isValid = validateStatus(item.status, item.type);
      if (isValid) {
        results.valid.push({ index, ...item });
        results.summary.validCount++;
      } else {
        results.invalid.push({
          index,
          ...item,
          error: '状态值不在有效范围内',
        });
        results.summary.invalidCount++;
      }
    } catch (error) {
      results.invalid.push({
        index,
        ...item,
        error: error.message,
      });
      results.summary.invalidCount++;
    }
  });

  return results;
};

/**
 * 生成状态映射报告
 * @returns {Object} 状态映射报告
 */
const generateStatusMappingReport = () => {
  const report = {
    timestamp: new Date().toISOString(),
    statusTypes: {},
    summary: {
      totalTypes: 0,
      totalStatuses: 0,
    },
  };

  const statusMaps = {
    inventory_transaction: INVENTORY_TRANSACTION_TYPES,
    transfer: TRANSFER_STATUS,
    order: ORDER_STATUS,
    purchase: PURCHASE_STATUS,
    sales: SALES_STATUS,
    quality: QUALITY_STATUS,
    production: PRODUCTION_STATUS,
    equipment: EQUIPMENT_STATUS,
    common: COMMON_STATUS,
    approval: APPROVAL_STATUS,
    user: USER_STATUS,
    asset: ASSET_STATUS,
    system: SYSTEM_STATUS,
  };

  Object.entries(statusMaps).forEach(([type, statusMap]) => {
    const statuses = Object.entries(statusMap).map(([key, value]) => ({
      key,
      value,
    }));

    report.statusTypes[type] = {
      count: statuses.length,
      statuses,
    };

    report.summary.totalStatuses += statuses.length;
  });

  report.summary.totalTypes = Object.keys(statusMaps).length;

  return report;
};

module.exports = {
  validateStatus,
  getValidStatuses,
  validateStatusTransition,
  batchValidateStatuses,
  generateStatusMappingReport,
};
