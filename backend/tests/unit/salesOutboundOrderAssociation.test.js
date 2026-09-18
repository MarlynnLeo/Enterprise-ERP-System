/* global beforeEach, describe, expect, jest, test */

const mockConnection = {
  query: jest.fn(), execute: jest.fn(), beginTransaction: jest.fn(),
  commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
};
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(async () => mockConnection) } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/utils/softDelete', () => ({ softDelete: jest.fn() }));
jest.mock('../../src/utils/userHelper', () => ({ getCurrentUserName: jest.fn(async () => '测试操作员') }));
jest.mock('../../src/authorization/ScopeGuard', () => ({ denyUnlessAccess: jest.fn(async () => true) }));
jest.mock('../../src/controllers/business/sales/salesShared', () => ({
  STATUS: { OUTBOUND: { DRAFT: 'draft', PROCESSING: 'processing', COMPLETED: 'completed', CANCELLED: 'cancelled' } },
  getConnection: jest.fn(async () => mockConnection),
  generateSalesOutboundNo: jest.fn(async () => 'SOB260914001'),
}));
jest.mock('../../src/services/business/DocumentChainService', () => ({ linkSalesOrderToOutbound: jest.fn() }));
jest.mock('../../src/services/business/ProductSalesTraceabilityService', () => ({ handleProductSalesOutbound: jest.fn() }));
jest.mock('../../src/services/business/SalesOrderStatusService', () => ({
  updateOrderStatus: jest.fn(async () => ({ status: 'in_production' })),
  updateMultipleOrderStatus: jest.fn(async () => []),
  updateOrderStatusByMaterials: jest.fn(async () => []),
}));
jest.mock('../../src/services/business/DomainEventService', () => ({
  enqueue: jest.fn(async () => 55), dispatchSoon: jest.fn(),
}));

const { createSalesOutbound, updateSalesOutbound } = require('../../src/controllers/business/sales/salesOutboundController');
const TraceService = require('../../src/services/business/ProductSalesTraceabilityService');
const DomainEventService = require('../../src/services/business/DomainEventService');
const { pool } = require('../../src/config/db');
let outbound;
let items;
const order = id => ({ id, order_no: `SO-${id}`, customer_id: 9 });
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const request = body => ({ params: { id: '7' }, body, user: { id: 1 } });

