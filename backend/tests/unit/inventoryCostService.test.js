jest.mock('../../src/config/db', () => ({
  pool: {
    getConnection: jest.fn(),
  },
}));

jest.mock('../../src/models/finance', () => ({}));
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const InventoryCostService = require('../../src/services/business/InventoryCostService');

describe('InventoryCostService moving average', () => {
  test('uses persisted stock quantity and value across locations', () => {
    const result = InventoryCostService.calculateMacFromBalances(
      [
        { quantity: 10, total_value: 200 },
        { quantity: 30, total_value: 900 },
      ],
      99
    );

    expect(result).toBeCloseTo(27.5, 6);
  });

  test('falls back to the inbound cost when no positive balance exists', () => {
    const result = InventoryCostService.calculateMacFromBalances(
      [{ quantity: 0, total_value: 0 }],
      18.75
    );

    expect(result).toBe(18.75);
  });

  test('uses the frozen posting line in cost document identity', () => {
    const first = InventoryCostService.buildCostDocumentNumber(
      { reference_no: 'GR-100', material_id: 7, posting_line_id: 11 },
      'IN'
    );
    const second = InventoryCostService.buildCostDocumentNumber(
      { reference_no: 'GR-100', material_id: 7, posting_line_id: 12 },
      'IN'
    );

    expect(first).toBe('GR-100-M7-L11');
    expect(second).toBe('GR-100-M7-L12');
    expect(first).not.toBe(second);
  });

  test('long source numbers retain distinct identities for every posting line', () => {
    const source = 'IN-'.padEnd(50, 'X');
    const first = InventoryCostService.buildCostDocumentNumber(
      { reference_no: source, material_id: 7, posting_line_id: 11 },
      'IN'
    );
    const second = InventoryCostService.buildCostDocumentNumber(
      { reference_no: source, material_id: 7, posting_line_id: 12 },
      'IN'
    );
    expect(first).toHaveLength(49);
    expect(first).not.toBe(second);
    expect(first).toBe(
      InventoryCostService.buildCostDocumentNumber(
        { reference_no: source, material_id: 7, posting_line_id: 11 },
        'IN'
      )
    );
  });

  test('an existing truncated historical key blocks creation under the new key', async () => {
    const source = 'IN-'.padEnd(50, 'X');
    const connection = { execute: jest.fn(async () => [[{ id: 25 }]]) };
    await expect(
      InventoryCostService.assertNoAmbiguousLegacyCostEntry(
        connection,
        { reference_no: source, material_id: 7, posting_line_id: 11 },
        'IN',
        'adjustment'
      )
    ).rejects.toThrow('编号被截断');
    expect(connection.execute.mock.calls[0][1]).toEqual(['adjustment', source]);
  });

  test('uses actual posted value before rounding the GL amount to cents', () => {
    expect(
      InventoryCostService.calculateTotalCost({ total_value: '33333.333333' }, 100000, 0.333333)
    ).toBe(33333.33);
    expect(
      InventoryCostService.calculateTotalCost({ total_value: '-33333.333333' }, 100000, 0.333333)
    ).toBe(33333.33);
    expect(InventoryCostService.calculateTotalCost({}, 100000, 0.333333)).toBe(33333.3);
  });

  test('retains the recorded finance reviewer regardless of current account activation', () => {
    expect(
      InventoryCostService.resolvePostingActorId({ finance_approved_by: '60', is_active: false })
    ).toBe(60);
    expect(() => InventoryCostService.resolvePostingActorId({})).toThrow('财务审核人');
    expect(() => InventoryCostService.resolvePostingActorId({ finance_approved_by: 0 })).toThrow(
      '财务审核人'
    );
  });
});
/* global describe, expect, jest, test */
