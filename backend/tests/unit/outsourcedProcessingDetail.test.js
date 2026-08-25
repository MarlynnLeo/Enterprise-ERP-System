/* global afterEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: {
    execute: jest.fn(),
  },
}));

jest.mock('../../src/models/purchase', () => ({}));
jest.mock('../../src/services/InventoryService', () => ({}));
jest.mock('../../src/services/external/FinanceIntegrationService', () => ({}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({}));
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const db = require('../../src/config/db');
const {
  getProcessing,
  getOutsourcedMaterialOptions,
  getOutsourcedSupplierOptions,
  getOutsourcedReceiptProcessingDetail,
  getOutsourcedReceiptProcessingOptions,
  getOutsourcedReceiptWarehouseOptions,
  getIncompleteReceiptProductCount,
  validateReceiptItems,
  getProcessingValidationError,
  validateProcessingReferences,
} = require('../../src/controllers/outsourced/processingController');

describe('outsourced processing detail', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns the remaining receivable quantity for each product', async () => {
    db.pool.execute
      .mockResolvedValueOnce([[
        { id: 7, processing_no: 'WW260824001', status: 'in_progress' },
      ]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[
        {
          id: 8,
          processing_id: 7,
          product_id: 12147,
          product_code: '300300402024',
          product_name: '底座（钻孔）',
          quantity: '3.00',
          unit_price: '20.00',
        },
      ]])
      .mockResolvedValueOnce([[
        { product_id: 12147, received_quantity: '1.00' },
      ]]);

    const req = { params: { id: '7' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await getProcessing(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        processingNo: 'WW260824001',
        products: [expect.objectContaining({
          productCode: '300300402024',
          receivedQuantity: 1,
          receivableQuantity: 2,
        })],
      }),
    }));
  });

  test('provides processing supplier options without exposing full supplier records', async () => {
    db.pool.execute
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[
        {
          id: 472,
          code: 'G477',
          name: '北京英拓文远智能科技有限公司',
          contact_person: null,
          contact_phone: null,
        },
      ]]);

    const req = { query: { keyword: '北京英拓', page: '1', pageSize: '100' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await getOutsourcedSupplierOptions(req, res);

    expect(db.pool.execute.mock.calls[0][0]).toContain('(code LIKE ? OR name LIKE ?)');
    expect(db.pool.execute.mock.calls[0][1]).toEqual(['%北京英拓%', '%北京英拓%']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        total: 1,
        list: [expect.objectContaining({
          id: 472,
          name: '北京英拓文远智能科技有限公司',
        })],
      }),
    }));
  });

  test('provides all enabled material types for outsourced document line roles', async () => {
    db.pool.execute
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[
        {
          id: 12147,
          code: '300300402024',
          name: '底座（钻孔）',
          specification: '钻孔',
          unit_id: 2,
          unit_name: '个',
          material_type: 'component',
        },
      ]]);

    const req = { query: { keyword: '底座', page: '1', pageSize: '100' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await getOutsourcedMaterialOptions(req, res);

    const countSql = db.pool.execute.mock.calls[0][0];
    expect(countSql).toContain('m.status = 1');
    expect(countSql).not.toContain('material_type =');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        list: [expect.objectContaining({
          materialType: 'component',
          unitName: '个',
        })],
      }),
    }));
  });

  test('provides receipt warehouses without depending on base-data permissions', async () => {
    db.pool.execute
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[
        { id: 3, name: '成品库', type: 'finished_goods', is_default: 1 },
      ]]);

    const req = { query: { page: '1', pageSize: '100' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await getOutsourcedReceiptWarehouseOptions(req, res);

    expect(db.pool.execute.mock.calls[0][0]).toContain('FROM locations');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        list: [expect.objectContaining({ id: 3, name: '成品库' })],
      }),
    }));
  });

  test('lists only processing orders that still have unallocated receipt quantity', async () => {
    db.pool.execute
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[
        { id: 8, processing_no: 'WW260825003', supplier_name: '北京英拓', status: 'in_progress' },
      ]]);

    const req = { query: { keyword: 'WW260825003', page: '1', pageSize: '100' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await getOutsourcedReceiptProcessingOptions(req, res);

    const countSql = db.pool.execute.mock.calls[0][0];
    expect(countSql).toContain("op.status IN ('confirmed', 'in_progress')");
    expect(countSql).toContain("opr1.status <> 'cancelled'");
    expect(countSql).toContain("pending_receipt.status = 'pending'");
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        list: [expect.objectContaining({ processingNo: 'WW260825003' })],
      }),
    }));
  });

  test('provides receipt-scoped processing details with remaining quantities', async () => {
    db.pool.execute
      .mockResolvedValueOnce([[
        { id: 8, processing_no: 'WW260825003', supplier_name: '北京英拓', status: 'in_progress' },
      ]])
      .mockResolvedValueOnce([[
        {
          product_id: 12147,
          product_code: '300300402024',
          product_name: '底座（钻孔）',
          quantity: '3.00',
          received_quantity: '1.00',
          receivable_quantity: '2.00',
        },
      ]]);

    const req = { params: { processingId: '8' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await getOutsourcedReceiptProcessingDetail(req, res);

    expect(db.pool.execute.mock.calls[1][0]).toContain("opr.status <> 'cancelled'");
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        processingNo: 'WW260825003',
        products: [expect.objectContaining({ receivableQuantity: '2.00' })],
      }),
    }));
  });

  test('rejects a new receipt quantity that exceeds the remaining quantity', async () => {
    const connection = {
      execute: jest.fn()
        .mockResolvedValueOnce([[
          {
            product_id: 12147,
            product_code: '300300402024',
            product_name: '底座（钻孔）',
            specification: 'HRF-MD4 MDF2',
            quantity: '3.00',
            unit_price: '20.00',
          },
        ]])
        .mockResolvedValueOnce([[
          { product_id: 12147, received_quantity: '2.00' },
        ]]),
    };

    await expect(validateReceiptItems(connection, 7, [
      {
        product_id: 12147,
        product_code: '300300402024',
        product_name: '底座（钻孔）',
        actual_quantity: 2,
        expected_quantity: 1,
        unit_price: 20,
      },
    ])).rejects.toThrow('超过剩余应收数量 1');
  });

  test('keeps processing incomplete when one of multiple products has not arrived', async () => {
    const connection = {
      execute: jest.fn().mockResolvedValueOnce([[{ incomplete_count: '1' }]]),
    };

    await expect(getIncompleteReceiptProductCount(connection, 7)).resolves.toBe(1);
    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining("opr.status = 'completed'"),
      [7, 7]
    );
  });

  test('allows completion only when every product has arrived in full', async () => {
    const connection = {
      execute: jest.fn().mockResolvedValueOnce([[{ incomplete_count: '0' }]]),
    };

    await expect(getIncompleteReceiptProductCount(connection, 7)).resolves.toBe(0);
  });

  test('rejects zero or invalid processing lines before writing a document', () => {
    expect(getProcessingValidationError({
      processing_date: '2026-08-25',
      supplier_id: 471,
      supplier_name: '加工厂',
      expected_delivery_date: '2026-08-28',
      materials: [{ material_id: 11732, quantity: 0 }],
      products: [{ product_id: 11727, quantity: 1, unit_price: 1 }],
    })).toBe('发料物料第 1 行数量必须大于0');

    expect(getProcessingValidationError({
      processing_date: '2026-08-25',
      supplier_id: 471,
      supplier_name: '加工厂',
      expected_delivery_date: '2026-08-28',
      materials: [{ material_id: 11732, quantity: 1 }],
      products: [{ product_id: 0, quantity: 1, unit_price: 1 }],
    })).toBe('加工成品第 1 行缺少有效物料ID');
  });

  test('canonicalizes processing master data and recalculates line amount', async () => {
    const connection = {
      execute: jest.fn().mockResolvedValueOnce([[
        { id: 11732, code: 'RAW-1', name: '原料', specs: '原料规格', unit_id: 1 },
        { id: 11727, code: 'FG-1', name: '成品', specs: '成品规格', unit_id: 2 },
      ]]),
    };

    const result = await validateProcessingReferences(
      connection,
      [{ material_id: 11732, material_name: '伪造名称', quantity: 1 }],
      [{ product_id: 11727, product_name: '伪造名称', quantity: 3, unit_price: 1.235 }]
    );

    expect(result.materials[0]).toEqual(expect.objectContaining({
      material_code: 'RAW-1',
      material_name: '原料',
      quantity: 1,
    }));
    expect(result.products[0]).toEqual(expect.objectContaining({
      product_code: 'FG-1',
      product_name: '成品',
      quantity: 3,
      unit_price: 1.235,
      total_price: 3.71,
    }));
  });
});
