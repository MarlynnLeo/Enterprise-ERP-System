/**
 * Optional statistic-card icon enhancement.
 *
 * Cards that need a specific icon should render it in their component. This
 * helper only fills the gap for legacy cards that intentionally omit one. It
 * is a scheduled, route-scoped scan with no app-wide mixin or MutationObserver
 * so table/menu updates never trigger a second DOM walk.
 */

import { createVNode, render } from 'vue'
import { ElIcon } from 'element-plus/es/components/icon/index'
import {
  Bell,
  CircleCheck,
  Clock,
  DataAnalysis,
  Document,
  Download,
  EditPen,
  Finished,
  Goods,
  Histogram,
  List,
  Loading,
  Money,
  Monitor,
  PieChart,
  Refresh,
  ShoppingCart,
  Tickets,
  Tools,
  TrendCharts,
  Upload,
  User,
  Van,
  Warning
} from '@element-plus/icons-vue'

const defaultIcons = [
  Document,
  EditPen,
  Loading,
  Clock,
  CircleCheck,
  DataAnalysis,
  TrendCharts
]

const statusIconMap = [
  ['draft|草稿', EditPen],
  ['pending|待审核|未处理|待执行', Clock],
  ['processing|progress|生产|进行|处理中', Loading],
  ['completed|finished|完成|已完成|通过', CircleCheck],
  ['approved|批准|通过', Finished],
  ['warning|异常|报警|风险|预警|阻断', Warning],
  ['maintenance|维护|保养', Tools],
  ['repair|维修', Tools],
  ['offline|离线', Warning],
  ['online|在线', Monitor],
  ['money|金额|销售额|回款|付款|收款|成本|利润|费用', Money],
  ['purchase|采购|请购|供应商', ShoppingCart],
  ['sales|销售|订单|客户', Tickets],
  ['inventory|库存|仓库|物料|产品', Goods],
  ['delivery|出库|入库|发货|物流|调拨', Van],
  ['quality|检验|质检|合格|不良|报废', CircleCheck],
  ['report|统计|报表|分析', DataAnalysis],
  ['chart|趋势|图表', TrendCharts],
  ['download|导出|下载', Download],
  ['upload|导入|上传', Upload],
  ['refresh|刷新', Refresh],
  ['user|人员|员工|用户', User],
  ['list|任务|清单|明细|检查项', List],
  ['histogram|柱状|数量', Histogram],
  ['pie|占比|比例', PieChart],
  ['bell|通知|提醒', Bell]
]

const getCardText = (card) => {
  const title = card.querySelector('.stat-title, .stat-label, .text, .stat-card__label')
  return `${card.className || ''} ${title?.textContent || card.textContent || ''}`.toLowerCase()
}

const resolveIcon = (card, index) => {
  const text = getCardText(card)
  const matched = statusIconMap.find(([pattern]) =>
    pattern.split('|').some((keyword) => text.includes(keyword.toLowerCase()))
  )
  return matched?.[1] || defaultIcons[index % defaultIcons.length]
}

const hasUsableIcon = (card) => Boolean(card.querySelector(
  '.stat-card__icon, .stat-card-auto-icon, .stat-icon, .icon-container'
))

const mountIcon = (card, target, iconComponent) => {
  const holder = document.createElement('span')
  holder.className = 'stat-card-auto-icon'
  card.classList.add('stat-card--auto-icon')
  render(
    createVNode(ElIcon, { size: 24 }, {
      default: () => createVNode(iconComponent)
    }),
    holder
  )
  target.prepend(holder)
}

const collectCards = (root) => {
  const cards = []
  if (root?.matches?.('.stat-card')) cards.push(root)
  if (root?.querySelectorAll) cards.push(...root.querySelectorAll('.stat-card'))
  return cards
}

/** Apply the enhancement synchronously when a caller explicitly needs it. */
export const applyStatCardIcons = (root = document) => {
  collectCards(root).forEach((card, index) => {
    if (hasUsableIcon(card)) return
    const target = card.classList.contains('el-card')
      ? card.querySelector('.el-card__body')
      : card
    if (target) mountIcon(card, target, resolveIcon(card, index))
  })
}

let idleId = 0
let frameId = 0
let queuedRoot = null
let destroyed = false

const cancelScheduledScan = () => {
  if (idleId && typeof window !== 'undefined' && window.cancelIdleCallback) {
    window.cancelIdleCallback(idleId)
  } else if (idleId) {
    clearTimeout(idleId)
  }
  if (frameId && typeof window !== 'undefined') window.cancelAnimationFrame(frameId)
  idleId = 0
  frameId = 0
}

const scheduleFrame = (callback) => {
  if (typeof window !== 'undefined' && window.requestAnimationFrame) {
    frameId = window.requestAnimationFrame(() => {
      frameId = 0
      callback()
    })
  } else {
    frameId = setTimeout(() => {
      frameId = 0
      callback()
    }, 16)
  }
}

const runScheduledScan = () => {
  const root = queuedRoot
  queuedRoot = null
  if (destroyed || !root) return

  const cards = collectCards(root)
  let index = 0
  const processBatch = () => {
    const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now())
    const startedAt = now()
    while (index < cards.length) {
      const card = cards[index]
      index += 1
      if (!hasUsableIcon(card)) {
        const target = card.classList.contains('el-card')
          ? card.querySelector('.el-card__body')
          : card
        if (target) mountIcon(card, target, resolveIcon(card, index - 1))
      }
      // Keep each batch short enough that a menu click can run between cards.
      if (index < cards.length && now() - startedAt >= 8) break
    }
    if (index < cards.length && !destroyed) scheduleFrame(processBatch)
  }
  processBatch()
}

/** Queue a route-scoped, incremental scan during browser idle time. */
export const initStatCardIcons = (root) => {
  if (typeof window === 'undefined' || !root) return
  destroyed = false
  cancelScheduledScan()
  queuedRoot = root
  const callback = () => {
    idleId = 0
    runScheduledScan()
  }
  if (window.requestIdleCallback) {
    idleId = window.requestIdleCallback(callback, { timeout: 2000 })
  } else {
    idleId = setTimeout(callback, 600)
  }
}

// Compatibility API for legacy bootstrappers. It deliberately scopes the
// scan to the current content area and does not install a global mixin.
export const registerStatCardIcons = (app) => {
  void app
  initStatCardIcons(
    document.querySelector('.main-content') || document.querySelector('#app') || document.body
  )
}

export const destroyStatCardIcons = () => {
  destroyed = true
  cancelScheduledScan()
  queuedRoot = null
}

if (import.meta.hot) {
  import.meta.hot.dispose(destroyStatCardIcons)
}
