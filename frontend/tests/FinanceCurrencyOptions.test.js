import { expect, test, vi } from 'vitest'
import { loadSettlementBankAccounts } from '@/views/finance/components/loadSettlementBankAccounts'
import { invoiceCurrencyError } from '@/views/finance/components/invoiceCurrency'

test('bank options traverse response pagination without dropping currencies from later pages', async () => {
  const first = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, currency: 'CNY' }))
  const api = { getBankAccounts: vi.fn().mockResolvedValueOnce({ data: first, pagination: { total: 101 } })
    .mockResolvedValueOnce({ data: [{ id: 101, currencyCode: 'USD', accountName: '美元户' }], pagination: { total: 101 } }) }
  const accounts = await loadSettlementBankAccounts(api)
  expect(api.getBankAccounts).toHaveBeenNthCalledWith(1, { page: 1, limit: 100 })
  expect(api.getBankAccounts).toHaveBeenNthCalledWith(2, { page: 2, limit: 100 })
  expect(accounts).toHaveLength(101)
  expect(accounts.at(-1).currencyCode).toBe('USD')
})

test('bank catalog fails incomplete pages and discards a cancelled load', async () => {
  const api = { getBankAccounts: vi.fn().mockResolvedValue({ data: { list: [{ id: 1 }], total: 2 } }) }
  await expect(loadSettlementBankAccounts(api)).rejects.toThrow('分页数据不完整')
  expect(await loadSettlementBankAccounts(api, () => false)).toEqual([])
})

test.each([null, '', 0, -1, '7.123456789', '1e-9'])('USD invoice rejects missing or invalid rate %s', exchangeRate => {
  expect(invoiceCurrencyError({ currencyCode: 'USD', exchangeRate })).toContain('最多 8 位')
})

test('USD accepts eight decimal places, while CNY always requires one', () => {
  expect(invoiceCurrencyError({ currencyCode: 'USD', exchangeRate: '0.00000001' })).toBe('')
  expect(invoiceCurrencyError({ currencyCode: 'USD', exchangeRate: '7.12345678' })).toBe('')
  expect(invoiceCurrencyError({ currencyCode: 'CNY', exchangeRate: 1 })).toBe('')
  expect(invoiceCurrencyError({ currencyCode: 'CNY', exchangeRate: 7.2 })).toContain('必须为 1')
})
