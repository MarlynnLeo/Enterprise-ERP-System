/**
 * 打印表格内容自动适配。
 *
 * 打印模板是用户可配置的 HTML，不能假设所有模板都使用同一套列 class。
 * 这里同时支持：
 *   - .print-auto-fit / .auto-fit-cell（显式标记）
 *   - QRZK 默认模板的 col.project / col.standard / col.method
 *   - 根据表头“项目 / 检验要求/标准 / 检测方法”推断列位置
 *
 * 函数只操作传入的打印文档，不向模板注入脚本，兼容严格 CSP。
 */

const DEFAULT_MIN_FONT_SIZE = 5
const DEFAULT_MAX_FONT_SCALE = 1.25
const MAX_FONT_SIZE = 16
const FIT_EPSILON = 0.5

const normalizeText = (value) => String(value ?? '')
  .replace(/\s+/g, '')
  .replace(/[：:]/g, '')
  .trim()

const getElementColumnIndex = (cell) => {
  let index = 0
  let sibling = cell?.previousElementSibling
  while (sibling) {
    index += Number(sibling.colSpan) || 1
    sibling = sibling.previousElementSibling
  }
  return index
}

const getCellAtColumn = (row, columnIndex) => {
  let index = 0
  for (const cell of Array.from(row?.cells || [])) {
    const span = Number(cell.colSpan) || 1
    if (columnIndex >= index && columnIndex < index + span) return cell
    index += span
  }
  return null
}

const getBodyRows = (table) => {
  const rows = []
  for (const body of Array.from(table?.tBodies || [])) {
    rows.push(...Array.from(body.rows || []))
  }
  // 兼容没有 tbody 的简易自定义模板。
  if (rows.length === 0) {
    rows.push(...Array.from(table?.rows || []).filter(row => row.querySelector('td')))
  }
  return rows
}

const getHeaderRows = (table) => {
  const rows = Array.from(table?.tHead?.rows || [])
  if (rows.length > 0) return rows
  return Array.from(table?.rows || []).filter(row => row.querySelector('th'))
}

const getColumnKind = (value) => {
  const text = normalizeText(value)
  if (!text) return null
  if (/(检验要求|检验标准|技术要求|技术标准|标准要求)/.test(text)) return 'standard'
  if (/(检测方法|检验方法|检测器具|检验器具|检测工具|检验工具|量具|仪器|^方法$)/.test(text)) return 'method'
  if (/^(项目|检验项目|项目名称|检验项目名称)$/.test(text)) return 'project'
  return null
}

const explicitCells = (doc) => {
  const selector = [
    '.print-auto-fit',
    '.auto-fit-cell',
    '.project-cell',
    '.standard-cell',
    '.method-cell',
    '[data-print-autofit]'
  ].join(',')
  return Array.from(doc?.querySelectorAll?.(selector) || [])
    .filter(cell => cell.getAttribute('data-print-autofit') !== 'false')
}

const getExplicitCellKind = (cell) => {
  if (cell.classList?.contains('project-cell')) return 'project'
  if (cell.classList?.contains('standard-cell')) return 'standard'
  if (cell.classList?.contains('method-cell')) return 'method'
  const value = normalizeText(cell.getAttribute?.('data-print-autofit'))
  if (['project', '项目'].includes(value)) return 'project'
  if (['standard', '检验要求/标准', '检验标准'].includes(value)) return 'standard'
  if (['method', '检测方法', '检验方法'].includes(value)) return 'method'
  return getColumnKind(value)
}

const setTarget = (targets, cell, kind = null) => {
  if (!cell || !cell.tagName || !['TD', 'TH'].includes(cell.tagName)) return
  if (!targets.has(cell) || kind) targets.set(cell, kind)
}

const findPrintAutoFitTargets = (doc) => {
  const targets = new Map()
  for (const cell of explicitCells(doc)) setTarget(targets, cell, getExplicitCellKind(cell))

  const tables = Array.from(doc.querySelectorAll('table'))
  for (const table of tables) {
    const rows = getBodyRows(table)
    if (rows.length === 0) continue

    const columns = new Map()
    const colElements = Array.from(table.children || [])
      .filter(child => child.tagName === 'COLGROUP')
      .flatMap(group => Array.from(group.children || []).filter(child => child.tagName === 'COL'))
    colElements.forEach((col, index) => {
      const classList = Array.from(col.classList || [])
      if (classList.includes('project')) columns.set('project', index)
      if (classList.includes('standard')) columns.set('standard', index)
      if (classList.includes('method')) columns.set('method', index)
    })

    // 自定义模板没有 col class 时，从表头文字推断列。
    if (columns.size < 3) {
      for (const row of getHeaderRows(table)) {
        for (const header of Array.from(row.cells || [])) {
          const kind = getColumnKind(header.textContent)
          if (kind && !columns.has(kind)) columns.set(kind, getElementColumnIndex(header))
        }
      }
    }

    for (const [kind, columnIndex] of columns) {
      for (const row of rows) setTarget(targets, getCellAtColumn(row, columnIndex), kind)
    }
  }
  return targets
}

/**
 * 找出打印文档中需要适配的单元格。
 * @param {Document} doc
 * @returns {HTMLElement[]}
 */
export function findPrintAutoFitCells(doc) {
  if (!doc?.querySelectorAll) return []
  return Array.from(findPrintAutoFitTargets(doc).keys())
}

