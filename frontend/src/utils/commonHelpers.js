/**
 * 公共工具函数库
 * @description 提供日期格式化、状态映射、数字格式化等通用功能
 * @author ERP开发团队
 * @date 2025-01-27
 */

/**
 * 日期格式化工具
 * 注意: 推荐使用 @/utils/helpers/dateUtils 中的函数
 * 这里保留是为了向后兼容
 */
import * as dateUtils from './helpers/dateUtils';
import { useFinanceStore } from '@/stores/finance';

let financeStore = null;
const getFinanceStore = () => {
  if (!financeStore) {
    try {
      financeStore = useFinanceStore();
    } catch {
      // Pinia might not be ready
    }
  }
  return financeStore;
};

export const DateFormatter = {
  /**
   * 格式化为日期字符串 (YYYY-MM-DD)
   * @param {String|Date} date - 日期
   * @returns {String} 格式化后的日期字符串
   */
  toDate(date) {
    return dateUtils.formatDate(date) || '';
  },

  /**
   * 格式化为日期时间字符串 (YYYY-MM-DD HH:mm:ss)
   * @param {String|Date} date - 日期时间
   * @returns {String} 格式化后的日期时间字符串
   */
  toDateTime(date) {
    return dateUtils.formatDateTime(date) || '';
  },

  /**
   * 格式化为时间字符串 (HH:mm:ss)
   * @param {String|Date} date - 日期时间
   * @returns {String} 格式化后的时间字符串
   */
  toTime(date) {
    return dateUtils.formatTime(date) || '';
  },

  /**
   * 相对时间格式化 (如: 1小时前)
   * @param {String|Date} date - 日期时间
   * @returns {String} 相对时间描述
   */
  toRelative(date) {
    return dateUtils.formatRelativeTime(date) || '';
  }
};

/**
 * 状态映射工具
 */
export const StatusMapper = {
  // 状态文本映射
  statusTexts: {
    // 订单状态
    order: {
      pending: '待审核',
      approved: '已审核',
      in_production: '生产中',
      partial_shipped: '部分发货',
      shipped: '已发货',
      completed: '已完成',
      cancelled: '已取消'
    },
    // 采购状态
    purchase: {
      draft: '草稿',
      pending: '待审核',
      approved: '已审核',
      partial_received: '部分收货',
      received: '已收货',
      completed: '已完成',
      cancelled: '已取消'
    },
    // 库存状态
    inventory: {
      in_stock: '在库',
      reserved: '已预留',
      out_of_stock: '缺货',
      on_order: '在途'
    },
    // 生产状态
    production: {
      planned: '已计划',
      in_progress: '进行中',
      completed: '已完成',
      cancelled: '已取消'
    },
    // 质检状态
    quality: {
      pending: '待检验',
      passed: '合格',
      failed: '不合格',
      partial: '部分合格'
    },
    // 通用状态
    common: {
      active: '启用',
      inactive: '停用',
      deleted: '已删除'
    }
  },

  // 状态类型映射（用于Element Plus的tag类型）
  statusTypes: {
    order: {
      pending: 'warning',
      approved: 'info',
      in_production: 'primary',
      partial_shipped: 'warning',
      shipped: 'success',
      completed: 'success',
      cancelled: 'danger'
    },
    purchase: {
      draft: 'info',
      pending: 'warning',
      approved: 'primary',
      partial_received: 'warning',
      received: 'success',
      completed: 'success',
      cancelled: 'danger'
    },
    inventory: {
      in_stock: 'success',
      reserved: 'warning',
      out_of_stock: 'danger',
      on_order: 'info'
    },
    production: {
      planned: 'info',
      in_progress: 'primary',
      completed: 'success',
      cancelled: 'danger'
    },
    quality: {
      pending: 'warning',
      passed: 'success',
      failed: 'danger',
      partial: 'warning'
    },
    common: {
      active: 'success',
      inactive: 'info',
      deleted: 'danger'
    }
  },

  /**
   * 获取状态文本
   * @param {String} category - 状态类别
   * @param {String} status - 状态值
   * @returns {String} 状态文本
   */
  getText(category, status) {
    if (!status) return '';
    const texts = this.statusTexts[category] || {};
    return texts[status] || status;
  },

  /**
   * 获取状态类型
   * @param {String} category - 状态类别
   * @param {String} status - 状态值
   * @returns {String} 状态类型
   */
  getType(category, status) {
    if (!status) return 'info';
    const types = this.statusTypes[category] || {};
    return types[status] || 'info';
  }
};

