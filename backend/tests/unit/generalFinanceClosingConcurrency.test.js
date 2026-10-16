jest.mock('../../src/config/db', () => ({
  pool: { getConnection: jest.fn(), execute: jest.fn(), query: jest.fn() },
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
  getTrialBalance: jest.fn().mockResolvedValue({ isBalanced: true }),
}));
jest.mock('../../src/services/business/CostClosingService', () => ({}));

const db = require('../../src/config/db');
const finance = require('../../src/models/finance');
const trialBalance = require('../../src/models/finance/trialBalance');
const closing = require('../../src/services/business/periodEnd/closingMethods');
const GLService = require('../../src/services/finance/GLService');
const period = {
  id: 1,
  is_closed: 0,
  start_date: '2026-10-01',
  end_date: '2026-10-31',
  period_name: '2026-10',
};

describe('period closing and posting use a common transaction boundary', () => {
  test.each([1, null])(
    'posting locks the selected period until transaction completion (period %s)',
    async (periodId) => {
      const connection = {
        execute: jest.fn(async (sql) => {
          if (sql.includes('FROM gl_periods')) return [[period]];
          if (sql.includes('INSERT INTO gl_entries')) return [{ insertId: 10 }];
          return [[]];
        }),
        query: jest.fn(async (sql) =>
          sql.includes('FROM gl_accounts') ? [[{ id: 1 }, { id: 2 }]] : [{ affectedRows: 2 }]
        ),
      };
      await expect(
        GLService.createEntry(
          {
            period_id: periodId,
            entry_date: '2026-10-13',
            entry_number: 'J10',
            voucher_number: 1,
            is_posted: 1,
          },
          [
            { account_id: 1, debit_amount: 100 },
            { account_id: 2, credit_amount: 100 },
          ],
          connection
        )
      ).resolves.toBe(10);
      const [sql] = connection.execute.mock.calls.find(([query]) =>
        query.includes('FROM gl_periods')
      );
      expect(sql).toContain('LOCK IN SHARE MODE');
    }
  );

  test('trial balance reuses the supplied connection rather than reading a separate snapshot', async () => {
    const connection = {
      execute: jest.fn().mockResolvedValue([[period]]),
      query: jest
        .fn()
        .mockResolvedValue([
          [{ id: 1, opening_net: 0, period_debit: 100, period_credit: 100, is_debit: 1 }],
        ]),
    };
    await expect(trialBalance.getTrialBalance(1, connection)).resolves.toMatchObject({
      isBalanced: true,
    });
    expect(db.pool.execute).not.toHaveBeenCalled();
    expect(db.pool.query).not.toHaveBeenCalled();
    expect(connection.query).toHaveBeenCalled();
  });

  test('closing uses fresh committed reads after acquiring its exclusive period lock', async () => {
    const connection = {
      execute: jest.fn(async (sql) => (sql.includes('FROM gl_periods') ? [[period]] : [[]])),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    const context = {
      ...closing,
      findPriorOpenPeriod: jest.fn().mockResolvedValue(null),
      getPeriodEntryIntegrity: jest
        .fn()
        .mockResolvedValue({
          unpostedCount: 0,
          postedDateMismatchCount: 0,
          postedPeriodMismatchCount: 0,
        }),
      getPeriodBankReconciliationStatus: jest
        .fn()
        .mockResolvedValue({ unreconciledCount: 0, manualReconciledCount: 0 }),
      assertCoreClosingControls: jest.fn(),
      sqlActiveOriginalClosingEntries: () => 'period_id = ? AND document_type = ?',
      transferProfitAndLoss: jest.fn().mockResolvedValue({ entryId: null }),
      calculatePeriodEndBalances: jest.fn(),
    };
    await closing.closePeriod.call(context, { period_id: 1, closed_by: 2 });
    expect(connection.execute.mock.calls[0][0]).toBe(
      'SET TRANSACTION ISOLATION LEVEL READ COMMITTED'
    );
    expect(connection.execute.mock.invocationCallOrder[0]).toBeLessThan(
      connection.beginTransaction.mock.invocationCallOrder[0]
    );
    expect(
      connection.execute.mock.calls.find(([sql]) => sql.includes('FROM gl_periods'))[0]
    ).toContain('FOR UPDATE');
    expect(finance.getTrialBalance).toHaveBeenCalledWith(1, connection);
    expect(connection.commit).toHaveBeenCalled();
  });
});
