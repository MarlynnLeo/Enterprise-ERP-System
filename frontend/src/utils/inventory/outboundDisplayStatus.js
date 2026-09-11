const COMPLETED_OUTBOUND_STATUSES = new Set(['completed', 'partial_completed'])

const FINANCE_STATUS_DISPLAY = Object.freeze({
  approved: { text: '财务已审', type: 'success' },
  pending: { text: '待财务审', type: 'warning' },
  rejected: { text: '财务驳回', type: 'danger' },
})

/**
 * Returns the single status shown in the outbound list.
 * Business status remains authoritative for workflow actions; finance status
 * only replaces it visually after the outbound has reached a completed state.
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
