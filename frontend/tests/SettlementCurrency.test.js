import { describe, expect, test } from 'vitest'
import { formatSettlementAmount, settlementCurrencyFields, settlementValidationError } from '@/views/finance/components/settlementCurrency'

describe('settlement currency contract', () => {
  const banks = [{ id: 1, currency: 'CNY' }, { id: 2, currencyCode: 'USD' }]
  const usd = { currencyCode: 'USD', exchangeRate: '7.12345678', bankAccountId: 2, paymentMethod: 'bank_transfer' }

  test('preserves the invoice rate precision without assigning a missing USD rate', () => {
    expect(settlementCurrencyFields(usd)).toEqual({ currencyCode: 'USD', exchangeRate: '7.12345678' })
    expect(settlementCurrencyFields({ currencyCode: 'USD' }).exchangeRate).toBeNull()
    expect(settlementCurrencyFields({})).toEqual({ currencyCode: 'CNY', exchangeRate: 1 })
  })

  test('keeps original amount separate from the reporting currency and preserves missing data', () => {
    expect(formatSettlementAmount(10000.01, usd)).toBe('US$10,000.01')
    expect(formatSettlementAmount(0)).toBe('¥0.00')
    expect(formatSettlementAmount(null, usd)).toBe('-')
    expect(formatSettlementAmount('***', usd)).toBe('***')
  })

  test('rejects cross-currency banks and unsupported USD cash, rates, or currencies', () => {
    expect(settlementValidationError(usd, banks)).toBe('')
    expect(settlementValidationError({ ...usd, bankAccountId: 1 }, banks)).toContain('同币种')
    expect(settlementValidationError({ ...usd, currencyCode: 'CNY' }, banks)).toContain('同币种')
    expect(settlementValidationError({ ...usd, paymentMethod: 'cash' }, banks)).toContain('银行转账')
    expect(settlementValidationError({ ...usd, exchangeRate: null }, banks)).toContain('确认汇率')
    expect(settlementValidationError({ ...usd, currencyCode: 'EUR' }, banks)).toContain('仅支持')
  })
})
