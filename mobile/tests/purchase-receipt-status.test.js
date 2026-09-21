import { describe, expect, test } from 'vitest'
import {
  PURCHASE_RECEIPT_STATUS,
  canCancelPurchaseReceipt,
  canCompletePurchaseReceipt,
  getPurchaseReceiptStatusText,
} from '@/constants/purchaseReceiptStatus'

describe('mobile purchase receipt lifecycle', () => {
  test('uses the persisted receipt status and list-level qualified quantity', () => {
    expect(canCompletePurchaseReceipt({ status: 'inspected', qualifiedQuantity: 8 })).toBe(true)
    expect(canCompletePurchaseReceipt({ status: 'inspected', qualifiedQuantity: 0 })).toBe(false)
    expect(canCompletePurchaseReceipt({ status: 'draft', qualifiedQuantity: 8 })).toBe(false)
    expect(canCompletePurchaseReceipt({ status: 'inspected', items: [{ qualifiedQuantity: 3 }] })).toBe(true)
    expect(canCompletePurchaseReceipt({ status: 'inspected', items: [{ qualifiedQuantity: 0 }] })).toBe(false)
  })

  test('allows cancellation only before inventory completion', () => {
    expect(canCancelPurchaseReceipt({ status: PURCHASE_RECEIPT_STATUS.DRAFT })).toBe(true)
    expect(canCancelPurchaseReceipt({ status: PURCHASE_RECEIPT_STATUS.INSPECTED })).toBe(true)
    expect(canCancelPurchaseReceipt({ status: PURCHASE_RECEIPT_STATUS.COMPLETED })).toBe(false)
    expect(canCancelPurchaseReceipt({ status: PURCHASE_RECEIPT_STATUS.CANCELLED })).toBe(false)
  })

  test('exposes no legacy confirmation state', () => {
    expect(getPurchaseReceiptStatusText('confirmed')).toBe('confirmed')
    expect(Object.values(PURCHASE_RECEIPT_STATUS)).toEqual(['draft', 'inspected', 'completed', 'cancelled'])
  })
})
