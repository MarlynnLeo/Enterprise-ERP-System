/* global jest, beforeEach, describe, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { debug: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/config/accountingConfig', () => ({ accountingConfig: {} }));
jest.mock('../../src/config/financeConfig', () => ({ financeConfig: {} }));

const db = require('../../src/config/db');
const income = require('../../src/services/business/financialReports/incomeMethods');
const balances = require('../../src/services/business/financialReports/balanceMethods');
const cash = require('../../src/services/business/financialReports/cashFlowMethods');
const report = { ...balances, ...cash };
const start = '2026-10-01';
const end = '2026-10-31';
const compareStart = '2026-09-01';
const compareEnd = '2026-09-30';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('period movement query budget', () => {
  test.each([1, 300])(
    'reads %s accounts and both periods with one movement query',
    async (count) => {
      const accounts = Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        code: String(index + 1),
        name: '收入',
        type: '收入',
        is_debit: 0,
      }));
      const connection = {
        execute: jest.fn(async (sql) =>
          sql.includes('AS current_net')
            ? [accounts.map(({ id }) => ({ account_id: id, current_net: -100, compare_net: -80 }))]
            : [accounts]
        ),
        release: jest.fn(),
      };
      db.pool.getConnection.mockResolvedValue(connection);
      const context = {
        ...income,
        buildPeriodAccountFilter: jest
          .fn()
          .mockResolvedValue({ whereSql: 'account_type = ?', params: ['收入'] }),
      };
      const result = await context.calculatePeriodAmount(
        '收入',
        start,
        end,
        compareStart,
        compareEnd
      );
      expect(result.totalAmount).toBe(count * 100);
      expect(result.totalCompareAmount).toBe(count * 80);
      expect(result.accounts[0]).toMatchObject({
        currentAmount: 100,
        compareAmount: 80,
        change: 20,
      });
      expect(connection.execute).toHaveBeenCalledTimes(2); // account selection + grouped movements
      expect(context.buildPeriodAccountFilter).toHaveBeenCalledWith('收入', connection);
      const [sql, params] = connection.execute.mock.calls[1];
      expect(sql).toContain('GROUP BY ei.account_id');
      expect(sql).toContain('e.is_posted = 1');
      expect(sql).toContain('COALESCE(ei.debit_amount, 0) - COALESCE(ei.credit_amount, 0)');
      expect(sql).toContain("NOT IN ('profit_loss_transfer', 'year_end_transfer')");
      expect(params).toEqual([
        start,
        end,
        compareStart,
        compareEnd,
        ...accounts.map(({ id }) => id),
        start,
        end,
        compareStart,
        compareEnd,
      ]);
      expect(connection.release).toHaveBeenCalledTimes(1);
    }
  );

  test('empty account selection does not issue an aggregate or invalid empty IN query', async () => {
    const connection = { execute: jest.fn().mockResolvedValue([[]]), release: jest.fn() };
    db.pool.getConnection.mockResolvedValue(connection);
    const context = {
      ...income,
      buildPeriodAccountFilter: async () => ({ whereSql: '1 = 0', params: [] }),
    };
    const result = await context.calculatePeriodAmount('成本', start, end);
    expect(result).toMatchObject({ accounts: [], totalAmount: 0, totalCompareAmount: null });
    expect(connection.execute).toHaveBeenCalledTimes(1);
    expect(await income.getBatchAccountPeriodAmounts(connection, [], start, end)).toEqual(
      new Map()
    );
    expect(connection.execute).toHaveBeenCalledTimes(1);
  });

  test('current-only reads preserve closing inclusion and missing-activity zero amounts', async () => {
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([
          [
            { id: 1, is_debit: 1 },
            { id: 2, is_debit: 1 },
          ],
        ])
        .mockResolvedValueOnce([[{ account_id: 1, current_net: '25.15', compare_net: 0 }]]),
      release: jest.fn(),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    const result = await income.calculatePeriodAmount.call(
      {
        ...income,
        buildPeriodAccountFilter: async () => ({ whereSql: 'id IN (?, ?)', params: [1, 2] }),
      },
      '成本',
      start,
      end,
      null,
      null,
      { includeClosingEntries: true }
    );
    expect(
      result.accounts.map((account) => [account.currentAmount, account.compareAmount])
    ).toEqual([
      [25.15, null],
      [0, null],
    ]);
    const [sql, params] = connection.execute.mock.calls[1];
    expect(sql).not.toContain('NOT IN');
    expect(sql).not.toContain(' OR e.entry_date');
    expect(params).toEqual([start, end, 1, 2, start, end]);
  });

  test('aggregate failures propagate and release the caller-owned report connection', async () => {
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[{ id: 1, is_debit: 1 }]])
        .mockRejectedValueOnce(new Error('query unavailable')),
      release: jest.fn(),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    await expect(
      income.calculatePeriodAmount.call(
        {
          ...income,
          buildPeriodAccountFilter: async () => ({ whereSql: 'id = ?', params: [1] }),
        },
        '成本',
        start,
        end
      )
    ).rejects.toThrow('query unavailable');
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});

describe('cash balance query budget and effective opening dates', () => {
  function connectionFor(count = 2) {
    return {
      execute: jest.fn(async (sql, params) => {
        if (!sql.includes('ga.id as account_id'))
          return [Array.from({ length: count }, (_, index) => ({ id: index + 1 }))];
        return [
          Array.from({ length: count }, (_, index) => ({
            account_id: index + 1,
            account_type: '资产',
            is_debit: 1,
            opening_balance_date: index === 0 ? start : '2026-01-01',
            opening_debit: index === 0 ? 100 : 50,
            opening_credit: 0,
            total_debit: params[0] === end ? (index === 0 ? 20 : 40) : index === 0 ? 0 : 10,
            total_credit: 0,
          })),
        ];
      }),
    };
  }

  test.each([2, 300])('cash and change queries remain bounded with %s accounts', async (count) => {
    const connection = connectionFor(count);
    const current = 120 + 90 * (count - 1);
    const previous = 60 * (count - 1);
    await expect(
      report.getCashBalance(connection, end, { cashEquivalents: ['1001', '1002'] })
    ).resolves.toBe(current);
    expect(connection.execute).toHaveBeenCalledTimes(2);
    connection.execute.mockClear();
    await expect(
      report.getAccountChangeByCodes(connection, ['1001', '1002'], compareEnd, end)
    ).resolves.toBe(current - previous);
    expect(connection.execute).toHaveBeenCalledTimes(3);
    connection.execute.mockClear();
    await expect(report.getBalanceChanges(connection, '资产', compareEnd, end)).resolves.toEqual({
      beginBalance: previous,
      endBalance: current,
      change: current - previous,
    });
    expect(connection.execute).toHaveBeenCalledTimes(3);
  });

  test('empty cash selection uses no balance queries and empty change codes use no queries', async () => {
    const connection = connectionFor(0);
    await expect(
      report.getCashBalance(connection, end, { cashEquivalents: ['1001'] })
    ).resolves.toBe(0);
    expect(connection.execute).toHaveBeenCalledTimes(1);
    connection.execute.mockClear();
    await expect(report.getAccountChangeByCodes(connection, [], compareEnd, end)).resolves.toBe(0);
    expect(connection.execute).not.toHaveBeenCalled();
  });

  test('subtracts each account balance before accumulating small movements on large balances', async () => {
    const row = (id, debit) => ({
      account_id: id,
      account_type: '资产',
      is_debit: 1,
      opening_debit: 0,
      opening_credit: 0,
      total_debit: debit,
      total_credit: 0,
    });
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]])
        .mockResolvedValueOnce([[row(1, '0.02'), row(2, '100000000.01')]])
        .mockResolvedValueOnce([[row(1, '0.00'), row(2, '100000000.00')]]),
    };
    const expectedPriorCalculation = 0.02 + (100000000.01 - 100000000);
    expect(expectedPriorCalculation).not.toBe(0.02 + 100000000.01 - 100000000);
    await expect(
      report.getAccountChangeByCodes(connection, ['1001'], compareEnd, end)
    ).resolves.toBe(expectedPriorCalculation);
    expect(connection.execute).toHaveBeenCalledTimes(3);
  });
});
