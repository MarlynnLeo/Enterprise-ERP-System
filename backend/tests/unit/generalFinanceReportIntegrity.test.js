jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/config/accountingConfig', () => ({
  accountingConfig: { loadFromDatabase: jest.fn(), getAccountCode: jest.fn() },
}));
jest.mock('../../src/config/financeConfig', () => ({
  financeConfig: { get: (_key, fallback) => fallback },
}));

const db = require('../../src/config/db');
const income = require('../../src/services/business/financialReports/incomeMethods');
const balances = require('../../src/services/business/financialReports/balanceMethods');
const balanceSheet = require('../../src/services/business/financialReports/balanceSheetMethods');
const cashFlow = require('../../src/services/business/financialReports/cashFlowMethods');
const budgetSql = require('../../src/utils/finance/budgetUsageSql');

describe('finance reports preserve business activity across closing', () => {
  test('P&L reports exclude closing and reopening entries but retain business reversals', async () => {
    const activity = [
      { debit: 0, credit: 100, type: 'ar_invoice' },
      { debit: 10, credit: 0, type: 'ar_invoice' },
      { debit: 90, credit: 0, type: 'profit_loss_transfer' },
      { debit: 0, credit: 90, type: 'profit_loss_transfer' },
      { debit: 90, credit: 0, type: 'profit_loss_transfer' },
    ];
    const connection = {
      execute: jest.fn(async (sql) => {
        const included = activity.filter(
          (row) =>
            !sql.includes('NOT IN') ||
            !['profit_loss_transfer', 'year_end_transfer'].includes(row.type)
        );
        return [
          [
            {
              total_debit: included.reduce((sum, row) => sum + row.debit, 0),
              total_credit: included.reduce((sum, row) => sum + row.credit, 0),
            },
          ],
        ];
      }),
    };
    await expect(
      income.getAccountPeriodAmount(connection, 1, '2026-09-01', '2026-09-30', false)
    ).resolves.toBe(90);
    await expect(
      income.getAccountPeriodAmount(connection, 1, '2026-09-01', '2026-09-30', false, {
        includeClosingEntries: true,
      })
    ).resolves.toBe(0);
  });

  test('budget detail and total usage exclude internal closing entries', () => {
    for (const sql of [
      budgetSql.budgetDetailActualAmountSql(),
      budgetSql.budgetTotalActualAmountSql(),
    ]) {
      expect(sql).toContain(
        "COALESCE(ge.document_type, '') NOT IN ('profit_loss_transfer', 'year_end_transfer')"
      );
      expect(sql).not.toContain('is_reversed = 0');
    }
  });

  test('batch and individual historical balances exclude future opening balances', async () => {
    const row = {
      account_id: 1,
      account_type: '资产',
      is_debit: 1,
      opening_debit: 100,
      opening_credit: 0,
      opening_balance_date: '2026-01-01',
      total_debit: 0,
      total_credit: 0,
    };
    const connection = { execute: jest.fn().mockResolvedValue([[row]]) };
    await expect(
      balances.getBatchAccountBalances.call(balances, connection, [1], '2026-01-01', '2025-12-31')
    ).resolves.toEqual({ current: { 1: 100 }, compare: { 1: 0 } });
    await expect(
      balances.getAccountBalanceAtDate.call(balances, connection, 1, '2025-12-31')
    ).resolves.toBe(0);
    for (const [sql] of connection.execute.mock.calls)
      expect(sql).toContain('ga.opening_balance_date');
    expect(
      balances.calculateSignedBalance({ ...row, opening_balance_date: null }, '2025-12-31')
    ).toBe(100);
  });

  test('balance sheet does not duplicate profit already transferred to equity', async () => {
    const context = {
      ...balanceSheet,
      validateReportParams: jest.fn(),
      roundAmount: (value) => Math.round(value * 100) / 100,
      calculateAccountBalance: jest.fn(async (type) => ({
        accounts: [],
        accountCount: 0,
        totalBalance: type === '负债' ? 0 : 90,
        totalCompareBalance: 0,
      })),
      calculatePeriodAmount: jest.fn(async (_type, _start, _end, _cs, _ce, options) => ({
        totalAmount: options?.includeClosingEntries ? 0 : 90,
      })),
      getReportAccountGroups: jest.fn().mockResolvedValue({}),
      formatReportInfo: (value) => value,
      formatAccountsForReport: (value) => value,
      categorizeAssets: jest.fn(),
      categorizeLiabilities: jest.fn(),
      categorizeEquity: jest.fn(),
    };
    const result = await balanceSheet.generateBalanceSheet.call(context, '2026-09-30');
    expect(result.summary).toMatchObject({
      assetsTotal: 90,
      equityTotal: 90,
      currentYearProfit: 0,
      isBalanced: true,
    });
  });
});

