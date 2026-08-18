const OPERATION_COLUMN_SELECTOR = '.el-table__cell.operation-column'
const OPERATION_HEADER_SELECTOR = '.el-table__cell.operation-column-header'
const COLUMN_CLASS_PATTERN = /el-table_\d+_column_\d+/g
const MIN_WIDTH = 72
const MAX_WIDTH = 420
const HORIZONTAL_PADDING = 20
const EXTRA_SAFE_SPACE = 8
const ACTION_ELEMENT_SELECTOR = [
  '.el-button',
  '.el-link',
  '.el-dropdown'
].join(',')

let observer = null
let resizeObserver = null
let resizeHandler = null
let pendingFrame = 0
let pendingRoots = new Set()
let observedTables = new WeakSet()
let appliedWidths = new WeakMap()

function clampWidth(width) {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.ceil(width)))
}

function setWidthStyles(element, widthValue) {
  if (
    element.style.width === widthValue &&
    element.style.minWidth === widthValue &&
    element.style.maxWidth === widthValue &&
    element.style.getPropertyPriority('width') === 'important' &&
    element.style.getPropertyPriority('min-width') === 'important' &&
    element.style.getPropertyPriority('max-width') === 'important'
  ) {
    return
  }

  element.style.setProperty('width', widthValue, 'important')
  element.style.setProperty('min-width', widthValue, 'important')
  element.style.setProperty('max-width', widthValue, 'important')
}

function getAppliedWidthMap(table) {
  let widths = appliedWidths.get(table)
  if (!widths) {
    widths = new Map()
    appliedWidths.set(table, widths)
  }

  return widths
}

function getColumnIds(cell) {
  return [...new Set((cell.className || '').match(COLUMN_CLASS_PATTERN) || [])]
}

function getCellContentWidth(cell) {
  const content = cell.querySelector('.cell')
  if (!content) return MIN_WIDTH

  const actionElements = getVisibleActionElements(content)
  const measurementElements = actionElements.length > 0 ? actionElements : [...content.children]
  const visibleElements = measurementElements.filter((element) => isVisibleElement(element))

  if (visibleElements.length === 0) {
    const textWidth = getTextWidth(content.textContent || '', content)
    return textWidth + HORIZONTAL_PADDING + EXTRA_SAFE_SPACE
  }

  const childrenWidth = visibleElements.reduce((sum, element) => {
    return sum + element.getBoundingClientRect().width
  }, 0)

  return childrenWidth + getActionGap(content) * Math.max(0, visibleElements.length - 1) + HORIZONTAL_PADDING + EXTRA_SAFE_SPACE
}

function getVisibleActionElements(content) {
  const actions = [...content.querySelectorAll(ACTION_ELEMENT_SELECTOR)].filter((element) => {
    if (!isVisibleElement(element)) return false

    return !actionsContainVisibleChildAction(element, content)
  })

  return actions
}

function actionsContainVisibleChildAction(element, content) {
  return [...element.querySelectorAll(ACTION_ELEMENT_SELECTOR)].some((child) => {
    return child !== element && content.contains(child) && isVisibleElement(child)
  })
}

function getActionGap(content) {
  const computedStyle = window.getComputedStyle(content)
  const gap = Number.parseFloat(computedStyle.columnGap || computedStyle.gap || '0')
  return Number.isFinite(gap) ? gap : 6
}

function getTextWidth(text, element) {
  const trimmedText = text.trim()
  if (!trimmedText) return 0

  const style = window.getComputedStyle(element)
  const canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement('canvas'))
  const context = canvas.getContext('2d')
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  return context.measureText(trimmedText).width
}

function isVisibleElement(element) {
  const style = window.getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
}

function collectOperationColumnWidths(table) {
  const widthsByColumnId = new Map()
  const cells = [
    ...table.querySelectorAll(OPERATION_COLUMN_SELECTOR),
    ...table.querySelectorAll(OPERATION_HEADER_SELECTOR)
  ]

  for (const cell of cells) {
    const width = getCellContentWidth(cell)
    const columnIds = getColumnIds(cell)

    for (const columnId of columnIds) {
      widthsByColumnId.set(columnId, Math.max(widthsByColumnId.get(columnId) || MIN_WIDTH, width))
    }
  }

  return widthsByColumnId
}

