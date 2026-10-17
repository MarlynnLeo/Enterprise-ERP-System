jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/models/finance', () => ({ createEntry: jest.fn(), reverseEntry: jest.fn() }));
jest.mock('../../src/utils/userUtils', () => ({
  resolveActorUserId: jest.fn().mockResolvedValue(2),
}));
jest.mock('../../src/config/accountingConfig', () => ({ accountingConfig: {} }));
jest.mock('../../src/services/business/CostClosingService', () => ({}));

const db = require('../../src/config/db');
const helpers = require('../../src/models/finance/helpers');
const closing = require('../../src/services/business/periodEnd/closingMethods');
const controls = require('../../src/services/business/periodEnd/controlsMethods');
const yearEnd = require('../../src/services/business/periodEnd/yearEndMethods');
const period = {
  id: 1,
  start_date: '2026-10-01',
  end_date: '2026-10-31',
  fiscal_year: 2026,
  period_name: 'October',
  is_closed: 0,
  is_locked: 0,
};

function connect(handler) {
  const conn = {
    execute: jest.fn(handler),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };
  db.pool.getConnection.mockResolvedValue(conn);
  return conn;
}

describe('moving draft dates enforces both period boundaries', () => {
  const context = { ...controls, ...helpers, isClosed: helpers.isClosedFlag };
  test.each([{ is_closed: 1 }, { is_locked: 1 }])(
    'cannot move a draft out of a protected period %p',
    async (state) => {
      const conn = connect(() => [
        [{ ...period, ...state, id: 7, period_id: 1, is_posted: 0, is_reversed: 0 }],
      ]);
      await expect(
        context.updateUnpostedEntryDates(7, { period_id: 2, entry_date: '2026-11-01' })
      ).rejects.toThrow('关闭或锁定');
      expect(conn.execute).toHaveBeenCalledTimes(1);
      expect(conn.rollback).toHaveBeenCalled();
    }
  );
  test('cannot move an open draft into a locked target', async () => {
    const conn = connect((sql) =>
      sql.includes('FROM gl_entries')
        ? [[{ ...period, id: 7, period_id: 1, is_posted: 0, is_reversed: 0 }]]
        : [[{ ...period, id: 2, is_locked: 1 }]]
    );
    await expect(
      context.updateUnpostedEntryDates(7, { period_id: 2, entry_date: '2026-10-10' })
    ).rejects.toThrow('关闭或锁定');
    expect(conn.execute.mock.calls.some(([sql]) => sql.includes('UPDATE gl_entries'))).toBe(false);
  });
  test('can move a draft between two open periods', async () => {
    const conn = connect((sql) => {
      if (sql.includes('FROM gl_entries'))
        return [[{ ...period, id: 7, period_id: 1, is_posted: 0, is_reversed: 0 }]];
      if (sql.includes('FROM gl_periods'))
        return [[{ ...period, id: 2, start_date: '2026-11-01', end_date: '2026-11-30' }]];
      return [{ affectedRows: 1 }];
    });
    await expect(
      context.updateUnpostedEntryDates(7, { period_id: 2, entry_date: '2026-11-10' })
    ).resolves.toMatchObject({ id: 7, entry_date: '2026-11-10' });
    expect(conn.commit).toHaveBeenCalled();
  });
});

describe('monthly reopening respects completed annual transfer', () => {
  test.each(['voucher', 'zero-profit log'])(
    'rejects a completed %s before changing the closed period',
    async (source) => {
      const conn = connect((sql) => {
        if (sql.includes('FROM gl_periods WHERE id')) return [[{ ...period, is_closed: 1 }]];
        if (sql.includes('FROM gl_entries')) return [source === 'voucher' ? [{ id: 8 }] : []];
        if (sql.includes('FROM operation_logs'))
          return [source === 'zero-profit log' ? [{ id: 9 }] : []];
        return [[]];
      });
      await expect(closing.reopenPeriod({ period_id: 1, reopened_by: 2 })).rejects.toThrow(
        '已完成年度结转'
      );
      expect(conn.execute.mock.calls.some(([sql]) => /^\s*(UPDATE|DELETE|INSERT)/.test(sql))).toBe(
        false
      );
      expect(conn.rollback).toHaveBeenCalled();
    }
  );
});

describe('year-end transfer serializes with posting and reopening', () => {
  test('locks the fiscal periods before checking open status and rolls back an open year', async () => {
    const conn = connect((sql) => {
      if (sql.includes('ORDER BY id FOR UPDATE')) return [[{ id: 1 }]];
      if (sql.includes('is_closed = false')) return [[{ count: 1 }]];
      return [[]];
    });
    await expect(yearEnd.yearEndTransfer({ year: 2026, transferred_by: 2 })).rejects.toThrow(
      '未关闭'
    );
    expect(conn.execute.mock.calls[0][0]).toBe('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    expect(conn.execute.mock.calls[1][0]).toContain('ORDER BY id FOR UPDATE');
    expect(conn.execute.mock.calls[2][0]).toContain('is_closed = false');
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('a second transfer sees the completed transfer after acquiring the year lock', async () => {
    const conn = connect((sql) => {
      if (sql.includes('ORDER BY id FOR UPDATE')) return [[{ id: 1 }]];
      if (sql.includes('FROM operation_logs')) return [[{ count: 1 }]];
      return [[{ count: 0 }]];
    });
    await expect(yearEnd.yearEndTransfer({ year: 2026, transferred_by: 2 })).rejects.toThrow(
      '已执行过年度结转'
    );
    expect(conn.execute.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE)/.test(sql))).toBe(false);
    expect(conn.rollback).toHaveBeenCalled();
  });
});