describe('cash flow uses cash evidence and reconciles to GL', () => {
  const codes = {
    cashEquivalents: ['1001', '1002'],
    fixedAssets: ['1601'],
    constructionInProgress: ['1604'],
    shortLoans: ['2001'],
    paidInCapital: ['4001'],
  };
  const line = (entry, account, debit, credit) => ({
    entry_id: entry,
    account_code: account,
    debit_amount: debit,
    credit_amount: credit,
  });
  test('noncash transfers are ignored, gross borrowing and repayments are retained, mixed vouchers remain unresolved', async () => {
    const rows = [
      line(1, '1601', 100, 0),
      line(1, '1604', 0, 100),
      line(2, '1002', 100, 0),
      line(2, '2001', 0, 100),
      line(3, '2001', 60, 0),
      line(3, '1002', 0, 60),
      line(4, '1601', 80, 0),
      line(4, '1002', 0, 80),
      line(5, '1001', 20, 0),
      line(5, '1002', 0, 20),
      line(6, '1601', 100, 0),
      line(6, '2221', 13, 0),
      line(6, '1002', 0, 113),
      line(7, '2001', 200, 0),
      line(7, '4001', 0, 200),
    ];
    const connection = { execute: jest.fn().mockResolvedValue([rows]) };
    const result = await cashFlow.getCashFlowCashMovements(
      connection,
      '2026-09-01',
      '2026-09-30',
      codes
    );
    expect(result).toEqual({
      investing: { inflow: 0, outflow: 80 },
      loans: { inflow: 100, outflow: 60 },
      capital: { inflow: 0, outflow: 0 },
      ambiguousEntryIds: [6],
    });
    expect(connection.execute.mock.calls[0][0]).toContain('e.is_posted = 1');
    expect(connection.execute.mock.calls[0][0]).toContain('EXISTS');
  });

  const reportContext = (operatingIncome = 0) => ({
    ...cashFlow,
    getCashFlowAccountCodes: jest.fn().mockResolvedValue(codes),
    calculatePeriodAmount: jest.fn(async (type) => ({
      totalAmount: type === '收入' ? operatingIncome : 0,
    })),
    getAccountChangeByCodes: jest.fn().mockResolvedValue(0),
    getCashBalance: jest.fn().mockResolvedValue(500),
    formatReportInfo: (value) => value,
    roundAmount: (value) => Math.round(value * 100) / 100,
  });

  test('CIP transfer does not reduce investing cash or reported ending cash', async () => {
    db.pool.getConnection.mockResolvedValue({
      execute: jest.fn().mockResolvedValue([[]]),
      release: jest.fn(),
    });
    const result = await cashFlow.generateCashFlowStatement.call(
      reportContext(),
      '2026-09-01',
      '2026-09-30'
    );
    expect(result.summary).toMatchObject({
      investingCashFlow: 0,
      beginningCash: 500,
      endingCash: 500,
      netCashIncrease: 0,
      reconciliationDifference: 0,
      isReconciled: true,
    });
  });

  test('unsupported operating adjustments show a difference without inventing ending cash', async () => {
    db.pool.getConnection.mockResolvedValue({
      execute: jest.fn().mockResolvedValue([[]]),
      release: jest.fn(),
    });
    const result = await cashFlow.generateCashFlowStatement.call(
      reportContext(30),
      '2026-09-01',
      '2026-09-30'
    );
    expect(result.summary).toMatchObject({
      operatingCashFlow: 30,
      endingCash: 500,
      netCashIncrease: 0,
      reconciliationDifference: -30,
      isReconciled: false,
    });
    expect(result.items).toContainEqual(
      expect.objectContaining({ code: 'CASH_RECONCILIATION', amount: -30, isWarning: true })
    );
  });

  test('cash lookup failures propagate instead of returning plausible zero balances', async () => {
    const connection = { execute: jest.fn().mockRejectedValue(new Error('database unavailable')) };
    await expect(
      cashFlow.getCashBalance.call(cashFlow, connection, '2026-09-30', codes)
    ).rejects.toThrow('database unavailable');
  });
});
