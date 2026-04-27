/**
 * 格式化日期为 YYYY-MM-DD 格式
 * @param {string|Date} date - 需要格式化的日期字符串或日期对象
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(date) {
  if (!date) return '';
  
  // 如果是字符串并且包含T和Z (ISO格式如2025-01-09T16:00:00.000Z)
  // 直接提取前10个字符作为日期部分 (YYYY-MM-DD)
  if (typeof date === 'string' && date.includes('T')) {
    return date.split('T')[0];
  }
  
  const d = date instanceof Date ? date : new Date(date);
  
  // 检查日期是否有效
  if (isNaN(d.getTime())) return '';
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * 格式化日期和时间为 YYYY-MM-DD HH:MM:SS 格式
 * @param {string|Date} date - 需要格式化的日期字符串或日期对象
 * @returns {string} 格式化后的日期时间字符串
 */
export function formatDateTime(date) {
  if (!date) return '';
  
  // 如果是ISO格式字符串，确保正确处理
  if (typeof date === 'string' && date.includes('T') && date.includes('Z')) {
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
  }
  
  const d = date instanceof Date ? date : new Date(date);
  
  // 检查日期是否有效
  if (isNaN(d.getTime())) return '';
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 格式化金额为货币格式，默认为人民币
 * @param {number} amount - 金额数值
 * @param {string} currency - 货币符号，默认为￥
 * @param {number} decimals - 小数位数，默认为2
 * @returns {string} 格式化后的金额字符串
 */
export function formatCurrency(amount, currency = '￥', decimals = 2) {
  if (amount === null || amount === undefined || isNaN(amount)) return '';
  const num = Number(amount);
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1e8) return `${currency}${sign}${(abs / 1e8).toFixed(decimals)}亿`;
  if (abs >= 1e4) return `${currency}${sign}${(abs / 1e4).toFixed(decimals)}万`;
  return `${currency}${num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
} 