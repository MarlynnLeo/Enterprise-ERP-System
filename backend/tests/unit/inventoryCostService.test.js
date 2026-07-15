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
});