/**
 * 数字格式化工具
 */
export const NumberFormatter = {
  /**
   * 格式化为货币
   * @param {Number} value - 数值
   * @param {String} currency - 货币符号
   * @param {Number} decimals - 小数位数
   * @returns {String} 格式化后的货币字符串
   */
  toCurrency(value, currency, decimals = 2) {
    if (value === null || value === undefined || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';

    // 如果没有提供货币符号，尝试从 store 获取
    if (!currency) {
      const store = getFinanceStore();
      currency = store?.currencySymbol || '¥';
    }

    return `${currency}${num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  },

  /**
   * 格式化为百分比
   * @param {Number} value - 数值
   * @param {Number} decimals - 小数位数
   * @returns {String} 格式化后的百分比字符串
   */
  toPercent(value, decimals = 2) {
    if (value === null || value === undefined || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return `${(num * 100).toFixed(decimals)}%`;
  },

  /**
   * 格式化为千分位
   * @param {Number} value - 数值
   * @param {Number} decimals - 小数位数
   * @returns {String} 格式化后的数字字符串
   */
  toThousands(value, decimals = 2) {
    if (value === null || value === undefined || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },

  /**
   * 格式化文件大小 (保留用于向后兼容)
   * @param {Number} bytes - 字节数
   * @returns {String} 格式化后的文件大小
   */
  toFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  },

  /**
   * 数字转中文大写金额
   * @param {Number} n - 金额数值
   * @returns {String} 中文大写金额
   */
  digitUppercase(n) {
    const fraction = ['角', '分'];
    const digit = [
      '零', '壹', '贰', '叁', '肆',
      '伍', '陆', '柒', '捌', '玖'
    ];
    const unit = [
      ['元', '万', '亿'],
      ['', '拾', '佰', '仟']
    ];
    const head = n < 0 ? '欠' : '';
    n = Math.abs(n);
    let s = '';
    for (let i = 0; i < fraction.length; i++) {
      s += (digit[Math.floor(n * 10 * Math.pow(10, i)) % 10] + fraction[i]).replace(/零./, '');
    }
    s = s || '整';
    n = Math.floor(n);
    for (let i = 0; i < unit[0].length && n > 0; i++) {
      let p = '';
      for (let j = 0; j < unit[1].length && n > 0; j++) {
        p = digit[n % 10] + unit[1][j] + p;
        n = Math.floor(n / 10);
      }
      s = p.replace(/(零.)*零$/, '').replace(/^$/, '零') + unit[0][i] + s;
    }
    return head + s.replace(/(零.)*零元/, '元')
      .replace(/(零.)+/g, '零')
      .replace(/^整$/, '零元整');
  }
};

/**
 * 数据处理工具
 */
export const DataHelper = {
  /**
   * 深拷贝 (保留用于向后兼容)
   * @param {*} obj - 要拷贝的对象
   * @returns {*} 拷贝后的对象
   */
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));

    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = this.deepClone(obj[key]);
      }
    }
    return clonedObj;
  },

  /**
   * 过滤空值
   * @param {Object} obj - 要过滤的对象
   * @returns {Object} 过滤后的对象
   */
  filterEmpty(obj) {
    const result = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (value !== null && value !== undefined && value !== '') {
          result[key] = value;
        }
      }
    }
    return result;
  },

  /**
   * 数组去重
   * @param {Array} arr - 要去重的数组
   * @param {String} key - 用于去重的键（可选）
   * @returns {Array} 去重后的数组
   */
  unique(arr, key = null) {
    if (!Array.isArray(arr)) return [];
    if (key) {
      const seen = new Set();
      return arr.filter(item => {
        const k = item[key];
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    return [...new Set(arr)];
  }
};

/**
 * 文件处理工具
 */
export const FileHelper = {
  /**
   * 下载文件
   * @param {String} url - 文件URL
   * @param {String} filename - 文件名
   */
  download(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  /**
   * 导出Blob为文件
   * @param {Blob} blob - Blob对象
   * @param {String} filename - 文件名
   */
  exportBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    this.download(url, filename);
    URL.revokeObjectURL(url);
  },

  /**
   * 导出JSON为文件
   * @param {Object} data - 数据对象
   * @param {String} filename - 文件名
   */
  exportJSON(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    this.exportBlob(blob, filename);
  }
};

/**
 * 采购订单工具
 */
export const PurchaseHelper = {
  /**
   * 格式化订单数据 - 统一字段映射逻辑
   * @param {Object} data - 原始数据
   * @returns {Object} 格式化后的数据
   */
  formatOrderData(data) {
    if (!data) return {};

    return {
      // 基本字段映射
      material_code: data.material_code || data.materialCode || data.code || '-',
      material_name: data.material_name || data.materialName || data.name || '-',
      specification: data.specification || data.specs || '-',
      unit_name: data.unit_name || data.unit || data.unitName || '-',

      // 数量相关字段
      quantity: parseFloat(data.quantity) || 0,
      received_quantity: parseFloat(data.received_quantity) || 0,
      warehoused_quantity: parseFloat(data.warehoused_quantity) || 0,

      // 价格相关字段
      price: parseFloat(data.price) || parseFloat(data.unit_price) || 0,
      total: parseFloat(data.total) || parseFloat(data.total_price) || parseFloat(data.amount) || 0,

      // 其他字段保持原样
      ...data
    };
  },

  /**
   * 批量格式化订单数据
   * @param {Array} dataList - 数据数组
   * @returns {Array} 格式化后的数据数组
   */
  formatOrderDataList(dataList) {
    if (!Array.isArray(dataList)) return [];
    return dataList.map(this.formatOrderData);
  },

  /**
   * 计算倒计时天数
   * @param {string} targetDate - 目标日期
   * @returns {number} 剩余天数（负数表示已过期）
   */
  calculateCountdown(targetDate) {
    if (!targetDate) return 0;

    const target = new Date(targetDate);
    const now = new Date();
    const diffTime = target - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  },

  /**
   * 获取倒计时显示文本和样式
   * @param {string} targetDate - 目标日期
   * @returns {Object} { text, type, color }
   */
  getCountdownDisplay(targetDate) {
    const days = this.calculateCountdown(targetDate);

    if (days < 0) {
      return {
        text: `已逾期${Math.abs(days)}天`,
        type: 'danger',
        color: '#F56C6C'
      };
    } else if (days === 0) {
      return {
        text: '今天到期',
        type: 'warning',
        color: '#E6A23C'
      };
    } else if (days <= 3) {
      return {
        text: `${days}天后到期`,
        type: 'warning',
        color: '#E6A23C'
      };
    } else if (days <= 7) {
      return {
        text: `${days}天后到期`,
        type: 'primary',
        color: '#409EFF'
      };
    } else {
      return {
        text: `${days}天后到期`,
        type: 'success',
        color: '#67C23A'
      };
    }
  },

  /**
   * 验证订单表单
   * @param {Object} form - 表单数据
   * @returns {Object} { valid, errors }
   */
  validateOrderForm(form) {
    const errors = [];

    // 基本字段验证
    if (!form.order_date) {
      errors.push('请选择订单日期');
    }

    if (!form.expected_delivery_date) {
      errors.push('请选择预计到货日期');
    }

    if (!form.supplier_id) {
      errors.push('请选择供应商');
    }

    // 物料项目验证
    if (!form.items || form.items.length === 0) {
      errors.push('至少添加一个物料');
    } else {
      form.items.forEach((item, index) => {
        if (!item.material_id) {
          errors.push(`第${index + 1}个物料：请选择物料`);
        }
        if (!item.quantity || item.quantity <= 0) {
          errors.push(`第${index + 1}个物料：数量必须大于0`);
        }
        if (!item.price || item.price < 0) {
          errors.push(`第${index + 1}个物料：单价不能为负数`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * 计算订单总金额
   * @param {Array} items - 物料项目数组
   * @returns {number} 总金额
   */
  calculateOrderTotal(items) {
    if (!Array.isArray(items)) return 0;

    return items.reduce((total, item) => {
      const quantity = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.price) || parseFloat(item.unit_price) || 0;
      return total + (quantity * price);
    }, 0);
  }
};

/**
 * 通用工具函数
 */
export const CommonUtils = {
  /**
   * 防抖函数
   * @param {Function} func - 要防抖的函数
   * @param {number} delay - 延迟时间（毫秒）
   * @returns {Function} 防抖后的函数
   */
  debounce(func, delay = 300) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  },

  /**
   * 节流函数
   * @param {Function} func - 要节流的函数
   * @param {number} delay - 延迟时间（毫秒）
   * @returns {Function} 节流后的函数
   */
  throttle(func, delay = 300) {
    let lastTime = 0;
    return function (...args) {
      const now = Date.now();
      if (now - lastTime >= delay) {
        lastTime = now;
        func.apply(this, args);
      }
    };
  },

  /**
   * 生成唯一ID
   * @param {string} prefix - 前缀
   * @returns {string} 唯一ID
   */
  generateId(prefix = 'id') {
    const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${performance.now()}`;
    return `${prefix}_${suffix}`;
  }
};

/**
 * 报表工具函数
 * 提供财务报表通用功能
 */
export const ReportHelper = {
  /**
   * 金额单位选项
   */
  unitOptions: [
    { label: '元', value: 1 },
    { label: '千元', value: 1000 },
    { label: '万元', value: 10000 }
  ],

  /**
   * 获取单位显示文本
   * @param {number} unit - 金额单位值 (1=元, 1000=千元, 10000=万元)
   * @returns {string} 单位文本
   */
  getUnitText(unit) {
    switch (unit) {
      case 1: return '元';
      case 1000: return '千元';
      case 10000: return '万元';
      default: return '元';
    }
  },

  /**
   * 格式化报表金额
   * @param {number} amount - 金额
   * @param {number} decimals - 小数位数
   * @param {boolean} showSign - 是否显示正负号
   * @returns {string} 格式化后的金额字符串
   */
  formatReportAmount(amount, decimals = 2, showSign = false) {
    if (amount === null || amount === undefined) return '-';
    const num = parseFloat(amount);
    if (isNaN(num)) return '-';

    const formatted = num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (showSign && num > 0) {
      return '+' + formatted;
    }
    return formatted;
  },

  /**
   * 获取金额变动的CSS类
   * @param {number} amount - 金额
   * @returns {string} CSS类名
   */
  getAmountClass(amount) {
    if (amount === null || amount === undefined) return '';
    const num = parseFloat(amount);
    if (num > 0) return 'amount-positive';
    if (num < 0) return 'amount-negative';
    return '';
  },

  /**
   * 计算变动率
   * @param {number} current - 当前值
   * @param {number} compare - 对比值
   * @returns {string} 变动率百分比字符串
   */
  calculateChangeRate(current, compare) {
    if (!compare || compare === 0) return '-';
    const change = ((current - compare) / Math.abs(compare)) * 100;
    return change.toFixed(2) + '%';
  },

  /**
   * 格式化日期范围
   * @param {string} startDate - 开始日期
   * @param {string} endDate - 结束日期
   * @returns {string} 格式化的日期范围
   */
  formatDateRange(startDate, endDate) {
    const formatDate = (d) => {
      if (!d) return '';
      const date = new Date(d);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    return `${formatDate(startDate)} 至 ${formatDate(endDate)}`;
  }
};

// 导出独立函数（向后兼容 purchaseUtils.js）
export const formatOrderData = PurchaseHelper.formatOrderData.bind(PurchaseHelper);
export const formatOrderDataList = PurchaseHelper.formatOrderDataList.bind(PurchaseHelper);
export const calculateCountdown = PurchaseHelper.calculateCountdown.bind(PurchaseHelper);
export const getCountdownDisplay = PurchaseHelper.getCountdownDisplay.bind(PurchaseHelper);
export const validateOrderForm = PurchaseHelper.validateOrderForm.bind(PurchaseHelper);
export const calculateOrderTotal = PurchaseHelper.calculateOrderTotal.bind(PurchaseHelper);
export const debounce = CommonUtils.debounce.bind(CommonUtils);
export const throttle = CommonUtils.throttle.bind(CommonUtils);
export const generateId = CommonUtils.generateId.bind(CommonUtils);

// 统一的API错误处理（需要 ElMessage）
let ElMessage = null;
try {
  const elementPlus = require('element-plus');
  ElMessage = elementPlus.ElMessage;
} catch {
  // Element Plus 未加载时的降级处理
}

export const handleApiError = (error, operation = '操作', showMessage = true) => {
  console.error(`${operation}失败:`, error);

  if (showMessage && ElMessage) {
    const message = error.response?.data?.message || error.message || `${operation}失败`;
    ElMessage.error(message);
  }

  return {
    success: false,
    error: error.message || `${operation}失败`,
    details: error.response?.data
  };
};

export default {
  DateFormatter,
  StatusMapper,
  NumberFormatter,
  DataHelper,
  FileHelper,
  PurchaseHelper,
  CommonUtils,
  ReportHelper,
  // 导出独立函数
  formatOrderData,
  formatOrderDataList,
  calculateCountdown,
  getCountdownDisplay,
  validateOrderForm,
  calculateOrderTotal,
  handleApiError,
  debounce,
  throttle,
  generateId
};

