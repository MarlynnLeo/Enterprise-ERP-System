/**
 * 通知类型映射工具模块
 * @description 统一管理通知图标、颜色、标签等映射关系（DRY 原则）
 */

import {
  InfoFilled,
  Warning,
  CircleCheck,
  Document,
} from '@element-plus/icons-vue'
import { cssVar } from './designTokens'

/**
 * 获取通知类型对应的图标组件
 */
export function getNotificationIcon(type) {
  const iconMap = {
    system: InfoFilled,
    business: Document,
    warning: Warning,
    business_alert: Warning,
    inventory_alert: Warning,
    inventory_warning: Warning,
    batch_expiry: Warning,
    overdue_invoice: Warning,
    finance_error: Warning,
    finance_auto: Document,
    purchase_return: Document,
    info: CircleCheck,
  }
  return iconMap[type] || InfoFilled
}

/**
 * 获取通知类型对应的颜色
 */
export function getNotificationColor(type) {
  const colorMap = {
    system: cssVar('primary'),
    business: cssVar('success'),
    warning: cssVar('danger'),
    business_alert: cssVar('warning'),
    inventory_alert: cssVar('danger'),
    inventory_warning: cssVar('warning'),
    batch_expiry: cssVar('warning'),
    overdue_invoice: cssVar('danger'),
    finance_error: cssVar('danger'),
    finance_auto: cssVar('success'),
    purchase_return: cssVar('warning'),
    info: cssVar('info'),
  }
  return colorMap[type] || cssVar('primary')
}

/**
 * 获取通知类型对应的 ElTag type
 */
export function getTypeTag(type) {
  const tagMap = {
    system: 'primary',
    business: 'success',
    warning: 'danger',
    business_alert: 'warning',
    inventory_alert: 'danger',
    inventory_warning: 'warning',
    batch_expiry: 'warning',
    overdue_invoice: 'danger',
    finance_error: 'danger',
    finance_auto: 'success',
    purchase_return: 'warning',
    info: 'info',
  }
  return tagMap[type] || 'info'
}

/**
 * 获取通知类型对应的中文文本
 */
export function getTypeText(type) {
  const textMap = {
    system: '系统通知',
    business: '业务通知',
    warning: '预警通知',
    business_alert: '业务告警',
    inventory_alert: '库存告警',
    inventory_warning: '库存预警',
    batch_expiry: '批次预警',
    overdue_invoice: '逾期提醒',
    finance_error: '财务异常',
    finance_auto: '财务自动化',
    purchase_return: '采购退货',
    info: '信息通知',
  }
  return textMap[type] || type
}

/**
 * 预警相关通知类型列表（用于筛选）
 */
export const WARNING_TYPES = 'warning,business_alert,inventory_alert,inventory_warning,batch_expiry,overdue_invoice,finance_error'

/**
 * 格式化通知时间为相对时间
 */
export function formatNotificationTime(time) {
  if (!time) return ''
  const date = new Date(time)
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`

  return date.toLocaleString('zh-CN')
}
