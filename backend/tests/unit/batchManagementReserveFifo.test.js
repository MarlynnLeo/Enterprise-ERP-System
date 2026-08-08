/**
 * FIFO 预留必须与 FOR UPDATE 使用同一 connection
 * + updateStock 台账写入 batch_number 归一化
 */

jest.mock('../../src/config/db', () => {
  const conn = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    query: jest.fn(),
    execute: jest.fn(),
  };
  return {
    pool: {
      getConnection: jest.fn().mockResolvedValue(conn),
    },
    query: jest.fn(),
    __mockConn: conn,
  };
});

jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/services/business/PeriodValidationService', () => ({
  validateInventoryTransaction: jest.fn().mockResolvedValue({ allowed: true }),
}));

jest.mock('../../src/services/business/InventoryAlertService', () => ({
  checkStockAfterChange: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/business/DLQService', () => ({
  recordSideEffectFailure: jest.fn().mockResolvedValue(undefined),
}));

const db = require('../../src/config/db');
const BatchManagementService = require('../../src/services/business/BatchManagementService');

describe('BatchManagementService.reserveBatch FIFO connection', () => {
  const conn = db.__mockConn;

  beforeEach(() => {
    jest.clearAllMocks();
    db.pool.getConnection.mockResolvedValue(conn);
  });

  it('passes transaction connection into getFIFOOutboundBatches', async () => {
    const spy = jest.spyOn(BatchManagementService, 'getFIFOOutboundBatches').mockResolvedValue({
      allocated_batches: [
        {
          location_id: 1,
          batch_number: 'B-1',
          allocated_quantity: 5,
        },
      ],
      total_allocated: 5,
      shortage: 0,
    });

    conn.query.mockResolvedValueOnce([[]]); // FOR UPDATE
    conn.execute.mockResolvedValueOnce([{ insertId: 1 }]);

    const result = await BatchManagementService.reserveBatch({
      material_id: 100,
      required_quantity: 5,
      reference_type: 'sales_order',
      reference_id: 9,
      reference_no: 'SO-9',
      operator: 'tester',
    });

    expect(spy).toHaveBeenCalledWith(100, 5, null, conn);
    expect(result.success).toBe(true);
    expect(result.total_reserved).toBe(5);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();

    spy.mockRestore();
  });

  it('rolls back when FIFO reports shortage', async () => {
    const spy = jest.spyOn(BatchManagementService, 'getFIFOOutboundBatches').mockResolvedValue({
      allocated_batches: [],
      total_allocated: 0,
      shortage: 3,
    });

    conn.query.mockResolvedValueOnce([[]]);

    await expect(
      BatchManagementService.reserveBatch({
        material_id: 100,
        required_quantity: 3,
        operator: 'tester',
      })
    ).rejects.toThrow(/库存不足/);

    expect(spy).toHaveBeenCalledWith(100, 3, null, conn);
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('writes inventory_reservations rows for each FIFO allocated batch', async () => {
    const spy = jest.spyOn(BatchManagementService, 'getFIFOOutboundBatches').mockResolvedValue({
      allocated_batches: [
        { location_id: 1, batch_number: 'B-1001', allocated_quantity: 10 },
        { location_id: 2, batch_number: 'B-1002', allocated_quantity: 15 },
      ],
      total_allocated: 25,
      shortage: 0,
    });

    conn.query.mockResolvedValueOnce([[]]); // FOR UPDATE
    conn.execute
      .mockResolvedValueOnce([{ insertId: 100 }])
      .mockResolvedValueOnce([{ insertId: 101 }]);

    const result = await BatchManagementService.reserveBatch({
      material_id: 42,
      required_quantity: 25,
      reference_type: 'sales_order',
      reference_id: 999,
      reference_no: 'SO-999',
      operator: 'tester',
      remarks: '测试预留',
    });

    expect(spy).toHaveBeenCalledWith(42, 25, null, conn);
    expect(result.success).toBe(true);
    expect(result.total_reserved).toBe(25);
    expect(result.reserve_records).toEqual([
      { batch_number: 'B-1001', reserved_quantity: 10 },
      { batch_number: 'B-1002', reserved_quantity: 15 },
    ]);

    expect(conn.execute).toHaveBeenCalledTimes(2);
    expect(conn.execute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO inventory_reservations'),
      [42, 1, 'B-1001', 10, 'sales_order', 999, 'SO-999', 'tester', '测试预留']
    );
    expect(conn.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO inventory_reservations'),
      [42, 2, 'B-1002', 15, 'sales_order', 999, 'SO-999', 'tester', '测试预留']
    );
    expect(conn.commit).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('rolls back and releases connection when reservation insert fails', async () => {
    const spy = jest.spyOn(BatchManagementService, 'getFIFOOutboundBatches').mockResolvedValue({
      allocated_batches: [
        { location_id: 1, batch_number: 'B-1', allocated_quantity: 5 },
      ],
      total_allocated: 5,
      shortage: 0,
    });

    conn.query.mockResolvedValueOnce([[]]);
    conn.execute.mockRejectedValueOnce(new Error('DB write failed'));

    await expect(
      BatchManagementService.reserveBatch({
        material_id: 100,
        required_quantity: 5,
        operator: 'tester',
      })
    ).rejects.toThrow(/DB write failed/);

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('InventoryService batch number normalize on ledger write', () => {
  const InventoryService = require('../../src/services/InventoryService');

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('_normalizeBatchNumber maps null/undefined/whitespace to empty string and trims', () => {
    expect(InventoryService._normalizeBatchNumber(null)).toBe('');
    expect(InventoryService._normalizeBatchNumber(undefined)).toBe('');
    expect(InventoryService._normalizeBatchNumber('   ')).toBe('');
    expect(InventoryService._normalizeBatchNumber('  B01  ')).toBe('B01');
    expect(InventoryService._normalizeBatchNumber('B01')).toBe('B01');
  });

  it('rejects inbound when batch is whitespace-only (treated as empty key)', async () => {
    const connection = { execute: jest.fn(), query: jest.fn() };
    jest.spyOn(InventoryService, '_findLedgerByIdempotencyKey').mockResolvedValue(null);
    jest.spyOn(InventoryService, 'resolveTransactionDate').mockResolvedValue('2026-06-27');
    jest.spyOn(InventoryService, '_lockStockLocation').mockResolvedValue(true);
    jest.spyOn(InventoryService, 'getCurrentStock').mockResolvedValue(0);

    await expect(
      InventoryService.updateStock(
        {
          materialId: 1,
          locationId: 2,
          quantity: 10,
          transactionType: 'inbound',
          referenceNo: 'INB-WS',
          referenceType: 'test',
          operator: 'tester',
          batchNumber: '   ',
          unitCost: 5,
        },
        connection
      )
    ).rejects.toThrow(/入库必须提供可追溯批次号/);
  });

  it('updateStock writes normalized empty batch_number for explicit empty batch inbound path guard', async () => {
    // 入库必须有批次：null/'' 应在归一化后被拒绝
    const connection = { execute: jest.fn(), query: jest.fn() };

    jest.spyOn(InventoryService, '_findLedgerByIdempotencyKey').mockResolvedValue(null);
    jest.spyOn(InventoryService, 'resolveTransactionDate').mockResolvedValue('2026-06-27');
    jest.spyOn(InventoryService, '_lockStockLocation').mockResolvedValue(true);
    jest.spyOn(InventoryService, 'getCurrentStock').mockResolvedValue(0);

    await expect(
      InventoryService.updateStock(
        {
          materialId: 1,
          locationId: 2,
          quantity: 10,
          transactionType: 'inbound',
          referenceNo: 'INB-1',
          referenceType: 'test',
          operator: 'tester',
          batchNumber: null,
          unitCost: 5,
        },
        connection
      )
    ).rejects.toThrow(/入库必须提供可追溯批次号/);
  });

  it('updateStock inserts ledger with normalized batch_number (null → empty string never reaches INSERT)', async () => {
    const connection = {
      execute: jest.fn().mockResolvedValue([{ insertId: 55 }]),
      query: jest.fn(),
    };

    jest.spyOn(InventoryService, '_findLedgerByIdempotencyKey').mockResolvedValue(null);
    jest.spyOn(InventoryService, 'resolveTransactionDate').mockResolvedValue('2026-06-27');
    jest.spyOn(InventoryService, '_lockStockLocation').mockResolvedValue(true);
    jest.spyOn(InventoryService, 'getCurrentStock').mockResolvedValue(100);
    jest.spyOn(InventoryService, '_validateMaterialAndLocation').mockResolvedValue(undefined);
    jest.spyOn(InventoryService, '_resolveUnitCost').mockResolvedValue(12.5);
    jest.spyOn(InventoryService, '_adjustStockBalance').mockResolvedValue(undefined);
    jest.spyOn(InventoryService, 'clearStockCache').mockResolvedValue(undefined);

    // 出库未指定批次 → FIFO 路径；这里模拟已有一批
    connection.query.mockResolvedValueOnce([
      [{ batch_number: 'FIFO-A', batch_quantity: 20 }],
    ]);

    const result = await InventoryService.updateStock(
      {
        materialId: 10,
        locationId: 3,
        quantity: -5,
        transactionType: 'outbound',
        referenceNo: 'OUT-1',
        referenceType: 'test',
        operator: 'tester',
        batchNumber: null,
      },
      connection
    );

    expect(result.success).toBe(true);
    const insertCall = connection.execute.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /INSERT\s+INTO\s+inventory_ledger/i.test(sql)
    );
    expect(insertCall).toBeTruthy();
    // INSERT params: materialId, locationId, type, ..., batch_number at index 10
    const params = insertCall[1];
    expect(params[10]).toBe('FIFO-A');
    expect(params[10]).not.toBeNull();

    // 排空 updateStock 成功后的 setImmediate 预警副作用，避免 Jest 环境已拆除
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('updateStock normalizes explicit batchNumber before ledger insert', async () => {
    const connection = {
      execute: jest.fn().mockResolvedValue([{ insertId: 66 }]),
      query: jest.fn(),
    };

    jest.spyOn(InventoryService, '_findLedgerByIdempotencyKey').mockResolvedValue(null);
    jest.spyOn(InventoryService, 'resolveTransactionDate').mockResolvedValue('2026-06-27');
    jest.spyOn(InventoryService, '_lockStockLocation').mockResolvedValue(true);
    jest.spyOn(InventoryService, 'getCurrentStock').mockResolvedValue(50);
    jest.spyOn(InventoryService, '_validateMaterialAndLocation').mockResolvedValue(undefined);
    jest.spyOn(InventoryService, '_resolveUnitCost').mockResolvedValue(8);
    jest.spyOn(InventoryService, '_adjustStockBalance').mockResolvedValue(undefined);
    jest.spyOn(InventoryService, 'clearStockCache').mockResolvedValue(undefined);

    await InventoryService.updateStock(
      {
        materialId: 10,
        locationId: 3,
        quantity: -2,
        transactionType: 'outbound',
        referenceNo: 'OUT-2',
        referenceType: 'test',
        operator: 'tester',
        batchNumber: 'B-EXPLICIT',
      },
      connection
    );

    const insertCall = connection.execute.mock.calls.find(
      ([sql]) => typeof sql === 'string' && /INSERT\s+INTO\s+inventory_ledger/i.test(sql)
    );
    expect(insertCall[1][10]).toBe('B-EXPLICIT');

    await new Promise((resolve) => setImmediate(resolve));
  });
});
