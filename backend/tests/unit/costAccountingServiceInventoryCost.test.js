/* global beforeEach, describe, expect, it, jest */
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
jest.mock('../../src/services/business/OverheadAllocationService', () => ({
  calculateOverhead: jest.fn(),
}));

const InventoryService = require('../../src/services/InventoryService');
const OverheadAllocationService = require('../../src/services/business/OverheadAllocationService');
const CostAccountingService = require('../../src/services/business/CostAccountingService');

describe('CostAccountingService inventory cost recalculation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    InventoryService.rebuildStockBalancesForMaterial.mockResolvedValue(true);
  });

  it('resolves the overhead service from the extracted cost module and passes actual task hours', async () => {
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[{ cost_center_id: 7, product_id: 1001 }]])
        .mockResolvedValueOnce([[{ total_hours: 4.5 }]]),
    };
    OverheadAllocationService.calculateOverhead.mockResolvedValue({
      overhead: 25,
      allocation_base: 'labor_hours',
      rate: 5.5556,
      config_name: 'Task overhead',
    });

    const result = await CostAccountingService.calculateActualOverheadCost(
      connection,
      99,
      100,
      50,
      10,
      { machineHours: 2 }
    );

    expect(result.totalCost).toBe(25);
    expect(OverheadAllocationService.calculateOverhead).toHaveBeenCalledWith(
      expect.objectContaining({
        costCenterId: 7,
        productId: 1001,
        laborCost: 100,
        laborHours: 4.5,
        machineHours: 2,
        materialCost: 50,
        quantity: 10,
      })
    );
  });

  it('preserves the business block when overhead allocation configuration is missing', async () => {
    const connection = { execute: jest.fn() };
    OverheadAllocationService.calculateOverhead.mockRejectedValue(
      new Error('没有适用的制造费用分摊配置')
    );

    await expect(
      CostAccountingService.calculateActualOverheadCost(connection, null, 100, 50, 10)
    ).rejects.toThrow(/没有适用的制造费用分摊配置/);
  });

  it('preserves posted inbound/outbound amounts and rebuilds stock balances without repricing', async () => {
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: 1,
              material_id: 1001,
              location_id: 7,
              transaction_type: 'purchase_inbound',
              quantity: 10,
              unit_cost: 2,
              total_value: 20,
            },
            {
              id: 2,
              material_id: 1001,
              location_id: 7,
              transaction_type: 'transfer_out',
              quantity: -3,
              total_value: 6,
            },
          ],
        ])
        .mockResolvedValueOnce([[]])
        .mockResolvedValue([{}]),
    };

    const result = await CostAccountingService.recalculateMaterialCost(
      connection,
      1001,
      CostAccountingService.COSTING_METHOD.WEIGHTED_AVERAGE
    );

    expect(result.finalQuantity).toBe(7);
    expect(result.transactionCount).toBe(2);
    const adjustmentCalls = connection.execute.mock.calls.filter(([sql]) =>
      /INSERT\s+INTO\s+inventory_valuation_adjustments/i.test(sql)
    );
    expect(adjustmentCalls).toHaveLength(0);
    expect(result).toMatchObject({ finalValue: 14, unitCost: 2 });
    expect(InventoryService.rebuildStockBalancesForMaterial).toHaveBeenCalledWith(1001, connection);
  });

  it('normalizes moving_average to weighted_average during inventory cost recalculation', async () => {
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: 1,
              material_id: 1002,
              transaction_type: 'production_inbound',
              quantity: 10,
              unit_cost: 17.5,
              total_value: 175,
            },
            {
              id: 2,
              material_id: 1002,
              transaction_type: 'sales_outbound',
              quantity: -6,
              total_value: 105,
            },
          ],
        ])
        .mockResolvedValueOnce([[]])
        .mockResolvedValue([{}]),
    };

    const result = await CostAccountingService.recalculateMaterialCost(
      connection,
      1002,
      'moving_average'
    );

    expect(result.finalQuantity).toBe(4);
    const adjustmentCalls = connection.execute.mock.calls.filter(([sql]) =>
      /INSERT\s+INTO\s+inventory_valuation_adjustments/i.test(sql)
    );
    expect(adjustmentCalls).toHaveLength(0);
    expect(result).toMatchObject({ finalValue: 70, unitCost: 17.5 });
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

  it('keeps two purchase lots at 300 rather than repricing the second receipt to the average', async () => {
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([
          [
            { id: 1, quantity: 10, total_value: 100 },
            { id: 2, quantity: 10, total_value: 200 },
          ],
        ])
        .mockResolvedValueOnce([[]])
        .mockResolvedValue([{}]),
    };
    const result = await CostAccountingService.recalculateMaterialCost(
      connection,
      1,
      'weighted_average'
    );
    expect(result).toMatchObject({ finalQuantity: 20, finalValue: 300, unitCost: 15 });
    expect(
      connection.execute.mock.calls.some(([sql]) =>
        /inventory_valuation_adjustments.*INSERT|INSERT.*inventory_valuation_adjustments/s.test(sql)
      )
    ).toBe(false);
  });

  it('uses frozen amounts and prior valuation adjustments even when unit price rounding differs', async () => {
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([
          [
            { id: 1, quantity: 100000, total_value: 33333.333333 },
            { id: 2, quantity: -10, total_value: 3.333333 },
          ],
        ])
        .mockResolvedValueOnce([
          [
            { ledger_id: 1, value_delta: 10 },
            { ledger_id: 2, value_delta: -1 },
          ],
        ])
        .mockResolvedValue([{}]),
    };
    const result = await CostAccountingService.recalculateMaterialCost(
      connection,
      1,
      'weighted_average'
    );
    expect(result.finalQuantity).toBe(99990);
    expect(result.finalValue).toBe(33339);
  });

  it('rejects FIFO instead of silently applying weighted average to posted history', async () => {
    const connection = { execute: jest.fn() };
    await expect(
      CostAccountingService.recalculateMaterialCost(connection, 1, 'fifo')
    ).rejects.toMatchObject({ errorCode: 'INVENTORY_REVALUATION_REQUIRED', httpStatus: 409 });
    expect(connection.execute).not.toHaveBeenCalled();
  });

  it.each([
    [{ quantity: 0, total_value: 20 }],
    [{ quantity: -1, total_value: 20 }],
    [{ quantity: 1, total_value: null }],
  ])('does not hide inconsistent posted balances by clamping them to zero', async (row) => {
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[row]])
        .mockResolvedValue([[]]),
    };
    await expect(
      CostAccountingService.recalculateMaterialCost(connection, 1, 'weighted_average')
    ).rejects.toMatchObject({ httpStatus: 409 });
    expect(connection.execute.mock.calls.some(([sql]) => /UPDATE materials/.test(sql))).toBe(false);
    expect(InventoryService.rebuildStockBalancesForMaterial).not.toHaveBeenCalled();
  });

  it('reads newly committed adjustments under their own lock rather than the older material-list snapshot', async () => {
    const connection = {
      execute: jest.fn(async (sql) => {
        if (sql.includes('FROM inventory_ledger il'))
          return [[{ id: 1, quantity: 10, total_value: 100 }]];
        if (sql.includes('FROM inventory_valuation_adjustments va')) {
          // Simulate an adjustment committed after the transaction's first read.
          return [[{ ledger_id: 1, value_delta: sql.includes('FOR UPDATE') ? 50 : 0 }]];
        }
        return [{ affectedRows: 1 }];
      }),
    };
    const result = await CostAccountingService.recalculateMaterialCost(
      connection,
      1,
      'weighted_average'
    );
    expect(result).toMatchObject({ finalValue: 150, unitCost: 15 });
    expect(connection.execute.mock.calls[0][0]).not.toContain('SELECT SUM');
  });

  it('protects the ledger range for the complete rebuild without changing pooled session isolation', async () => {
    const connection = {
      query: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
      execute: jest.fn().mockResolvedValue([[]]),
    };
    require('../../src/config/db').pool.getConnection.mockResolvedValue(connection);
    await CostAccountingService.recalculateInventoryCost();
    expect(connection.query).toHaveBeenCalledWith(
      'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'
    );
    expect(connection.query.mock.invocationCallOrder[0]).toBeLessThan(
      connection.beginTransaction.mock.invocationCallOrder[0]
    );
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
  });
});
