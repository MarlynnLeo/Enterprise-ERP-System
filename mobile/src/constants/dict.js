/**
 * dict.js
 * @description 全局状态字典配置文件，集中管理系统所有枚举类型和状态映射
 * @date 2026-04-15
 */

// ==================== 统一的主题配色类和色彩常量 ====================
export const UI_COLORS = {
  DEFAULT: { class: 'tag-default', accent: 'accent-gray' },
  PRIMARY: { class: 'tag-info', accent: 'accent-blue' }, // 对应原 primary/info
  INFO: { class: 'tag-info', accent: 'accent-blue' },
  SUCCESS: { class: 'tag-success', accent: 'accent-green' },
  WARNING: { class: 'tag-warning', accent: 'accent-yellow' },
  DANGER: { class: 'tag-danger', accent: 'accent-red' },
  PURPLE: { class: 'tag-purple', accent: 'accent-purple' } // 某些特化检测使用
}

// ==================== 销售模块 (Sales) ====================

// 销售订单状态
export const SALES_ORDER_STATUS = {
  draft: { text: '草稿', ...UI_COLORS.DEFAULT },
  pending: { text: '待确认', ...UI_COLORS.WARNING },
  confirmed: { text: '已确认', ...UI_COLORS.INFO },
  in_production: { text: '生产中', ...UI_COLORS.WARNING },
  in_procurement: { text: '采购中', ...UI_COLORS.WARNING },
  ready_to_ship: { text: '待发货', ...UI_COLORS.INFO },
  shortage: { text: '缺料', ...UI_COLORS.DANGER },
  partial_shipped: { text: '部分发货', ...UI_COLORS.INFO },
  shipped: { text: '已发货', ...UI_COLORS.INFO },
  delivered: { text: '已送达', ...UI_COLORS.SUCCESS },
  completed: { text: '已完成', ...UI_COLORS.SUCCESS },
  cancelled: { text: '已取消', ...UI_COLORS.DEFAULT }
}

// 销售出库单状态
export const SALES_OUTBOUND_STATUS = {
  draft: { text: '草稿', ...UI_COLORS.DEFAULT },
  pending: { text: '待出库', ...UI_COLORS.WARNING }, // 对于老旧视图，如果用到pending
  confirmed: { text: '已确认', ...UI_COLORS.PRIMARY },
  processing: { text: '出库中', ...UI_COLORS.WARNING }, // 部分视图使用了 processing
  shipped: { text: '已发货', ...UI_COLORS.WARNING },
  completed: { text: '已完成', ...UI_COLORS.SUCCESS },
  cancelled: { text: '已取消', ...UI_COLORS.DEFAULT }
}

// 销售退货单状态
export const SALES_RETURN_STATUS = {
  draft: { text: '草稿', ...UI_COLORS.DEFAULT },
  pending: { text: '待处理', ...UI_COLORS.WARNING },
  approved: { text: '已审核', ...UI_COLORS.PRIMARY },
  completed: { text: '已完成', ...UI_COLORS.SUCCESS },
  rejected: { text: '已拒绝', ...UI_COLORS.DANGER },
  cancelled: { text: '已取消', ...UI_COLORS.DEFAULT }
}

// 销售换货状态
export const SALES_EXCHANGE_STATUS = {
  pending: { text: '待处理', ...UI_COLORS.WARNING },
  processing: { text: '处理中', ...UI_COLORS.INFO },
  completed: { text: '已完成', ...UI_COLORS.SUCCESS },
  cancelled: { text: '已取消', ...UI_COLORS.DEFAULT }
}

// ==================== 自定义工具函数 ====================

/**
 * 根据类型和状态键获取对应文本
 * @param {Object} dictMap - 对应的字典对象 (如 SALES_ORDER_STATUS)
 * @param {String} status - 状态字符串
 * @param {String} fallback - 默认回退文本
 */
export const getDictText = (dictMap, status, fallback = '未知状态') => {
  if (!dictMap || !status) return fallback
  return dictMap[status]?.text || status
}

/**
 * 根据类型和状态键获取对应的CSS Class
 * @param {Object} dictMap - 对应的字典对象
 * @param {String} status - 状态字符串
 */
export const getDictClass = (dictMap, status) => {
  if (!dictMap || !status) return UI_COLORS.DEFAULT.class
  return dictMap[status]?.class || UI_COLORS.DEFAULT.class
}

/**
 * 根据类型和状态键获取左侧 Accent 列色值
 * @param {Object} dictMap - 对应的字典对象
 * @param {String} status - 状态字符串
 */
export const getDictAccent = (dictMap, status) => {
  if (!dictMap || !status) return UI_COLORS.DEFAULT.accent
  return dictMap[status]?.accent || UI_COLORS.DEFAULT.accent
}
