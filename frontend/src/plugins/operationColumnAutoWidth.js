/**
 * operationColumnAutoWidth.js
 *
 * 自动测量并设置带 class-name="operation-column" 的 el-table 操作列宽度，
 * 使列宽始终等于当前可见按钮的实际宽度之和。
 *
 * 核心测量方案：
 *   将可见按钮克隆到一个绝对定位的"探针容器"里，用 offsetWidth 读取自然宽度。
 *   探针在 document 内（CSS 规则生效）但位于屏幕外（不影响布局），
 *   读取后立即销毁，无副作用。
 *
 * MutationObserver 触发条件（同时覆盖 addedNodes 和 removedNodes）：
 *   - v-if false→true：按钮 ADDED   → addedNodes 有 nodeType=1 元素
 *   - v-if true→false：按钮 REMOVED → addedNodes 只有注释节点（nodeType=8），
 *                                     必须检查 removedNodes 才能触发
 *   - v-show：class/style 属性变化   → attributes 变更触发
 */

// ─── 常量 ────────────────────────────────────────────────────────────────────

const OPERATION_COLUMN_SEL = '.el-table__cell.operation-column'
const OPERATION_HEADER_SEL = '.el-table__cell.operation-column-header'
const COLUMN_ID_RE = /el-table_\d+_column_\d+/g
const ACTION_SEL = '.el-button, .el-link, .el-dropdown'
// Legacy wrappers remain supported during the page-by-page migration. They
// are normalized by common-styles.css, so width measurement uses the same gap
// for old and new pages.
const CONTAINER_SEL =
  '.table-actions, .operation-buttons, .operation-btns, .operation-column-actions, .flex-wrap, .row-actions'

const MIN_WIDTH = 72
const MAX_WIDTH = 500
const EXTRA = 4         // 极小安全余量（px），cell padding 动态读取
const GAP_FALLBACK = 6  // 找不到 gap 时的回退值

// ─── 模块级状态 ───────────────────────────────────────────────────────────────

let mutationObserver = null
let resizeObserver = null
let resizeHandler = null
let rafId = 0
let debounceTimer = null
let pendingRoots = new Set()
let observedTables = new WeakSet()
let appliedWidths = new WeakMap()

// ─── 工具 ─────────────────────────────────────────────────────────────────────

function clamp(w) {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.ceil(w)))
}

function getColumnIds(cell) {
  return [...new Set((cell.className || '').match(COLUMN_ID_RE) || [])]
}

/** 元素是否可见（不依赖 getBoundingClientRect，按钮溢出列边界时 rect 为 0） */
function isVisible(el) {
  if (!el || el.nodeType !== 1) return false
  const s = window.getComputedStyle(el)
  if (s.display === 'none' || s.visibility === 'hidden') return false
  // offsetWidth/scrollWidth/offsetHeight 不受父容器 overflow 截断
  return el.offsetWidth > 0 || el.scrollWidth > 0 || el.offsetHeight > 0
}

/**
 * 获取容器的 flex gap（px）。
 * 优先读 gap，fallback 到 column-gap，再 fallback 到常量。
 */
function readGap(container) {
  const s = window.getComputedStyle(container)
  const v = parseFloat(s.gap || s.columnGap || '0')
  return Number.isFinite(v) && v > 0 ? v : GAP_FALLBACK
}

/**
 * 用 canvas 测量文本宽度（仅用于操作列内没有任何按钮时）。
 */
function measureText(text, el) {
  const t = String(text || '').trim()
  if (!t) return 0
  const s = window.getComputedStyle(el)
  const canvas = (measureText._c = measureText._c || document.createElement('canvas'))
  const ctx = canvas.getContext('2d')
  ctx.font = [s.fontStyle, s.fontVariant, s.fontWeight, s.fontSize, s.fontFamily]
    .filter(Boolean).join(' ')
  return ctx.measureText(t).width
}

// ─── 核心：探针测量 ───────────────────────────────────────────────────────────

/**
 * 将可见的操作按钮克隆到屏幕外的"探针容器"，通过 offsetWidth 测量自然宽度。
 *
 * 关键修复：
 *  1. 动态读取 cell 实际 padding，不使用硬编码常量
 *  2. 克隆时显式设置 margin-left:0，覆盖 Element Plus 默认的
 *     `.el-button + .el-button { margin-left: 10px }`（在表格内已被
 *     common-styles.css 覆盖，但探针容器不在 .operation-column 里）
 */
