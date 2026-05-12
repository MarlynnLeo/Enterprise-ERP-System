/**
 * 日期时间工具函数
 */

/**
 * 格式化日期时间
 * @param {string|Date} date - 日期
 * @param {string} format - 格式 (默认: 'YYYY-MM-DD HH:mm:ss')
 * @returns {string} 格式化后的日期字符串
 */
export function formatDateTime(date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!date) return '-'

  const d = new Date(date)
  if (isNaN(d.getTime())) return '-'

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
}

/**
 * 格式化日期
 * @param {string|Date} date - 日期
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(date) {
  return formatDateTime(date, 'YYYY-MM-DD')
}

/**
 * 格式化时间
 * @param {string|Date} date - 日期
 * @returns {string} 格式化后的时间字符串
 */
export function formatTime(date) {
  return formatDateTime(date, 'HH:mm:ss')
}

/**
 * 格式化相对时间
 * @param {string|Date} date - 日期
 * @returns {string} 相对时间字符串
 */
export function formatRelativeTime(date) {
  if (!date) return '-'

  const d = new Date(date)
  if (isNaN(d.getTime())) return '-'

  const now = new Date()
  const diff = now.getTime() - d.getTime()

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) {
    return '刚刚'
  } else if (minutes < 60) {
    return `${minutes}分钟前`
  } else if (hours < 24) {
    return `${hours}小时前`
  } else if (days < 7) {
    return `${days}天前`
  } else {
    return formatDate(date)
  }
}

/**
 * 获取时间范围
 * @param {string} range - 时间范围类型 ('today', 'yesterday', 'week', 'month')
 * @returns {object} 包含开始和结束时间的对象
 */
export function getTimeRange(range) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (range) {
    case 'today':
      return {
        start: today,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
      }

    case 'yesterday':
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
      return {
        start: yesterday,
        end: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1)
      }

    case 'week':
      const weekStart = new Date(today.getTime() - (today.getDay() || 7) * 24 * 60 * 60 * 1000)
      return {
        start: weekStart,
        end: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
      }

    case 'month':
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      return {
        start: monthStart,
        end: monthEnd
      }

    default:
      return {
        start: today,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
      }
  }
}

/**
 * 检查日期是否为今天
 * @param {string|Date} date - 日期
 * @returns {boolean} 是否为今天
 */
export function isToday(date) {
  if (!date) return false

  const d = new Date(date)
  if (isNaN(d.getTime())) return false

  const today = new Date()
  return d.getDate() === today.getDate() &&
         d.getMonth() === today.getMonth() &&
         d.getFullYear() === today.getFullYear()
}

/**
 * 计算两个日期之间的天数差
 * @param {string|Date} date1 - 第一个日期
 * @param {string|Date} date2 - 第二个日期
 * @returns {number} 天数差
 */
export function daysBetween(date1, date2) {
  const d1 = new Date(date1)
  const d2 = new Date(date2)

  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0

  const diffTime = Math.abs(d2.getTime() - d1.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * 添加天数到日期
 * @param {string|Date} date - 原始日期
 * @param {number} days - 要添加的天数
 * @returns {Date} 新日期
 */
export function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/**
 * 获取月份的第一天和最后一天
 * @param {number} year - 年份
 * @param {number} month - 月份 (0-11)
 * @returns {object} 包含第一天和最后一天的对象
 */
export function getMonthRange(year, month) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0, 23, 59, 59, 999)

  return {
    start: firstDay,
    end: lastDay
  }
}

/**
 * 格式化持续时间
 * @param {number} seconds - 秒数
 * @returns {string} 格式化后的持续时间
 */
export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0秒'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  const parts = []
  if (hours > 0) parts.push(`${hours}小时`)
  if (minutes > 0) parts.push(`${minutes}分钟`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}秒`)

  return parts.join('')
}

/**
 * 获取当前日期
 * @param {string} format - 格式 (默认: 'YYYY-MM-DD')
 * @returns {string} 当前日期字符串
 */
export function getCurrentDate(format = 'YYYY-MM-DD') {
  return formatDateTime(new Date(), format)
}

export default {
  formatDateTime,
  formatDate,
  formatTime,
  formatRelativeTime,
  getTimeRange,
  isToday,
  daysBetween,
  addDays,
  getMonthRange,
  formatDuration,
  getCurrentDate
}
