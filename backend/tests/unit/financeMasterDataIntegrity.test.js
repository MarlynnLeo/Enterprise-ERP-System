jest.mock('../../src/config/db', () => ({
  pool: { getConnection: jest.fn(), execute: jest.fn() },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/config/financeConfig', () => ({
  financeConfig: { get: (_key, fallback) => fallback },
}));
jest.mock('../../src/config/accountingConfig', () => ({ accountingConfig: {} }));
jest.mock('../../src/utils/userUtils', () => ({
  resolveActorUserId: jest.fn().mockResolvedValue(2),
}));
jest.mock('../../src/models/finance', () => ({
  createPeriod: jest.fn(),
  setOpeningBalance: jest.fn(),
}));
jest.mock('../../src/services/business/OpeningBalanceService', () => ({}));
jest.mock('../../src/utils/responseHandler', () => ({
  ResponseHandler: { success: jest.fn(), error: jest.fn() },
}));

const db = require('../../src/config/db');
const GLService = require('../../src/services/finance/GLService');
const periods = require('../../src/models/finance/periods');
const accounts = require('../../src/models/finance/accounts');
const {
  normalizeOpeningAmount,
  assertOpeningBalancesEditable,
} = require('../../src/models/finance/helpers');
const controller = require('../../src/controllers/business/finance/financeController');
const finance = require('../../src/models/finance');
const { ResponseHandler } = require('../../src/utils/responseHandler');

const period = {
  id: 1,
  period_name: '2026-10',
  start_date: '2026-10-01',
  end_date: '2026-10-31',
  fiscal_year: 2026,
  is_closed: 0,
  is_locked: 0,
  is_adjusting: 0,
};
function connection(handler = () => [[]]) {
  const conn = {
    execute: jest.fn(handler),
    query: jest.fn(handler),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };
  db.pool.getConnection.mockResolvedValue(conn);
  return conn;
}

describe('ledger monetary input is strict and decimal exact', () => {
  test('opening balances acquire the posting boundary before checking ledger usage', async () => {
    const conn = connection((sql) => (sql.includes('COUNT') ? [[{ count: 0 }]] : [[]]));
    await assertOpeningBalancesEditable(conn);
    expect(conn.execute.mock.calls[0][0]).toBe('SELECT id FROM gl_periods ORDER BY id FOR UPDATE');
    expect(conn.execute.mock.calls[1][0]).toContain('FROM gl_entries');
  });

  test.each([true, false])(
    'cost center references are locked and missing references rejected (available=%s)',
    async (available) => {
      const conn = connection((sql) => {
        if (sql.includes('FROM gl_periods')) return [[period]];
        if (sql.includes('FROM gl_accounts')) return [[{ id: 1 }, { id: 2 }]];
        if (sql.includes('FROM cost_centers')) return [available ? [{ id: 3 }] : []];
        if (sql.includes('INSERT INTO gl_entries')) return [{ insertId: 10 }];
        return [[]];
      });
      const action = GLService.createEntry(
        { period_id: 1, entry_date: '2026-10-15', entry_number: 'J10', voucher_number: 1 },
        [
          { account_id: 1, debit_amount: 10, cost_center_id: 3 },
          { account_id: 2, credit_amount: 10 },
        ]
      );
      if (available) await expect(action).resolves.toBe(10);
      else await expect(action).rejects.toThrow('成本中心不存在');
      expect(conn.query.mock.calls.find(([sql]) => sql.includes('FROM cost_centers'))[0]).toContain(
        'LOCK IN SHARE MODE'
      );
      if (!available)
        expect(
          conn.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO gl_entries'))
        ).toBe(false);
    }
  );
  test.each(['100wrong', 'NaN', Infinity, 'Infinity', true, [], {}, ' ', -0.001, '10000000000000'])(
    'rejects malformed, negative or overflowing amount %p before writing',
    async (value) => {
      const conn = connection();
      await expect(
        GLService.createEntry({ entry_date: '2026-10-15' }, [
          { account_id: 1, debit_amount: value, credit_amount: 0 },
          { account_id: 2, credit_amount: value, debit_amount: 0 },
        ])
      ).rejects.toThrow();
      expect(conn.execute).not.toHaveBeenCalled();
      expect(conn.query).not.toHaveBeenCalled();
      expect(conn.rollback).toHaveBeenCalled();
      expect(() => normalizeOpeningAmount(value, '期初金额')).toThrow();
    }
  );

  test('rounds half cents identically for opening balances and journal lines', async () => {
    expect(normalizeOpeningAmount('1.005', 'amount')).toBe(1.01);
    const conn = connection((sql) => {
      if (sql.includes('FROM gl_periods')) return [[period]];
      if (sql.includes('FROM gl_accounts')) return [[{ id: 1 }, { id: 2 }]];
      if (sql.includes('INSERT INTO gl_entries')) return [{ insertId: 10 }];
      return [[]];
    });
    await expect(
      GLService.createEntry(
        { period_id: 1, entry_date: '2026-10-15', voucher_number: 1, entry_number: 'J10' },
        [
          { account_id: 1, debit_amount: '1.005' },
          { account_id: 2, credit_amount: '1.01' },
        ]
      )
    ).resolves.toBe(10);
    const lines = conn.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO gl_entry_items')
    )[1][0];
    expect(lines.map((line) => line.slice(3, 5))).toEqual([
      [1.01, 0],
      [0, 1.01],
    ]);
    expect(conn.query.mock.calls.find(([sql]) => sql.includes('FROM gl_accounts'))[0]).toContain(
      'LOCK IN SHARE MODE'
    );
    expect(conn.commit).toHaveBeenCalled();
  });

  test.each(['1junk', '1.5', 0, null])('does not truncate account id %p', async (id) => {
    const conn = connection();
    await expect(
      GLService.createEntry({ entry_date: '2026-10-15' }, [
        { account_id: id, debit_amount: 1 },
        { account_id: 2, credit_amount: 1 },
      ])
    ).rejects.toThrow('科目');
    expect(conn.query).not.toHaveBeenCalled();
  });

  test('opening balance HTTP boundary retains invalid input for model validation', async () => {
    await controller.setOpeningBalance(
      { params: { id: '1' }, user: { id: 2 }, body: { debit: '12junk', credit: 0 } },
      {}
    );
    expect(finance.setOpeningBalance).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ debit: '12junk' })
    );
  });
});

