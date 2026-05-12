/**
 * 数量相关的工具函数
 */

/**
 * 解析数量值，将各种格式的数量统一转换为数字类型
 * @param {*} value - 要解析的数量值，可以是数字、字符串或null/undefined
 * @returns {number|null} - 解析后的数字或null(如果无法解析)
 */
export const parseQuantity = (value) => {
  // 处理空值
  if (value === undefined || value === null || value === '') {
    return null;
  }

  // 处理0值
  if (value === 0 || value === '0') {
    return 0;
  }

  // 处理数字类型
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }

  // 处理字符串类型
  if (typeof value === 'string') {
    // 如果已经包含单位"件"
    if (value.includes('件')) {
      const parsed = parseFloat(value.replace(/[^0-9.]/g, ''));
      return isNaN(parsed) ? null : parsed;
    } else {
      // 处理可能包含千分位逗号的字符串
      const parsed = parseFloat(value.replace(/,/g, ''));
      return isNaN(parsed) ? null : parsed;
    }
  }

  return null;
};

/**
 * 格式化数量，将数字转换为带千分位的字符串（不带单位）
 * @param {*} value - 要格式化的数量值，可以是数字、字符串或null/undefined
 * @param {string} unit - 可选的单位，如果提供则附加到数字后面
 * @returns {string} - 格式化后的字符串，例如"1,000"或"1,000 件"
 */
export const formatQuantity = (value, unit = null) => {
  // 处理空值
  if (value === undefined || value === null || value === '') {
    return '';
  }

  // 解析数量
  const num = parseQuantity(value);
  if (num === null) {
    return '';
  }

  // 格式化数字 - 整数，无小数点
  const formatted = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num);

  // 如果提供了单位，则附加；否则只返回数字
  return unit ? `${formatted} ${unit}` : formatted;
};

/**
 * 从数组中根据ID查找相关项并获取其数量
 * @param {Array} items - 要搜索的数组
 * @param {number|string} id - 要查找的ID
 * @param {string} idField - ID字段名，默认为'id'
 * @param {string} quantityField - 数量字段名，默认为'quantity'
 * @returns {number|null} - 解析后的数量值或null
 */
export const getQuantityFromRelatedItem = (items, id, idField = 'id', quantityField = 'quantity') => {
  if (!id || !items || !Array.isArray(items) || items.length === 0) {
    return null;
  }

  // 使用字符串比较确保ID类型一致性
  const relatedItem = items.find(item => String(item[idField]) === String(id));
  if (!relatedItem) {
    return null;
  }

  return parseQuantity(relatedItem[quantityField]);
};

/**
 * 安全地比较两个数量，解决浮点数精度问题
 * @param {*} a - 第一个数量值
 * @param {*} b - 第二个数量值
 * @param {string} operator - 比较操作符，支持: '>', '<', '>=', '<=', '=='
 * @returns {boolean} - 比较结果
 */
export const compareQuantities = (a, b, operator = '>=') => {
  // 将输入转换为数字
  const numA = parseQuantity(a) || 0;
  const numB = parseQuantity(b) || 0;

  // 为了防止浮点数精度问题，将数字乘以100并取整
  // 这样可以在比较时处理最多两位小数的精度
  const preciseA = Math.round(numA * 100);
  const preciseB = Math.round(numB * 100);

  // 根据操作符执行比较
  switch (operator) {
    case '>': return preciseA > preciseB;
    case '<': return preciseA < preciseB;
    case '>=': return preciseA >= preciseB;
    case '<=': return preciseA <= preciseB;
    case '==': return preciseA === preciseB;
    default: return false;
  }
};