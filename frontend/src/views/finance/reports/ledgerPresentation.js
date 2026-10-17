import { escapeHtml } from '@/utils/htmlSecurity'

export const LEDGER_TITLES = {
  general: '总分类账',
  cash: '库存现金日记账',
  payable: '应付账款明细分类账',
  vat: '增值税多栏账',
  quantity: '数量金额明细账'
}

export const flattenLedgerColumns = columns => (columns || []).flatMap(column =>
  column.children?.length ? flattenLedgerColumns(column.children) : [column])

export function formatLedgerCell(row, column) {
  const value = row[column.key]
  if (value === undefined || value === null || value === '') return '—'
  if (column.decimals !== undefined) {
    const number = Number(value)
    if (!Number.isFinite(number)) return '—'
    return number.toLocaleString('zh-CN', {
      minimumFractionDigits: column.decimals,
      maximumFractionDigits: column.decimals
    })
  }
  return String(value)
}

export function ledgerFilterCaption(filters = {}) {
  return [filters.accountName, filters.supplierName, filters.materialName].filter(Boolean).join(' / ')
}

// Screen, Excel and print all use the same server-supplied column definitions.
export function ledgerHeaderRows(columns) {
  const grouped = columns.some(column => column.children?.length)
  const first = columns.map(column => ({
    label: column.label,
    colspan: column.children?.length || 1,
    rowspan: grouped && !column.children?.length ? 2 : 1
  }))
  return grouped ? [first, columns.flatMap(column => (column.children || []).map(child => ({
    label: child.label, colspan: 1, rowspan: 1
  })))] : [first]
}

export function buildLedgerPrintHtml(report) {
  const columns = report.columns || []
  const leafColumns = flattenLedgerColumns(columns)
  const printWidths = { description: 180, voucherNumber: 110, materialCode: 85, materialName: 85, unit: 36, date: 75, direction: 28, period: 65, accountCode: 65, accountName: 100 }
  const widths = leafColumns.map(column => printWidths[column.key] || 85)
  const totalWidth = widths.reduce((sum, width) => sum + width, 0)
  const colgroup = `<colgroup>${widths.map(width => `<col style="width:${(width / totalWidth * 100).toFixed(3)}%">`).join('')}</colgroup>`
  const headers = ledgerHeaderRows(columns).map(row => `<tr>${row.map(cell =>
    `<th colspan="${cell.colspan}" rowspan="${cell.rowspan}">${escapeHtml(cell.label)}</th>`
  ).join('')}</tr>`).join('')
  const body = (report.rows || []).map(row => `<tr class="${row.rowType === 'entry' ? '' : 'summary'}">${leafColumns.map(column =>
    `<td class="${column.decimals !== undefined ? 'number' : ''}">${escapeHtml(formatLedgerCell(row, column))}</td>`
  ).join('')}</tr>`).join('')
  const filters = report.filters || {}
  const notes = (report.warnings || []).map(warning => `<p class="note">${escapeHtml(warning)}</p>`).join('')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${escapeHtml(report.title)}</title>
    <style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,"Microsoft YaHei",sans-serif;color:#111;font-size:10px}
    h1{text-align:center;font-size:20px;margin:0 0 12px}.meta{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px}
    table{width:100%;border-collapse:collapse;table-layout:fixed;font:inherit;font-size:${leafColumns.length > 12 ? '8.5' : '10'}px}th,td{border:1px solid #777;padding:4px 3px;overflow-wrap:anywhere;font-size:inherit}
    th{background:#eee;text-align:center}thead{display:table-header-group}tr{break-inside:avoid}.number{text-align:right;font-variant-numeric:tabular-nums}
    .summary{font-weight:bold;background:#f5f5f5}.note{font-size:10px;line-height:1.5}footer{margin-top:10px;color:#555}</style></head><body>
    <h1>${escapeHtml(report.title)}</h1><div class="meta"><span>${escapeHtml(report.organizationName || '')}</span>
    <span>期间：${escapeHtml(filters.startMonth)} 至 ${escapeHtml(filters.endMonth)}</span><span>金额单位：元</span></div>
    <p>${escapeHtml(ledgerFilterCaption(filters))}</p>${notes}<table data-print-autofit="false">${colgroup}<thead>${headers}</thead><tbody>${body}</tbody></table>
    <footer>共 ${(report.rows || []).length} 行（含期初、合计及累计）</footer></body></html>`
}

export function populateLedgerWorksheet(sheet, report) {
  const columns = report.columns || []
  const leaves = flattenLedgerColumns(columns)
  sheet.addRow([report.title])
  sheet.mergeCells(1, 1, 1, Math.max(1, leaves.length))
  sheet.getRow(1).font = { size: 16, bold: true }
  sheet.getRow(1).height = 28
  sheet.addRow([`${report.filters?.startMonth || ''} 至 ${report.filters?.endMonth || ''}`, ledgerFilterCaption(report.filters), '金额单位：元'])
  for (const warning of report.warnings || []) {
    const note = sheet.addRow([warning])
    sheet.mergeCells(note.number, 1, note.number, Math.max(1, leaves.length))
    note.alignment = { vertical: 'middle', wrapText: true }
    note.height = 34
  }
  const headerStart = sheet.rowCount + 1
  const hasGroups = columns.some(column => column.children?.length)
  let index = 1
  columns.forEach(column => {
    const children = column.children || []
    sheet.getCell(headerStart, index).value = column.label
    if (children.length) {
      if (children.length > 1) sheet.mergeCells(headerStart, index, headerStart, index + children.length - 1)
      children.forEach((child, offset) => { sheet.getCell(headerStart + 1, index + offset).value = child.label })
    } else if (hasGroups) {
      sheet.mergeCells(headerStart, index, headerStart + 1, index)
    }
    index += children.length || 1
  })
  const headerEnd = headerStart + (hasGroups ? 1 : 0)
  for (let row = headerStart; row <= headerEnd; row++) {
    sheet.getRow(row).font = { bold: true }
    sheet.getRow(row).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    sheet.getRow(row).height = 32
  }
  leaves.forEach((column, offset) => {
    sheet.getColumn(offset + 1).width = column.key === 'description' ? 40 : Math.max(14, (column.width || 120) / 7)
  })
  for (const sourceRow of report.rows || []) {
    const row = sheet.addRow(leaves.map(column => {
      const value = sourceRow[column.key]
      if (value === null || value === undefined || value === '') return null
      return column.decimals !== undefined && Number.isFinite(Number(value)) ? Number(value) : String(value)
    }))
    row.alignment = { vertical: 'middle', wrapText: true }
    if (sourceRow.rowType !== 'entry') row.font = { bold: true }
    leaves.forEach((column, offset) => {
      if (column.decimals !== undefined) row.getCell(offset + 1).numFmt = `#,##0${column.decimals ? '.' + '0'.repeat(column.decimals) : ''}`
    })
  }
  sheet.views = [{ state: 'frozen', ySplit: headerEnd }]
  sheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${headerStart}:${headerEnd}` }
}
