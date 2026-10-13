import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { buildPurchaseOrderPrintData } from '@/utils/purchaseOrderPrint'
import { normalizePurchaseOrderResponse } from '@/utils/purchaseContracts'
import { usePurchaseOrderActions } from '@/views/purchase/composables/usePurchaseOrderActions'

const mocks = vi.hoisted(() => ({
  getOrder: vi.fn(),
  getCompanyInfo: vi.fn(async () => ({ company_name: '浙江开控电气有限公司' })),
  previewByDefaultTemplate: vi.fn(),
  warning: vi.fn(), error: vi.fn()
}))
vi.mock('@/api', () => ({ purchaseApi: { getOrder: mocks.getOrder } }))
vi.mock('@/services/axiosInstance', () => ({ api: {}, fastApi: {} }))
vi.mock('@/stores/finance', () => ({ useFinanceStore: () => ({}) }))
vi.mock('@/services/printService', () => ({ default: {
  getCompanyInfo: mocks.getCompanyInfo, previewByDefaultTemplate: mocks.previewByDefaultTemplate
} }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { warning: mocks.warning, error: mocks.error } }))
vi.mock('element-plus/es/components/message-box/index', () => ({ ElMessageBox: {} }))

const exampleOrder = () => ({
  id: 22, companyName: '浙江开控电气有限公司', orderNo: 'G2610060022',
  orderDate: '2026-10-06', expectedDeliveryDate: '2026-10-30',
  supplierCode: 'G010', supplierName: '浙江久制电气有限公司', senderName: '潘林苏',
  subtotal: 12869.47, taxAmount: 1673.03, totalAmount: 14542.50,
  items: [{ id: 35, materialCode: '3012007035', materialName: 'SL 40（红）',
    specification: 'D4 RECTANGLE LED ASS', unit: '个', quantity: 5000,
    unitPrice: 2.573894, totalPrice: 12869.47, taxAmount: 1673.03, taxRate: 0.13 }]
})

const approvedOrder = (overrides = {}) => ({
  ...exampleOrder(), status: 'approved', approverId: 42, approverName: '陈贤萍',
  approverSignatureCode: 'c', approvedAt: '2026-10-09 00:15:30', ...overrides
})

const blankApproval = {
  approverName: '', approverSignatureCode: '', approverSignature: '', approvalDate: ''
}

