import { settlementMethodLabel } from './voucherPresentation'

export const JOURNAL_COLUMNS = [
  { prop: 'periodName', label: '会计期', width: 88, header: true },
  { prop: 'entryDate', label: '日期', width: 94, header: true },
  { prop: 'voucherType', label: '凭证类型', width: 82, header: true },
  { prop: 'entryNumber', label: '凭证号', width: 114, header: true },
  { prop: 'documentType', label: '业务类型', width: 90 },
  { prop: 'documentNumber', label: '业务票据号', width: 132 },
  { prop: 'description', label: '摘要', width: 220 },
  { prop: 'accountCode', label: '科目代码', width: 94 },
  { prop: 'accountName', label: '科目名称', width: 180 },
  { prop: 'debitAmount', label: '借方（CNY）', width: 128, numeric: true },
  { prop: 'creditAmount', label: '贷方（CNY）', width: 128, numeric: true },
  { prop: 'departmentName', label: '部门', width: 100 },
  { prop: 'customerName', label: '客户', width: 150 },
  { prop: 'supplierName', label: '供应商', width: 150 },
  { prop: 'currencyName', label: '原币币种', width: 90 },
  { prop: 'foreignAmount', label: '外币金额', width: 112, numeric: true },
  { prop: 'exchangeRate', label: '汇率（CNY/原币）', width: 138, numeric: true },
  { prop: 'invoiceNumber', label: '发票号', width: 132 },
  { prop: 'settlementMethod', label: '结算方式', width: 100 },
  { prop: 'createdBy', label: '制单人', width: 90 },
  { prop: 'approverName', label: '审核人', width: 90 },
  { prop: 'postedBy', label: '过账人', width: 90 },
]

const voucherTypes = { 收: '收款凭证', 付: '付款凭证', 转: '转账凭证', 记: '记账凭证' }
const currencyNames = { CNY: '人民币', RMB: '人民币', USD: '美元', EUR: '欧元', HKD: '港币', JPY: '日元', TWD: '新台币' }
const amountFormatter = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatJournalAmount(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) === 0) return ''
  return amountFormatter.format(Number(value))
}

export function buildJournalRows(entries) {
  return entries.flatMap(entry => {
    const items = entry.items?.length ? entry.items : [null]
    return items.map((item, index) => ({
      ...entry,
      rowKey: `${entry.id}:${item?.id ?? index}`,
      entry,
      firstLine: index === 0,
      hasItem: Boolean(item),
      voucherType: voucherTypes[entry.voucherWord] || entry.voucherWord || '',
      description: item ? (item.description || entry.description || '') : '暂无分录',
      accountCode: item?.accountCode || '',
      accountName: item?.accountName || '',
      debitAmount: item?.debitAmount,
      creditAmount: item?.creditAmount,
      departmentName: item?.departmentName || '',
      customerName: item?.customerName || '',
      supplierName: item?.supplierName || '',
      currencyName: currencyNames[item?.currencyCode] || item?.currencyCode || '',
      exchangeRate: item?.currencyCode ? item.exchangeRate : '',
      foreignAmount: item?.foreignAmount,
      invoiceNumber: item?.invoiceNumber || '',
      settlementMethod: settlementMethodLabel(item?.settlementMethod),
    }))
  })
}

export function journalCellValue(row, column) {
  if (column.header && !row.firstLine) return ''
  if (['debitAmount', 'creditAmount', 'foreignAmount'].includes(column.prop)) {
    return formatJournalAmount(row[column.prop])
  }
  if (column.prop === 'exchangeRate') return Number(row.exchangeRate) > 0 ? Number(row.exchangeRate).toFixed(8) : ''
  return row[column.prop] ?? ''
}
