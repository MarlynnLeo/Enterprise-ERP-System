/* global jest, beforeEach, describe, test, expect */
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
jest.mock('../../src/models/finance', () => ({
  createEntry: jest.fn().mockResolvedValue(500),
  getTrialBalance: jest.fn().mockResolvedValue({ isBalanced: true, summary: {} }),
}));
jest.mock('../../src/services/business/CostClosingService', () => ({}));
jest.mock('../../src/utils/userUtils', () => ({ resolveActorUserId: async () => 2 }));

const db = require('../../src/config/db');
const { accountingConfig } = require('../../src/config/accountingConfig');
const finance = require('../../src/models/finance');
const { classifyProfitLossAccounts } = require('../../src/utils/finance/profitLossAccounts');
const balances = require('../../src/services/business/financialReports/balanceMethods');
const income = require('../../src/services/business/financialReports/incomeMethods');
const closing = require('../../src/services/business/periodEnd/closingMethods');

const account = (id, code, type, parent = null, active = 1) => ({
  id,
  account_code: code,
  account_name: code,
  account_type: type,
  parent_id: parent,
  is_debit: ['收入', 'revenue'].includes(type) ? 0 : 1,
  is_active: active,
});
const period = {
  id: 10,
  period_name: '2026-10',
  start_date: '2026-10-01',
  end_date: '2026-10-31',
  is_closed: 0,
};
const codes = {
  SALES_COST: '6401',
  COST_OF_GOODS_SOLD: '6401',
  OTHER_COST: '6402',
  PRODUCTION_COST: '5001',
  MANUFACTURING_EXPENSE: '5101',
  CURRENT_YEAR_PROFIT: '3103',
};
const reportContext = { ...balances, ...income };
const closingContext = {
  ...closing,
  roundMoney: (value) => Math.round(Number(value) * 100) / 100,
  getCurrentYearProfitAccountId: async () => 99,
  generateTransferEntryNumber: async () => 'PL202610001',
  findPriorOpenPeriod: async () => null,
  getPeriodEntryIntegrity: async () => ({
    unpostedCount: 0,
    postedDateMismatchCount: 0,
    postedPeriodMismatchCount: 0,
  }),
  getPeriodBankReconciliationStatus: async () => ({
    unreconciledCount: 0,
    manualReconciledCount: 0,
  }),
  assertCoreClosingControls: async () => {},
  sqlActiveOriginalClosingEntries: () => 'period_id = ? AND document_type = ?',
  isClosed: (value) => Boolean(value),
};

