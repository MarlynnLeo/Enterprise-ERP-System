/* global beforeEach, describe, expect, jest, test */

const mockConnection = {
  execute: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(),
  rollback: jest.fn(), release: jest.fn(),
};
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(async () => mockConnection) } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/utils/userUtils', () => ({ resolveActorLabel: jest.fn(async (_req, operator) => operator) }));
jest.mock('../../src/services/InventoryService', () => ({ getCurrentStock: jest.fn(), updateStock: jest.fn() }));
jest.mock('../../src/services/InventoryReservationService', () => ({ consumeReservation: jest.fn() }));

const Service = require('../../src/services/business/ProductSalesTraceabilityService');
const InventoryService = require('../../src/services/InventoryService');
const ReservationService = require('../../src/services/InventoryReservationService');
let orders;
const salesData = (items, orderId = 14517) => ({
  outbound_id: 7, outbound_no: 'SOB260914001', order_id: orderId,
  delivery_date: '2026-09-14', operator: '测试操作员', operator_id: 81, items,
});
const line = (id = 8, sourceOrderId = null) => ({
  id, product_id: 9461, quantity: 2000, source_order_id: sourceOrderId,
});
const traceInserts = () => mockConnection.execute.mock.calls.filter(([sql]) => sql.includes('INSERT INTO product_sales_traceability'));

beforeEach(() => {
  jest.clearAllMocks();
  InventoryService.updateStock.mockReset().mockResolvedValue({ success: true });
  orders = [
    { id: 14517, customer_id: 9, active_customer_id: 9 },
    { id: 14518, customer_id: 10, active_customer_id: 10 },
  ];
  mockConnection.execute.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM sales_orders so')) return [orders.filter(order => params.includes(order.id))];
    if (sql.includes('FROM materials')) return [[{ code: 'P9461', name: '测试产品' }]];
    if (sql.includes('FROM customers')) return [[{ name: `客户${params[0]}` }]];
    if (sql.includes('FROM inventory_ledger')) return [[{ location_id: 1 }]];
    if (sql.includes('FROM v_batch_stock')) return [[{ batch_number: 'B1', available_quantity: 10000, location_id: 1 }]];
    if (sql.includes('INSERT INTO product_sales_traceability')) return [{ insertId: 1 }];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
});

describe('sales outbound source and customer resolution', () => {
  test('single-order legacy details resolve the customer from the order within the caller transaction', async () => {
    await expect(Service.handleProductSalesOutbound(salesData([line()]), mockConnection))
      .resolves.toMatchObject({ success: true, traced_items: 1 });

    expect(traceInserts()[0][1].slice(0, 5)).toEqual([7, 'SOB260914001', 14517, 9, '客户9']);
    expect(InventoryService.updateStock).toHaveBeenCalledWith(expect.objectContaining({
      quantity: -2000, operator: '测试操作员', businessApprovedById: 81, businessApprovedBy: '测试操作员',
    }), mockConnection);
    expect(ReservationService.consumeReservation).toHaveBeenCalledWith(14517, [{ material_id: 9461, quantity: 2000 }], mockConnection);
    expect(mockConnection.beginTransaction).not.toHaveBeenCalled();
    expect(mockConnection.commit).not.toHaveBeenCalled();
    expect(mockConnection.rollback).not.toHaveBeenCalled();
    expect(mockConnection.release).not.toHaveBeenCalled();
  });

  test('multi-order lines resolve distinct customers and do not deduplicate stock movements for the same product', async () => {
    await Service.handleProductSalesOutbound(salesData([
      line(8, 14517), { id: 9, productId: 9461, quantity: 300, sourceOrderId: 14518 },
    ], null), mockConnection);

    expect(traceInserts().map(([, values]) => [values[2], values[3], values[9]]))
      .toEqual([[14517, 9, 2000], [14518, 10, 300]]);
    const movements = InventoryService.updateStock.mock.calls.map(([movement]) => movement);
    expect(movements.map(movement => movement.quantity)).toEqual([-2000, -300]);
    expect(new Set(movements.map(movement => movement.idempotencyKey)).size).toBe(2);
    expect(ReservationService.consumeReservation).toHaveBeenCalledWith(14518, [{ material_id: 9461, quantity: 300 }], mockConnection);
  });

  test('two lines of the same order also retain distinct inventory identities', async () => {
    await Service.handleProductSalesOutbound(salesData([line(8), line(9)]), mockConnection);
    const keys = InventoryService.updateStock.mock.calls.map(([movement]) => movement.idempotencyKey);
    expect(new Set(keys).size).toBe(2);
  });

  test.each([
    ['missing source order', [line()], null],
    ['zero quantity', [{ ...line(), quantity: 0 }], 14517],
    ['empty details', [], 14517],
  ])('%s is rejected before any SQL or stock writes', async (_label, items, orderId) => {
    await expect(Service.handleProductSalesOutbound(salesData(items, orderId), mockConnection))
      .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(mockConnection.execute).not.toHaveBeenCalled();
    expect(InventoryService.updateStock).not.toHaveBeenCalled();
  });

  test.each(['missing order', 'missing customer', 'deleted customer'])('%s on a later line rejects the whole outbound before writes', async (problem) => {
    if (problem === 'missing order') orders.pop();
    if (problem === 'missing customer') orders[1].customer_id = null;
    if (problem === 'deleted customer') orders[1].active_customer_id = null;
    await expect(Service.handleProductSalesOutbound(salesData([line(8, 14517), line(9, 14518)], null), mockConnection))
      .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(traceInserts()).toHaveLength(0);
    expect(InventoryService.updateStock).not.toHaveBeenCalled();
    expect(ReservationService.consumeReservation).not.toHaveBeenCalled();
  });

  test('direct trace creation rejects an undefined customer before binding SQL parameters', async () => {
    await expect(Service.createProductSalesTraceability(mockConnection, { product_id: 9461, quantity: 2000 }))
      .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(mockConnection.execute).not.toHaveBeenCalled();
  });

  test('an owned transaction commits and releases only after successful tracing', async () => {
    await Service.handleProductSalesOutbound(salesData([line()]));
    expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    expect(mockConnection.rollback).not.toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalledTimes(1);
  });

  test('inventory failure rolls back an owned transaction and leaves reservations unconsumed', async () => {
    InventoryService.updateStock.mockRejectedValueOnce(new Error('库存不足'));
    await expect(Service.handleProductSalesOutbound(salesData([line()]))).rejects.toThrow('库存不足');
    expect(mockConnection.commit).not.toHaveBeenCalled();
    expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    expect(mockConnection.release).toHaveBeenCalledTimes(1);
    expect(ReservationService.consumeReservation).not.toHaveBeenCalled();
  });
});
