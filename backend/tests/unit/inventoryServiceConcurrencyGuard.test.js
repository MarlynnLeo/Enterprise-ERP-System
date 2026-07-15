jest.mock('../../src/services/business/PeriodValidationService', () => ({
  validateInventoryTransaction: jest.fn().mockResolvedValue({ allowed: true }),
}));

const InventoryService = require('../../src/services/InventoryService');

describe('InventoryService concurrency guard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('locks the stock location before reading quantity and rejects insufficient stock before ledger writes', async () => {
    const order = [];
    const connection = {
      execute: jest.fn(),
      query: jest.fn(),
    };

    jest.spyOn(InventoryService, '_findLedgerByIdempotencyKey').mockImplementation(async () => null);
    jest.spyOn(InventoryService, 'resolveTransactionDate').mockImplementation(async () => new Date('2026-06-27'));
    jest.spyOn(InventoryService, '_lockStockLocation').mockImplementation(async () => {
      order.push('lock');
    });
    jest.spyOn(InventoryService, 'getCurrentStock').mockImplementation(async () => {
      order.push('read-stock');
      return 5;
    });
    jest.spyOn(InventoryService, '_validateMaterialAndLocation').mockImplementation(async () => {
      order.push('validate');
    });
    jest.spyOn(InventoryService, '_resolveUnitCost').mockResolvedValue(0);
    jest.spyOn(InventoryService, '_adjustStockBalance').mockResolvedValue(undefined);
    jest.spyOn(InventoryService, 'clearStockCache').mockResolvedValue(undefined);

    await expect(InventoryService.updateStock({
      materialId: 1001,
      locationId: 7,
      quantity: 6,
      transactionType: 'outbound',
      referenceNo: 'TEST-OUT-1',
      referenceType: 'test',
      operator: 1,
      batchNumber: 'BATCH-1',
      allowNegativeStock: false,
    }, connection)).rejects.toThrow();

    expect(order).toEqual(['lock', 'read-stock']);
    expect(InventoryService._validateMaterialAndLocation).not.toHaveBeenCalled();
    expect(connection.execute).not.toHaveBeenCalledWith(
      expect.stringMatching(/INSERT\s+INTO\s+inventory_ledger/i),
      expect.any(Array)
    );
  });
});
