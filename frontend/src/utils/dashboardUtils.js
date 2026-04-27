/**
 * 数据概览仪表盘公共工具函数
 */

import { ElMessage } from 'element-plus';

/**
 * 统一的错误处理函数
 * @param {Error} error - 错误对象
 * @param {string} moduleName - 模块名称
 * @param {Object} fallbackData - 降级数据
 * @param {boolean} showMessage - 是否显示错误消息
 * @returns {Object} 降级数据
 */
export function handleDashboardError(error, moduleName, fallbackData = {}, showMessage = true) {
  console.error(`${moduleName}数据加载失败:`, error);
  
  if (showMessage) {
    if (error.response?.status === 401) {
      ElMessage.error('登录已过期，请重新登录');
    } else if (error.response?.status >= 500) {
      ElMessage.error(`${moduleName}服务暂时不可用，请稍后重试`);
    } else if (error.code === 'NETWORK_ERROR') {
      ElMessage.error('网络连接失败，请检查网络设置');
    } else {
      ElMessage.warning(`${moduleName}数据加载失败，显示默认数据`);
    }
  }
  
  return fallbackData;
}

/**
 * 格式化货币显示
 * @param {number|string} value - 数值
 * @param {string} currency - 货币符号
 * @returns {string} 格式化后的货币字符串
 */
export function formatCurrency(value, currency = '¥') {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return `${currency}0.00`;
  }
  const numValue = Number(value);
  const abs = Math.abs(numValue);
  const sign = numValue < 0 ? '-' : '';
  if (abs >= 1e8) return `${currency}${sign}${(abs / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${currency}${sign}${(abs / 1e4).toFixed(2)}万`;
  return currency + numValue.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * 格式化百分比
 * @param {number} value - 数值
 * @param {number} decimals - 小数位数
 * @returns {string} 格式化后的百分比字符串
 */
export function formatPercentage(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return '0%';
  }
  return Number(value).toFixed(decimals) + '%';
}

/**
 * 格式化数量
 * @param {number} value - 数值
 * @param {string} unit - 单位
 * @returns {string} 格式化后的数量字符串
 */
export function formatQuantity(value, unit = '') {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return `0${unit}`;
  }
  const numValue = Number(value);
  return numValue.toLocaleString('zh-CN') + unit;
}

/**
 * 获取本月开始日期
 * @returns {string} YYYY-MM-DD格式的日期字符串
 */
export function getMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
}

/**
 * 获取本月结束日期
 * @returns {string} YYYY-MM-DD格式的日期字符串
 */
export function getMonthEnd() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
}

/**
 * 获取指定月份前的日期
 * @param {number} months - 月份数
 * @returns {string} YYYY-MM-DD格式的日期字符串
 */
export function getDateBefore(months) {
  const now = new Date();
  now.setMonth(now.getMonth() - months);
  return now.toISOString().split('T')[0];
}

/**
 * 生成月份标签数组
 * @param {number} count - 月份数量
 * @returns {Array} 月份标签数组
 */
export function generateMonthLabels(count = 12) {
  const months = ['一月', '二月', '三月', '四月', '五月', '六月', 
                  '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const currentMonth = new Date().getMonth();
  const labels = [];
  
  for (let i = count - 1; i >= 0; i--) {
    const monthIndex = (currentMonth - i + 12) % 12;
    labels.push(months[monthIndex]);
  }
  
  return labels;
}

/**
 * 安全的数据提取函数
 * @param {Object} data - 数据对象
 * @param {string} path - 数据路径，如 'user.profile.name'
 * @param {*} defaultValue - 默认值
 * @returns {*} 提取的数据或默认值
 */
export function safeGet(data, path, defaultValue = null) {
  try {
    const keys = path.split('.');
    let result = data;
    
    for (const key of keys) {
      if (result === null || result === undefined) {
        return defaultValue;
      }
      result = result[key];
    }
    
    return result !== undefined ? result : defaultValue;
  } catch (error) {
    return defaultValue;
  }
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(func, delay) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return func.apply(this, args);
    }
  };
}

/**
 * 创建重试机制的API调用
 * @param {Function} apiCall - API调用函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} delay - 重试延迟（毫秒）
 * @returns {Promise} API调用结果
 */
export async function retryApiCall(apiCall, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await apiCall();
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      
      // 如果是网络错误或服务器错误，进行重试
      if (error.code === 'NETWORK_ERROR' || 
          (error.response && error.response.status >= 500)) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        continue;
      }
      
      // 其他错误直接抛出
      throw error;
    }
  }
}

/**
 * 批量API调用，支持并发控制
 * @param {Array} apiCalls - API调用函数数组
 * @param {number} concurrency - 并发数量
 * @returns {Promise<Array>} 所有API调用结果
 */
export async function batchApiCall(apiCalls, concurrency = 3) {
  const results = [];
  const executing = [];
  
  for (const apiCall of apiCalls) {
    const promise = apiCall().then(result => {
      executing.splice(executing.indexOf(promise), 1);
      return result;
    });
    
    results.push(promise);
    executing.push(promise);
    
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }
  
  return Promise.allSettled(results);
}

/**
 * 数据验证函数
 * @param {*} data - 要验证的数据
 * @param {Object} schema - 验证模式
 * @returns {boolean} 验证结果
 */
export function validateData(data, schema) {
  if (!data || typeof data !== 'object') {
    return false;
  }
  
  for (const [key, validator] of Object.entries(schema)) {
    const value = data[key];
    
    if (validator.required && (value === undefined || value === null)) {
      return false;
    }
    
    if (value !== undefined && validator.type && typeof value !== validator.type) {
      return false;
    }
    
    if (validator.min !== undefined && value < validator.min) {
      return false;
    }
    
    if (validator.max !== undefined && value > validator.max) {
      return false;
    }
  }
  
  return true;
}

/**
 * 生成默认的统计数据
 * @param {string} type - 数据类型
 * @returns {Object} 默认统计数据
 */
export function getDefaultStatistics(type) {
  const defaults = {
    production: {
      plans: { total: 0, pending: 0 },
      tasks: { total: 0, inProgress: 0 },
      processes: { completed: 0, rate: '0%' },
      reports: { total: 0, today: 0 }
    },
    inventory: {
      totalStock: 0,
      totalValue: 0,
      inbound: { count: 0, items: 0 },
      outbound: { count: 0, items: 0 },
      alerts: { low: 0, overstock: 0 }
    },
    sales: {
      orders: { total: 0, pending: 0 },
      currentMonth: { amount: 0, count: 0 },
      returns: { total: 0, amount: 0 },
      receivables: { collected: 0, pending: 0 }
    },
    finance: {
      currentMonth: { income: 0, expense: 0, count: 0, expenseCount: 0 },
      receivables: { total: 0, overdue: 0 },
      payables: { total: 0, due: 0 }
    },
    quality: {
      incoming: { total: 0, passRate: '0%' },
      process: { total: 0, passRate: '0%' },
      final: { total: 0, passRate: '0%' },
      defects: { total: 0, types: 0 }
    },
    purchase: {
      requisitions: { total: 0, pending: 0 },
      orders: { total: 0, pending: 0 },
      receipts: { total: 0, pending: 0 },
      returns: { total: 0, pending: 0 }
    }
  };
  
  return defaults[type] || {};
}
