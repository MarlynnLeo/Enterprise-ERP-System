jest.mock('../../src/config/db', () => ({
  pool: { getConnection: jest.fn(), query: jest.fn(), execute: jest.fn() },
}));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

const db = require('../../src/config/db');
const budgetModel = require('../../src/models/budget');
const { fromBudgetApi } = require('../../src/utils/finance/glFieldMap');

describe('budget creation transaction ownership', () => {
  let connection;
  const budget = {
    budget_no: 'BUD-TEST', budget_name: 'Transaction test', budget_year: 2026,
    start_date: '2026-01-01', end_date: '2026-12-31', created_by: 1,
  };
  const details = [{ account_id: 7, budget_amount: 100 }];
  beforeEach(() => {
    jest.clearAllMocks();
    connection = {
      beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
      execute: jest.fn().mockResolvedValueOnce([{ insertId: 10 }]).mockResolvedValue([{ affectedRows: 1 }]),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    db.pool.execute.mockImplementation((...args) => connection.execute(...args));
  });

  it('holds one acquired connection until header and lines commit, then releases it', async () => {
    expect(await budgetModel.createBudget(budget, details)).toBe(10);
    expect(db.pool.getConnection).toHaveBeenCalledTimes(1);
    expect(db.pool.query).not.toHaveBeenCalled();
    expect(db.pool.execute).not.toHaveBeenCalled();
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.execute).toHaveBeenCalledTimes(2);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('rolls back the header on the same connection when a detail insert fails', async () => {
    const failure = new Error('detail foreign key failed');
    connection.execute = jest.fn().mockResolvedValueOnce([{ insertId: 10 }]).mockRejectedValueOnce(failure);
    await expect(budgetModel.createBudget(budget, details)).rejects.toBe(failure);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(db.pool.query).not.toHaveBeenCalled();
  });

  it.each([false, true])('leaves the supplied transaction lifecycle to its caller (failure=%s)', async (fail) => {
    if (fail) connection.execute.mockReset().mockRejectedValue(new Error('external failure'));
    const result = budgetModel.createBudget(budget, details, connection);
    if (fail) await expect(result).rejects.toThrow('external failure');
    else expect(await result).toBe(10);
    expect(db.pool.getConnection).not.toHaveBeenCalled();
    expect(connection.beginTransaction).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).not.toHaveBeenCalled();
  });
});

describe('budget editing without an optional department', () => {
  it.each([
    [null, 'Updated explanation'],
    [undefined, undefined],
  ])('saves a draft with department %s using SQL null for absent optional values', async (departmentId, description) => {
    const connection = {
      beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
      execute: jest.fn(async (sql, values) => {
        if (values.some(value => value === undefined)) throw new Error('Undefined SQL binding');
        if (sql.startsWith('SELECT')) return [[{ id: 1, status: '草稿', created_by: 1 }]];
        return [{ affectedRows: 1 }];
      }),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    const payload = fromBudgetApi({
      budgetName: 'Updated budget', budgetYear: 2026, budgetType: '年度预算',
      startDate: '2026-01-01', endDate: '2026-12-31', totalAmount: 100, departmentId, description,
    });

    await expect(budgetModel.updateBudget(1, payload)).resolves.toBe(true);
    const update = connection.execute.mock.calls.find(([sql]) => sql.includes('UPDATE budgets'));
    expect(update[1][3]).toBeNull();
    expect(update[1][7]).toBe(description ?? null);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