describe('purchase order print data', () => {
  it('prints the reference amount and four-decimal tax-inclusive price, while preserving legacy net amounts', () => {
    const source = exampleOrder()
    const original = structuredClone(source)
    const printed = buildPurchaseOrderPrintData(source)
    expect(printed).toMatchObject({
      companyName: '浙江开控电气有限公司', orderNo: 'G2610060022', orderNumber: 'G2610060022',
      orderDate: '10/06/26', deliveryDate: '10/30/26', supplierCode: 'G010', senderName: '潘林苏',
      subtotal: '12,869.47', taxAmount: '1,673.03', totalAmount: '14,542.50',
      amountUpper: '壹万肆仟伍佰肆拾贰元伍角整', totalQuantity: '5,000'
    })
    expect(printed.items[0]).toMatchObject({
      quantity: '5,000', unitName: '个', unitPrice: '2.5739', price: '2.5739',
      amount: '12,869.47', totalPrice: '12,869.47',
      taxInclusiveUnitPrice: '2.9085', taxInclusiveAmount: '14,542.50', deliveryDate: '10/30/26'
    })
    expect(source).toEqual(original)
  })

  it('handles zero VAT, percent VAT, line rounding and fractional quantities', () => {
    const printed = buildPurchaseOrderPrintData({ items: [
      { quantity: 0.1234, unitPrice: 10, taxRate: 13 },
      { quantity: 1, unitPrice: 1.15, taxRate: 0 }
    ] })
    expect(printed.items[0]).toMatchObject({ quantity: '0.1234', amount: '1.23', taxInclusiveAmount: '1.39' })
    expect(printed.items[1]).toMatchObject({ amount: '1.15', taxInclusiveAmount: '1.15' })
    expect(printed).toMatchObject({ subtotal: '2.38', taxAmount: '0.16', totalAmount: '2.54', totalQuantity: '1.1234' })
    expect(buildPurchaseOrderPrintData({ totalAmount: 1.10 }).amountUpper).toBe('壹元壹角整')
    expect(buildPurchaseOrderPrintData({ totalAmount: 1 }).amountUpper).toBe('壹元整')
    expect(buildPurchaseOrderPrintData({ totalAmount: 1.15 }).amountUpper).toBe('壹元壹角伍分')
    expect(buildPurchaseOrderPrintData({ totalAmount: 0 }).amountUpper).toBe('零元整')
  })

  it('keeps explicitly masked or missing prices and totals unknown instead of reconstructing them', () => {
    const printed = buildPurchaseOrderPrintData({
      subtotal: null, taxAmount: '***', totalAmount: '',
      items: [{ quantity: 3, unitPrice: null, price: 999, totalPrice: '***', amount: 2997, taxAmount: null, taxRate: 13 }]
    })
    expect(printed).toMatchObject({ subtotal: '-', taxAmount: '-', totalAmount: '-', amountUpper: '-' })
    expect(printed.items[0]).toMatchObject({
      quantity: '3', price: '-', unitPrice: '-', amount: '-', totalPrice: '-',
      taxInclusiveUnitPrice: '-', taxInclusiveAmount: '-'
    })
    const noRate = buildPurchaseOrderPrintData({ items: [{ quantity: 1, unitPrice: 100 }] })
    expect(noRate.items[0].taxInclusiveAmount).toBe('-')
    expect(noRate.totalAmount).toBe('-')
    expect(buildPurchaseOrderPrintData({}).totalAmount).toBe('-')
  })

  it('preserves unknown financial data through the real API response normalizer', () => {
    const normalized = normalizePurchaseOrderResponse({ data: {
      order_no: 'PO-MASKED', total_amount: '***', subtotal: '***', tax_amount: null,
      items: [
        { quantity: 5, unit_price: '***', total_price: '***', tax_amount: '***', tax_rate: 13 },
        { quantity: 5 },
        { quantity: 5, unitPrice: null, price: 99, totalPrice: null, amount: 495, taxAmount: null, taxRate: 13 }
      ]
    } }).data
    normalized.items.forEach(item => expect(item).toMatchObject({ unitPrice: null, totalPrice: null, taxAmount: null }))
    expect(normalized).toMatchObject({ subtotal: null, taxAmount: null, totalAmount: null })
    const printed = buildPurchaseOrderPrintData(normalized)
    expect(printed).toMatchObject({ subtotal: '-', taxAmount: '-', totalAmount: '-', amountUpper: '-' })
    expect(printed).not.toHaveProperty('total_amount')
    printed.items.forEach(item => {
      expect(item).toMatchObject({ unitPrice: '-', totalPrice: '-', taxInclusiveUnitPrice: '-', taxInclusiveAmount: '-' })
      expect(item).not.toHaveProperty('unit_price')
      expect(item).not.toHaveProperty('total_price')
    })
  })

  it('calculates a missing tax amount only when the API supplies a known amount and rate', () => {
    const normalized = normalizePurchaseOrderResponse({ data: {
      order_no: 'PO-VAT', items: [
        { quantity: 2, unit_price: 100, tax_rate: 13 },
        { quantity: 1, unit_price: 100, tax_rate: 0 },
        { quantity: 1, unit_price: 100 }
      ]
    } }).data
    expect(normalized.items.map(item => item.taxAmount)).toEqual([26, 0, null])
    const printed = buildPurchaseOrderPrintData(normalized)
    expect(printed.items.map(item => item.taxInclusiveAmount)).toEqual(['226.00', '100.00', '-'])
  })

  it('formats legacy aliases after API normalization without stale snake fields shadowing them', () => {
    const normalized = normalizePurchaseOrderResponse({ data: {
      order_no: 'PO-LEGACY', order_date: '2026-10-06', supplier_code: 'G010', sender_name: '采购员',
      subtotal: 2468.12, tax_amount: 0, total_amount: 2468.12,
      items: [{ material_code: 'M1', quantity: 1, unit_price: 2468.1234, total_price: 2468.12,
        tax_rate: 0, delivery_date: '2026-10-30' }]
    } }).data
    const printed = buildPurchaseOrderPrintData(normalized)
    expect(printed).toMatchObject({ orderDate: '10/06/26', totalAmount: '2,468.12', supplierCode: 'G010', senderName: '采购员' })
    expect(printed.items[0]).toMatchObject({ unitPrice: '2,468.1234', totalPrice: '2,468.12', deliveryDate: '10/30/26' })
    expect(printed).not.toHaveProperty('order_date')
    expect(printed).not.toHaveProperty('total_amount')
    expect(printed.items[0]).not.toHaveProperty('unit_price')
  })

  it.each([0, 1, 8, 9, 16, 17])('preserves all %i real lines and pads only the page rows', (count) => {
    const source = Array.from({ length: count }, (_, index) => ({ id: index + 1, materialCode: `M${index}`, quantity: index + 1 }))
    const printed = buildPurchaseOrderPrintData({ items: source })
    const pageCount = Math.max(1, Math.ceil(count / 8))
    expect(printed.items).toHaveLength(count)
    expect(printed.printPages).toHaveLength(pageCount)
    printed.printPages.forEach((page, pageIndex) => {
      expect(page).toMatchObject({ pageNumber: pageIndex + 1, pageCount, isLastPage: pageIndex === pageCount - 1 })
      expect(page.items).toHaveLength(8)
    })
    const rows = printed.printPages.flatMap(page => page.items)
    expect(rows.filter(row => !row.isBlank).map(row => row.id)).toEqual(source.map(row => row.id))
    expect(rows.map(row => row.index)).toEqual(Array.from({ length: pageCount * 8 }, (_, index) => index + 1))
    rows.filter(row => row.isBlank).forEach(row => {
      expect(row).toMatchObject({ quantity: '', unitPrice: '', amount: '', taxInclusiveUnitPrice: '', taxInclusiveAmount: '', deliveryDate: '' })
    })
  })

  it('retains long notes and per-line dates, without inventing supplier fax or sender names', () => {
    const requirements = '按图纸执行。\n包装要求：' + '每盒贴物料标签。'.repeat(20)
    const printed = buildPurchaseOrderPrintData({
      orderDate: '2026-10-06T00:00:00.000Z', expectedDeliveryDate: '2026-10-30', remarks: requirements,
      items: [{ remarks: '红色\n包装20个一盒', deliveryDate: '2026-11-01' }, { deliveryDate: '2026-02-30' }]
    })
    expect(printed.technicalRequirements).toBe(requirements)
    expect(printed.notes).toBe(requirements)
    expect(printed.items[0]).toMatchObject({ remark: '红色\n包装20个一盒', deliveryDate: '11/01/26' })
    expect(printed.items[1].deliveryDate).toBe('10/30/26')
    expect(printed).toMatchObject({ orderDate: '10/06/26', supplierFax: '', senderName: '' })
  })
})

