jest.mock('../../src/config/db', () => ({
  pool: {
    getConnection: jest.fn(),
    execute: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../src/config/globalConfig', () => ({
  get: jest.fn(),
}));

jest.mock('../../src/config/businessConfig', () => ({}));

jest.mock('../../src/services/finance/GLService', () => ({}));

jest.mock('../../src/services/InventoryService', () => ({
  rebuildStockBalancesForMaterial: jest.fn(),
}));

const InventoryService = require('../../src/services/InventoryService');
const CostAccountingService = require('../../src/services/business/CostAccountingService');

describe('CostAccountingService inventory cost recalculation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    InventoryService.rebuildStockBalancesForMaterial.mockResolvedValue(true);
  });

  it('treats outbound ledger quantities as absolute deductions and rebuilds stock balances', async () => {
    const connection = {
      execute: jest.fn()
        .mockResolvedValueOnce([
          [
            {
              id: 1,
              material_id: 1001,
              location_id: 7,
              transaction_type: 'purchase_inbound',
              quantity: 10,
              unit_cost: 2,
            },
            {
              id: 2,
              material_id: 1001,
              location_id: 7,
              transaction_type: 'transfer_out',
              quantity: -3,
            },
          ],
        ])
        .mockResolvedValue([{}]),
    };

    const result = await CostAccountingService.recalculateMaterialCost(
      connection,
      1001,
      CostAccountingService.COSTING_METHOD.WEIGHTED_AVERAGE
    );

    expect(result.finalQuantity).toBe(7);
    expect(result.transactionCount).toBe(2);
    expect(connection.execute).toHaveBeenNthCalledWith(
      2,
      'UPDATE inventory_ledger SET unit_cost = ?, total_value = ROUND(ABS(quantity) * ?, 2) WHERE id = ?',
      [2, 2, 1]
    );
    expect(connection.execute).toHaveBeenNthCalledWith(
      3,
      'UPDATE inventory_ledger SET unit_cost = ?, total_value = ROUND(ABS(quantity) * ?, 2) WHERE id = ?',
      [2, 2, 2]
    );
    expect(InventoryService.rebuildStockBalancesForMaterial).toHaveBeenCalledWith(
      1001,
      connection
    );
  });

  it('normalizes moving_average to weighted_average during inventory cost recalculation', async () => {
    const connection = {
      execute: jest.fn()
        .mockResolvedValueOnce([
          [
            {
              id: 1,
              material_id: 1002,
              transaction_type: 'production_inbound',
              quantity: 10,
              unit_cost: 17.5,
            },
            {
              id: 2,
              material_id: 1002,
              transaction_type: 'sales_outbound',
              quantity: -6,
            },
          ],
        ])
        .mockResolvedValue([{}]),
    };

    const result = await CostAccountingService.recalculateMaterialCost(
      connection,
      1002,
      'moving_average'
    );

    expect(result.finalQuantity).toBe(4);
    expect(connection.execute).toHaveBeenNthCalledWith(
      2,
      'UPDATE inventory_ledger SET unit_cost = ?, total_value = ROUND(ABS(quantity) * ?, 2) WHERE id = ?',
      [17.5, 17.5, 1]
    );
    expect(connection.execute).toHaveBeenNthCalledWith(
      3,
      'UPDATE inventory_ledger SET unit_cost = ?, total_value = ROUND(ABS(quantity) * ?, 2) WHERE id = ?',
      [17.5, 17.5, 2]
    );
  });

  it('rejects unsupported inventory costing methods instead of zeroing ledger costs', async () => {
    const connection = {
      execute: jest.fn(),
    };

    await expect(
      CostAccountingService.recalculateMaterialCost(connection, 1003, 'unknown_method')
    ).rejects.toMatchObject({
      errorCode: 'INVALID_COSTING_METHOD',
      httpStatus: 400,
    });
    expect(connection.execute).not.toHaveBeenCalled();
  });
});
