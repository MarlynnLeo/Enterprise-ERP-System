import { describe, expect, test } from 'vitest'
import { moveOrderItemColumn, restoreOrderItemColumns } from '@/utils/orderItemColumns'

const columns = [
  { key: 'materialCode', draggable: true },
  { key: 'quantity', draggable: true },
  { key: 'unitPrice', draggable: true },
  { key: 'operations', draggable: false, fixed: 'right' }
]
const keys = (items) => items.map((column) => column.key)

describe('sales order item column ordering', () => {
  test('moves a column onto its right neighbor while keeping operations last', () => {
    const moved = moveOrderItemColumn(columns, 'materialCode', 'quantity')
    expect(keys(moved)).toEqual(['quantity', 'materialCode', 'unitPrice', 'operations'])
    expect(keys(columns)).toEqual(['materialCode', 'quantity', 'unitPrice', 'operations'])
  })

  test('moves the last editable column to the first position and back', () => {
    const moved = moveOrderItemColumn(columns, 'unitPrice', 'materialCode')
    expect(keys(moved)).toEqual(['unitPrice', 'materialCode', 'quantity', 'operations'])
    expect(moveOrderItemColumn(moved, 'unitPrice', 'quantity')).toEqual(columns)
  })

  test('ignores invalid keys and attempts to move the fixed operations column', () => {
    for (const [source, target] of [
      ['operations', 'materialCode'], ['quantity', 'operations'],
      ['unknown', 'quantity'], ['quantity', 'unknown'], ['quantity', 'quantity']
    ]) {
      expect(moveOrderItemColumn(columns, source, target)).toBe(columns)
    }
  })

  test('repairs duplicate and obsolete stored keys while retaining saved order', () => {
    const restored = restoreOrderItemColumns(columns, [
      'quantity', 'obsolete', 'quantity', 'operations', 'materialCode'
    ])
    expect(keys(restored)).toEqual(['quantity', 'materialCode', 'unitPrice', 'operations'])
    expect(new Set(keys(restored)).size).toBe(columns.length)
  })

  test('falls back to all default columns for non-array preferences', () => {
    expect(restoreOrderItemColumns(columns, null)).toEqual(columns)
    expect(restoreOrderItemColumns(columns, { quantity: 0 })).toEqual(columns)
  })
})
