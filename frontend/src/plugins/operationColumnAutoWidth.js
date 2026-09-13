/**
 * Shared operation-column sizing with opt-in content-fit columns.
 *
 * Read intrinsic action sizes in one phase, then write only changed widths.
 * No hidden DOM probes and no document-wide attribute observer: branch clicks
 * and unmarked data-cell changes must not trigger table measurement.
 */

const CELL_SELECTOR = '.el-table__cell.operation-column, .el-table__cell.operation-column-header, .el-table__cell.content-fit-column'
const ACTION_SELECTOR = '.el-button, .el-link, .el-dropdown'
const CONTAINER_SELECTOR = '.table-actions, .operation-buttons, .operation-btns, .operation-column-actions, .flex-wrap, .row-actions'
const COLUMN_ID_PATTERN = /el-table_\d+_column_\d+/g
const MIN_WIDTH = 72
const MAX_WIDTH = 500
const EXTRA_WIDTH = 4
const layoutClassPattern = /(?:^|\s)(?:is-scrolling-\S+|el-table--(?:scrollable-[xy]|fluid-height|enable-row-hover|enable-row-transition))(?=\s|$)/g
const tableStyleSignature = (table) => table.className.replace(layoutClassPattern, '').trim()

const tables = new Map()
const pendingTables = new Map()
const widthControllers = new WeakMap()
let rootElement = null
let discoveryObserver = null
let themeObserver = null
let resizeObserver = null
let resizeHandler = null
let fontHandler = null
let frameId = 0
let resizeTimer = 0

const px = (value) => parseFloat(value) || 0
const clamp = (value) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.ceil(value)))
const getColumnIds = (element) => element.tagName === 'COL'
  ? [element.getAttribute('name')].filter(Boolean)
  : [...new Set(String(element.className || '').match(COLUMN_ID_PATTERN) || [])]

const isRendered = (element) => element?.getClientRects().length > 0 &&
  window.getComputedStyle(element).visibility !== 'hidden'

const measurePlainText = (content) => {
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let width = 0
  let node
  while ((node = walker.nextNode())) {
    if (!node.textContent.trim() || !isRendered(node.parentElement)) continue
    range.selectNodeContents(node)
    width += range.getBoundingClientRect().width
  }
  return width
}

const measureCell = (cell) => {
  const content = cell.querySelector('.cell')
  if (!content || !isRendered(cell)) return 0
  const contentStyle = window.getComputedStyle(content)
  const padding = px(contentStyle.paddingLeft) + px(contentStyle.paddingRight)
  if (cell.classList.contains('content-fit-column')) {
    const tag = content.querySelector('.el-tag')
    const cellStyle = window.getComputedStyle(cell)
    const border = px(cellStyle.borderLeftWidth) + px(cellStyle.borderRightWidth)
    if (!tag) return measurePlainText(content) + padding + border
    const tagStyle = window.getComputedStyle(tag)
    // Measure the complete label, even if the previous column width clipped it.
    return measurePlainText(tag) + px(tagStyle.paddingLeft) + px(tagStyle.paddingRight) +
      px(tagStyle.borderLeftWidth) + px(tagStyle.borderRightWidth) + padding + border
  }
  const actions = [...content.querySelectorAll(ACTION_SELECTOR)].filter((action) => {
    const parentAction = action.parentElement?.closest(ACTION_SELECTOR)
    return (!parentAction || !content.contains(parentAction)) && isRendered(action)
  })

  if (actions.length === 0) return measurePlainText(content) + padding + EXTRA_WIDTH

  const container = content.querySelector(CONTAINER_SELECTOR) || content
  const gapValue = parseFloat(window.getComputedStyle(container).columnGap)
  const gap = Number.isFinite(gapValue) ? gapValue : 6
  const actionWidth = actions.reduce((width, action) => {
    const style = window.getComputedStyle(action)
    // flex-shrink: 0 in common-styles.css keeps these natural sizes stable
    // even before the column has been sized or after a narrow viewport resize.
    return width + Math.max(action.offsetWidth,
      action.scrollWidth + px(style.borderLeftWidth) + px(style.borderRightWidth)) +
      px(style.marginLeft) + px(style.marginRight)
  }, 0)
  return actionWidth + gap * (actions.length - 1) + padding + EXTRA_WIDTH
}

