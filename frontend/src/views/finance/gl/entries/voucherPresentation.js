export const voucherFlag = value => value === true || value === 1 || value === '1'

export const voucherStatus = entry => {
  if (voucherFlag(entry?.isReversed) || entry?.reversalEntryId) return '已冲销'
  if (voucherFlag(entry?.isReversalEntry) || entry?.reversalOfEntryId) return '冲销凭证（已过账）'
  return voucherFlag(entry?.isPosted) ? '已过账' : '未过账'
}

export const postingMethodLabel = method => ({ automatic: '自动过账', manual: '人工过账' })[method] || method || '未记录'

export const settlementMethodLabel = method => ({
  bank_transfer: '银行转账', cash: '现金', check: '支票', credit_card: '信用卡', other: '其他',
})[method] || method || ''

const manualTypes = [null, undefined, '', 'manual', 'manual_entry', '手工凭证', '记账凭证']
export const isManualVoucher = entry => Boolean(entry) &&
  manualTypes.includes(entry.rawDocumentType ?? entry.documentType) &&
  manualTypes.includes(entry.transactionType) && !entry.transactionId && !voucherFlag(entry.hasBusinessLinks)

export const reversalUnavailableReason = entry => {
  if (!entry) return '请先选择凭证'
  if (!voucherFlag(entry.isPosted)) return '未过账凭证无需冲销'
  if (voucherFlag(entry.isReversed) || entry.reversalEntryId) return '该凭证已经冲销'
  if (voucherFlag(entry.isReversalEntry) || entry.reversalOfEntryId) return '冲销凭证不能再次冲销'
  if (!isManualVoucher(entry)) return '业务或结转凭证请通过原业务撤销或期间反结账处理'
  return ''
}

export const normalizeVoucherPeriod = period => ({
  id: period.id,
  periodName: period.periodName ?? period.period_name ?? '',
  fiscalYear: period.fiscalYear ?? period.fiscal_year,
  startDate: String(period.startDate ?? period.start_date ?? '').slice(0, 10),
  endDate: String(period.endDate ?? period.end_date ?? '').slice(0, 10),
  isClosed: voucherFlag(period.isClosed ?? period.is_closed),
  isLocked: voucherFlag(period.isLocked ?? period.is_locked),
})
export const isOpenVoucherPeriod = period => Boolean(period) && !period.isClosed && !period.isLocked