// Query double implements selection and direct-account aggregates only. All
// hierarchy classification and report/closing calculations run the real code.
function fixture(accounts, amounts) {
  const movements = Object.entries(amounts).map(([id, amount]) => ({
    account_id: Number(id),
    debit: Math.max(amount, 0),
    credit: Math.max(-amount, 0),
    date: '2026-10-10',
    type: 'manual',
  }));
  const totals = (id, start = period.start_date, end = period.end_date, excludeClosing = false) => {
    const lines = movements.filter(
      (line) =>
        line.account_id === id &&
        line.date >= start &&
        line.date <= end &&
        (!excludeClosing || !['profit_loss_transfer', 'year_end_transfer'].includes(line.type))
    );
    return {
      total_debit: lines.reduce((sum, line) => sum + line.debit, 0),
      total_credit: lines.reduce((sum, line) => sum + line.credit, 0),
    };
  };
  const aggregate = (selected) =>
    selected
      .map((row) => {
        const total = totals(row.id);
        const balance = row.is_debit
          ? total.total_debit - total.total_credit
          : total.total_credit - total.total_debit;
        return { ...row, ...total, balance, closing_amount: balance };
      })
      .filter((row) => row.balance !== 0);
  const connection = {
    execute: jest.fn(async (sql, params = []) => {
      if (sql === 'SELECT id, account_code, account_type, parent_id FROM gl_accounts')
        return [accounts];
      if (sql.includes('WHERE ei.account_id = ?')) {
        return [[totals(params[0], params[1], params[2], sql.includes('NOT IN'))]];
      }
      if (sql.includes('AS current_net')) {
        const compare = !sql.includes('0 AS compare_net');
        const offset = compare ? 4 : 2;
        const count = sql.match(/ei.account_id IN \(([^)]+)\)/)[1].split(',').length;
        return [
          params.slice(offset, offset + count).map((id) => {
            const current = totals(id, params[0], params[1], sql.includes('NOT IN'));
            const previous = compare
              ? totals(id, params[2], params[3], sql.includes('NOT IN'))
              : {};
            return {
              account_id: id,
              current_net: current.total_debit - current.total_credit,
              compare_net: compare ? previous.total_debit - previous.total_credit : 0,
            };
          }),
        ];
      }
      if (sql.includes('account_code as code')) {
        const clause = sql.match(/WHERE id IN \(([^)]+)\)/);
        const ids = clause ? params.slice(0, clause[1].split(',').length) : [];
        return [
          accounts
            .filter((row) => ids.includes(row.id))
            .map((row) => ({
              id: row.id,
              code: row.account_code,
              name: row.account_name,
              type: row.account_type,
              is_debit: row.is_debit,
            })),
        ];
      }
      if (sql.includes('FROM gl_periods')) return [[period]];
      if (sql.includes('SELECT COUNT(*) as count FROM gl_entries')) return [[{ count: 0 }]];
      if (sql.includes('WHERE account_code = ?')) return [[{ id: 99 }]];
      if (sql.includes('as closing_amount')) return [aggregate(accounts)];
      if (sql.includes("a.account_type IN ('收入', 'revenue')"))
        return [aggregate(accounts.filter((row) => !row.is_debit))];
      if (sql.includes("a.account_type IN ('费用', '成本', 'expense', 'cost')"))
        return [aggregate(accounts.filter((row) => row.is_debit))];
      throw new Error(`Unexpected query: ${sql}`);
    }),
    release: jest.fn(),
  };
  db.pool.getConnection.mockResolvedValue(connection);
  return { connection, movements };
}

beforeEach(() => {
  accountingConfig.getAccountCode.mockImplementation((key) => codes[key]);
});

describe('shared profit and loss account hierarchy', () => {
  test('inherits configured roots across multiple levels and non-prefix account codes', () => {
    const accounts = [
      account(1, 'COST-X', '费用', null, 0),
      account(2, 'PRODUCT-A', '成本', '1'),
      account(3, 'PRODUCT-B', 'expense', 2),
      account(4, 'WIP-X', '资产'),
      account(5, 'ASSEMBLY', '成本', 4),
      account(6, 'OVERHEAD-X', '费用'),
      account(7, 'SHOP-A', '费用', 6),
      account(8, 'OTHER-X', 'expense'),
      account(9, 'OTHER-A', 'cost', 8),
    ];
    const result = classifyProfitLossAccounts(accounts, {
      costCodes: ['COST-X', 'OTHER-X'],
      productionCodes: ['WIP-X', 'OVERHEAD-X'],
    });
    expect([...result]).toEqual([
      [1, 'cost'],
      [2, 'cost'],
      [3, 'cost'],
      [4, null],
      [5, 'production'],
      [6, 'production'],
      [7, 'production'],
      [8, 'cost'],
      [9, 'cost'],
    ]);
  });

  test('supports unlinked legacy codes but gives real parentage and revenue types precedence', () => {
    const accounts = [
      account(1, '640101', '成本'),
      account(2, '510101', '费用'),
      account(3, '6601', '费用'),
      account(4, '500177', '费用', 3),
      account(5, '5001', '收入'),
      account(6, '5401', 'revenue'),
      account(7, '500199', '成本'),
      account(8, 'UNKNOWN', '成本'),
      account(9, 'LEGACY-SALES-CHILD', '费用', 1),
      account(10, 'LEGACY-PRODUCTION-CHILD', '费用', 2),
    ];
    const result = classifyProfitLossAccounts(accounts, {
      costCodes: ['6401', '5401'],
      productionCodes: ['5001', '5101'],
    });
    expect([...result.values()]).toEqual([
      'cost',
      'production',
      'expense',
      'expense',
      'income',
      'income',
      'cost',
      'cost',
      'cost',
      'production',
    ]);
  });
});

