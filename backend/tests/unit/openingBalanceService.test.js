const {
  aggregateSourceLines,
  amountParts,
  createSourceLine,
  normalizeBalanceDate,
  normalizeManualAmount,
} = require('../../src/services/business/OpeningBalanceService');

describe('OpeningBalanceService', () => {
  test('converts signed net balances into exclusive debit or credit amounts', () => {
    expect(amountParts(12550)).toEqual({ debit: 125.5, credit: 0 });
    expect(amountParts(-12550)).toEqual({ debit: 0, credit: 125.5 });
    expect(amountParts(0)).toEqual({ debit: 0, credit: 0 });
  });

  test('aggregates multiple system sources by configured GL account', () => {
    const accounts = new Map([
      ['1002', { id: 1, account_code: '1002' }],
      ['1601', { id: 2, account_code: '1601' }],
    ]);
    const result = aggregateSourceLines([
      createSourceLine({
        sourceType: 'bank_accounts',
        sourceLabel: '资金账户期初',
        accountCode: '1002',
        netAmount: 100,
      }),
      createSourceLine({
        sourceType: 'bank_accounts',
        sourceLabel: '资金账户期初',
        accountCode: '1002',
        netAmount: -25,
      }),
      createSourceLine({
        sourceType: 'fixed_assets',
        sourceLabel: '固定资产卡片原值',
        accountCode: '1601',
        netAmount: 200,
      }),
    ], accounts);

    expect(result.rows.get(1).netCents).toBe(7500);
    expect(result.rows.get(2).netCents).toBe(20000);
    expect(result.warnings).toEqual([]);
  });

  test('keeps zero-value configured sources governed by the system', () => {
    const accounts = new Map([['1122', { id: 3, account_code: '1122' }]]);
    const result = aggregateSourceLines([
      createSourceLine({
        sourceType: 'ar_invoices',
        sourceLabel: '应收未结发票',
        accountCode: '1122',
        netAmount: 0,
      }),
    ], accounts);

    expect(result.rows.has(3)).toBe(true);
    expect(result.rows.get(3).netCents).toBe(0);
  });

  test('validates initialization dates and manual amounts', () => {
    expect(normalizeBalanceDate('2026-06-01')).toBe('2026-06-01');
    expect(() => normalizeBalanceDate('2026-02-31')).toThrow('valid date');
    expect(normalizeManualAmount('12.345', 1)).toBe(12.35);
    expect(() => normalizeManualAmount(-1, 1)).toThrow('non-negative');
  });
});