beforeEach(() => {
  jest.clearAllMocks();
  TraceService.handleProductSalesOutbound.mockReset().mockResolvedValue({ success: true });
  outbound = {
    id: 7, outbound_no: 'SOB260914001', order_id: 14517, status: 'processing',
    is_multi_order: false, related_orders: null, delivery_date: '2026-09-14',
    remarks: '', created_by: 1, total_amount: 200,
  };
  items = [{ id: 8, outbound_id: 7, product_id: 9461, quantity: 2000, price: 0.1, amount: 200, source_order_id: 14517 }];
  mockConnection.query.mockImplementation(async (sql, params) => {
    if (sql.includes('SELECT DISTINCT COALESCE(i.source_order_id,o.order_id) AS order_id')) {
      return [[...new Set(items.map(item => item.source_order_id || outbound.order_id))].map(orderId => ({ order_id: orderId }))];
    }
    if (sql.includes('FROM sales_outbound') && sql.includes("status = 'draft'")) return [[]];
    if (sql.includes('FROM sales_outbound WHERE id')) return [[{ ...outbound }]];
    if (sql.includes('FROM sales_outbound so')) return [[{ ...outbound }]];
    if (sql.includes('FROM sales_outbound_items WHERE outbound_id') || sql.includes('SELECT soi.*, m.code')) {
      return [items.map(item => ({ ...item }))];
    }
    if (sql.includes('FROM sales_orders WHERE')) {
      const ids = Array.isArray(params[0]) ? params[0] : [params[0]];
      return [ids.map(order)];
    }
    if (sql.includes('FROM materials WHERE')) return [[{ id: 9461, code: 'P9461', name: '测试产品' }]];
    if (sql.includes('AS shipped_qty')) return [[{ shipped_qty: 0 }]];
    if (sql.includes('AS quantity')) return [[{ quantity: 3000 }]];
    if (sql.includes('SELECT soi.order_id, soi.material_id,') && sql.includes('AS unit_price')) {
      return [params[0].map(id => ({ order_id: id, material_id: 9461, unit_price: 0.1 }))];
    }
    if (sql.includes('INSERT INTO sales_outbound_items')) {
      items = params[0].map((row, index) => ({
        id: 80 + index, outbound_id: row[0], product_id: row[1], quantity: row[2],
        price: row[3], amount: row[4], source_order_id: row[5], source_order_no: row[6],
      }));
      return [{ affectedRows: items.length }];
    }
    if (sql.includes('INSERT INTO sales_outbound')) return [{ insertId: 7 }];
    if (sql.includes('DELETE FROM sales_outbound_items')) { items = []; return [{ affectedRows: 1 }]; }
    if (sql.includes('UPDATE sales_outbound SET total_amount')) {
      outbound.total_amount = items.reduce((sum, item) => sum + item.amount, 0);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('UPDATE sales_outbound SET')) {
      outbound = { ...outbound, order_id: params[0], status: params[4] };
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  mockConnection.execute.mockImplementation(async (sql, params) => {
    if (sql.includes('SELECT DISTINCT source_order_id')) return [items.filter(item => item.source_order_id)];
    if (sql.includes('SELECT so.*, c.name as customer_name')) return [params.map(order)];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
});

describe('sales outbound creation association contract', () => {
  test('the old delivery-statistics payload returns 400 instead of silently creating an orphan', async () => {
    const res = response();
    await createSalesOutbound(request({
      order_id: 14517, delivery_date: '2026-09-14', status: 'draft',
      items: [{ product_id: 9461, quantity: 2000 }],
    }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR', message: expect.stringContaining('关联订单') }));
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test.each([
    { relatedOrders: [14517, 14518], items: [{ productId: 9461, quantity: 2000 }] },
    { relatedOrders: [14518], items: [{ productId: 9461, quantity: 2000, sourceOrderId: 14517 }] },
  ])('invalid multi-order sources are rejected before any database writes', async payload => {
    const res = response();
    await createSalesOutbound(request({ ...payload, isMultiOrder: true, status: 'draft' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockConnection.query).not.toHaveBeenCalled();
  });

  test('camelCase single-order creation persists the source and order price', async () => {
    const res = response();
    await createSalesOutbound(request({
      orderId: 14517, deliveryDate: '2026-09-14', status: 'draft',
      items: [{ productId: 9461, quantity: 2000, sourceOrderId: 14517, sourceOrderNo: 'SO-14517' }],
    }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(items).toEqual([expect.objectContaining({ source_order_id: 14517, source_order_no: 'SO-14517', price: 0.1, amount: 200 })]);
    const headerInsert = mockConnection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO sales_outbound ('));
    expect(headerInsert[1][1]).toBe(14517);
    expect(headerInsert[1][4]).toBe('2026-09-14');
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
  });

  test('multi-order creation preserves all related orders and each line source', async () => {
    const res = response();
    await createSalesOutbound(request({
      orderId: null, relatedOrders: [14517, 14518], isMultiOrder: true, status: 'draft',
      items: [
        { productId: 9461, quantity: 2000, sourceOrderId: 14517 },
        { productId: 9461, quantity: 300, sourceOrderId: 14518 },
      ],
    }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(items.map(item => item.source_order_id)).toEqual([14517, 14518]);
    const headerInsert = mockConnection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO sales_outbound ('));
    expect(headerInsert[1].slice(1, 4)).toEqual([null, true, '[14517,14518]']);
  });
});

describe('sales outbound completion', () => {
  test('an orphaned historical outbound gives 400 without stock or header changes', async () => {
    outbound.order_id = null;
    items[0].source_order_id = null;
    const res = response();
    await updateSalesOutbound(request({ status: 'completed' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockConnection.query.mock.calls.some(([sql]) => sql.includes('UPDATE sales_outbound SET'))).toBe(false);
    expect(TraceService.handleProductSalesOutbound).not.toHaveBeenCalled();
    expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    expect(mockConnection.commit).not.toHaveBeenCalled();
  });

  test.each([false, true])('completion retains saved order associations (multi-order: %s)', async isMultiOrder => {
    if (isMultiOrder) {
      outbound.order_id = null;
      outbound.is_multi_order = true;
      outbound.related_orders = '[14517,14518]';
      items.push({ ...items[0], id: 9, source_order_id: 14518, quantity: 300 });
    }
    const res = response();
    await updateSalesOutbound(request({ status: 'completed', delivery_date: '2026-09-14' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(TraceService.handleProductSalesOutbound).toHaveBeenCalledWith(expect.objectContaining({
      outbound_id: '7', order_id: isMultiOrder ? null : 14517, items,
    }), mockConnection);
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    expect(DomainEventService.enqueue).toHaveBeenCalledTimes(1);
    expect(DomainEventService.dispatchSoon).toHaveBeenCalledWith(55);
  });

  test('replaced details use their persisted IDs and price when tracing', async () => {
    const res = response();
    await updateSalesOutbound(request({
      status: 'completed', items: [{ productId: 9461, quantity: 2000, sourceOrderId: 14517 }],
    }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(TraceService.handleProductSalesOutbound).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ id: 80, source_order_id: 14517, price: 0.1 })],
    }), mockConnection);
  });

  test('trace validation failures roll back completion and do not dispatch financial events', async () => {
    TraceService.handleProductSalesOutbound.mockRejectedValueOnce(Object.assign(new Error('销售订单缺少有效客户'), {
      statusCode: 400, code: 'VALIDATION_ERROR',
    }));
    const res = response();
    await updateSalesOutbound(request({ status: 'completed' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    expect(mockConnection.commit).not.toHaveBeenCalled();
    expect(DomainEventService.enqueue).not.toHaveBeenCalled();
    expect(DomainEventService.dispatchSoon).not.toHaveBeenCalled();
  });
});