function measureCellWidth(cell) {
  const content = cell.querySelector('.cell')
  if (!content) return MIN_WIDTH

  // 收集可见的叶子级 action 元素（排除 dropdown 内嵌套的 button）
  const allActions = [...content.querySelectorAll(ACTION_SEL)]
  const visibleActions = allActions.filter((el) => {
    if (!isVisible(el)) return false
    // 如果 el 被另一个 action 包含，则 el 是"子 action"，跳过（避免重复计算）
    return !allActions.some((p) => p !== el && p.contains(el) && isVisible(p))
  })

  // 动态读取 cell 实际 padding（Element Plus 默认 var(--el-table-padding,12px) 各侧）
  const cs = window.getComputedStyle(content)
  const cellPadding = parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0')

  if (visibleActions.length === 0) {
    // 没有按钮，回退到文本宽度
    return Math.ceil(measureText(content.textContent, content)) + cellPadding + EXTRA
  }

  // 读取实际 gap
  const gapSource = content.querySelector(CONTAINER_SEL) || content
  const gap = readGap(gapSource)

  // 创建探针容器（position:fixed 脱离文档流，visibility:hidden 不可见）
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;top:-9999px;left:-9999px;' +
    'visibility:hidden;pointer-events:none;' +
    'white-space:nowrap;display:inline-flex;flex-wrap:nowrap;' +
    `gap:${gap}px;padding:0;margin:0;border:0;`

  // 克隆可见按钮（保留 class，CSS 规则自动生效）
  visibleActions.forEach((el) => {
    const clone = el.cloneNode(true)
    // 清除插件可能注入的 width !important
    clone.style.removeProperty('width')
    clone.style.removeProperty('min-width')
    clone.style.removeProperty('max-width')
    // 关键修复：Element Plus 默认 .el-button + .el-button { margin-left: 10px }
    // 表格内被 common-styles.css 覆盖为 0，但探针不在 .operation-column 里，
    // 不设置则每多一个按钮多算 10px，导致右边空白随按钮数增加而变大。
    clone.style.setProperty('margin-left', '0', 'important')
    clone.style.setProperty('margin-right', '0', 'important')
    probe.appendChild(clone)
  })

  document.body.appendChild(probe)
  const buttonWidth = probe.offsetWidth  // 探针自然展开，读取真实宽度
  document.body.removeChild(probe)

  return buttonWidth + cellPadding + EXTRA
}

// ─── 宽度应用 ─────────────────────────────────────────────────────────────────

function setWidth(el, px) {
  const v = px + 'px'
  if (
    el.style.width === v &&
    el.style.getPropertyPriority('width') === 'important'
  ) return
  el.style.setProperty('width', v, 'important')
  el.style.setProperty('min-width', v, 'important')
  el.style.setProperty('max-width', v, 'important')
}

function applyToTable(table, columnId, rawWidth) {
  const width = clamp(rawWidth)
  const map = appliedWidths.get(table) || new Map()
  appliedWidths.set(table, map)
  if (map.get(columnId) === width) return
  map.set(columnId, width)

  table.querySelectorAll(`col[name="${columnId}"]`).forEach((col) => {
    col.setAttribute('width', String(width))
    setWidth(col, width)
  })
  table.querySelectorAll(`.${columnId}.operation-column, td.${columnId}.operation-column`).forEach((td) => {
    setWidth(td, width)
  })
  table.querySelectorAll(`th.${columnId}.operation-column-header`).forEach((th) => {
    setWidth(th, width)
  })
}

// ─── 扫描与调度 ───────────────────────────────────────────────────────────────

function getTables(root) {
  if (!root) return []
  if (typeof root.matches === 'function' && root.matches('.el-table')) return [root]
  if (typeof root.querySelectorAll !== 'function') return []
  return [...root.querySelectorAll('.el-table')]
}