describe('reports and closing use the same direct-account amounts', () => {
  const accounts = [
    account(1, '6001', '收入'),
    account(2, '6401', '成本', null, 0),
    account(3, '640101', '成本', 2),
    account(4, 'PRODUCT-ALT', '费用', 3),
    account(5, '5001', '成本'),
    account(6, '500101', '成本', 5),
    account(7, 'SHOP-ALT', '费用', 6),
    account(8, '5101', '费用'),
    account(9, '510101', '费用', 8),
    account(10, '6601', '费用'),
    account(11, '500177', '费用', 10),
    account(12, '6402', '费用'),
    account(13, '640201', '费用', 12),
  ];
  const amounts = {
    1: -1000,
    2: 100,
    3: 600,
    4: 50,
    5: 250,
    6: 600,
    7: 40,
    8: 80,
    9: 60,
    10: 20,
    11: 30,
    13: 75,
  };

  test('profit includes parent and descendant sales costs once and excludes all production costs', async () => {
    const { connection } = fixture(accounts, amounts);
    const report = await reportContext.generateIncomeStatement(period.start_date, period.end_date);
    expect(report.find((row) => row.id === 'cost-total').amount).toBe(-825);
    expect(report.find((row) => row.id === 'expense-total').amount).toBe(-50);
    expect(report.find((row) => row.id === 'gross-profit').amount).toBe(175);
    expect(report.find((row) => row.id === 'net-income').amount).toBe(125);
    expect(report.find((row) => row.id === 'cost-total').children.map((row) => row.code)).toEqual([
      '6401',
      '640101',
      'PRODUCT-ALT',
      '640201',
    ]);
    expect(
      connection.execute.mock.calls.filter(
        ([sql]) => sql === 'SELECT id, account_code, account_type, parent_id FROM gl_accounts'
      )
    ).toHaveLength(3);
  });

  test('closing and preview retain production balances and match reported profit', async () => {
    const { connection } = fixture(accounts, amounts);
    const preview = await closingContext.getClosingPreview(10);
    const result = await closingContext.transferProfitAndLoss(connection, 10, period, 2);
    expect(preview.canClose).toBe(true);
    expect(preview.summary).toEqual({ totalIncome: 1000, totalExpense: 875, netProfit: 125 });
    expect(result).toMatchObject(preview.summary);
    const [, items] = finance.createEntry.mock.calls[0];
    expect(items.map((item) => item.account_id)).toEqual([1, 2, 3, 4, 10, 11, 13, 99]);
    expect(preview.closingItems.map((item) => item.id)).toEqual([1, 2, 3, 4, 10, 11, 13]);
    expect(items.find((item) => item.account_id === 99)).toMatchObject({
      debit_amount: 0,
      credit_amount: 125,
    });
  });

  test('a period containing only production and manufacturing costs needs no profit transfer', async () => {
    const { connection } = fixture(accounts, { 5: 250, 6: 600, 7: 40, 8: 80, 9: 60 });
    const result = await closingContext.transferProfitAndLoss(connection, 10, period, 2);
    expect(result).toEqual({ totalIncome: 0, totalExpense: 0, netProfit: 0, entryId: null });
    expect(finance.createEntry).not.toHaveBeenCalled();
    const report = await reportContext.generateIncomeStatement(period.start_date, period.end_date);
    expect(report.find((row) => row.id === 'net-income').amount).toBe(0);
  });

  test('closing clears descendant P&L balances without erasing their business-period report', async () => {
    const { connection, movements } = fixture(accounts, amounts);
    await closingContext.transferProfitAndLoss(connection, 10, period, 2);
    const [, items] = finance.createEntry.mock.calls[0];
    movements.push(
      ...items.map((item) => ({
        account_id: item.account_id,
        debit: item.debit_amount,
        credit: item.credit_amount,
        date: period.end_date,
        type: 'profit_loss_transfer',
      }))
    );
    const report = await reportContext.generateIncomeStatement(period.start_date, period.end_date);
    expect(report.find((row) => row.id === 'net-income').amount).toBe(125);
    for (const type of ['收入', '成本', '费用']) {
      const remaining = await reportContext.calculatePeriodAmount(
        type,
        period.start_date,
        period.end_date,
        null,
        null,
        { includeClosingEntries: true }
      );
      expect(remaining.totalAmount).toBe(0);
    }
  });
});
