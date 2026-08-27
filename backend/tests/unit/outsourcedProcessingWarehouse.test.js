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
  generateOutsourcedIssueEntry: jest.fn(),
  getOutsourcedReceiptCostAllocation: jest.fn(),
  generateOutsourcedReceiptEntry: jest.fn(),
}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({
  tryAutoLink: jest.fn(),
}));
jest.mock('../../src/services/finance/VoucherReversalService', () => ({}));
jest.mock('../../src/utils/codeGenerator', () => ({
  CodeGenerators: {
    generateProcessingReceiptCode: jest.fn(async () => 'WWRK-TEST-001'),
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

const InventoryService = require('../../src/services/InventoryService');
const FinanceIntegrationService = require('../../src/services/external/FinanceIntegrationService');
const {
  updateProcessingStatus,
  updateReceiptStatus,
} = require('../../src/controllers/outsourced/processingController');

const createResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

const processing = {
  id: 8,
  processing_no: 'WW-TEST-001',
  processing_date: '2026-08-25',
  supplier_id: 472,
  supplier_name: '测试加工厂',
  expected_delivery_date: '2026-08-28',
  status: 'pending',
  location_id: 99,
  warehouse_name: '错误的表头仓库',
};

describe('outsourced inventory warehouse resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection.execute.mockReset();
    InventoryService.updateStock.mockResolvedValue({ success: true });
    FinanceIntegrationService.generateOutsourcedIssueEntry.mockResolvedValue({ success: true });
    FinanceIntegrationService.getOutsourcedReceiptCostAllocation.mockResolvedValue({
      materialCostByItemId: new Map([
        [701, { unitCost: 10 }],
        [702, { unitCost: 12 }],
      ]),
    });
    FinanceIntegrationService.generateOutsourcedReceiptEntry.mockResolvedValue({ success: true });
  });

  test('issues each material from its configured warehouse instead of the processing header', async () => {
    InventoryService.getBatchMaterialInfo.mockResolvedValue(new Map([
      [501, { locationId: 11, code: 'RAW-1', name: '原料1' }],
      [502, { locationId: 22, code: 'RAW-2', name: '原料2' }],
      [701, { locationId: 33, code: 'FG-1', name: '成品1' }],
    ]));
    mockConnection.execute
      .mockResolvedValueOnce([[processing]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[
        { id: 601, material_id: 501, material_name: '原料1', unit_id: 1, quantity: '2.00' },
        { id: 602, material_id: 502, material_name: '原料2', unit_id: 1, quantity: '3.00' },
      ]])
      .mockResolvedValueOnce([[
        { id: 11, name: '原料仓A' },
        { id: 22, name: '原料仓B' },
      ]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[
        {
          product_id: 701,
          product_code: 'FG-1',
          product_name: '成品1',
          specification: '',
          unit: '个',
          unit_id: 1,
          quantity: '1.00',
          unit_price: '10.00',
          total_price: '10.00',
        },
      ]])
      .mockResolvedValueOnce([[
        { id: 33, name: '成品仓' },
      ]])
      .mockResolvedValueOnce([{ insertId: 77 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const req = {
      params: { id: '8' },
      body: { status: 'in_progress' },
      user: { id: 1, name: '管理员' },
    };
    const res = createResponse();

    await updateProcessingStatus(req, res);

    expect(InventoryService.updateStock).toHaveBeenCalledTimes(2);
    expect(InventoryService.updateStock.mock.calls.map(([payload]) => payload.locationId))
      .toEqual([11, 22]);
    expect(InventoryService.updateStock.mock.calls.map(([payload]) => payload.warehouseName))
      .toEqual(['原料仓A', '原料仓B']);
    expect(InventoryService.updateStock.mock.calls.every(([payload]) => payload.locationId !== 99))
      .toBe(true);
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('receives each product into its configured warehouse instead of the receipt header', async () => {
    InventoryService.getBatchMaterialInfo.mockResolvedValue(new Map([
      [701, { locationId: 41, code: 'FG-1', name: '成品1' }],
      [702, { locationId: 42, code: 'FG-2', name: '成品2' }],
    ]));
    mockConnection.execute
      .mockResolvedValueOnce([[{
        id: 9,
        receipt_no: 'WWRK-TEST-002',
        processing_id: 8,
        processing_no: 'WW-TEST-001',
        supplier_id: 472,
        supplier_name: '测试加工厂',
        location_id: 99,
        warehouse_name: '错误的表头仓库',
        operator: '管理员',
        status: 'pending',
      }]])
      .mockResolvedValueOnce([[{ id: 8, status: 'in_progress' }]])
      .mockResolvedValueOnce([[
        { id: 701, product_id: 701, product_name: '成品1', unit_id: 1, actual_quantity: '1.00' },
        { id: 702, product_id: 702, product_name: '成品2', unit_id: 1, actual_quantity: '2.00' },
      ]])
      .mockResolvedValueOnce([[
        { id: 41, name: '成品仓A' },
        { id: 42, name: '成品仓B' },
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const req = {
      params: { id: '9' },
      body: { status: 'confirmed' },
      user: { id: 1, name: '管理员' },
    };
    const res = createResponse();

    await updateReceiptStatus(req, res);

    expect(InventoryService.updateStock).toHaveBeenCalledTimes(2);
    expect(InventoryService.updateStock.mock.calls.map(([payload]) => payload.locationId))
      .toEqual([41, 42]);
    expect(InventoryService.updateStock.mock.calls.map(([payload]) => payload.warehouseName))
      .toEqual(['成品仓A', '成品仓B']);
    expect(InventoryService.updateStock.mock.calls.every(([payload]) => payload.locationId !== 99))
      .toBe(true);
    expect(FinanceIntegrationService.generateOutsourcedReceiptEntry).toHaveBeenCalledTimes(1);
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('rolls back before posting when a material has no configured warehouse', async () => {
    InventoryService.getBatchMaterialInfo.mockRejectedValue(
      new Error('物料 RAW-1 未配置默认仓库，请在【物料管理】中设置存放仓库后再操作')
    );
    mockConnection.execute
      .mockResolvedValueOnce([[processing]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[
        { id: 601, material_id: 501, material_name: '原料1', unit_id: 1, quantity: '2.00' },
      ]]);

    const req = {
      params: { id: '8' },
      body: { status: 'in_progress' },
      user: { id: 1, name: '管理员' },
    };
    const res = createResponse();

    await updateProcessingStatus(req, res);

    expect(InventoryService.updateStock).not.toHaveBeenCalled();
    expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    expect(mockConnection.commit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
