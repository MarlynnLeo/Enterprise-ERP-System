import { describe, expect, test } from 'vitest'
import { formatOutboundQuantity } from '@/utils/inventory/outboundQuantity'
import { formatQuantityNumber } from '@/utils/helpers/quantity'

describe('outbound quantity display', () => {
  test.each(['个', '件', 'kg', null])('shows only the number when the material unit is %s', (itemUnitName) => {
    expect(formatOutboundQuantity({ outboundType: 'manual', totalQuantity: 246, itemUnitName })).toBe('246')
  })

  test.each(['bom_issue', 'batch_issue'])('retains the product quantity basis for %s without a unit suffix', (outboundType) => {
    expect(formatOutboundQuantity({ outboundType, productQuantity: 6, totalQuantity: 246 })).toBe('6')
    expect(formatOutboundQuantity({ outboundType, productQuantity: 0, totalQuantity: 246 })).toBe('0')
    expect(formatOutboundQuantity({ outboundType, productQuantity: null, totalQuantity: 2.4 })).toBe('2.4')
  })

  test.each([
    [0.6, '0.6'],
    [1.2000000000000002, '1.2'],
    ['2.400000', '2.4'],
    [0.000001, '0.000001'],
    [1234567.5, '1234567.5'],
    [0, '0'],
    [null, '0'],
    [undefined, '0'],
  ])('preserves quantity %s without truncation, grouping or redundant zeros', (quantity, expected) => {
    expect(formatQuantityNumber(quantity)).toBe(expected)
    expect(formatOutboundQuantity({ outboundType: 'production_outbound', totalQuantity: quantity })).toBe(expected)
  })

  test('does not present invalid quantities as real stock amounts', () => {
    expect(formatQuantityNumber('invalid')).toBe('-')
    expect(formatQuantityNumber(Infinity)).toBe('-')
  })
})
