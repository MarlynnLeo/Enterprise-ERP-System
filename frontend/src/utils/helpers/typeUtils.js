/**
 * 类型安全工具函数
 * 用于确保数据类型正确，避免Vue组件prop类型警告
 */

/**
 * 确保值为数字类型
 * @param {any} value - 要转换的值
 * @param {number} defaultValue - 默认值，默认为0
 * @returns {number} 数字类型的值
 */
export function ensureNumber(value, defaultValue = 0) {
  if (typeof value === 'number' && !isNaN(value)) {
    return value;
  }
  
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  
  return defaultValue;
}

/**
 * 确保值为整数类型
 * @param {any} value - 要转换的值
 * @param {number} defaultValue - 默认值，默认为0
 * @returns {number} 整数类型的值
 */
export function ensureInteger(value, defaultValue = 0) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  
  return defaultValue;
}

/**
 * 确保值为字符串类型
 * @param {any} value - 要转换的值
 * @param {string} defaultValue - 默认值，默认为空字符串
 * @returns {string} 字符串类型的值
 */
export function ensureString(value, defaultValue = '') {
  if (typeof value === 'string') {
    return value;
  }
  
  if (value === null || value === undefined) {
    return defaultValue;
  }
  
  return String(value);
}

/**
 * 确保值为数组类型
 * @param {any} value - 要转换的值
 * @param {Array} defaultValue - 默认值，默认为空数组
 * @returns {Array} 数组类型的值
 */
export function ensureArray(value, defaultValue = []) {
  if (Array.isArray(value)) {
    return value;
  }
  
  return defaultValue;
}

/**
 * 确保值为布尔类型
 * @param {any} value - 要转换的值
 * @param {boolean} defaultValue - 默认值，默认为false
 * @returns {boolean} 布尔类型的值
 */
export function ensureBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  
  if (typeof value === 'number') {
    return value !== 0;
  }
  
  return defaultValue;
}

/**
 * 安全的分页数据处理
 * @param {Object} response - API响应数据
 * @returns {Object} 标准化的分页数据
 */
export function normalizePaginationData(response) {
  const result = {
    items: [],
    total: 0,
    page: 1,
    pageSize: 10
  };
  
  if (!response) {
    return result;
  }
  
  const data = response.data !== undefined ? response.data : response;
  if (!data) {
    return result;
  }

  const pagination = data?.pagination || {};
  
  // 处理数据列表
  if (Array.isArray(data)) {
    result.items = data;
    result.total = data.length;
  } else if (data.items && Array.isArray(data.items)) {
    result.items = data.items;
    result.total = ensureInteger(data.total ?? pagination.total, data.items.length);
  } else if (data.list && Array.isArray(data.list)) {
    result.items = data.list;
    result.total = ensureInteger(data.total ?? pagination.total, data.list.length);
  } else if (data.data && Array.isArray(data.data)) {
    result.items = data.data;
    result.total = ensureInteger(data.total ?? pagination.total, data.data.length);
  }
  
  // 处理分页信息
  const page = data.page ?? data.current ?? pagination.page ?? pagination.current;
  if (page !== undefined) {
    result.page = ensureInteger(page, 1);
  }
  
  const pageSize = data.pageSize ?? data.limit ?? data.size ?? pagination.pageSize ?? pagination.limit;
  if (pageSize !== undefined) {
    result.pageSize = ensureInteger(pageSize, 10);
  }
  
  return result;
}

/**
 * Element Plus 分页组件安全属性
 * @param {Object} paginationData - 分页数据
 * @returns {Object} 类型安全的分页属性
 */
export function safePaginationProps(paginationData) {
  return {
    total: ensureInteger(paginationData.total, 0),
    pageSize: ensureInteger(paginationData.pageSize, 10),
    currentPage: ensureInteger(paginationData.currentPage || paginationData.page, 1)
  };
}
