import { NumberFormatter } from '@/utils/commonHelpers'
import { getSignatureDetails } from '@/constants/signatureConstants'

const ROWS_PER_PAGE = 8
const INACTIVE_APPROVAL_STATUSES = new Set(['draft', 'pending', 'rejected', 'withdrawn', 'cancelled'])
const amountFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const priceFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
const quantityFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
const approvalDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei', year: '2-digit', month: '2-digit', day: '2-digit'
})

const numberOrNull = (value) => {
  if (value === null || value === undefined || typeof value === 'boolean') return null
  const text = String(value).trim()
  if (!text) return null
  const number = Number(text.replace(/,/g, ''))
  return Number.isFinite(number) ? number : null
}

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100
const formatNumber = (value, formatter = amountFormatter) => value === null ? '-' : formatter.format(value)

const withPrintFields = (source, fields) => {
  const result = { ...source }
  for (const key of Object.keys(fields)) {
    const snakeKey = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
    if (snakeKey !== key) delete result[snakeKey]
  }
  return { ...result, ...fields }
}

// A provided null/masked amount is deliberately unknown. Do not reconstruct it
// from another alias or a quantity after the API has hidden financial fields.
const readNumber = (source, keys, fallback = () => null) => {
  for (const key of keys) {
    if (source[key] !== undefined) return numberOrNull(source[key])
  }
  return fallback()
}

const sumKnownNumbers = (values) => values.length && values.every(value => value !== null)
  ? values.reduce((sum, value) => sum + value, 0)
  : null
const sumKnownAmounts = (values) => {
  const total = sumKnownNumbers(values)
  return total === null ? null : roundMoney(total)
}

