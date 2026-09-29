/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: { getConnection: jest.fn(), query: jest.fn() },
}));
jest.mock('../../src/models/purchase', () => ({}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({ assertAccess: jest.fn() }));
jest.mock('../../src/utils/desensitizer', () => ({ desensitizeDataForUser: jest.fn() }));
jest.mock('../../src/services/business/PurchaseOrderStatusService', () => ({}));
jest.mock('../../src/services/business/PurchaseReceiveInspectionService', () => ({}));
jest.mock('../../src/services/business/PurchasePriceService', () => ({}));
jest.mock('../../src/services/business/SupplierMetalRangePriceService', () => ({
  getCurrentMetalPrice: jest.fn(async () => null),
}));
jest.mock('../../src/services/PurchaseOrderService', () => {
  const actual = jest.requireActual('../../src/services/PurchaseOrderService');
  return {
    // Keep the actual draft-only guard while isolating quantity synchronization.
    validateOrderEditable: jest.fn(actual.validateOrderEditable),
    validateSupplier: jest.fn(),
    syncRequisitionQuantitiesForOrderEdit: jest.fn(),
    validateRequisitionAllocation: jest.fn(),
    insertOrderItems: jest.fn(),
    syncRequisitionStatusFromOrders: jest.fn(),
  };
});

const db = require('../../src/config/db');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const PurchaseOrderService = require('../../src/services/PurchaseOrderService');
const controller = require('../../src/controllers/business/purchase/purchaseOrderController');

const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const request = (requisitionId = '4') => ({
  params: { id: '9' },
  body: {
    orderDate: '2026-09-29',
    supplierId: 5,
    requisitionId,
    taxRate: 0.13,
    items: [{ materialId: 3, materialCode: '4003003015', quantity: 100000, price: 2 }],
  },
  user: { id: 8 },
  userPermissions: ['purchase:orders:update'],
});

function orderConnection({ status = 'draft', requisitionId = 4 } = {}) {
  const state = { requisitionQuantity: 3663, orderQuantity: 3663 };
  let snapshot;
  return {
    state,
    beginTransaction: jest.fn(async () => {
      snapshot = { ...state };
    }),
    commit: jest.fn(),
    rollback: jest.fn(async () => {
      Object.assign(state, snapshot);
    }),
    release: jest.fn(),
    query: jest.fn(async (sql) => {
      if (sql.includes('SELECT status, requisition_id FROM purchase_orders')) {
        return [[{ status, requisition_id: requisitionId }]];
      }
      if (
        sql.includes('UPDATE purchase_orders') ||
        sql.includes('DELETE FROM purchase_order_items')
      ) {
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected transaction query: ${sql}`);
    }),
  };
}

describe('purchase order editing synchronizes its existing requisition in one transaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ScopeGuard.assertAccess.mockResolvedValue(true);
    PurchaseOrderService.validateSupplier.mockResolvedValue('Supplier');
    PurchaseOrderService.syncRequisitionQuantitiesForOrderEdit.mockImplementation(
      async (connection, _requisitionId, _orderId, items) => {
        connection.state.requisitionQuantity = Number(items[0].quantity);
      }
    );
    PurchaseOrderService.validateRequisitionAllocation.mockImplementation(
      async (_connection, requisitionId) =>
        requisitionId
          ? { id: Number(requisitionId), requisition_number: `REQ-${requisitionId}` }
          : null
    );
    PurchaseOrderService.insertOrderItems.mockImplementation(
      async (connection, _orderId, items) => {
        connection.state.orderQuantity = Number(items[0].quantity);
      }
    );
    PurchaseOrderService.syncRequisitionStatusFromOrders.mockResolvedValue(null);
    db.pool.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM purchase_orders o')) return [[{ id: 9, status: 'draft' }]];
      if (sql.includes('purchase_order_items poi')) {
        return [[{ id: 90, material_id: 3, quantity: 100000, price: 2 }]];
      }
      throw new Error(`Unexpected detail query: ${sql}`);
    });
  });

  test('same-source edits synchronize the submitted quantities before allocation validation', async () => {
    const connection = orderConnection();
    db.pool.getConnection.mockResolvedValue(connection);
    const res = response();

    await controller.updateOrder(request(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(PurchaseOrderService.syncRequisitionQuantitiesForOrderEdit).toHaveBeenCalledWith(
      connection,
      '4',
      9,
      [expect.objectContaining({ material_id: 3, material_code: '4003003015', quantity: 100000 })]
    );
    expect(PurchaseOrderService.validateRequisitionAllocation).toHaveBeenCalledWith(
      connection,
      '4',
      expect.any(Array),
      9
    );
    expect(
      PurchaseOrderService.syncRequisitionQuantitiesForOrderEdit.mock.invocationCallOrder[0]
    ).toBeLessThan(PurchaseOrderService.validateRequisitionAllocation.mock.invocationCallOrder[0]);
    expect(PurchaseOrderService.syncRequisitionStatusFromOrders).toHaveBeenCalledWith(
      connection,
      4
    );
    expect(connection.state).toEqual({ requisitionQuantity: 100000, orderQuantity: 100000 });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['switching the requisition', 4, 6, [4, 6]],
    ['unlinking the requisition', 4, null, [4]],
    ['linking a previously independent order', null, 6, [6]],
    ['editing an independent order', null, null, []],
  ])(
    '%s retains allocation checks without changing requested quantities',
    async (_label, previousRequisitionId, nextRequisitionId, affectedIds) => {
      const connection = orderConnection({ requisitionId: previousRequisitionId });
      db.pool.getConnection.mockResolvedValue(connection);
      const res = response();

      await controller.updateOrder(request(nextRequisitionId), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(PurchaseOrderService.syncRequisitionQuantitiesForOrderEdit).not.toHaveBeenCalled();
      expect(PurchaseOrderService.validateRequisitionAllocation).toHaveBeenCalledWith(
        connection,
        nextRequisitionId,
        expect.any(Array),
        9
      );
      expect(PurchaseOrderService.syncRequisitionStatusFromOrders.mock.calls).toEqual(
        affectedIds.map((id) => [connection, id])
      );
      expect(connection.state.requisitionQuantity).toBe(3663);
      expect(connection.commit).toHaveBeenCalledTimes(1);
    }
  );

  test('a later order-item save failure rolls back both order and requisition quantities', async () => {
    const connection = orderConnection();
    db.pool.getConnection.mockResolvedValue(connection);
    PurchaseOrderService.insertOrderItems.mockImplementationOnce(
      async (client, _orderId, items) => {
        client.state.orderQuantity = Number(items[0].quantity);
        throw new Error('Order item save failed');
      }
    );
    const res = response();

    await controller.updateOrder(request(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(PurchaseOrderService.syncRequisitionQuantitiesForOrderEdit).toHaveBeenCalledTimes(1);
    expect(connection.state).toEqual({ requisitionQuantity: 3663, orderQuantity: 3663 });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(db.pool.query).not.toHaveBeenCalled();
  });

  test.each(['pending', 'approved', 'completed', 'cancelled'])(
    '%s orders remain uneditable and cannot mutate their requisitions',
    async (status) => {
      const connection = orderConnection({ status });
      db.pool.getConnection.mockResolvedValue(connection);
      const res = response();

      await controller.updateOrder(request(), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('只能编辑草稿状态'),
        })
      );
      expect(PurchaseOrderService.validateOrderEditable).toHaveBeenCalledWith(connection, '9');
      expect(PurchaseOrderService.syncRequisitionQuantitiesForOrderEdit).not.toHaveBeenCalled();
      expect(PurchaseOrderService.validateRequisitionAllocation).not.toHaveBeenCalled();
      expect(PurchaseOrderService.insertOrderItems).not.toHaveBeenCalled();
      expect(connection.state).toEqual({ requisitionQuantity: 3663, orderQuantity: 3663 });
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
    }
  );
});
