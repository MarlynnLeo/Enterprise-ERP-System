/* global describe, expect, jest, test */
'use strict';

const {
  getQuantityLedger,
  buildQuantityRows,
  eventSource,
} = require('../../src/services/business/financialLedgers/quantityMethods');

const filters = {
  startMonth: '2026-09',
  endMonth: '2026-10',
  startDate: '2026-09-01',
  endDate: '2026-10-31',
  yearStartDate: '2026-01-01',
};

function event(overrides = {}) {
  return {
    event_id: 1,
    ledger_id: 1,
    event_type: 'movement',
    date: '2026-09-02',
    material_id: 7,
    material_code: 'M007',
    material_name: '测试物料',
    unit_id: 1,
    unit_name: '件',
    quantity: '10',
    signed_amount: '100.00',
    posting_document_id: 30,
    posting_no: 'IP-0030',
    reference_no: 'IN-0030',
    description: '采购入库',
    ...overrides,
  };
}

function opening(overrides = {}) {
  return {
    material_id: 7,
    material_code: 'M007',
    material_name: '测试物料',
    unit_id: 1,
    unit_name: '件',
    opening_quantity: '10',
    opening_value: '100',
    missing_count: 0,
    derived_count: 0,
    ytd_debit: '60',
    ytd_credit: '20',
    ytd_debit_quantity: '6',
    ytd_credit_quantity: '2',
    ytd_missing_debit: 0,
    ytd_missing_credit: 0,
    ...overrides,
  };
}

