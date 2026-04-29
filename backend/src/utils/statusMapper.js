/**
 * statusMapper.js
 * @description 状态映射工具 - 处理API状态和数据库ENUM状态之间的转换
 * @date 2025-12-13
 * @version 1.0.0
 */

const businessConfig = require('../config/businessConfig');

/**
 * 生产任务状态映射（API <-> 数据库ENUM）
 *
 * 数据库ENUM统一使用下划线命名
 * API也统一使用下划线命名
 *
 * 注意：数据库中的状态值是：
 * 'pending', 'allocated', 'preparing', 'material_issuing',
 * 'material_partial_issued', 'material_issued', 'in_progress',
 * 'inspection', 'warehousing', 'completed', 'cancelled'
 */
const PRODUCTION_TASK_STATUS_MAPPING = {
  // API状态 -> 数据库ENUM状态
  apiToDb: {
    in_progress: 'in_progress', // API下划线 → 数据库下划线
    inProgress: 'in_progress', // API驼峰 → 数据库下划线（兼容旧代码）
    material_issued: 'material_issued', // API下划线 → 数据库下划线
    materialIssued: 'material_issued', // API驼峰 → 数据库下划线（兼容）
    material_partial_issued: 'material_partial_issued',
    materialPartialIssued: 'material_partial_issued', // 兼容驼峰
    material_issuing: 'material_issuing',
    materialIssuing: 'material_issuing', // 兼容驼峰
    pending: 'pending',
    allocated: 'allocated',
    preparing: 'preparing',
    paused: 'paused',
    inspection: 'inspection',
    warehousing: 'warehousing',
    completed: 'completed',
    cancelled: 'cancelled',
  },

  // 数据库ENUM状态 -> API状态
  dbToApi: {
    in_progress: 'in_progress', // 数据库下划线 → API下划线
    material_issued: 'material_issued', // 数据库下划线 → API下划线
    material_partial_issued: 'material_partial_issued',
    material_issuing: 'material_issuing',
    pending: 'pending',
    allocated: 'allocated',
    preparing: 'preparing',
    paused: 'paused',
    inspection: 'inspection',
    warehousing: 'warehousing',
    completed: 'completed',
    cancelled: 'cancelled',
  },
};

/**
 * 将API状态转换为数据库ENUM状态
 * @param {string} apiStatus - API状态
 * @param {string} entityType - 实体类型（productionTask, productionPlan等）
 * @returns {string} 数据库ENUM状态
 */
function apiStatusToDbStatus(apiStatus, entityType = 'productionTask') {
  if (!apiStatus) return apiStatus;

  // 目前只有生产任务需要特殊映射
  if (entityType === 'productionTask' || entityType === 'productionPlan') {
    return PRODUCTION_TASK_STATUS_MAPPING.apiToDb[apiStatus] || apiStatus;
  }

  return apiStatus;
}

/**
 * 将数据库ENUM状态转换为API状态
 * @param {string} dbStatus - 数据库ENUM状态
 * @param {string} entityType - 实体类型（productionTask, productionPlan等）
 * @returns {string} API状态
 */
function dbStatusToApiStatus(dbStatus, entityType = 'productionTask') {
  if (!dbStatus) return dbStatus;

  // 目前只有生产任务需要特殊映射
  if (entityType === 'productionTask' || entityType === 'productionPlan') {
    return PRODUCTION_TASK_STATUS_MAPPING.dbToApi[dbStatus] || dbStatus;
  }

  return dbStatus;
}

/**
 * 获取状态常量
 * @param {string} entityType - 实体类型
 * @returns {object} 状态常量对象
 */
function getStatusConstants(entityType) {
  const statusMap = {
    outbound: businessConfig.status.outbound,
    inbound: businessConfig.status.inbound,
    productionTask: businessConfig.status.productionTask,
    productionPlan: businessConfig.status.productionPlan,
    inspection: businessConfig.status.inspection,
    ncp: businessConfig.status.ncp,
    receipt: businessConfig.status.receipt,
    approval: businessConfig.status.approval,
    transfer: businessConfig.status.transfer,
  };

  return statusMap[entityType] || {};
}

/**
 * 验证状态是否有效
 * @param {string} status - 状态值
 * @param {string} entityType - 实体类型
 * @returns {boolean} 是否有效
 */
function isValidStatus(status, entityType) {
  const constants = getStatusConstants(entityType);
  const validStatuses = Object.values(constants);
  return validStatuses.includes(status);
}

/**
 * 获取状态的中文名称
 * @param {string} status - 状态值
 * @param {string} entityType - 实体类型
 * @returns {string} 中文名称
 */
function getStatusLabel(status, entityType) {
  const statusLabels = {
    draft: '草稿',
    pending: '待处理',
    confirmed: '已确认',
    approved: '已批准',
    rejected: '已拒绝',
    allocated: '已分配',
    preparing: '配料中',
    material_issuing: '发料中',
    material_partial_issued: '部分发料',
    material_issued: '已发料',
    in_progress: '生产中',
    inProgress: '生产中',
    paused: '已暂停',
    inspection: '待检验',
    warehousing: '入库中',
    completed: '已完成',
    cancelled: '已取消',
    partial_completed: '部分完成',
  };

  return statusLabels[status] || status;
}

/**
 * 成本核算方法映射
 */
const COSTING_METHOD_LABELS = {
  standard: '标准成本法',
  actual: '实际成本法',
  actual_combined: '实际综合成本法',
  weighted_average: '加权平均法',
  fifo: '先进先出法',
  lifo: '后进先出法',
  moving_average: '移动平均法',
};

/**
 * 获取成本核算方法的中文名称
 * @param {string} method - 成本核算方法代码
 * @returns {string} 中文名称
 */
function getCostingMethodLabel(method) {
  return COSTING_METHOD_LABELS[method] || method || '-';
}

/**
 * 交易类型/业务类型映射
 */
const TRANSACTION_TYPE_LABELS = {
  // 生产相关
  PRODUCTION: '生产完工',
  PRODUCTION_COMPLETE: '完工入库',
  PRODUCTION_MATERIAL: '领料投产',
  PRODUCTION_LABOR: '人工成本',
  PRODUCTION_OVERHEAD: '制造费用',
  // 库存相关
  INVENTORY_INBOUND: '入库',
  INVENTORY_OUTBOUND: '出库',
  INVENTORY_TRANSFER: '调拨',
  INVENTORY_ADJUSTMENT: '盘点调整',
  // 采购相关
  PURCHASE: '采购',
  PURCHASE_RETURN: '采购退货',
  // 销售相关
  SALES: '销售',
  SALES_RETURN: '销售退货',
  // 财务相关
  AP_INVOICE: '应付发票',
  AR_INVOICE: '应收发票',
  PAYMENT: '付款',
  RECEIPT: '收款',
};

/**
 * 获取交易类型的中文名称
 * @param {string} type - 交易类型代码
 * @returns {string} 中文名称
 */
function getTransactionTypeLabel(type) {
  return TRANSACTION_TYPE_LABELS[type] || type || '-';
}

module.exports = {
  PRODUCTION_TASK_STATUS_MAPPING,
  COSTING_METHOD_LABELS,
  TRANSACTION_TYPE_LABELS,
  apiStatusToDbStatus,
  dbStatusToApiStatus,
  getStatusConstants,
  isValidStatus,
  getStatusLabel,
  getCostingMethodLabel,
  getTransactionTypeLabel,
};