function updateAll(root) {
  getTables(root).forEach((table) => {
    // 注册到 ResizeObserver（首次时）
    if (resizeObserver && !observedTables.has(table)) {
      observedTables.add(table)
      resizeObserver.observe(table)
    }

    // 收集各列最大宽度
    const widths = new Map()
    const cells = [
      ...table.querySelectorAll(OPERATION_COLUMN_SEL),
      ...table.querySelectorAll(OPERATION_HEADER_SEL),
    ]
    for (const cell of cells) {
      const w = measureCellWidth(cell)
      for (const id of getColumnIds(cell)) {
        widths.set(id, Math.max(widths.get(id) || MIN_WIDTH, w))
      }
    }
    widths.forEach((w, id) => applyToTable(table, id, w))
  })
}

/**
 * 双 rAF 调度：第一帧等 Element Plus doLayout 写完样式，
 * 第二帧再覆盖，避免被 doLayout 后续调用冲掉。
 */
function schedule(root) {
  if (root === document) {
    pendingRoots = new Set([document])
  } else if (!pendingRoots.has(document)) {
    pendingRoots.add(root)
  }
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      rafId = 0
      const roots = [...pendingRoots]
      pendingRoots.clear()
      roots.forEach((r) => updateAll(r))
    })
  })
}

// ─── 公共 API ─────────────────────────────────────────────────────────────────

/** 手动触发一次重新测量（适用于无法被自动检测到的场景） */
export function triggerOperationColumnAutoWidth(root) {
  schedule(root || document)
}

export function initOperationColumnAutoWidth(appRoot = document.body) {
  if (typeof window === 'undefined' || mutationObserver) return

  // ResizeObserver：表格容器尺寸变化时重新计算
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((e) => schedule(e.target))
    })
  }

  schedule(document)

  // MutationObserver：同时检测 addedNodes 和 removedNodes
  mutationObserver = new MutationObserver((mutations) => {
    let hit = false

    for (const m of mutations) {
      if (hit) break

      // ── childList：按钮增减（v-if 双向切换）──────────────────────────────
      if (m.type === 'childList') {
        // 合并 addedNodes + removedNodes 一起扫描：
        // v-if false→true：addedNodes 有真实元素（nodeType=1）
        // v-if true→false：addedNodes 只有注释节点（nodeType=8），
        //                  removedNodes 有真实元素 → 必须检查 removedNodes！
        for (const node of [...m.addedNodes, ...m.removedNodes]) {
          if (node.nodeType !== 1) continue
          if (
            node.matches?.(ACTION_SEL + ', .table-actions, .operation-buttons, .operation-btns, .operation-column-actions, .flex-wrap, .row-actions, .el-table, .el-table__body') ||
            node.querySelector?.(ACTION_SEL + ', .operation-column')
          ) {
            hit = true
            break
          }
        }

        // 兜底：mutation 的直接父节点就在操作列容器里
        if (!hit && m.target?.closest?.('.operation-column, .table-actions, .operation-buttons, .operation-column-actions, .flex-wrap, .row-actions')) {
          hit = true
        }
      }

      // ── attributes：v-show、disabled 等属性变化 ──────────────────────────
      if (
        !hit &&
        m.type === 'attributes' &&
        m.target?.nodeType === 1 &&
        (
          m.target.closest?.('.operation-column') ||
          m.target.matches?.(ACTION_SEL + ', .table-actions, .operation-buttons, .operation-btns, .operation-column-actions, .flex-wrap, .row-actions')
        )
      ) {
        hit = true
      }
    }

    if (!hit) return

    // 防抖 60ms，合并短时间内的多次变化
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => schedule(document), 60)
  })

  mutationObserver.observe(appRoot || document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'disabled', 'hidden'],
  })

  resizeHandler = () => schedule(document)
  window.addEventListener('resize', resizeHandler, { passive: true })
}

export function destroyOperationColumnAutoWidth() {
  mutationObserver?.disconnect()
  mutationObserver = null

  window.removeEventListener('resize', resizeHandler)
  resizeHandler = null

  resizeObserver?.disconnect()
  resizeObserver = null
  observedTables = new WeakSet()
  appliedWidths = new WeakMap()

  cancelAnimationFrame(rafId)
  rafId = 0

  clearTimeout(debounceTimer)
  debounceTimer = null

  pendingRoots.clear()
}

// ─── Vite HMR 支持 ───────────────────────────────────────────────────────────
// 热更新时销毁旧 observer，让新模块代码从干净状态初始化。
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    destroyOperationColumnAutoWidth()
  })
}
