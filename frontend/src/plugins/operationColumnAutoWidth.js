/**
 * Explicit operation-column measurement for isolated callers.
 *
 * Operation columns in routed pages declare width/min-width in their table
 * definitions. This module is intentionally opt-in: it never installs a
 * document-wide observer and therefore cannot compete with navigation or
 * sidebar interactions for the main thread.
 */

const OPERATION_CELL_SELECTOR = '.el-table__cell.operation-column'
const OPERATION_HEADER_SELECTOR = '.el-table__cell.operation-column-header'
const ACTION_SELECTOR = '.el-button, .el-link, .el-dropdown'
const ACTION_CONTAINER_SELECTOR =
  '.table-actions, .operation-buttons, .operation-btns, .operation-column-actions, .flex-wrap, .row-actions'
const COLUMN_ID_PATTERN = /el-table_\d+_column_\d+/g
const PROBE_ATTRIBUTE = 'data-erp-operation-measure-probe'
const MIN_WIDTH = 72
const MAX_WIDTH = 500
const EXTRA_WIDTH = 4
const FALLBACK_GAP = 6

let frameId = 0
const pendingRoots = new Set()

const clamp = (value) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.ceil(value)))

const getColumnIds = (cell) => [...new Set((cell.className || '').match(COLUMN_ID_PATTERN) || [])]

const isVisible = (element) => {
  if (!element || element.nodeType !== 1) return false
  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  return element.offsetWidth > 0 || element.scrollWidth > 0 || element.offsetHeight > 0
}

const getGap = (element) => {
  const style = window.getComputedStyle(element)
  const gap = parseFloat(style.gap || style.columnGap || '0')
  return Number.isFinite(gap) && gap > 0 ? gap : FALLBACK_GAP
}

const measureText = (text, element) => {
  const value = String(text || '').trim()
  if (!value) return 0

  const style = window.getComputedStyle(element)
  const canvas = (measureText.canvas ||= document.createElement('canvas'))
  const context = canvas.getContext('2d')
  if (!context) return value.length * parseFloat(style.fontSize || '14')

  context.font = [
    style.fontStyle,
    style.fontVariant,
    style.fontWeight,
    style.fontSize,
    style.fontFamily
  ].filter(Boolean).join(' ')
  return context.measureText(value).width
}

const measureCell = (cell) => {
  const content = cell.querySelector('.cell')
  if (!content) return MIN_WIDTH

  const actions = [...content.querySelectorAll(ACTION_SELECTOR)]
  const visibleActions = actions.filter((element) => {
    if (!isVisible(element)) return false
    return !actions.some((parent) => parent !== element && parent.contains(element) && isVisible(parent))
  })

  const style = window.getComputedStyle(content)
  const padding = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0')
  if (visibleActions.length === 0) {
    return Math.ceil(measureText(content.textContent, content)) + padding + EXTRA_WIDTH
  }

  const probe = document.createElement('div')
  probe.setAttribute(PROBE_ATTRIBUTE, 'true')
  probe.style.cssText = [
    'position:fixed',
    'top:-9999px',
    'left:-9999px',
    'visibility:hidden',
    'pointer-events:none',
    'white-space:nowrap',
    'display:inline-flex',
    'flex-wrap:nowrap',
    `gap:${getGap(content.querySelector(ACTION_CONTAINER_SELECTOR) || content)}px`,
    'padding:0',
    'margin:0',
    'border:0'
  ].join(';')

  for (const action of visibleActions) {
    const clone = action.cloneNode(true)
    clone.style.removeProperty('width')
    clone.style.removeProperty('min-width')
    clone.style.removeProperty('max-width')
    clone.style.setProperty('margin-left', '0', 'important')
    clone.style.setProperty('margin-right', '0', 'important')
    probe.appendChild(clone)
  }

  document.body.appendChild(probe)
  const width = probe.offsetWidth
  probe.remove()
  return width + padding + EXTRA_WIDTH
}

const setWidth = (element, width) => {
  const value = `${width}px`
  element.style.setProperty('width', value, 'important')
  element.style.setProperty('min-width', value, 'important')
  element.style.setProperty('max-width', value, 'important')
}

const applyTableWidths = (table) => {
  const widths = new Map()
  const cells = [
    ...table.querySelectorAll(OPERATION_CELL_SELECTOR),
    ...table.querySelectorAll(OPERATION_HEADER_SELECTOR)
  ]

  for (const cell of cells) {
    const width = measureCell(cell)
    for (const columnId of getColumnIds(cell)) {
      widths.set(columnId, Math.max(widths.get(columnId) || MIN_WIDTH, width))
    }
  }

  for (const [columnId, rawWidth] of widths) {
    const width = clamp(rawWidth)
    table.querySelectorAll(`col[name="${columnId}"]`).forEach((column) => {
      column.setAttribute('width', String(width))
      setWidth(column, width)
    })
    table.querySelectorAll(`.${columnId}.operation-column, td.${columnId}.operation-column`).forEach((cell) => {
      setWidth(cell, width)
    })
    table.querySelectorAll(`th.${columnId}.operation-column-header`).forEach((header) => {
      setWidth(header, width)
    })
  }
}

const getTables = (root) => {
  if (!root) return []
  if (root.matches?.('.el-table')) return [root]
  return root.querySelectorAll ? [...root.querySelectorAll('.el-table')] : []
}

/** Apply sizing immediately to the explicitly supplied root. */
export const applyOperationColumnAutoWidth = (root = document) => {
  if (typeof window === 'undefined') return
  getTables(root).forEach(applyTableWidths)
}

/** Schedule one measurement pass without installing observers. */
export const triggerOperationColumnAutoWidth = (root = document) => {
  if (typeof window === 'undefined') return
  pendingRoots.add(root)
  if (frameId) return
  frameId = window.requestAnimationFrame(() => {
    frameId = 0
    const roots = [...pendingRoots]
    pendingRoots.clear()
    roots.forEach((target) => applyOperationColumnAutoWidth(target))
  })
}
