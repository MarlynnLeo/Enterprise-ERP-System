jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/models/purchase', () => ({}));
jest.mock('../../src/services/business/DomainEventService', () => ({
  enqueue: jest.fn(),
  dispatchSoon: jest.fn(),
}));
jest.mock('../../src/services/InventoryReservationService', () => ({}));
jest.mock('../../src/services/business/InventoryPostingResubmissionService', () => ({
  resubmit: jest.fn(),
}));
jest.mock('../../src/services/InventoryPostingService', () => ({
  actorFromRequest: (req) => ({ id: req.user.id, label: req.user.name }),
}));
jest.mock('../../src/controllers/business/sales/salesPackingController', () => ({}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  assertAccess: jest.fn(async () => true),
  denyUnlessAccess: jest.fn(async () => true),
}));
jest.mock('../../src/utils/sales/salesOrderLocks', () => ({
  lockSalesOrders: jest.fn(async () => new Set([2])),
}));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
const db = require('../../src/config/db');
const retry = require('../../src/services/business/InventoryPostingResubmissionService');
const events = require('../../src/services/business/DomainEventService');
const returns = require('../../src/controllers/business/purchase/purchaseReturnController');
const exchanges = require('../../src/controllers/business/sales/salesExchangeController');
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const connectionFor = (kind) => ({
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
  query: jest.fn(async (sql) => {
    if (kind === 'return' && sql.includes('FROM purchase_returns'))
      return [[{ status: 'completed', return_no: 'RET-7' }]];
    if (kind === 'exchange' && sql.includes('FROM sales_orders')) return [[{ id: 2 }]];
    if (kind === 'exchange' && sql.includes('FROM sales_exchanges'))
      return [[{ status: 'completed', exchange_no: 'EX-7' }]];
    throw new Error('Unexpected business side effect: ' + sql);
  }),
});
beforeEach(() => jest.clearAllMocks());

test.each(['return', 'exchange'])(
  '%s resubmits without repeating any quantities, valuation or completion events',
  async (kind) => {
    const connection = connectionFor(kind);
    db.pool.getConnection.mockResolvedValue(connection);
    retry.resubmit.mockResolvedValue({ documentId: 40, financeStatus: 'pending' });
    const req = {
      params: { id: '7' },
      body: kind === 'return' ? { newStatus: 'completed' } : { status: 'completed' },
      user: { id: 9, name: 'buyer' },
    };
    const res = response();
    await (kind === 'return' ? returns.updateReturnStatus : exchanges.updateExchangeStatus)(
      req,
      res
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(retry.resubmit).toHaveBeenCalledWith(connection, {
      sourceType: kind === 'return' ? 'purchase_return' : 'sales_exchange',
      sourceId: '7',
      sourceNo: kind === 'return' ? 'RET-7' : 'EX-7',
      actor: { id: 9, label: 'buyer' },
    });
    expect(connection.query.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
    expect(events.enqueue).not.toHaveBeenCalled();
  }
);

test('cannot use completed exchange edits to alter the amounts of a rejected snapshot', async () => {
  const connection = connectionFor('exchange');
  db.pool.getConnection.mockResolvedValue(connection);
  const res = response();
  await exchanges.updateSalesExchange(
    {
      params: { id: '7' },
      body: { status: 'completed', items: [{ quantity: 999 }] },
      user: { id: 9 },
    },
    res
  );
  expect(res.status).toHaveBeenCalledWith(400);
  expect(retry.resubmit).not.toHaveBeenCalled();
  expect(connection.commit).not.toHaveBeenCalled();
});