const getFontSize = (cell, view) => {
  const inlineSize = Number.parseFloat(cell.style?.fontSize || '')
  if (Number.isFinite(inlineSize) && inlineSize > 0) return inlineSize
  const computedSize = view?.getComputedStyle?.(cell)?.fontSize
  const parsed = Number.parseFloat(computedSize || '')
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 12
}

const getBaseFontSize = (cell, view) => {
  const cached = Number.parseFloat(cell.getAttribute?.('data-print-autofit-base-font-size') || '')
  if (Number.isFinite(cached) && cached > 0) return cached
  const base = getFontSize(cell, view)
  if (cell.setAttribute) cell.setAttribute('data-print-autofit-base-font-size', String(base))
  return base
}

const getAvailableWidth = (cell) => {
  const clientWidth = Number(cell.clientWidth) || 0
  if (clientWidth > 0) return clientWidth
  const rectWidth = Number(cell.getBoundingClientRect?.().width) || 0
  if (rectWidth > 0) return rectWidth
  return Number(cell.offsetWidth) || 0
}

const fitsOnOneLine = (cell, width) => {
  const scrollWidth = Number(cell.scrollWidth) || 0
  if (!width || !scrollWidth) return null
  return scrollWidth <= width + FIT_EPSILON
}

const roundFontSize = (value) => Math.round(value * 100) / 100

const setPrintStyle = (cell, property, value) => {
  cell.style.setProperty(property, value, 'important')
}

const fitCell = (cell, options, view, kind = null) => {
  if (!cell) return false

  const text = normalizeText(cell.textContent)
  const baseSize = getBaseFontSize(cell, view)
  setPrintStyle(cell, 'overflow', 'visible')
  setPrintStyle(cell, 'text-overflow', 'unset')
  setPrintStyle(cell, 'word-break', 'normal')
  setPrintStyle(cell, 'overflow-wrap', 'normal')

  // 检验要求/标准是说明性长文本，超过 14 字时保持正常字号并自然换行。
  if (kind === 'standard' && text.length > 14) {
    setPrintStyle(cell, 'font-size', `${baseSize}px`)
    setPrintStyle(cell, 'white-space', 'normal')
    setPrintStyle(cell, 'word-break', 'break-all')
    setPrintStyle(cell, 'overflow-wrap', 'anywhere')
    setPrintStyle(cell, 'height', 'auto')
    return Boolean(text)
  }

  setPrintStyle(cell, 'white-space', 'nowrap')
  if (!text) return false

  // 项目短文本不做无谓缩放；超过 5 字才进入缩小流程。
  if (kind === 'project' && text.length <= 5) {
    setPrintStyle(cell, 'font-size', `${baseSize}px`)
    return true
  }

  const width = getAvailableWidth(cell)
  // jsdom/未完成布局时宽度为 0，跳过以免把测试或预览内容强制成最小字号。
  if (!width) return false

  const minSize = Math.max(3, Number(options.minFontSize) || DEFAULT_MIN_FONT_SIZE)
  const dataMax = Number.parseFloat(cell.getAttribute('data-print-autofit-max') || '')
  const requestedMaxSize = Math.min(
    MAX_FONT_SIZE,
    Number.isFinite(dataMax) ? dataMax : baseSize * (Number(options.maxFontScale) || DEFAULT_MAX_FONT_SCALE)
  )
  // 项目列只在确有溢出时缩小，短列或宽裕列保持模板字号，不被无谓放大。
  const maxSize = kind === 'project' ? baseSize : Math.max(baseSize, requestedMaxSize)

  let low = Math.min(minSize, maxSize)
  let high = Math.max(minSize, maxSize)
  let best = low

  // 二分搜索能同时放大短文本、缩小长文本，且比逐像素递减更快。
  for (let index = 0; index < 9; index += 1) {
    const candidate = (low + high) / 2
    setPrintStyle(cell, 'font-size', `${candidate}px`)
    const fits = fitsOnOneLine(cell, width)
    if (fits === null) return false
    if (fits) {
      best = candidate
      low = candidate
    } else {
      high = candidate
    }
  }

  // 最小字号仍放不下时换行，确保内容可见而不是被截断。
  setPrintStyle(cell, 'font-size', `${roundFontSize(best)}px`)
  if (fitsOnOneLine(cell, width) === false) {
    setPrintStyle(cell, 'white-space', 'normal')
    setPrintStyle(cell, 'word-break', 'break-all')
    setPrintStyle(cell, 'overflow-wrap', 'anywhere')
    setPrintStyle(cell, 'height', 'auto')
  }
  return true
}

/**
 * 将打印表格中的内容调整到单元格可见范围内。
 * 标准列长文本自然换行，其余内容尽量保持单行并在必要时缩小。
 * @param {Document} doc 打印 iframe 的 document
 * @param {Object} options
 * @returns {number} 实际处理的单元格数量
 */
export function autoFitPrintDocument(doc, options = {}) {
  if (!doc?.querySelectorAll) return 0
  const view = doc.defaultView || (typeof window !== 'undefined' ? window : null)
  const targets = findPrintAutoFitTargets(doc)
  const targetCells = new Set(targets.keys())
  const allCells = Array.from(doc.querySelectorAll('table td, table th'))
  const cells = new Set([...allCells, ...targetCells])
  let count = 0
  for (const cell of cells) {
    const kind = targets.get(cell)
    const cellOptions = targetCells.has(cell)
      ? options
      : { ...options, maxFontScale: 1 }
    if (fitCell(cell, cellOptions, view, kind)) count += 1
  }
  return count
}

export default autoFitPrintDocument
