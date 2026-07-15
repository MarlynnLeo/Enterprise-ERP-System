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

jest.mock('../../src/utils/codeGenerator', () => ({
  CodeGenerators: {
    generateAdjustmentCode: jest.fn(),
  },
}));

jest.mock('../../src/services/business/PeriodValidationService', () => ({
  validateInventoryTransaction: jest.fn(),
}));

jest.mock('../../src/services/InventoryService', () => ({
  getCurrentStock: jest.fn(),
  updateStock: jest.fn(),
}));

const db = require('../../src/config/db');
const { CodeGenerators } = require('../../src/utils/codeGenerator');
const PeriodValidationService = require('../../src/services/business/PeriodValidationService');
const InventoryService = require('../../src/services/InventoryService');
const InventoryConsistencyService = require('../../src/services/business/InventoryConsistencyService');

describe('InventoryConsistencyService', () => {
  function createConnection() {
    return {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
      execute: jest.fn(),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    CodeGenerators.generateAdjustmentCode.mockResolvedValue('ADJ-20260626-0001');
    PeriodValidationService.validateInventoryTransaction.mockResolvedValue({ allowed: true });
    InventoryService.updateStock.mockResolvedValue({ success: true });
  });

  it('repairs negative stock through the unified inventory service entrypoint', async () => {
    const connection = createConnection();
    db.pool.getConnection.mockResolvedValue(connection);
    connection.execute.mockResolvedValueOnce([
      [
        {
          material_id: 1001,
          material_code: 'MAT-1001',
          material_name: 'Material 1001',
          unit_id: 3,
          location_id: 7,
          location_name: 'Main',
          current_stock: '-5.5',
        },
      ],
    ]);
    InventoryService.getCurrentStock.mockResolvedValue(-5.5);

    const result = await InventoryConsistencyService.generateAdjustmentForNegativeStock('auditor');

    expect(result.success).toBe(true);
    expect(result.adjustedCount).toBe(1);
    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
    expect(connection.execute).toHaveBeenCalledTimes(1);
    expect(connection.execute.mock.calls[0][0]).toContain('FROM inventory_ledger');
    expect(connection.execute.mock.calls[0][0]).not.toContain('INSERT INTO inventory_ledger');

    expect(InventoryService.getCurrentStock).toHaveBeenCalledWith(
      1001,
      7,
      connection,
      true,
      false
    );
    expect(InventoryService.updateStock).toHaveBeenCalledWith(
      expect.objectContaining({
        materialId: 1001,
        locationId: 7,
        quantity: 5.5,
        transactionType: 'adjustment_in',
        referenceNo: 'ADJ-20260626-0001',
        referenceType: 'inventory_adjustment',
        operator: 'auditor',
        unitId: 3,
        batchNumber: 'ADJ-ADJ-20260626-0001-1001-7',
        allowNegativeStock: false,
        idempotencyKey: 'negative-stock:ADJ-20260626-0001:1001:7',
      }),
      connection
    );
  });

  it('skips rows that are no longer negative after locking current stock', async () => {
    const connection = createConnection();
    db.pool.getConnection.mockResolvedValue(connection);
    connection.execute.mockResolvedValueOnce([
      [
        {
          material_id: 1002,
          unit_id: 4,
          location_id: 8,
          current_stock: '-2',
        },
      ],
    ]);
    InventoryService.getCurrentStock.mockResolvedValue(0);

    const result = await InventoryConsistencyService.generateAdjustmentForNegativeStock('auditor');

    expect(result.adjustedCount).toBe(0);
    expect(InventoryService.updateStock).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalled();
  });
});