const formatPrintDate = (value) => {
  if (!value) return ''
  const date = String(value).trim()
  const iso = date.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[T\s])/)
  const printed = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (!iso && !printed) return ''
  const [, year, month, day] = iso || [null, `20${printed[3]}`, printed[1], printed[2]]
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() + 1 !== Number(month) || parsed.getUTCDate() !== Number(day)) return ''
  return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year.slice(-2)}`
}

const formatApprovalDate = (value) => {
  if (typeof value !== 'string') return ''
  const timestamp = value.trim()
  const match = timestamp.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})?)?$/i)
  if (!match) return ''
  const [, calendarDate, hour, minute, second, offset] = match
  const printed = formatPrintDate(calendarDate)
  if (!printed || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return ''

  // MySQL dateStrings already represent the +08:00 calendar date. Explicit
  // ISO offsets must be converted to that same day, independent of the device.
  if (!offset) return printed
  const parsed = new Date(timestamp.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? '' : approvalDateFormatter.format(parsed)
}

const buildApprovalPrintFields = (order) => {
  const approvalDate = formatApprovalDate(order.approvedAt)
  const id = order.approverId
  const hasApprover = (typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id.trim())))
    && Number.isSafeInteger(Number(id)) && Number(id) > 0
  const hasApproval = hasApprover && Boolean(approvalDate)
    && !INACTIVE_APPROVAL_STATUSES.has(String(order.status ?? '').trim().toLowerCase())
  // Only use canonical API fields: null must not fall through to a stale
  // signature alias, and an unconfigured name must not select a font glyph.
  const signature = getSignatureDetails({
    approverName: hasApproval ? (order.approverName ?? '') : '',
    approverSignatureCode: hasApproval ? (order.approverSignatureCode ?? '') : ''
  }, 'approver')
  return {
    approverId: hasApproval ? id : null,
    approvedAt: hasApproval ? order.approvedAt : null,
    approverName: signature.name,
    approverSignatureCode: signature.code,
    approverSignature: signature.code,
    approvalDate: hasApproval ? approvalDate : ''
  }
}

const amountUppercase = (amount) => {
  if (amount === null) return '-'
  const rounded = roundMoney(amount)
  // The shared formatter uses floor for cents. Move an exact cent just above
  // its binary representation so values such as 1.15 do not lose a cent.
  const correction = Math.sign(rounded) * Number.EPSILON * Math.max(1, Math.abs(rounded))
  const uppercase = NumberFormatter.digitUppercase(rounded + correction)
  return uppercase.endsWith('角') ? `${uppercase}整` : uppercase
}

const blankRow = (index) => ({
  index, isBlank: true,
  materialCode: '', productCode: '', materialName: '', productName: '', specification: '',
  remark: '', remarks: '', unit: '', unitName: '', quantity: '', price: '', unitPrice: '',
  totalPrice: '', total: '', amount: '', taxInclusiveUnitPrice: '', taxInclusiveAmount: '', deliveryDate: ''
})

/**
 * Build the purchase order form without mutating the API response.
 * Existing template amounts remain tax-exclusive. Templates can explicitly
 * use taxInclusiveUnitPrice/taxInclusiveAmount. Only printPages are padded.
 */
export function buildPurchaseOrderPrintData(order = {}) {
  const sourceItems = Array.isArray(order.items) ? order.items : []
  const deliveryDate = formatPrintDate(order.expectedDeliveryDate || order.deliveryDate)
  const amounts = sourceItems.map((item) => {
    const quantity = readNumber(item, ['quantity'])
    const unitPrice = readNumber(item, ['unitPrice', 'price'])
    const amount = readNumber(item, ['totalPrice', 'amount', 'total'], () => (
      quantity === null || unitPrice === null ? null : roundMoney(quantity * unitPrice)
    ))
    const rawRate = readNumber(item, ['taxRate'], () => readNumber(order, ['taxRate']))
    const rate = rawRate === null ? null : (rawRate > 1 ? rawRate / 100 : rawRate)
    const taxAmount = readNumber(item, ['taxAmount'], () => (
      amount === null || rate === null ? null : roundMoney(amount * rate)
    ))
    const taxInclusiveAmount = amount === null || taxAmount === null ? null : roundMoney(amount + taxAmount)
    const taxInclusiveUnitPrice = taxInclusiveAmount === null || quantity === null || quantity <= 0
      ? null
      : taxInclusiveAmount / quantity
    return { quantity, unitPrice, amount, taxAmount, taxInclusiveAmount, taxInclusiveUnitPrice }
  })

  const items = sourceItems.map((item, index) => {
    const line = amounts[index]
    const materialCode = item.materialCode || item.code || item.productCode || ''
    const materialName = item.materialName || item.name || item.productName || ''
    const unitName = item.unitName || item.unit || ''
    const remark = item.remarks || item.remark || ''
    const amount = formatNumber(line.amount)
    const unitPrice = formatNumber(line.unitPrice, priceFormatter)
    return withPrintFields(item, {
      index: index + 1, isBlank: false,
      materialCode, productCode: materialCode, materialName, productName: materialName,
      specification: item.specification || item.specs || item.model || '',
      unitName, unit: unitName, remark, remarks: remark,
      quantity: formatNumber(line.quantity, quantityFormatter),
      unitPrice, price: unitPrice, amount, totalPrice: amount, total: amount,
      taxInclusiveUnitPrice: formatNumber(line.taxInclusiveUnitPrice, priceFormatter),
      taxInclusiveAmount: formatNumber(line.taxInclusiveAmount),
      deliveryDate: formatPrintDate(item.deliveryDate) || deliveryDate
    })
  })

  const subtotal = readNumber(order, ['subtotal'], () => sumKnownAmounts(amounts.map(item => item.amount)))
  const taxAmount = readNumber(order, ['taxAmount'], () => sumKnownAmounts(amounts.map(item => item.taxAmount)))
  const totalAmount = readNumber(order, ['totalAmount'], () => (
    subtotal === null || taxAmount === null ? null : roundMoney(subtotal + taxAmount)
  ))
  const pageCount = Math.max(1, Math.ceil(items.length / ROWS_PER_PAGE))
  const printPages = Array.from({ length: pageCount }, (_, pageIndex) => ({
    pageNumber: pageIndex + 1,
    pageCount,
    isLastPage: pageIndex === pageCount - 1,
    items: Array.from({ length: ROWS_PER_PAGE }, (_, rowIndex) => {
      const index = pageIndex * ROWS_PER_PAGE + rowIndex
      return items[index] || blankRow(index + 1)
    })
  }))
  const remark = order.remarks || order.notes || order.remark || ''
  const orderNo = order.orderNo || order.orderNumber || ''

  return withPrintFields(order, {
    orderNo, orderNumber: orderNo,
    orderDate: formatPrintDate(order.orderDate),
    expectedDeliveryDate: deliveryDate, deliveryDate,
    supplierCode: order.supplierCode || '', supplierName: order.supplierName || '',
    contactPerson: order.contactPerson || '', contactPhone: order.contactPhone || '',
    supplierFax: order.supplierFax || '', senderName: order.senderName || '',
    ...buildApprovalPrintFields(order),
    notes: remark, remark, technicalRequirements: order.technicalRequirements ?? remark,
    contractCode: order.contractCode || '-',
    subtotal: formatNumber(subtotal), taxAmount: formatNumber(taxAmount), totalAmount: formatNumber(totalAmount),
    amountUpper: amountUppercase(totalAmount),
    totalQuantity: formatNumber(sumKnownNumbers(amounts.map(item => item.quantity)), quantityFormatter),
    items, printPages
  })
}
