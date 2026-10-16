const COMPLETED_OUTBOUND_STATUSES = new Set(['completed', 'partial_completed'])

const FINANCE_STATUS_DISPLAY = Object.freeze({
  approved: { text: '已审', type: 'success' },
  pending: { text: '未审核', type: 'warning' },
  rejected: { text: '已驳回', type: 'danger' },
  reversed: { text: '已反审', type: 'info' },
})

/**
 * Formats the approval summary for an outbound document after business completion.
 * The business status column and workflow actions use the business status directly.
 */
export const getOutboundDisplayStatus = (row = {}, getBusinessStatusDisplay = (status) => ({
  text: status || '',
  type: 'info',
})) => {
  const status = row.status
  const financeStatus = row.financeStatus ?? row.finance_status

  if (COMPLETED_OUTBOUND_STATUSES.has(status) && financeStatus) {
    return FINANCE_STATUS_DISPLAY[financeStatus] || {
      text: String(financeStatus),
      type: 'info',
    }
  }

  return getBusinessStatusDisplay(status)
}