describe('financial quantity ledger', () => {
  test('preserves opening and posted values with monthly and YTD totals', () => {
    const result = buildQuantityRows(
      [opening()],
      [
        event({ quantity: '2', signed_amount: '20.123456' }),
        event({
          event_id: 2,
          ledger_id: 2,
          date: '2026-09-03',
          quantity: '-3',
          signed_amount: '-30',
        }),
      ],
      filters
    );
    const rows = result.rows;
    expect(rows[0]).toMatchObject({
      rowType: 'opening',
      balanceQuantity: 10,
      balance: 100,
      debit: 0,
    });
    expect(rows[1]).toMatchObject({
      voucherNumber: 'IP-0030',
      debit: 20.123456,
      debitQuantity: 2,
      debitUnitPrice: 10.061728,
    });
    expect(rows[2]).toMatchObject({
      credit: 30,
      creditQuantity: 3,
      balanceQuantity: 9,
      balance: 90.123456,
    });
    expect(rows[3]).toMatchObject({
      rowType: 'subtotal',
      period: '2026-09',
      debit: 20.123456,
      credit: 30,
    });
    expect(rows[4]).toMatchObject({
      rowType: 'cumulative',
      description: '2026-09 本年累计',
      debit: 80.123456,
      credit: 50,
      debitQuantity: 8,
      creditQuantity: 5,
    });
    expect(rows[5]).toMatchObject({
      rowType: 'subtotal',
      period: '2026-10',
      debit: 0,
      credit: 0,
      balance: 90.123456,
    });
    expect(result.summary).toMatchObject({
      openingBalance: 100,
      totalDebit: 20.123456,
      totalCredit: 30,
      closingBalance: 90.123456,
    });
  });

  test('places valuation corrections in their own period without rewriting prior balances', () => {
    const result = buildQuantityRows(
      [],
      [
        event(),
        event({
          event_type: 'adjustment',
          event_id: 5,
          date: '2026-10-03',
          quantity: '0',
          signed_amount: '-15',
          description: '估值调整：成本核算',
        }),
      ],
      filters
    );
    const september = result.rows.find(
      (row) => row.period === '2026-09' && row.rowType === 'subtotal'
    );
    const adjustment = result.rows.find((row) => row.description === '估值调整：成本核算');
    expect(september).toMatchObject({ balance: 100, balanceQuantity: 10, balanceUnitPrice: 10 });
    expect(adjustment).toMatchObject({
      credit: 15,
      creditQuantity: 0,
      creditUnitPrice: null,
      balance: 85,
      balanceQuantity: 10,
      balanceUnitPrice: 8.5,
    });
    expect(result.summary.closingBalance).toBe(85);
  });

  test('separates different materials and historical units instead of combining quantities', () => {
    const result = buildQuantityRows(
      [],
      [
        event(),
        event({
          event_id: 2,
          ledger_id: 2,
          unit_id: 2,
          unit_name: '千克',
          quantity: '3',
          signed_amount: '15',
        }),
        event({
          event_id: 3,
          ledger_id: 3,
          unit_id: null,
          unit_name: null,
          quantity: '4',
          signed_amount: '20',
        }),
        event({
          event_id: 4,
          ledger_id: 4,
          material_id: 8,
          material_code: 'M008',
          quantity: '1',
          signed_amount: '5',
        }),
      ],
      filters
    );
    expect(result.summary.groupCount).toBe(4);
    expect(result.summary.quantityTotals.map((row) => row.closingQuantity)).toEqual([10, 3, 4, 1]);
    expect(result.summary).not.toHaveProperty('closingQuantity');
    expect(result.warnings.join('')).toContain('未按当前物料单位换算');
  });

  test('keeps unknown valuation null through balances while showing known quantities', () => {
    const result = buildQuantityRows(
      [],
      [
        event({ signed_amount: null }),
        event({ event_id: 2, ledger_id: 2, quantity: '-3', signed_amount: '-30' }),
      ],
      filters
    );
    expect(result.rows[1]).toMatchObject({
      debit: null,
      credit: 0,
      debitQuantity: 10,
      debitUnitPrice: null,
      balance: null,
    });
    expect(result.rows[2]).toMatchObject({
      credit: 30,
      balance: null,
      balanceQuantity: 7,
      balanceUnitPrice: null,
    });
    expect(result.summary).toMatchObject({
      totalDebit: null,
      totalCredit: 30,
      closingBalance: null,
      missingValuationCount: 1,
    });
    expect(result.warnings.join('')).toContain('显示为空');
  });

  test('does not let a missing historical valuation masquerade as a known opening or ending balance', () => {
    const result = buildQuantityRows(
      [opening({ missing_count: 1, ytd_missing_credit: 1 })],
      [],
      filters
    );
    expect(result.summary).toMatchObject({
      openingBalance: null,
      closingBalance: null,
      totalDebit: 0,
      totalCredit: 0,
    });
    expect(result.rows.find((row) => row.rowType === 'cumulative')).toMatchObject({
      debit: 60,
      credit: null,
      balance: null,
    });
  });

  test('reversal movements net to zero and annual totals reset in January', () => {
    const result = buildQuantityRows(
      [],
      [
        event({ date: '2026-12-20' }),
        event({
          event_id: 2,
          ledger_id: 2,
          date: '2027-01-02',
          quantity: '-10',
          signed_amount: '-100',
        }),
      ],
      { startDate: '2026-12-01', endDate: '2027-01-31' }
    );
    const final = result.rows.at(-1);
    expect(final).toMatchObject({
      rowType: 'cumulative',
      debit: 0,
      credit: 100,
      balance: 0,
      direction: '平',
      balanceQuantity: 0,
      balanceUnitPrice: null,
    });
    expect(result.summary.closingBalance).toBe(0);
  });

  test('uses decimal arithmetic when repeated movements would otherwise accumulate floating error', () => {
    const result = buildQuantityRows(
      [],
      Array.from({ length: 10 }, (_, index) =>
        event({
          event_id: index + 1,
          ledger_id: index + 1,
          quantity: '0.1',
          signed_amount: '0.3',
        })
      ),
      filters
    );
    expect(result.summary).toMatchObject({ totalDebit: 3, closingBalance: 3 });
    expect(result.summary.quantityTotals[0].closingQuantity).toBe(1);
  });

  test('rejects oversized detail and expanded report output rather than silently truncating', () => {
    expect(() => buildQuantityRows([], Array(10001).fill(event()), filters)).toThrow(
      '超过 10000 条'
    );
    expect(() => buildQuantityRows([], Array(9998).fill(event()), filters)).toThrow(
      '超过 10000 条'
    );
  });

  test('rejects account filtering because inventory records do not carry a reliable GL mapping', async () => {
    const connection = { execute: jest.fn() };
    await expect(getQuantityLedger(connection, { ...filters, accountId: 9 })).rejects.toMatchObject(
      { statusCode: 400 }
    );
    expect(connection.execute).not.toHaveBeenCalled();
  });

  test('queries frozen sources with date/material bounds and does not exclude reversed postings', async () => {
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[{ id: 7, code: 'M007', name: '测试物料' }]])
        .mockResolvedValueOnce([[opening()]])
        .mockResolvedValueOnce([[event()]]),
    };
    const result = await getQuantityLedger(connection, { ...filters, materialId: 7 });
    expect(result.filters).toMatchObject({
      materialName: '测试物料',
      accountFilterSupported: false,
    });
    expect(result.source).toContain('已过账库存台账');
    const [openingSql, openingParams] = connection.execute.mock.calls[1];
    const [detailSql, detailParams] = connection.execute.mock.calls[2];
    expect(openingParams).toEqual([
      ...Array(6).fill('2026-01-01'),
      '2026-09-01',
      7,
      '2026-09-01',
      7,
    ]);
    expect(detailParams).toEqual(['2026-09-01', '2026-10-31', 7, '2026-09-01', '2026-10-31', 7]);
    expect(openingSql).toContain('SUM(q.signed_amount IS NULL)');
    expect(detailSql).toContain('COALESCE(il.total_value, pl.posted_value)');
    expect(detailSql).toContain('DATE(va.created_at) >= ?');
    expect(detailSql).toContain('LIMIT 10001');
    expect(detailSql).not.toMatch(
      /m\.cost_price|finance_status\s*=|is_reversed\s*=|\bUPDATE\b|\bINSERT\b/i
    );
  });

  test('rejects a missing material rather than returning an unlabelled empty report', async () => {
    const connection = { execute: jest.fn().mockResolvedValueOnce([[]]) };
    await expect(
      getQuantityLedger(connection, { ...filters, materialId: 99 })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: '所选物料不存在，请重新选择物料',
    });
    expect(connection.execute).toHaveBeenCalledTimes(1);
  });

  test('uses the material name even when it has no historical ledger records', async () => {
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[{ id: 7, code: 'M007', name: '尚无流水的物料' }]])
        .mockResolvedValue([[]]),
    };
    const result = await getQuantityLedger(connection, { ...filters, materialId: 7 });
    expect(result.rows).toEqual([]);
    expect(result.filters.materialName).toBe('尚无流水的物料');
    expect(result.source).toContain('来源单号栏');
  });

  test('binds material IDs and filters future adjustments out of both opening and selected period sources', () => {
    const source = eventSource({ ...filters, materialId: '7 OR 1=1' }, true);
    expect(source.sql).not.toContain('7 OR 1=1');
    expect(source.params).toEqual(['2026-09-01', '7 OR 1=1', '2026-09-01', '7 OR 1=1']);
    expect(source.sql).toContain('DATE(va.created_at) < ?');
  });
});
