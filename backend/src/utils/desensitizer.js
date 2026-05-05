/**
 * desensitizer.js
 * @description 金额等敏感数据脱敏工具
 */

const { logger } = require('./logger');
const PermissionService = require('../services/PermissionService');

const SENSITIVE_FIELDS = [
  // 基础字段
  'price',
  'cost_price',
  'amount',
  'total_cost',
  'tax_rate',
  // 引申字段
  'unit_cost',
  'order_price',
  'material_cost',
  'labor_cost',
  'overhead_cost',
  'standard_price',
  'actual_cost',
  'standard_cost',
  'unitCost',
  'costPrice',
  'actualCost',
  'taxRate',
  'totalCost',
  'orderPrice'
];

/**
 * 遍历对象或数组，把匹配到的敏感字段设为 null
 * @param {any} data 要遍历的数据
 * @param {boolean} hasPermission 是否有权限
 */
function desensitizeData(data, hasPermission) {
  // 如果有财务权限，直接放行数据
  if (hasPermission) return data;
  if (!data) return data;

  if (Array.isArray(data)) {
    data.forEach(item => desensitizeData(item, hasPermission));
  } else if (typeof data === 'object') {
    Object.keys(data).forEach(key => {
      // 匹配关键字或者是数组/对象继续深入
      if (SENSITIVE_FIELDS.includes(key)) {
        data[key] = null;
      } else if (typeof data[key] === 'object') {
         desensitizeData(data[key], hasPermission);
      }
    });
  }
  return data;
}

/**
 * 权限判断：通过统一的 PermissionService 检查用户是否拥有财务数据查看权限
 * ✅ 修复: 移除硬编码的 username/roles 判断，统一走权限体系
 * @param {Object} user req.user对象 (JWT解码后仅含 id, username)
 * @returns {Promise<boolean>}
 */
async function hasFinancePermission(user) {
  if (!user || !user.id) return false;

  try {
    const permissions = await PermissionService.getUserPermissions(user.id);
    // 管理员拥有 * 通配符，自动通过
    if (permissions.includes('*')) return true;
    // 检查财务相关权限标识
    return permissions.some(p =>
      p === 'finance:view' ||
      p === 'finance:view_cost' ||
      p.startsWith('finance:')
    );
  } catch (error) {
    logger.error('[脱敏] 权限检查失败:', error.message);
    return false;
  }
}

module.exports = {
  desensitizeData,
  hasFinancePermission
};

