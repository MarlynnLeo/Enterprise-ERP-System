jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/utils/userUtils', () => ({
  getRequestActorLabel: jest.fn(() => 'Finance reviewer'),
}));
jest.mock('../../src/services/business/CostAccountingService', () => ({}));

const db = require('../../src/config/db');
const controller = require('../../src/controllers/business/finance/costCalculationController');

test('automatic freeze prefers database cost_price, including when the fallback price is zero', async () => {
  const connection = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    execute: jest.fn(async (sql) =>
      sql.includes('FROM materials')
        ? [
            [
              { id: 1, cost_price: '80.00', price: '100.00' },
              { id: 2, cost_price: '60.00', price: '0.00' },
              { id: 3, cost_price: '0.00', price: '45.00' },
              { id: 4, cost_price: null, price: '35.00' },
            ],
          ]
        : [{ affectedRows: 1 }]
    ),
  };
  db.pool.getConnection.mockResolvedValue(connection);
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  await controller.freezeMaterialStandardCosts(
    { body: { effectiveDate: '2026-09-29', source: 'cost_price' }, user: { id: 5 } },
    res
  );
  const writes = connection.execute.mock.calls.filter(([sql]) =>
    sql.includes('INSERT INTO standard_costs')
  );
  expect(writes.map(([, params]) => params.slice(0, 2))).toEqual([
    [1, 80],
    [2, 60],
    [3, 45],
    [4, 35],
  ]);
  expect(res.json.mock.calls[0][0].data).toMatchObject({ frozenCount: 4, skippedCount: 0 });
  expect(connection.commit).toHaveBeenCalledTimes(1);
  expect(connection.rollback).not.toHaveBeenCalled();
});
