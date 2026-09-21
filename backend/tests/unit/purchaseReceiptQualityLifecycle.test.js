/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));
jest.mock('../../src/models/purchase', () => ({ generateReceiptNo: jest.fn(async () => 'PR-1') }));
jest.mock('../../src/config/financeConfig', () => ({
  financeConfig: { get: jest.fn(() => 0.13) },
}));

const PurchaseReceiptService = require('../../src/services/quality/PurchaseReceiptService');
const db = require('../../src/config/db');

const inspection = (values = {}) => ({
  id: 7,
  inspection_no: 'QI-7',
  inspection_type: 'incoming',
  source_type: 'purchase_order',
  reference_id: 2,
  reference_no: 'PO-2',
  supplier_id: 6,
  material_id: 3,
  purchase_order_item_id: 4,
  batch_no: 'BATCH-7',
  status: 'partial',
  quantity: 10,
  qualified_quantity: 6,
  unqualified_quantity: 4,
  inspector_id: 8,
  inspector_name: 'Inspector',
  ...values,
});
const receipt = (values = {}) => ({
  id: 9,
  receipt_no: 'PR-9',
  order_id: 2,
  status: 'draft',
  ...values,
});
const receiptItem = (values = {}) => ({
  id: 90,
  order_item_id: 4,
  material_id: 3,
  received_quantity: 10,
  qualified_quantity: 0,
  batch_number: 'BATCH-7',
  price: 20,
  tax_rate: 0.13,
  ...values,
});
function connectionFor({ inspected = inspection(), receipts = [], items = [] } = {}) {
  return {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    query: jest.fn(async (sql) => {
      if (sql.includes('FROM purchase_orders'))
        return [[{ id: 2, order_no: 'PO-2', supplier_id: 6, status: 'approved' }]];
      if (sql.includes('FROM quality_inspections')) return [[inspected]];
      if (sql.includes('FROM purchase_receipts')) return [receipts];
      if (sql.includes('FROM purchase_receipt_items')) return [items];
      if (sql.includes('INSERT INTO purchase_receipts')) return [{ insertId: 9 }];
      if (
        sql.includes('INSERT INTO purchase_receipt_items') ||
        sql.includes('UPDATE purchase_receipt')
      ) {
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
}
const insertData = (connection, table) => {
  const call = connection.query.mock.calls.find(([sql]) => sql.includes(`INSERT INTO ${table} (`));
  if (!call) return null;
  const columns = call[0]
    .match(/INSERT INTO \w+\s*\(([^)]+)\)/)[1]
    .split(',')
    .map((value) => value.trim());
  return Object.fromEntries(columns.map((column, index) => [column, call[1][index]]));
};

describe('purchase receipt lifecycle follows persisted inspection evidence', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.spyOn(PurchaseReceiptService, '_getOrderContext').mockResolvedValue({
      orderItemId: 4,
      orderedQuantity: 20,
      orderNo: 'PO-2',
      orderCreatedBy: 8,
      supplierId: 6,
      supplierName: 'Supplier',
      materialCode: 'M-3',
      materialName: 'Material',
      unitId: 1,
      materialLocationId: 5,
      price: 20,
      taxRate: 0.13,
    });
    jest
      .spyOn(PurchaseReceiptService, '_resolveWarehouse')
      .mockResolvedValue({ warehouseId: 5, warehouseName: 'Warehouse' });
  });

  test('partial inspection creates inspected with total received and only qualified value', async () => {
    const connection = connectionFor();
    await PurchaseReceiptService.autoCreateFromInspection(
      { id: 7, qualified_quantity: 999 },
      {},
      connection
    );
    expect(insertData(connection, 'purchase_receipts')).toMatchObject({
      status: 'inspected',
      total_amount: 135.6,
      total_tax_amount: 15.6,
      active_inspection_key: 'INSPECTION:7',
    });
    expect(insertData(connection, 'purchase_receipt_items')).toMatchObject({
      order_item_id: 4,
      ordered_quantity: 20,
      quantity: 10,
      received_quantity: 10,
      qualified_quantity: 6,
      amount_excluding_tax: 120,
      total_amount: 135.6,
    });
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test.each(['failed', 'completed'])(
    'all-rejected %s closes an explicitly bound draft without creating stock',
    async (status) => {
      const connection = connectionFor({
        inspected: inspection({ status, qualified_quantity: 0, unqualified_quantity: 10 }),
        receipts: [receipt()],
        items: [receiptItem()],
      });
      const result = await PurchaseReceiptService.autoCreateFromInspection(
        { id: 7 },
        {},
        connection
      );
      expect(result).toMatchObject({ receiptId: 9, existed: true });
      expect(insertData(connection, 'purchase_receipts')).toBeNull();
      const itemUpdate = connection.query.mock.calls.find(([sql]) =>
        sql.includes('UPDATE purchase_receipt_items')
      );
      expect(itemUpdate[1]).toEqual([4, 10, 10, 0, 'BATCH-7', 0.13, 0, 0, 0, 90]);
      const headerUpdate = connection.query.mock.calls.find(([sql]) =>
        sql.includes('UPDATE purchase_receipts')
      );
      expect(headerUpdate[1]).toEqual(['inspected', 0, 0, 'INSPECTION:7', 9]);
    }
  );

  test('all-rejected inspection without a bound draft does not create a receipt', async () => {
    const connection = connectionFor({
      inspected: inspection({ status: 'failed', qualified_quantity: 0, unqualified_quantity: 10 }),
    });
    await expect(
      PurchaseReceiptService.autoCreateFromInspection({ id: 7 }, {}, connection)
    ).resolves.toBeNull();
    expect(insertData(connection, 'purchase_receipts')).toBeNull();
  });

  test('repeated closure of a completed receipt cannot overwrite posted quantities', async () => {
    const connection = connectionFor({
      receipts: [receipt({ status: 'completed' })],
      items: [receiptItem({ qualified_quantity: 6 })],
    });
    await expect(
      PurchaseReceiptService.autoCreateFromInspection({ id: 7 }, {}, connection)
    ).resolves.toMatchObject({ existed: true });
    expect(
      connection.query.mock.calls.some(([sql]) => /INSERT|UPDATE/.test(sql.split('FOR UPDATE')[0]))
    ).toBe(false);
  });

  test('changing qualified evidence after posting rolls back the owned transaction', async () => {
    const connection = connectionFor({
      receipts: [receipt({ status: 'completed' })],
      items: [receiptItem({ qualified_quantity: 8 })],
    });
    db.pool.getConnection.mockResolvedValue(connection);
    await expect(PurchaseReceiptService.autoCreateFromInspection({ id: 7 }, {})).rejects.toThrow(
      '已经入库'
    );
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test('cancelled receipt is never resurrected by a repeated inspection closure', async () => {
    const connection = connectionFor({ receipts: [receipt({ status: 'cancelled' })] });
    await expect(
      PurchaseReceiptService.autoCreateFromInspection({ id: 7 }, {}, connection)
    ).resolves.toBeNull();
    expect(insertData(connection, 'purchase_receipts')).toBeNull();
  });

  test.each([
    { status: 'pending' },
    { source_type: 'outsourced_receipt' },
    { status: 'completed', qualified_quantity: 0, unqualified_quantity: 0 },
    { qualified_quantity: 'NaN' },
  ])('rejects invalid persisted release evidence %j', async (values) => {
    const connection = connectionFor({ inspected: inspection(values) });
    await expect(
      PurchaseReceiptService.autoCreateFromInspection({ id: 7 }, {}, connection)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(insertData(connection, 'purchase_receipts')).toBeNull();
  });

  test('refuses ambiguous receipt ownership instead of selecting the first match', async () => {
    const connection = connectionFor({ receipts: [receipt(), receipt({ id: 10 })] });
    await expect(
      PurchaseReceiptService.autoCreateFromInspection({ id: 7 }, {}, connection)
    ).rejects.toThrow('多张有效收货单');
  });
});