const measureTable = (table) => {
  const widths = new Map()
  for (const cell of table.querySelectorAll(CELL_SELECTOR)) {
    if (cell.closest('.el-table') !== table) continue
    const measured = measureCell(cell)
    if (!measured) continue
    for (const id of getColumnIds(cell)) {
      const width = cell.classList.contains('content-fit-column') ? Math.ceil(measured) : clamp(measured)
      widths.set(id, Math.max(widths.get(id) || 0, width))
    }
  }
  return widths
}

const hasWidth = (element, width) => ['width', 'min-width', 'max-width'].every((property) =>
  element.style.getPropertyValue(property) === width + 'px' &&
  element.style.getPropertyPriority(property) === 'important'
)

const setWidth = (element, width) => {
  const value = width + 'px'
  for (const property of ['width', 'min-width', 'max-width']) {
    if (element.style.getPropertyValue(property) !== value ||
        element.style.getPropertyPriority(property) !== 'important') {
      element.style.setProperty(property, value, 'important')
    }
  }
}

const applyWidths = ({ table, widths }) => {
  const controller = widthControllers.get(table)
  if (controller) {
    controller(widths)
    return
  }
  for (const [id, width] of widths) {
    table.querySelectorAll('col[name="' + id + '"]').forEach((column) => {
      if (column.getAttribute('width') !== String(width)) column.setAttribute('width', String(width))
      setWidth(column, width)
    })
    table.querySelectorAll('.' + id).forEach((cell) => {
      if (cell.matches(CELL_SELECTOR)) setWidth(cell, width)
    })
  }
}

const flushTables = () => {
  frameId = 0
  const entries = [...pendingTables]
  pendingTables.clear()
  const ready = []
  // Complete every read before any write, including when several tables
  // become visible together. A hundred rows still need only one layout.
  for (const [table, measure] of entries) {
    const state = tables.get(table)
    if (!state || !table.isConnected || !isRendered(table)) continue
    state.visible = true
    if (measure || !state.widths.size) {
      state.widths = measureTable(table)
      ready.push(() => applyWidths(state))
    } else {
      const targets = [...state.restoreTargets]
      ready.push(() => targets.forEach((element) => {
        for (const id of getColumnIds(element)) {
          const width = state.widths.get(id)
          if (!width || !element.isConnected) continue
          if (element.tagName === 'COL' && element.getAttribute('width') !== String(width)) {
            element.setAttribute('width', String(width))
          }
          setWidth(element, width)
        }
      }))
    }
    state.restoreTargets.clear()
  }
  ready.forEach((apply) => apply())
}

const scheduleTable = (table, measure = true) => {
  if (!tables.has(table)) return
  pendingTables.set(table, measure || pendingTables.get(table) || false)
  if (!frameId) frameId = window.requestAnimationFrame(flushTables)
}

const touchesOperationCell = (node) => {
  const element = node?.nodeType === 1 ? node : node?.parentElement
  return Boolean(element?.closest(CELL_SELECTOR))
}

const containsOperationCell = (node) => node?.nodeType === 1 &&
  (node.matches(CELL_SELECTOR) || Boolean(node.querySelector(CELL_SELECTOR)))

