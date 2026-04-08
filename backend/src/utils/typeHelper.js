/**
 * typeHelper.js
 * @description 类型安全转换工具函数（避免 undefined/NaN 渗透到 SQL 参数）
 * @date 2026-04-08
 */

/**
 * 安全转换为字符串，避免 undefined 值
 * @param {*} value 任意值
 * @returns {string} 安全的字符串值
 */
function safeString(value) {
  return value === undefined ? '' : String(value || '');
}

/**
 * 安全转换为数字，避免 undefined/NaN 值
 * @param {*} value 任意值
 * @returns {number|null} 安全的数字值或 null
 */
function safeNumber(value) {
  if (value === undefined || value === null) return null;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

module.exports = { safeString, safeNumber };