describe('purchase order approval signatures', () => {
  it('uses the actual approver account signature and approval day without mutating the order', () => {
    const order = approvedOrder({ approverName: '实际审核人', approverSignatureCode: ' p ' })
    const original = structuredClone(order)
    expect(buildPurchaseOrderPrintData(order)).toMatchObject({
      approverName: '实际审核人', approverSignatureCode: 'P', approverSignature: 'P',
      approvalDate: '10/09/26', orderDate: '10/06/26', senderName: '潘林苏'
    })
    expect(order).toEqual(original)
  })

  it.each(['draft', 'pending', 'rejected', 'withdrawn', 'cancelled'])(
    'leaves signatures and dates blank for %s orders even if old approval fields remain', (status) => {
      const printed = buildPurchaseOrderPrintData(approvedOrder({
        status, approver_name: '旧审核人', approver_signature_code: 'A', approver_signature: 'A',
        approval_date: '10/01/26', approved_at: '2026-10-01 12:00:00', approver_id: 7
      }))
      expect(printed).toMatchObject({ ...blankApproval, approverId: null, approvedAt: null })
      for (const alias of ['approver_name', 'approver_signature_code', 'approver_signature', 'approval_date', 'approved_at', 'approver_id']) {
        expect(printed).not.toHaveProperty(alias)
      }
    }
  )

  it.each(['approved', 'confirmed', 'partial_received', 'received', 'inspecting', 'inspected', 'warehousing', 'completed'])(
    'retains valid approval signatures after an order reaches %s', (status) => {
      expect(buildPurchaseOrderPrintData(approvedOrder({ status }))).toMatchObject({
        approverName: '陈贤萍', approverSignature: 'C', approvalDate: '10/09/26'
      })
    }
  )

  it('clears a rejected and resubmitted approval and prints the newly approved person and date', () => {
    const firstApproval = approvedOrder()
    expect(buildPurchaseOrderPrintData({ ...firstApproval, status: 'rejected' })).toMatchObject(blankApproval)
    expect(buildPurchaseOrderPrintData({ ...firstApproval, status: 'pending' })).toMatchObject(blankApproval)
    expect(buildPurchaseOrderPrintData({
      ...firstApproval, approverId: 51, approverName: '新审核人',
      approverSignatureCode: 'a', approvedAt: '2026-10-12 15:10:00'
    })).toMatchObject({ approverName: '新审核人', approverSignature: 'A', approvalDate: '10/12/26' })
  })

  it('uses the real name as plain text when the account has no configured signature, even for a preset name', () => {
    const printed = buildPurchaseOrderPrintData(approvedOrder({
      approverSignatureCode: null, approverSignature: 'P', approver_signature_code: 'O', approver_signature: 'A'
    }))
    expect(printed).toMatchObject({
      approverName: '陈贤萍', approverSignatureCode: '', approverSignature: '', approvalDate: '10/09/26'
    })
    expect(printed).not.toHaveProperty('approver_signature_code')
    expect(printed).not.toHaveProperty('approver_signature')
  })

  it.each(['', ' ', 'AB', '陈贤萍', '1', '<svg>', 'Ｏ'])(
    'rejects the invalid electronic signature code %j while retaining the approver name', (code) => {
      expect(buildPurchaseOrderPrintData(approvedOrder({ approverSignatureCode: code }))).toMatchObject({
        approverName: '陈贤萍', approverSignatureCode: '', approverSignature: '', approvalDate: '10/09/26'
      })
    }
  )

  it.each([null, undefined, 0, '0', '', ' ', -1, false, 'user-42', 1.5])(
    'requires a real approver ID (%j cannot provide approval evidence)', (approverId) => {
      expect(buildPurchaseOrderPrintData(approvedOrder({ approverId }))).toMatchObject(blankApproval)
    }
  )

  it.each([
    null, undefined, '', 'not a date', '2026-02-30 12:00:00', '2026-10-09 24:00:00',
    '2026-10-09 23:60:00', '2026-10-09 23:59:60', '2026-10-09 nonsense', '2026-10-09T00:00:00+25:00'
  ])('requires a valid approval date (%j cannot provide approval evidence)', (approvedAt) => {
    expect(buildPurchaseOrderPrintData(approvedOrder({ approvedAt }))).toMatchObject(blankApproval)
  })

  it.each([
    ['2026-10-09 00:15:30', '10/09/26'],
    ['2026-10-09 23:59:59.999999', '10/09/26'],
    ['2026-10-08T16:05:00.000Z', '10/09/26'],
    ['2026-10-09T00:05:00+08:00', '10/09/26'],
    ['2026-10-09T23:30:00-04:00', '10/10/26'],
    ['2026-12-31T16:00:00Z', '01/01/27'],
    ['2028-02-29 00:00:00', '02/29/28']
  ])('formats approval timestamp %s using the +08:00 calendar day', (approvedAt, approvalDate) => {
    expect(buildPurchaseOrderPrintData(approvedOrder({ approvedAt })).approvalDate).toBe(approvalDate)
  })

  it('keeps the approval date fixed when the print clock changes without changing order-date semantics', () => {
    vi.useFakeTimers()
    try {
      const order = approvedOrder({ orderDate: '2026-10-06T20:30:00.000Z', approvedAt: '2026-10-08T16:05:00.000Z' })
      vi.setSystemTime(new Date('2026-10-10T01:00:00Z'))
      const firstPrint = buildPurchaseOrderPrintData(order)
      vi.setSystemTime(new Date('2027-01-25T22:00:00Z'))
      const laterPrint = buildPurchaseOrderPrintData(order)
      expect(firstPrint).toMatchObject({ approvalDate: '10/09/26', orderDate: '10/06/26' })
      expect(laterPrint.approvalDate).toBe(firstPrint.approvalDate)
    } finally {
      vi.useRealTimers()
    }
  })

  it('normalizes legacy approval fields once at the API boundary and replaces stale print aliases', () => {
    const normalized = normalizePurchaseOrderResponse({ data: {
      ...exampleOrder(), status: 'approved', approver_id: '42', approver_name: '陈贤萍',
      approver_signature_code: 'c', approved_at: '2026-10-09 00:15:30',
      approver_signature: 'P', approval_date: '10/01/26'
    } }).data
    expect(normalized).toMatchObject({
      approverId: '42', approverName: '陈贤萍', approverSignatureCode: 'c', approvedAt: '2026-10-09 00:15:30'
    })
    const printed = buildPurchaseOrderPrintData(normalized)
    expect(printed).toMatchObject({
      approverName: '陈贤萍', approverSignatureCode: 'C', approverSignature: 'C', approvalDate: '10/09/26'
    })
    expect(printed).not.toHaveProperty('approver_signature_code')
    expect(printed).not.toHaveProperty('approver_signature')
    expect(printed).not.toHaveProperty('approval_date')
  })

  it('preserves explicit camel nulls instead of resurrecting old snake approval evidence', () => {
    const normalized = normalizePurchaseOrderResponse({ data: {
      ...exampleOrder(), status: 'approved', approverId: null, approverName: null,
      approverSignatureCode: null, approvedAt: null,
      approver_id: 42, approver_name: '陈贤萍', approver_signature_code: 'c', approved_at: '2026-10-09 00:15:30'
    } }).data
    expect(normalized).toMatchObject({ approverId: null, approverName: null, approverSignatureCode: null, approvedAt: null })
    expect(buildPurchaseOrderPrintData(normalized)).toMatchObject(blankApproval)
  })

  it.each([null, ''])('preserves an explicitly cleared signature (%j) even when legacy aliases remain', (code) => {
    const normalized = normalizePurchaseOrderResponse({ data: approvedOrder({
      approverSignatureCode: code, approver_signature_code: 'P', approver_signature: 'A'
    }) }).data
    expect(normalized.approverSignatureCode).toBe(code)
    expect(buildPurchaseOrderPrintData(normalized)).toMatchObject({
      approverName: '陈贤萍', approverSignatureCode: '', approverSignature: '', approvalDate: '10/09/26'
    })
  })
})

