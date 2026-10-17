/* global jest, beforeEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/business/DomainEventService', () => ({
  enqueue: jest.fn(),
  dispatchSoon: jest.fn(),
}));
jest.mock('../../src/services/business/InventoryPostingResubmissionService', () => ({
  resubmit: jest.fn(),
}));
jest.mock('../../src/services/InventoryPostingService', () => ({
  actorFromRequest: (req) => ({ id: req.user.id, label: 'seller' }),
}));
jest.mock('../../src/services/business/SalesReturnValuationService', () => ({
  getItems: jest.fn(async () => []),
  total: () => 0,
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  denyUnlessAccess: jest.fn(async () => true),
  applyListScope: jest.fn(async () => ({ join: '', where: '', params: [] })),
}));
jest.mock('../../src/utils/sales/salesOrderLocks', () => ({
  lockSalesOrders: jest.fn(async () => new Set([2])),
}));
const db = require('../../src/config/db');
const retry = require('../../src/services/business/InventoryPostingResubmissionService');
const events = require('../../src/services/business/DomainEventService');
const controller = require('../../src/controllers/business/sales/salesReturnController');
const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
let connection;
beforeEach(() => {
  jest.clearAllMocks();
  connection = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    query: jest.fn(async (sql) => {
      if (/SELECT order_id FROM sales_returns/.test(sql)) return [[{ order_id: 2 }]];
      if (/COUNT\(\*\) as total/.test(sql)) return [[{ total: 1 }]];
      if (/SELECT status, COUNT/.test(sql)) return [[{ status: 'completed', count: 1 }]];
      if (/FROM sales_returns/.test(sql))
        return [
          [
            {
              id: 7,
              order_id: 2,
              return_no: 'SR-7',
              status: 'completed',
              finance_status: 'rejected',
            },
          ],
        ];
      throw new Error('Unexpected write or query: ' + sql);
    }),
  };
  db.pool.getConnection.mockResolvedValue(connection);
  retry.resubmit.mockResolvedValue({
    documentId: 40,
    financeStatus: 'pending',
    resubmittedFrom: 30,
  });
});
test('completed return resubmits only its frozen rejected inventory snapshot', async () => {
  const response = res();
  await controller.updateSalesReturn(
    { params: { id: '7' }, body: { status: 'completed' }, user: { id: 9 } },
    response
  );
  expect(response.status).toHaveBeenCalledWith(200);
  expect(retry.resubmit).toHaveBeenCalledWith(connection, {
    sourceType: 'sales_return',
    sourceId: '7',
    sourceNo: 'SR-7',
    actor: { id: 9, label: 'seller' },
  });
  expect(connection.query.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
  expect(events.enqueue).not.toHaveBeenCalled();
  expect(connection.commit).toHaveBeenCalledTimes(1);
  expect(response.json.mock.calls[0][0].data).toMatchObject({
    financeStatus: 'pending',
    resubmittedFrom: 30,
  });
});
test('a repeated request when no posting is rejected does not replay completion', async () => {
  retry.resubmit.mockResolvedValue(null);
  const response = res();
  await controller.updateSalesReturnStatus(
    { params: { id: '7' }, body: { status: 'completed' }, user: { id: 9 } },
    response
  );
  expect(response.status).toHaveBeenCalledWith(200);
  expect(events.enqueue).not.toHaveBeenCalled();
  expect(connection.query.mock.calls).toHaveLength(2);
});
test('snapshot errors roll back and remain visible', async () => {
  retry.resubmit.mockRejectedValue(Object.assign(new Error('过账期间已关闭'), { statusCode: 400 }));
  const response = res();
  await controller.updateSalesReturn(
    { params: { id: '7' }, body: { status: 'completed' }, user: { id: 9 } },
    response
  );
  expect(response.status).toHaveBeenCalledWith(400);
  expect(connection.rollback).toHaveBeenCalledTimes(1);
  expect(connection.commit).not.toHaveBeenCalled();
});
test('cannot use resubmission to rewrite completed return quantities', async () => {
  const response = res();
  await controller.updateSalesReturn(
    {
      params: { id: '7' },
      body: { status: 'completed', items: [{ quantity: 999 }] },
      user: { id: 9 },
    },
    response
  );
  expect(response.status).toHaveBeenCalledWith(400);
  expect(retry.resubmit).not.toHaveBeenCalled();
});
test.each(['getSalesReturns', 'getSalesReturnById'])(
  '%s exposes the latest posting status and retry eligibility',
  async (method) => {
    const response = res();
    await controller[method]({ params: { id: '7' }, query: {}, user: { id: 9 } }, response);
    expect(response.status).toHaveBeenCalledWith(200);
    const data = response.json.mock.calls[0][0].data;
    expect(method === 'getSalesReturns' ? data.items[0] : data).toMatchObject({
      financeStatus: 'rejected',
      canResubmitInventory: true,
    });
    const sql = connection.query.mock.calls.find(([query]) =>
      query.includes('inventory_posting_documents')
    )[0];
    expect(sql).toContain("d.source_type = 'sales_return'");
    expect(sql).toContain('d.source_id = sr.id');
    expect(sql).toContain('ORDER BY d.posting_sequence DESC, d.id DESC LIMIT 1');
  }
);
