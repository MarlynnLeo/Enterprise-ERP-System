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
jest.mock('../../src/services/business/InventoryPostingResubmissionService', () => ({
  resubmit: jest.fn(async () => null),
}));
jest.mock('../../src/services/InventoryPostingService', () => ({ getApprovalBySource: jest.fn() }));
jest.mock('../../src/utils/userHelper', () => ({ getCurrentUserName: jest.fn(async () => 'Inspector') }));

const db = require('../../src/config/db');
const controller = require('../../src/controllers/business/purchase/purchaseReceiptController');
const PurchaseOrderQuantityService = require('../../src/services/business/PurchaseOrderQuantityService');
const InventoryTraceabilityService = require('../../src/services/business/InventoryTraceabilityService');
const DomainEventService = require('../../src/services/business/DomainEventService');
const Resubmission = require('../../src/services/business/InventoryPostingResubmissionService');
const PurchaseOrderStatusService = require('../../src/services/business/PurchaseOrderStatusService');
const Posting = require('../../src/services/InventoryPostingService');

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
    Resubmission.resubmit.mockReset().mockResolvedValue(null);
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

  test.each(['rejected', 'invalid'])('source detail stays readable and returns minimal finance status: %s', async (status) => {
    const connection = { release: jest.fn(), query: jest.fn()
      .mockResolvedValueOnce([[{ id: 9, receipt_no: 'PR-9', status: 'completed' }]])
      .mockResolvedValueOnce([[]]) };
    db.pool.getConnection.mockResolvedValue(connection);
    if (status === 'invalid') {
      Posting.getApprovalBySource.mockRejectedValueOnce(Object.assign(new Error('过账批次与冻结快照不一致'), { code: 'SNAPSHOT_INVALID', statusCode: 409 }));
    } else {
      Posting.getApprovalBySource.mockResolvedValueOnce({ movement: { finance_status: 'rejected', total_value: 999 }, events: [{ id: 1 }] });
    }
    const res = response();
    await controller.getReceipt(request(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0].data;
    expect(body.financeStatus).toBe(status);
    expect(body).not.toHaveProperty('events');
    expect(body).not.toHaveProperty('movement');
    if (status === 'invalid') expect(body.financeValidationError).toContain('冻结快照');
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test('已完成但财务驳回的采购收货重提不再累加上游数量、重写状态或产生完工事件', async () => {
    const connection = receiptConnection({ status: 'completed' });
    db.pool.getConnection.mockResolvedValue(connection);
    Resubmission.resubmit.mockResolvedValue({ documentId: 91, resubmittedFrom: 90, financeStatus: 'pending' });
    const res = response();
    await controller.updateReceiptStatus(request(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(Resubmission.resubmit).toHaveBeenCalledWith(connection, {
      sourceType: 'purchase_receipt', sourceId: 9, sourceNo: 'PR-9', actor: { id: 8, label: 'Inspector' },
    });
    expect(connection.state).toEqual({ status: 'completed', stock: 0, events: 0 });
    expect(connection.query.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
    expect(PurchaseOrderStatusService.syncOrderItemReceivedFromReceipts).not.toHaveBeenCalled();
    expect(PurchaseOrderStatusService.updateOrderItemWarehousingQuantity).not.toHaveBeenCalled();
    expect(InventoryTraceabilityService.handlePurchaseReceipt).not.toHaveBeenCalled();
    expect(DomainEventService.enqueue).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test('已完成采购单没有可重提驳回时返回冲突且不重放业务操作', async () => {
    const connection = receiptConnection({ status: 'completed' });
    db.pool.getConnection.mockResolvedValue(connection);
    const res = response();
    await controller.updateReceiptStatus(request(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(InventoryTraceabilityService.handlePurchaseReceipt).not.toHaveBeenCalled();
    expect(DomainEventService.enqueue).not.toHaveBeenCalled();
  });

  test.each([
    [400, 'VALIDATION_ERROR', '会计期间已关闭'],
    [409, 'SNAPSHOT_INVALID', '冻结快照与明细不一致'],
  ])('重提被%s业务校验阻断时保留错误详情并回滚', async (statusCode, code, message) => {
    const connection = receiptConnection({ status: 'completed' });
    db.pool.getConnection.mockResolvedValue(connection);
    Resubmission.resubmit.mockRejectedValue(Object.assign(new Error(message), { statusCode, code }));
    const res = response();
    await controller.updateReceiptStatus(request(), res);
    expect(res.status).toHaveBeenCalledWith(statusCode);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message }));
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(PurchaseOrderStatusService.updateOrderItemWarehousingQuantity).not.toHaveBeenCalled();
    expect(InventoryTraceabilityService.handlePurchaseReceipt).not.toHaveBeenCalled();
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
