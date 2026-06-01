import { createVNode, nextTick, render } from 'vue'
import { ElIcon } from 'element-plus'
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
  SetUp,
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
  SetUp,
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

function getCardText(card) {
  const title = card.querySelector('.stat-title, .stat-label, .text, .stat-card__label')
  return `${card.className || ''} ${title?.textContent || card.textContent || ''}`.toLowerCase()
}

function resolveIcon(card, index) {
  const text = getCardText(card)
  const matched = statusIconMap.find(([pattern]) => {
    return pattern.split('|').some((keyword) => text.includes(keyword.toLowerCase()))
  })

  return matched?.[1] || defaultIcons[index % defaultIcons.length]
}

function hasUsableIcon(card) {
  return Boolean(card.querySelector(
    '.stat-card__icon, .stat-card-auto-icon, .stat-icon, .icon-container'
  ))
}

function mountIcon(card, target, iconComponent) {
  const holder = document.createElement('span')
  holder.className = 'stat-card-auto-icon'
  card.classList.add('stat-card--auto-icon')
  const vnode = createVNode(ElIcon, { size: 24 }, {
    default: () => createVNode(iconComponent)
  })

  render(vnode, holder)
  target.prepend(holder)
}

export function applyStatCardIcons(root = document) {
  const cards = Array.from(root.querySelectorAll('.stat-card'))

  cards.forEach((card, index) => {
    if (hasUsableIcon(card)) return

    const target = card.classList.contains('el-card')
      ? card.querySelector('.el-card__body')
      : card

    if (!target) return
    mountIcon(card, target, resolveIcon(card, index))
  })
}

let queued = false
let initialized = false
let observer

function scheduleStatCardIconScan(root) {
  if (typeof window === 'undefined') return
  if (queued) return
  queued = true

  nextTick(() => {
    window.requestAnimationFrame(() => {
      queued = false
      applyStatCardIcons(root)
    })
  })
}

function setupStatCardIconObserver() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  scheduleStatCardIconScan(document)

  observer = new window.MutationObserver((mutations) => {
    const hasStatCardChange = mutations.some((mutation) => {
      return Array.from(mutation.addedNodes).some((node) => {
        if (node.nodeType !== window.Node.ELEMENT_NODE) return false
        return node.matches?.('.stat-card') || node.querySelector?.('.stat-card')
      })
    })

    if (hasStatCardChange) {
      scheduleStatCardIconScan(document)
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true
  })
}

export function registerStatCardIcons(app) {
  app.mixin({
    mounted() {
      setupStatCardIconObserver()
    }
  })
}
