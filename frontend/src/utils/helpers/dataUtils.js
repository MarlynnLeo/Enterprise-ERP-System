/**
 * 数据处理工具函数
 */

/**
 * 确保值不是数组，如果是数组则返回第一个元素
 * @param {any} value - 要处理的值
 * @param {any} defaultValue - 默认值
 * @returns {any} 处理后的值
 */
export function ensureNotArray(value, defaultValue = null) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : defaultValue;
  }
  return value;
}

/**
 * 确保ID值是有效的数字
 * @param {any} value - 要处理的值
 * @param {number} defaultValue - 默认值
 * @returns {number|null} 处理后的ID值
 */
export function ensureValidId(value, defaultValue = null) {
  // 先确保不是数组
  const singleValue = ensureNotArray(value, defaultValue);
  
  // 转换为数字
  const numValue = Number(singleValue);
  
  // 检查是否为有效数字
  if (isNaN(numValue) || numValue <= 0) {
    return defaultValue;
  }
  
  return numValue;
}

/**
 * 安全地获取对象属性值
 * @param {Object} obj - 对象
 * @param {string} path - 属性路径，如 'user.profile.name'
 * @param {any} defaultValue - 默认值
 * @returns {any} 属性值
 */
export function safeGet(obj, path, defaultValue = null) {
  if (!obj || typeof obj !== 'object') {
    return defaultValue;
  }
  
  const keys = path.split('.');
  let result = obj;
  
  for (const key of keys) {
    if (result === null || result === undefined || typeof result !== 'object') {
      return defaultValue;
    }
    result = result[key];
  }
  
  return result !== undefined ? result : defaultValue;
}

/**
 * 格式化API响应数据
 * @param {Object} response - API响应
 * @returns {Object} 格式化后的数据
 */
export function formatApiResponse(response) {
  if (!response || !response.data) {
    return { items: [], total: 0 };
  }
  
  const data = response.data;
  
  // 处理不同的响应格式
  if (data.items && Array.isArray(data.items)) {
    // 新格式: { items: [], total: number }
    return {
      items: data.items,
      total: data.total || data.items.length
    };
  } else if (data.data && Array.isArray(data.data)) {
    // 旧格式: { data: [] }
    return {
      items: data.data,
      total: data.total || data.data.length
    };
  } else if (Array.isArray(data)) {
    // 直接数组格式
    return {
      items: data,
      total: data.length
    };
  }
  
  return { items: [], total: 0 };
}

/**
 * 清理表单数据，确保所有ID字段都是有效的
 * @param {Object} formData - 表单数据
 * @param {Array} idFields - ID字段名数组
 * @returns {Object} 清理后的表单数据
 */
export function cleanFormData(formData, idFields = []) {
  const cleaned = { ...formData };
  
  // 默认的ID字段
  const defaultIdFields = [
    'id', 'warehouse_id', 'supplier_id', 'customer_id', 'material_id', 
    'product_id', 'order_id', 'processing_id', 'unit_id', 'category_id'
  ];
  
  const allIdFields = [...new Set([...defaultIdFields, ...idFields])];
  
  // 清理ID字段
  allIdFields.forEach(field => {
    if (cleaned.hasOwnProperty(field)) {
      cleaned[field] = ensureValidId(cleaned[field]);
    }
  });
  
  return cleaned;
}

/**
 * 验证必填字段
 * @param {Object} data - 要验证的数据
 * @param {Array} requiredFields - 必填字段数组
 * @returns {Object} 验证结果 { valid: boolean, errors: string[] }
 */
export function validateRequiredFields(data, requiredFields) {
  const errors = [];
  
  requiredFields.forEach(field => {
    const value = safeGet(data, field);
    if (value === null || value === undefined || value === '') {
      errors.push(`${field} 是必填字段`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// 统一使用dateUtils.js中的日期格式化函数
import { formatDate as _formatDate } from './dateUtils'

/**
 * 格式化日期为 YYYY-MM-DD 格式
 * @param {Date|string} date - 日期
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(date) {
  if (!date) return '';
  const result = _formatDate(date);
  return result === '-' ? '' : result;
}

/**
 * 格式化金额，保留两位小数
 * @param {number|string} amount - 金额
 * @returns {number} 格式化后的金额
 */
export function formatAmount(amount) {
  const num = Number(amount);
  if (isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
}

/**
 * 生成唯一ID（简单版本）
 * @returns {string} 唯一ID
 */
export function generateId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}_${performance.now()}`;
}

/**
 * 深度克隆对象
 * @param {any} obj - 要克隆的对象
 * @returns {any} 克隆后的对象
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item));
  }
  
  const cloned = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  
  return cloned;
}
