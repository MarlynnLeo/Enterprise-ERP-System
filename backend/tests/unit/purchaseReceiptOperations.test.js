/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/models/purchase', () => ({}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  assertAccess: jest.fn(async () => true),
}));
jest.mock('../../src/utils/desensitizer', () => ({
  desensitizeData: (value) => value,
  hasFinancePermission: () => true,
}));
jest.mock('../../src/services/business/PurchasePriceService', () => ({}));
jest.mock('../../src/services/business/PurchaseOrderStatusService', () => ({
  syncOrderItemReceivedFromReceipts: jest.fn(),
  updateOrderItemWarehousingQuantity: jest.fn(),
}));
jest.mock('../../src/services/business/PurchaseOrderQuantityService', () => ({ read: jest.fn() }));
jest.mock('../../src/services/business/PurchaseReceiptReleaseService', () => ({
  resolveConcession: jest.fn(async () => null),
}));
jest.mock('../../src/services/business/InventoryTraceabilityService', () => ({
  handlePurchaseReceipt: jest.fn(),
}));
jest.mock('../../src/services/business/DomainEventService', () => ({
  enqueue: jest.fn(),
  dispatchSoon: jest.fn(),
}));
jest.mock('../../src/services/system/AuditLogService', () => ({ log: jest.fn() }));

const db = require('../../src/config/db');
const controller = require('../../src/controllers/business/purchase/purchaseReceiptController');
const PurchaseOrderQuantityService = require('../../src/services/business/PurchaseOrderQuantityService');
const InventoryTraceabilityService = require('../../src/services/business/InventoryTraceabilityService');
const DomainEventService = require('../../src/services/business/DomainEventService');

const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const request = (status = 'completed') => ({
  params: { id: '9' },
  body: { status },
  headers: {},
  user: { id: 8, real_name: 'Inspector' },
  method: 'PUT',
  originalUrl: '/purchase/receipts/9/status',
  ip: '127.0.0.1',
});