function applyColumnWidth(table, columnId, width) {
  const nextWidth = clampWidth(width)
  const widthValue = `${nextWidth}px`
  const lastAppliedWidths = getAppliedWidthMap(table)
  const isSameWidth = lastAppliedWidths.get(columnId) === nextWidth

  table.querySelectorAll(`col[name="${columnId}"]`).forEach((col) => {
    if (
      isSameWidth &&
      col.getAttribute('width') === String(nextWidth) &&
      col.style.width === widthValue &&
      col.style.minWidth === widthValue &&
      col.style.maxWidth === widthValue &&
      col.style.getPropertyPriority('width') === 'important' &&
      col.style.getPropertyPriority('min-width') === 'important' &&
      col.style.getPropertyPriority('max-width') === 'important'
    ) {
      return
    }

    col.setAttribute('width', String(nextWidth))
    setWidthStyles(col, widthValue)
  })

  table.querySelectorAll(`.${columnId}.operation-column`).forEach((cell) => {
    setWidthStyles(cell, widthValue)
  })

  table.querySelectorAll(`th.${columnId}.operation-column-header`).forEach((cell) => {
    setWidthStyles(cell, widthValue)
  })

  lastAppliedWidths.set(columnId, nextWidth)
}

function getTables(root = document) {
  if (root?.matches?.('.el-table')) return [root]
  return [...root.querySelectorAll('.el-table')]
}

function updateOperationColumns(root = document) {
  observeTables(root)

  getTables(root).forEach((table) => {
    const widthsByColumnId = collectOperationColumnWidths(table)
    widthsByColumnId.forEach((width, columnId) => applyColumnWidth(table, columnId, width))
  })
}

function observeTables(root = document) {
  if (!resizeObserver) return

  getTables(root).forEach((table) => {
    if (observedTables.has(table)) return
    observedTables.add(table)
    resizeObserver.observe(table)
  })
}

function scheduleUpdate(root = document) {
  if (root === document) {
    pendingRoots = new Set([document])
  } else if (!pendingRoots.has(document)) {
    pendingRoots.add(root)
  }

  if (pendingFrame) return

  pendingFrame = window.requestAnimationFrame(() => {
    pendingFrame = 0
    const roots = [...pendingRoots]
    pendingRoots.clear()
    roots.forEach((pendingRoot) => updateOperationColumns(pendingRoot))
  })
}

function addTablesFromNode(node, tables) {
  if (node.nodeType !== window.Node.ELEMENT_NODE) return

  if (node.matches('.el-table')) {
    tables.add(node)
  }
  node.querySelectorAll('.el-table').forEach((table) => tables.add(table))
}

function getContainingTable(node) {
  if (node.nodeType !== window.Node.ELEMENT_NODE) return null
  return node.matches('.el-table') ? node : node.closest('.el-table')
}

export function initOperationColumnAutoWidth(appRoot = document.body) {
  if (typeof window === 'undefined' || observer) return

  if (typeof window.ResizeObserver !== 'undefined') {
    resizeObserver = new window.ResizeObserver((entries) => {
      entries.forEach((entry) => scheduleUpdate(entry.target))
    })
  }

  scheduleUpdate(document)

  let debounceTimer = null

  observer = new window.MutationObserver((mutations) => {
    let hasTableNodes = false

    for (let i = 0; i < mutations.length; i++) {
      const mutation = mutations[i]
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (let j = 0; j < mutation.addedNodes.length; j++) {
          const node = mutation.addedNodes[j]
          if (node.nodeType === 1 && (node.matches?.('.el-table') || node.querySelector?.('.el-table'))) {
            hasTableNodes = true
            break
          }
        }
      }
      if (hasTableNodes) break
    }

    if (hasTableNodes) {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        scheduleUpdate(document)
      }, 150)
    }
  })

  observer.observe(appRoot, {
    subtree: true,
    childList: true
  })

  resizeHandler = () => scheduleUpdate(document)
  window.addEventListener('resize', resizeHandler, { passive: true })
}

export function destroyOperationColumnAutoWidth() {
  if (observer) {
    observer.disconnect()
    observer = null
  }

  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
    observedTables = new WeakSet()
    appliedWidths = new WeakMap()
  }

  if (pendingFrame) {
    window.cancelAnimationFrame(pendingFrame)
    pendingFrame = 0
  }
  pendingRoots.clear()
}
