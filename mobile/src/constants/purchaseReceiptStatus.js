/**
 * Canonical lifecycle for purchase receipts.
 *
 * The persisted status is the single workflow state for a receipt. Quality
 * details explain the inspected result; they do not create another receipt
 * state machine.
 */
export const PURCHASE_RECEIPT_STATUS = Object.freeze({
  DRAFT: 'draft',
  INSPECTED: 'inspected',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
})

export const PURCHASE_RECEIPT_STATUS_VALUES = Object.freeze(Object.values(PURCHASE_RECEIPT_STATUS))

export const PURCHASE_RECEIPT_STATUS_LABELS = Object.freeze({
  [PURCHASE_RECEIPT_STATUS.DRAFT]: '草稿',
  [PURCHASE_RECEIPT_STATUS.INSPECTED]: '已检验',
  [PURCHASE_RECEIPT_STATUS.COMPLETED]: '已完成',
  [PURCHASE_RECEIPT_STATUS.CANCELLED]: '已取消',
})

export const PURCHASE_RECEIPT_STATUS_COLORS = Object.freeze({
  [PURCHASE_RECEIPT_STATUS.DRAFT]: 'default',
  [PURCHASE_RECEIPT_STATUS.INSPECTED]: 'primary',
  [PURCHASE_RECEIPT_STATUS.COMPLETED]: 'success',
  [PURCHASE_RECEIPT_STATUS.CANCELLED]: 'danger',
})

export const getPurchaseReceiptStatusText = (status) =>
  PURCHASE_RECEIPT_STATUS_LABELS[status] || status || '未知'

export const getPurchaseReceiptStatusColor = (status) =>
  PURCHASE_RECEIPT_STATUS_COLORS[status] || 'default'

const getQualifiedQuantity = (receipt) => {
  const headerQuantity = receipt?.qualifiedQuantity ?? receipt?.qualified_quantity
  if (headerQuantity != null) return Number(headerQuantity)

  return (receipt?.items || []).reduce(
    (total, item) => total + Number(item.qualifiedQuantity ?? item.qualified_quantity ?? 0),
    0
  )
}

export const canCompletePurchaseReceipt = (receipt) =>
  receipt?.status === PURCHASE_RECEIPT_STATUS.INSPECTED &&
  Number.isFinite(getQualifiedQuantity(receipt)) &&
  getQualifiedQuantity(receipt) > 0

export const canCancelPurchaseReceipt = (receipt) =>
  [PURCHASE_RECEIPT_STATUS.DRAFT, PURCHASE_RECEIPT_STATUS.INSPECTED].includes(receipt?.status)