const observeTable = (table) => {
  if (tables.has(table)) return
  const state = {
    table, widths: new Map(), observer: null, visible: false,
    restoreTargets: new Set(), styleSignature: tableStyleSignature(table)
  }
  tables.set(table, state)
  state.observer = new MutationObserver((mutations) => {
    let measure = false
    let restore = false
    for (const mutation of mutations) {
      const target = mutation.target
      if (mutation.type === 'attributes') {
        // Element Plus may replace a col's width during its resize layout.
        // Restore the cached value; never measure all rows for that event.
        if (target.matches('col') || (mutation.attributeName === 'style' && target.matches(CELL_SELECTOR))) {
          // A registered Vue owner applies widths through column props. Its
          // renderer owns the DOM, including resize and fixed-column layout.
          if (widthControllers.has(table)) continue
          for (const id of getColumnIds(target)) {
            const width = state.widths.get(id)
            if (width && (!hasWidth(target, width) ||
                (target.tagName === 'COL' && target.getAttribute('width') !== String(width)))) {
              restore = true
              state.restoreTargets.add(target)
            }
          }
          continue
        }
        if (touchesOperationCell(target)) measure = true
        if (target === table && mutation.attributeName === 'class') {
          const signature = tableStyleSignature(table)
          if (signature !== state.styleSignature) measure = true
          state.styleSignature = signature
        }
      } else if (touchesOperationCell(target)) {
        measure = true
      } else if (mutation.type === 'childList' &&
          [...mutation.addedNodes, ...mutation.removedNodes].some(containsOperationCell)) {
        measure = true
      }
    }
    if (measure || restore) scheduleTable(table, measure)
  })
  state.observer.observe(table, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'disabled', 'hidden', 'width']
  })
  resizeObserver?.observe(table)
  scheduleTable(table)
}

const discoverTables = (node) => {
  if (node?.nodeType !== 1) return
  if (node.matches('.el-table')) observeTable(node)
  node.querySelectorAll('.el-table').forEach(observeTable)
}

const releaseDetachedTables = () => {
  for (const [table, state] of tables) {
    if (table.isConnected && rootElement?.contains(table)) continue
    state.observer.disconnect()
    resizeObserver?.unobserve(table)
    pendingTables.delete(table)
    tables.delete(table)
  }
}

const measureVisibleTables = () => {
  tables.forEach(({ table }) => scheduleTable(table))
}

/** Register during mount so measured widths have one owner: the table's Vue state. */
export const registerTableWidthController = (table, controller) => {
  widthControllers.set(table, controller)
  scheduleTable(table)
  return () => {
    if (widthControllers.get(table) === controller) widthControllers.delete(table)
  }
}

/** Start once after mount; teleported dialogs are included under body. */
export const startOperationColumnAutoWidth = (root = document.body) => {
  if (typeof window === 'undefined' || discoveryObserver) return
  rootElement = root || document.body

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      for (const { target, contentRect } of entries) {
        const state = tables.get(target)
        if (!state) continue
        const visible = contentRect.width > 0 && contentRect.height > 0
        if (visible && !state.visible) scheduleTable(target)
        state.visible = visible
      }
    })
  }

  // Discovery watches structure only and scans added subtrees, never the
  // mutation target (which could be the entire application or document).
  discoveryObserver = new MutationObserver((mutations) => {
    let removed = false
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(discoverTables)
      if (mutation.removedNodes.length) removed = true
    }
    if (removed) releaseDetachedTables()
  })
  discoveryObserver.observe(rootElement, { subtree: true, childList: true })
  discoverTables(rootElement)

  // Theme/font changes alter intrinsic sizes; a sidebar width change doesn't.
  themeObserver = new MutationObserver(measureVisibleTables)
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme', 'lang']
  })
  resizeHandler = () => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(measureVisibleTables, 120)
  }
  window.addEventListener('resize', resizeHandler, { passive: true })
  fontHandler = measureVisibleTables
  document.fonts?.addEventListener?.('loadingdone', fontHandler)
}

export const destroyOperationColumnAutoWidth = () => {
  if (typeof window !== 'undefined') {
    window.cancelAnimationFrame(frameId)
    window.clearTimeout(resizeTimer)
    window.removeEventListener('resize', resizeHandler)
  }
  frameId = 0
  resizeTimer = 0
  discoveryObserver?.disconnect()
  discoveryObserver = null
  themeObserver?.disconnect()
  themeObserver = null
  resizeObserver?.disconnect()
  resizeObserver = null
  tables.forEach(({ observer }) => observer.disconnect())
  tables.clear()
  pendingTables.clear()
  document.fonts?.removeEventListener?.('loadingdone', fontHandler)
  fontHandler = null
  resizeHandler = null
  rootElement = null
}

if (import.meta.hot) {
  import.meta.hot.dispose(destroyOperationColumnAutoWidth)
}