function receiptConnection({
  status = 'inspected',
  inspectionStatus = 'partial',
  qualified = 6,
} = {}) {
  const state = { status, stock: 0, events: 0 };
  const inspection = {
    id: 7,
    inspection_no: 'QI-7',
    inspection_type: 'incoming',
    source_type: 'purchase_order',
    reference_id: 2,
    material_id: 3,
    supplier_id: 5,
    purchase_order_item_id: 4,
    quantity: 10,
    qualified_quantity: qualified,
    unqualified_quantity: 10 - qualified,
    status: inspectionStatus,
    batch_no: 'BATCH-7',
  };
  const header = {
    id: 9,
    receipt_no: 'PR-9',
    order_id: 2,
    order_no: 'PO-2',
    supplier_id: 5,
    supplier_name: 'Supplier',
    inspection_id: 7,
    warehouse_id: 6,
    warehouse_name: 'Warehouse',
    receipt_date: '2026-09-20',
    operator: 'Inspector',
  };
  const item = {
    id: 90,
    receipt_id: 9,
    order_item_id: 4,
    material_id: 3,
    material_code: 'M-3',
    material_name: 'Material',
    quantity: 10,
    received_quantity: 10,
    qualified_quantity: qualified,
    batch_number: 'BATCH-7',
    price: 20,
    tax_rate: 0.13,
    unit_id: 1,
    unit: '个',
  };
  let snapshot;
  const connection = {
    state,
    beginTransaction: jest.fn(async () => {
      snapshot = { ...state };
    }),
    commit: jest.fn(),
    rollback: jest.fn(async () => {
      Object.assign(state, snapshot);
    }),
    release: jest.fn(),
    query: jest.fn(async (sql, values) => {
      if (sql.includes('SELECT order_id FROM purchase_receipts')) return [[{ order_id: 2 }]];
      if (sql.includes('SELECT id FROM purchase_orders')) return [[{ id: 2 }]];
      if (sql.includes('SELECT id, receipt_no, status FROM purchase_receipts'))
        return [[{ ...header, status: state.status }]];
      if (sql.includes('SELECT order_id, supplier_id, inspection_id FROM purchase_receipts'))
        return [[header]];
      if (sql.includes('FROM quality_inspections')) return [[inspection]];
      if (sql.includes('FROM purchase_orders'))
        return [[{ id: 2, status: 'inspected', supplier_id: 5 }]];
      if (sql.includes('FROM purchase_receipt_items WHERE')) return [[item]];
      if (sql.includes('UPDATE purchase_receipts')) {
        state.status = values[0];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT DISTINCT r.order_id'))
        return [[{ order_id: 2, material_id: 3, order_item_id: 4 }]];
      if (sql.includes('SELECT r.*, ri.*')) return [[{ ...header, ...item }]];
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
  return connection;
}

describe('purchase receipt completion authorization and transaction boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const line = {
      item: { id: 4, material_id: 3, quantity: 20, price: 20, tax_rate: 0.13, unit_id: 1 },
      reserved: 0,
    };
    PurchaseOrderQuantityService.read.mockResolvedValue({
      lines: new Map([[4, line]]),
      resolve: () => line,
    });
    InventoryTraceabilityService.handlePurchaseReceipt.mockImplementation(
      async (receipt, connection) => {
        connection.state.stock += receipt.items.reduce(
          (total, item) => total + Number(item.quantity),
          0
        );
      }
    );
    DomainEventService.enqueue.mockImplementation(async (_type, _payload, options) => {
      options.connection.state.events += 1;
      return 55;
    });
  });

  test.each([
    ['draft cannot skip inspection', 'draft', 'completed'],
    ['clients cannot manually mark inspected', 'draft', 'inspected'],
    ['completed is terminal', 'completed', 'cancelled'],
    ['cancelled is terminal', 'cancelled', 'completed'],
  ])('%s', async (_label, current, requested) => {
    const connection = receiptConnection({ status: current });
    db.pool.getConnection.mockResolvedValue(connection);
    const res = response();
    await controller.updateReceiptStatus(request(requested), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(connection.state).toEqual({ status: current, stock: 0, events: 0 });
    expect(connection.commit).not.toHaveBeenCalled();
    expect(InventoryTraceabilityService.handlePurchaseReceipt).not.toHaveBeenCalled();
    expect(DomainEventService.enqueue).not.toHaveBeenCalled();
  });

  test.each([
    ['failed', 0],
    ['completed', 0],
    ['pending', 6],
    ['in_progress', 6],
  ])(
    'inspected receipt rechecks live %s evidence with qualified=%s before posting',
    async (inspectionStatus, qualified) => {
      const connection = receiptConnection({ inspectionStatus, qualified });
      db.pool.getConnection.mockResolvedValue(connection);
      const res = response();
      await controller.updateReceiptStatus(request(), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(connection.state).toEqual({ status: 'inspected', stock: 0, events: 0 });
      expect(InventoryTraceabilityService.handlePurchaseReceipt).not.toHaveBeenCalled();
      expect(DomainEventService.enqueue).not.toHaveBeenCalled();
    }
  );

  test('stock failure rolls back the earlier status write and emits no event', async () => {
    const connection = receiptConnection();
    db.pool.getConnection.mockResolvedValue(connection);
    InventoryTraceabilityService.handlePurchaseReceipt.mockImplementationOnce(
      async (_receipt, client) => {
        client.state.stock += 6;
        throw new Error('Stock ledger write failed');
      }
    );
    const res = response();
    await controller.updateReceiptStatus(request(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(connection.state).toEqual({ status: 'inspected', stock: 0, events: 0 });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(DomainEventService.enqueue).not.toHaveBeenCalled();
    expect(DomainEventService.dispatchSoon).not.toHaveBeenCalled();
  });

  test('outbox failure rolls back stock and receipt status together', async () => {
    const connection = receiptConnection();
    db.pool.getConnection.mockResolvedValue(connection);
    DomainEventService.enqueue.mockRejectedValueOnce(new Error('Outbox write failed'));
    const res = response();
    await controller.updateReceiptStatus(request(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(connection.state).toEqual({ status: 'inspected', stock: 0, events: 0 });
    expect(connection.commit).not.toHaveBeenCalled();
    expect(DomainEventService.dispatchSoon).not.toHaveBeenCalled();
  });

  test('completion posts accepted stock and its event once, including repeated requests', async () => {
    const connection = receiptConnection();
    db.pool.getConnection.mockResolvedValue(connection);
    const res = response();
    await controller.updateReceiptStatus(request(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(connection.state).toEqual({ status: 'completed', stock: 6, events: 1 });
    expect(InventoryTraceabilityService.handlePurchaseReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt_id: '9',
        items: [expect.objectContaining({ quantity: 6, batch_number: 'BATCH-7' })],
      }),
      connection
    );
    expect(DomainEventService.enqueue).toHaveBeenCalledWith(
      'PURCHASE_RECEIPT_COMPLETED',
      { receiptId: '9', currentUserId: 8 },
      expect.objectContaining({ connection, dedupKey: 'PURCHASE_RECEIPT_COMPLETED:9' })
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(DomainEventService.dispatchSoon).toHaveBeenCalledWith(55);

    await controller.updateReceiptStatus(request(), response());
    expect(connection.state).toEqual({ status: 'completed', stock: 6, events: 1 });
    expect(InventoryTraceabilityService.handlePurchaseReceipt).toHaveBeenCalledTimes(1);
    expect(DomainEventService.enqueue).toHaveBeenCalledTimes(1);
    expect(DomainEventService.dispatchSoon).toHaveBeenCalledTimes(1);
  });
});
