import { describe, expect, test } from 'vitest'
import {
  normalizePurchaseOrderResponse,
  normalizePurchaseRequisitionResponse
} from '@/utils/purchaseContracts'

describe('purchase response contracts', () => {
  test('normalizes a legacy order relation for list rows', () => {
    const order = {
      id: 8,
      order_no: 'PO-008',
      requisition_id: 42,
      requisition_number: 'PR-042',
      status: 'pending'
    }
    const response = normalizePurchaseOrderResponse({
      data: { list: [order], items: [order], total: 1 }
    })

    expect(response.data.list[0]).toMatchObject({
      id: 8,
      orderNo: 'PO-008',
      requisitionId: 42,
      requisitionNumber: 'PR-042',
      hasRequisition: true
    })
    expect(response.data.items[0].requisitionId).toBe(42)
  })

  test('keeps order detail items as material lines instead of remapping them as orders', () => {
    const response = normalizePurchaseOrderResponse({
      data: {
        id: 8,
        order_no: 'PO-008',
        requisition_id: 42,
        items: [{ id: 101, material_id: 9, material_code: 'MAT-9', quantity: '2', unit_price: '3.5' }]
      }
    })

    expect(response.data).toMatchObject({ orderNo: 'PO-008', requisitionId: 42 })
    expect(response.data.items).toHaveLength(1)
    expect(response.data.items[0]).toMatchObject({
      materialId: 9,
      materialCode: 'MAT-9',
      quantity: 2,
      unitPrice: 3.5,
      totalPrice: 7
    })
    expect(response.data.items[0].orderNo).toBeUndefined()
  })

  test('supports an old items-only requisition list envelope', () => {
    const response = normalizePurchaseRequisitionResponse({
      data: {
        items: [{ requisition_no: 'PR-1', materials: [{ material_id: 7, quantity: '4' }] }],
        total: 1
      }
    })

    expect(response.data.list).toHaveLength(1)
    expect(response.data.list[0]).toMatchObject({
      requisitionNo: 'PR-1',
      requisitionNumber: 'PR-1'
    })
    expect(response.data.list[0].materials[0]).toMatchObject({ materialId: 7, quantity: 4 })
  })

  test('normalizes requisition detail items into both supported aliases', () => {
    const response = normalizePurchaseRequisitionResponse({
      data: {
        id: 42,
        requisition_no: 'PR-042',
        items: [{ material_id: 7, material_code: 'MAT-7', quantity: '4' }]
      }
    })

    expect(response.data).toMatchObject({
      requisitionNo: 'PR-042',
      requisitionNumber: 'PR-042'
    })
    expect(response.data.materials).toEqual(response.data.items)
    expect(response.data.materials[0]).toMatchObject({ materialId: 7, quantity: 4 })
  })
})
