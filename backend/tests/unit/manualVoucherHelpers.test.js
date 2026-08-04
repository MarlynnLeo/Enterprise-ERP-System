/**
 * manualVoucherHelpers 单元测试
 */

const {
  ENTRY_ROLES,
  parseMergeFlag,
  normalizeOverridesMap,
  resolveMergedPayload,
  mergeDraftsIntoVoucher,
  accountsFromEntryLines,
  canonicalizeGenerateOverrides,
} = require('../../src/services/finance/manualVoucherHelpers');

describe('manualVoucherHelpers', () => {
  test('parseMergeFlag 默认 true，显式 false 生效', () => {
    expect(parseMergeFlag({}, true)).toBe(true);
    expect(parseMergeFlag({ merge: false }, true)).toBe(false);
    expect(parseMergeFlag({ merge: true }, false)).toBe(true);
  });

  test('normalizeOverridesMap 只认 camelCase 与有效 id', () => {
    const map = normalizeOverridesMap([
      {
        id: 12,
        taxRate: 13,
        items: [{ quantity: 2, unit_price: 10, material_id: 3 }],
        entryLines: [{ role: ENTRY_ROLES.COST, account_id: 99, debit_amount: 20 }],
      },
      { id: 'x' },
      null,
    ]);
    expect(map.size).toBe(1);
    const row = map.get(12);
    expect(row.taxRate).toBeCloseTo(0.13);
    expect(row.items).toHaveLength(1);
    expect(row.items[0].amount).toBe(20);
    expect(row.accounts.costAccountId).toBe(99);
  });

  test('resolveMergedPayload 按 source_id 拆明细', () => {
    const { perDocOverrides, mergedMeta } = resolveMergedPayload(
      {
        isMerged: true,
        sourceIds: [1, 2],
        description: '合并',
        taxRate: 0.13,
        items: [
          { source_id: 1, quantity: 1, unit_price: 10, material_id: 1 },
          { source_id: 2, quantity: 2, unit_price: 5, material_id: 2 },
        ],
        entryLines: [
          { role: 'payable', account_id: 7, credit_amount: 22.6 },
          { role: 'cost', account_id: 8, debit_amount: 20 },
          { role: 'tax', account_id: 9, debit_amount: 2.6 },
        ],
      },
      [1, 2]
    );
    expect(perDocOverrides.get(1).items).toHaveLength(1);
    expect(perDocOverrides.get(2).items[0].amount).toBe(10);
    expect(mergedMeta.accounts.payableAccountId).toBe(7);
    expect(mergedMeta.accounts.costAccountId).toBe(8);
  });

  test('mergeDraftsIntoVoucher 汇总金额与分录', () => {
    const drafts = [
      {
        id: 1,
        docNo: 'A1',
        partyName: '甲',
        partyId: 10,
        entryDate: '2026-08-01',
        subtotal: 100,
        taxAmount: 13,
        taxRate: 0.13,
        totalAmount: 113,
        items: [{ material_id: 1, quantity: 1, unit_price: 100, amount: 100 }],
        entryLines: [
          { role: 'cost', account_id: 1, debit_amount: 100, credit_amount: 0, description: '成本' },
          { role: 'tax', account_id: 2, debit_amount: 13, credit_amount: 0, description: '税' },
          { role: 'payable', account_id: 3, debit_amount: 0, credit_amount: 113, description: '应付' },
        ],
        accounts: { costAccountId: 1 },
      },
      {
        id: 2,
        docNo: 'A2',
        partyName: '甲',
        partyId: 10,
        entryDate: '2026-08-02',
        subtotal: 50,
        taxAmount: 6.5,
        taxRate: 0.13,
        totalAmount: 56.5,
        items: [{ material_id: 2, quantity: 1, unit_price: 50, amount: 50 }],
        entryLines: [
          { role: 'cost', account_id: 1, debit_amount: 50, credit_amount: 0 },
          { role: 'tax', account_id: 2, debit_amount: 6.5, credit_amount: 0 },
          { role: 'payable', account_id: 3, debit_amount: 0, credit_amount: 56.5 },
        ],
        accounts: {},
      },
    ];
    const merged = mergeDraftsIntoVoucher('purchase_receipt', drafts, true);
    expect(merged.isMerged).toBe(true);
    expect(merged.sourceIds).toEqual([1, 2]);
    expect(merged.subtotal).toBe(150);
    expect(merged.taxAmount).toBe(19.5);
    expect(merged.totalAmount).toBe(169.5);
    expect(merged.entryDate).toBe('2026-08-02');
    expect(merged.items).toHaveLength(2);
    const payable = merged.entryLines.find((l) => l.role === 'payable');
    expect(payable.credit_amount).toBe(169.5);
  });

  test('accountsFromEntryLines / canonicalizeGenerateOverrides', () => {
    expect(
      accountsFromEntryLines([
        { role: 'receivable', account_id: 11 },
        { role: 'income', account_id: 12 },
      ])
    ).toEqual({ receivableAccountId: 11, incomeAccountId: 12 });

    const canon = canonicalizeGenerateOverrides({
      id: 3,
      tax_rate: 0.13,
      tax_amount: 1.3,
      items: [{ quantity: 1, price: 10, material_id: 1 }],
    });
    expect(canon.taxRate).toBeCloseTo(0.13);
    expect(canon.taxAmount).toBe(1.3);
    expect(canon.items[0].unit_price).toBe(10);
  });
});
