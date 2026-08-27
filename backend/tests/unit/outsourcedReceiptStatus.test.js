/* global beforeEach, describe, expect, jest, test */

const mockConnection = {
  beginTransaction: jest.fn(),
  execute: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
};

jest.mock('../../src/config/db', () => ({
  pool: {
    getConnection: jest.fn(async () => mockConnection),
  },
}));

jest.mock('../../src/models/purchase', () => ({}));
jest.mock('../../src/services/InventoryService', () => ({
  updateStock: jest.fn(),
  getBatchMaterialInfo: jest.fn(),
}));
jest.mock('../../src/services/external/FinanceIntegrationService', () => ({
  getOutsourcedReceiptCostAllocation: jest.fn(),
  generateOutsourcedReceiptEntry: jest.fn(),
}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({}));
jest.mock('../../src/services/finance/VoucherReversalService', () => ({}));
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const InventoryService = require('../../src/services/InventoryService');
const FinanceIntegrationService = require('../../src/services/external/FinanceIntegrationService');
const {
  createReceipt,
  updateReceiptStatus,
} = require('../../src/controllers/outsourced/processingController');

const createResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

const receipt = (status) => ({
  id: 5,
  receipt_no: 'WWRK260825005',
  processing_id: 12,
  processing_no: 'WW260825012',
  supplier_id: 472,
  supplier_name: '北京英拓',
  location_id: 3,
  warehouse_name: '成品库',
  operator: '管理员',
  status,
});

describe('outsourced receipt status side effects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection.execute.mockReset();
    InventoryService.getBatchMaterialInfo.mockResolvedValue(new Map([
      [12147, { locationId: 9, code: 'FG-1', name: '底座（钻孔）' }],
    ]));
    FinanceIntegrationService.getOutsourcedReceiptCostAllocation.mockResolvedValue({
      materialCostByItemId: new Map([[51, { unitCost: 20 }]]),
    });
    FinanceIntegrationService.generateOutsourcedReceiptEntry.mockResolvedValue({ success: true });
  });

  test('confirmation posts stock and finance but does not complete the processing order', async () => {
    mockConnection.execute
      .mockResolvedValueOnce([[receipt('pending')]])
      .mockResolvedValueOnce([[{ id: 12, status: 'in_progress' }]])
      .mockResolvedValueOnce([[
        {
          id: 51,
          product_id: 12147,
          product_name: '底座（钻孔）',
          unit_id: 2,
          actual_quantity: '1.00',
        },
      ]]);
    mockConnection.execute
      .mockResolvedValueOnce([[{ id: 9, name: '成品库' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const req = {
      params: { id: '5' },
      body: { status: 'confirmed' },
      user: { id: 1, name: '管理员' },
    };
    const res = createResponse();

    await updateReceiptStatus(req, res);

    expect(InventoryService.updateStock).toHaveBeenCalledTimes(1);
    expect(InventoryService.updateStock).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: 9, warehouseName: '成品库' }),
      mockConnection
    );
    expect(FinanceIntegrationService.generateOutsourcedReceiptEntry).toHaveBeenCalledTimes(1);
    expect(mockConnection.execute.mock.calls.some(([sql]) =>
      String(sql).includes('UPDATE outsourced_processings SET status')
    )).toBe(false);
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('creation rejects a duplicate pending receipt for the same processing order', async () => {
    mockConnection.execute
      .mockResolvedValueOnce([[
        { id: 12, processing_no: 'WW260825012', status: 'in_progress' },
      ]])
      .mockResolvedValueOnce([[
        { id: 6, receipt_no: 'WWRK260825005' },
      ]]);

    const req = {
      body: {
        processingId: 12,
        locationId: 3,
        receiptDate: '2026-08-25',
        operator: '管理员',
        items: [{ productId: 12147, actualQuantity: 1 }],
      },
      user: { id: 1 },
    };
    const res = createResponse();

    await createReceipt(req, res);

    expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: expect.stringContaining('已有待处理入库单 WWRK260825005'),
    }));
  });

  test('completion does not repost stock and completes processing only after completed receipts are sufficient', async () => {
    mockConnection.execute
      .mockResolvedValueOnce([[receipt('confirmed')]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ incomplete_count: '0' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const req = {
      params: { id: '5' },
      body: { status: 'completed' },
      user: { id: 1, name: '管理员' },
    };
    const res = createResponse();

    await updateReceiptStatus(req, res);

    expect(InventoryService.updateStock).not.toHaveBeenCalled();
    expect(FinanceIntegrationService.generateOutsourcedReceiptEntry).not.toHaveBeenCalled();
    expect(mockConnection.execute.mock.calls.some(([sql]) =>
      String(sql).includes('UPDATE outsourced_processings SET status')
    )).toBe(true);
    expect(mockConnection.execute.mock.calls[2][0]).toContain("opr.status = 'completed'");
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('a partial completed receipt remains valid without completing the processing order', async () => {
    mockConnection.execute
      .mockResolvedValueOnce([[receipt('confirmed')]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ incomplete_count: '1' }]]);

    const req = {
      params: { id: '5' },
      body: { status: 'completed' },
      user: { id: 1, name: '管理员' },
    };
    const res = createResponse();

    await updateReceiptStatus(req, res);

    expect(mockConnection.execute.mock.calls.some(([sql]) =>
      String(sql).includes('UPDATE outsourced_processings SET status')
    )).toBe(false);
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