describe('period calendar integrity', () => {
  test.each([
    { start_date: '2026-02-30' },
    { end_date: 'bad' },
    { fiscal_year: '2026junk' },
    { start_date: '2026-11-01' },
    { is_adjusting: 'invalid' },
  ])('rejects invalid calendar data before opening a transaction: %p', async (patch) => {
    await expect(periods.createPeriod({ ...period, ...patch })).rejects.toThrow();
    expect(db.pool.getConnection).not.toHaveBeenCalled();
  });

  test('creation checks overlapping dates under the same transaction as insertion', async () => {
    const conn = connection((sql) =>
      sql.includes('INSERT INTO gl_periods') ? [{ insertId: 2 }] : [[]]
    );
    await expect(periods.createPeriod({ ...period, is_adjusting: 'false' })).resolves.toBe(2);
    expect(conn.execute.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(conn.execute.mock.calls[1][1][4]).toBe(0);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('overlap rolls back without inserting', async () => {
    const conn = connection(() => [[{ id: 8 }]]);
    await expect(periods.createPeriod(period)).rejects.toThrow('overlaps');
    expect(conn.execute).toHaveBeenCalledTimes(1);
    expect(conn.rollback).toHaveBeenCalled();
  });

  test.each(['entry', 'snapshot'])(
    'a linked %s prevents rewriting the accounting calendar',
    async (usage) => {
      const conn = connection((sql) => {
        if (sql.includes('gl_periods WHERE id = ?')) return [[period]];
        if (sql.includes('FROM gl_entries')) return [usage === 'entry' ? [{ id: 5 }] : []];
        if (sql.includes('FROM gl_period_balances'))
          return [usage === 'snapshot' ? [{ account_id: 2 }] : []];
        return [[]];
      });
      await expect(periods.updatePeriod(1, { ...period, end_date: '2026-10-30' })).rejects.toThrow(
        '已有凭证或余额快照'
      );
      expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
      expect(conn.rollback).toHaveBeenCalled();
    }
  );

  test('an unused open period can be corrected', async () => {
    const conn = connection((sql) => {
      if (sql.includes('gl_periods WHERE id = ?')) return [[period]];
      if (sql.includes('UPDATE gl_periods SET')) return [{ affectedRows: 1 }];
      return [[]];
    });
    await expect(periods.updatePeriod(1, { ...period, end_date: '2026-10-30' })).resolves.toBe(
      true
    );
    expect(conn.commit).toHaveBeenCalled();
  });

  test('renaming an open used period does not change its calendar', async () => {
    const conn = connection((sql) => {
      if (sql.includes('gl_periods WHERE id = ?')) return [[period]];
      if (sql.includes('UPDATE gl_periods SET')) return [{ affectedRows: 1 }];
      return [[]];
    });
    await expect(periods.updatePeriod(1, { ...period, period_name: 'October' })).resolves.toBe(
      true
    );
    expect(conn.execute.mock.calls.some(([sql]) => sql.includes('FROM gl_entries'))).toBe(false);
  });

  test('a locked period cannot be edited', async () => {
    const conn = connection(() => [[{ ...period, is_locked: 1 }]]);
    await expect(periods.updatePeriod(1, period)).rejects.toThrow('锁定');
    expect(conn.execute).toHaveBeenCalledTimes(1);
  });

  test('invalid create dates return 400, not a successful empty batch', async () => {
    await controller.createPeriod(
      { body: { startDate: 'invalid', endDate: '2026-12-31', fiscalYear: 2026 } },
      {}
    );
    expect(finance.createPeriod).not.toHaveBeenCalled();
    expect(ResponseHandler.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'VALIDATION_ERROR',
      400,
      expect.any(Error)
    );
  });

  test('split monthly periods preserve the requested first and last day', async () => {
    finance.createPeriod.mockResolvedValue(1);
    await controller.createPeriod(
      { body: { startDate: '2026-10-15', endDate: '2026-11-20', fiscalYear: 2026 } },
      {}
    );
    expect(
      finance.createPeriod.mock.calls.map(([data]) => [data.start_date, data.end_date])
    ).toEqual([
      ['2026-10-15', '2026-10-31'],
      ['2026-11-01', '2026-11-20'],
    ]);
  });
});

describe('account edits preserve historical classification', () => {
  const account = {
    id: 1,
    account_name: 'Bank',
    account_type: '资产',
    is_debit: 1,
    is_active: 1,
    currency_code: 'CNY',
    opening_debit: 0,
    opening_credit: 0,
    parent_id: null,
  };
  test.each([
    { account_type: '收入' },
    { is_debit: 0 },
    { currency_code: 'USD' },
    { parent_id: 2 },
  ])('rejects historical accounting change %p', async (patch) => {
    const conn = connection((sql) =>
      sql.includes('FROM gl_accounts') ? [[account]] : [[{ id: 2 }]]
    );
    await expect(accounts.updateAccount(1, { ...account, ...patch })).rejects.toThrow('凭证历史');
    expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('a name-only edit retains omitted status and accounting properties', async () => {
    const conn = connection((sql) =>
      sql.includes('FROM gl_accounts') ? [[account]] : [{ affectedRows: 1 }]
    );
    await expect(
      accounts.updateAccount(1, { account_name: 'Bank renamed', is_active: undefined })
    ).resolves.toBe(true);
    expect(conn.execute.mock.calls[1][1].slice(0, 6)).toEqual([
      'Bank renamed',
      '资产',
      null,
      1,
      1,
      'CNY',
    ]);
    expect(conn.commit).toHaveBeenCalled();
  });

  test('deactivation holds the account lock before checking history', async () => {
    const conn = connection((sql) => {
      if (sql.includes('entry_line_count')) return [[{ opening_amount: 0, entry_line_count: 1 }]];
      return [[account]];
    });
    await expect(accounts.deactivateAccount(1)).rejects.toThrow('不能停用');
    expect(conn.execute.mock.calls[0][0]).toMatch(/gl_accounts.*FOR UPDATE/);
    expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });
});
