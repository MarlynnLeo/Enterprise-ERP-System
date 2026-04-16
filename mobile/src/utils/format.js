/**
 * format.js
 * @description 通用的格式化工具函数，包括日期和金额转换
 * @date 2026-04-15
 */
import dayjs from 'dayjs'

/**
 * 格式化时间
 * @param {String|Date} date - 时间字符串或对象
 * @param {String} format - 格式模式，默认为 'YYYY-MM-DD HH:mm'
 * @returns {String} 格式化后的时间字符串
 */
export const formatDate = (date, format = 'YYYY-MM-DD HH:mm') => {
  if (!date) return '--'
  return dayjs(date).format(format)
}

/**
 * 格式化金额，保留两位小数
 * @param {Number|String} amount - 金额
 * @returns {String} 带有两位小数的字符串
 */
export const formatAmount = (amount) => {
  const num = Number(amount)
  if (isNaN(num)) return '0.00'
  return num.toFixed(2)
}

/**
 * 大额数字缩写转换 (支持w/k单位)
 * @param {Number|String} num - 原始数值
 */
export const formatUnit = (num) => {
  const value = Number(num)
  if (isNaN(value)) return '0'
  if (value >= 10000) {
    return (value / 10000).toFixed(1) + 'w'
  }
  return value.toString()
}
