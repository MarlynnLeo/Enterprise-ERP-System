jest.mock('../../src/config/db', () => ({ pool: { execute: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/services/cache/CacheManager', () => ({
  get: jest.fn().mockResolvedValue(null), set: jest.fn(), delete: jest.fn(), deleteByPrefix: jest.fn(),
}));
jest.mock('../../src/services/business/PeriodValidationService', () => ({
  validateInventoryTransaction: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.mock('../../src/services/InventoryPostingService', () => ({
  stageMovement: jest.fn().mockResolvedValue({ documentId: 10, lineIds: [20] }),
}));
jest.mock('../../src/services/business/InventoryAlertService', () => ({
  checkStockAfterChange: jest.fn().mockResolvedValue(),
}));

const InventoryService = require('../../src/services/InventoryService');
const InventoryPostingService = require('../../src/services/InventoryPostingService');
const { INTERNAL_POSTING_TOKEN } = require('../../src/services/inventoryPostingContext');
const { pool } = require('../../src/config/db');
const cacheService = require('../../src/services/cache/CacheManager');

describe('formal and pending-inclusive stock cache isolation', () => {
  let cache;
  beforeEach(() => {
    jest.clearAllMocks();
    InventoryService.balanceTableAvailable = null;
    cache = new Map();
    cacheService.get.mockImplementation(async (key) => cache.has(key) ? cache.get(key) : null);
    cacheService.set.mockImplementation(async (key, value) => cache.set(key, value));
    cacheService.delete.mockImplementation(async (key) => cache.delete(key));
    pool.execute.mockImplementation(async (sql) => sql.includes('FROM inventory_posting_lines')
      ? [[{ pending_stock: 20 }]]
      : [[{ current_stock: 100 }]]);
  });
  afterEach(() => { InventoryService.balanceTableAvailable = null; });

  test.each([[true, false], [false, true]])(
    'keeps both stock views correct when includePending=%s is cached first', async (first, second) => {
      const read = (pending) => InventoryService.getCurrentStock(1, 2, null, false, true, pending);
      expect(await read(first)).toBe(first ? 120 : 100);
      expect(await read(second)).toBe(second ? 120 : 100);
      pool.execute.mockClear();
      expect(await read(true)).toBe(120);
      expect(await read(false)).toBe(100);
      expect(pool.execute).not.toHaveBeenCalled();
    }
  );

  test('a stock change invalidates both views for the same location', async () => {
    await InventoryService.getCurrentStock(1, 2);
    await InventoryService.getCurrentStock(1, 2, null, false, true, false);
    await InventoryService.clearStockCache(1, 2);
    pool.execute.mockImplementation(async (sql) => sql.includes('FROM inventory_posting_lines')
      ? [[{ pending_stock: 5 }]]
      : [[{ current_stock: 110 }]]);
    expect(await InventoryService.getCurrentStock(1, 2)).toBe(115);
    expect(await InventoryService.getCurrentStock(1, 2, null, false, true, false)).toBe(110);
  });
});

describe('inventory errors preserve balance and pending-stock integrity', () => {
  beforeEach(() => { InventoryService.balanceTableAvailable = null; });
  afterEach(() => { InventoryService.balanceTableAvailable = null; });

  test.each([
    ['ER_TABLEACCESS_DENIED_ERROR', "INSERT command denied for table 'inventory_stock_balances'"],
    ['ER_BAD_FIELD_ERROR', "Unknown column 'inventory_stock_balances.version'"],
    ['ER_LOCK_DEADLOCK', 'Deadlock updating inventory_stock_balances'],
  ])('does not silently disable balance locks on %s', async (code, message) => {
    const error = Object.assign(new Error(message), { code });
    const connection = { execute: jest.fn().mockRejectedValue(error) };
    await expect(InventoryService._lockStockLocation(1, 2, connection)).rejects.toBe(error);
    expect(InventoryService.balanceTableAvailable).toBeNull();
  });

  test('retains compatibility only for an actually missing balance table', async () => {
    const error = Object.assign(new Error("Table 'erp_test.inventory_stock_balances' doesn't exist"), {
      code: 'ER_NO_SUCH_TABLE',
    });
    const connection = { execute: jest.fn().mockRejectedValue(error) };
    await expect(InventoryService._lockStockLocation(1, 2, connection)).resolves.toBe(false);
    expect(InventoryService.balanceTableAvailable).toBe(false);
  });

  test.each(['getCurrentStock', 'getBatchStock'])('%s propagates pending-stock permission failures', async (method) => {
    const connection = { execute: jest.fn(async (sql) => {
      if (sql.includes('FROM inventory_posting_lines')) {
        throw Object.assign(new Error("SELECT command denied for table 'inventory_posting_lines'"), {
          code: 'ER_TABLEACCESS_DENIED_ERROR',
        });
      }
      return [[{ material_id: 1, location_id: 2, quantity: 100, current_stock: 100 }]];
    }) };
    const result = method === 'getCurrentStock'
      ? InventoryService.getCurrentStock(1, 2, connection)
      : InventoryService.getBatchStock([{ material_id: 1, location_id: 2 }], connection);
    await expect(result).rejects.toThrow('SELECT command denied');
  });
});

describe('a batch cannot spend stock belonging to a different batch', () => {
  let connection;
  let batchStock;
  let pendingStock;
  const movement = () => ({
    materialId: 1, materialCode: 'MAT-1', locationId: 2,
    batchNumber: 'A', quantity: -5, transactionType: 'sales_outbound',
    referenceNo: 'OUT-1', referenceType: 'sales_outbound', operator: 'warehouse', unitCost: 2,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    batchStock = 1;
    pendingStock = 0;
    connection = { execute: jest.fn(async (sql) => {
      if (sql.includes('FROM inventory_posting_documents WHERE id'))
        return [[{ id: 10, finance_status: 'approved', locked: 1 }]];
      if (sql.includes('FROM inventory_posting_lines') && sql.includes('WHERE id'))
        return [[{ id: 20, signed_quantity: -5, total_value: 10 }]];
      if (sql.includes('FROM inventory_posting_lines')) return [[{ batch_stock: pendingStock }]];
      if (sql.includes('FROM inventory_ledger')) return [[{ batch_stock: batchStock }]];
      return [{ insertId: 30, affectedRows: 1 }];
    }), query: jest.fn() };
    jest.spyOn(InventoryService, '_findLedgerByIdempotencyKey').mockResolvedValue(null);
    jest.spyOn(InventoryService, 'resolveTransactionDate').mockResolvedValue('2026-10-14');
    jest.spyOn(InventoryService, '_lockStockLocation').mockResolvedValue(true);
    jest.spyOn(InventoryService, 'getCurrentStock').mockResolvedValue(100);
    jest.spyOn(InventoryService, '_validateMaterialAndLocation').mockResolvedValue();
    jest.spyOn(InventoryService, '_resolveUnitCost').mockResolvedValue(2);
    jest.spyOn(InventoryService, '_adjustStockBalance').mockResolvedValue();
    jest.spyOn(InventoryService, 'clearStockCache').mockResolvedValue();
  });
  afterEach(() => jest.restoreAllMocks());

  test('rejects a specific batch shortage before staging despite sufficient location stock', async () => {
    await expect(InventoryService.updateStock(movement(), connection)).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK', statusCode: 400,
    });
    expect(InventoryPostingService.stageMovement).not.toHaveBeenCalled();
  });

  test('includes pending business movements in batch availability', async () => {
    pendingStock = 4;
    await expect(InventoryService.updateStock(movement(), connection)).resolves.toMatchObject({ staged: true });
    expect(InventoryPostingService.stageMovement).toHaveBeenCalledTimes(1);
  });

  test('subtracts already pending outbounds from the selected batch', async () => {
    batchStock = 6;
    pendingStock = -2;
    await expect(InventoryService.updateStock(movement(), connection)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(InventoryPostingService.stageMovement).not.toHaveBeenCalled();
  });

  test('formal approval cannot spend pending receipts or other batches', async () => {
    pendingStock = 99;
    await expect(InventoryService.updateStock({
      ...movement(), postingDocumentId: 10, postingLineId: 20,
      internalPostingToken: INTERNAL_POSTING_TOKEN,
    }, connection)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(connection.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO inventory_ledger'))).toBe(false);
    expect(connection.execute.mock.calls.some(([sql]) => sql.includes('SUM(l.signed_quantity)'))).toBe(false);
  });
});
