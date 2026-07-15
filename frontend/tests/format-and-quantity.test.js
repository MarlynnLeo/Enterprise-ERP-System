import { describe, expect, test } from 'vitest'
import { formatAmount, formatDate, maskBankAccount } from '@/utils/format'
import { compareQuantities, parseQuantity } from '@/utils/helpers/quantity'

describe('financial and quantity formatting', () => {
  test('formats monetary values without losing precision', () => {
    expect(formatAmount('1234567.8')).toBe('1,234,567.80')
    expect(formatAmount(null)).toBe('-')
  })

  test('masks bank accounts and rejects invalid dates', () => {
    expect(maskBankAccount('6222 1234 5678 9012')).toBe('6222********9012')
    expect(formatDate('not-a-date')).toBe('')
  })

  test('normalizes quantities and compares decimal values safely', () => {
    expect(parseQuantity('1,234.50')).toBe(1234.5)
    expect(compareQuantities(0.1 + 0.2, 0.3, '==')).toBe(true)
  })
})