describe('purchase order print action', () => {
  it('passes the original API data through to printing, including fields absent from the detail table', async () => {
    const order = { ...exampleOrder(), remarks: '技术要求', items: [{
      ...exampleOrder().items[0], remarks: '备注描述', deliveryDate: '2026-11-02'
    }] }
    mocks.getOrder.mockResolvedValue(normalizePurchaseOrderResponse({ data: order }))
    const actions = usePurchaseOrderActions(vi.fn(), ref([{ id: 22 }]))
    await actions.viewOrder(22)
    await actions.printOrder()
    expect(mocks.previewByDefaultTemplate).toHaveBeenCalledWith('purchase', 'purchase_order', expect.objectContaining({
      supplierCode: 'G010', senderName: '潘林苏', technicalRequirements: '技术要求',
      items: [expect.objectContaining({ remark: '备注描述', deliveryDate: '11/02/26', taxInclusiveUnitPrice: '2.9085' })]
    }))
  })

  it('does not let detail-view fallbacks turn masked amounts into printable zeros', async () => {
    const order = { ...exampleOrder(), subtotal: '***', taxAmount: '***', totalAmount: '***',
      items: [{ quantity: 5000, price: '***', unitPrice: '***', amount: '***', totalPrice: '***', taxAmount: '***' }] }
    mocks.getOrder.mockResolvedValue(normalizePurchaseOrderResponse({ data: order }))
    const actions = usePurchaseOrderActions(vi.fn(), ref([{ id: 22 }]))
    await actions.viewOrder(22)
    await actions.printOrder()
    expect(mocks.previewByDefaultTemplate.mock.lastCall[2]).toMatchObject({
      totalAmount: '-', amountUpper: '-',
      items: [expect.objectContaining({ unitPrice: '-', amount: '-', taxInclusiveAmount: '-' })]
    })
  })

  it('passes the final approver signature and approval date from API details to the print template', async () => {
    mocks.getOrder.mockResolvedValue(normalizePurchaseOrderResponse({ data: approvedOrder() }))
    const actions = usePurchaseOrderActions(vi.fn(), ref([{ id: 22 }]))
    await actions.viewOrder(22)
    await actions.printOrder()
    expect(mocks.previewByDefaultTemplate.mock.lastCall[2]).toMatchObject({
      approverName: '陈贤萍', approverSignatureCode: 'C', approverSignature: 'C',
      approvalDate: '10/09/26', orderDate: '10/06/26'
    })
  })
})
