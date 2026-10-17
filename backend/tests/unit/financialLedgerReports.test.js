jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/config/accountingConfig', () => ({
  accountingConfig: { loadFromDatabase: jest.fn(), getAllAccountCodes: jest.fn() },
}));

const db = require('../../src/config/db');
const { accountingConfig } = require('../../src/config/accountingConfig');
const FinancialLedgerService = require('../../src/services/business/FinancialLedgerService');
const {
  normalizeFilters,
  availableAccounts,
} = require('../../src/services/business/financialLedgers/helpers');
const {
  selectScopes,
  loadGlData,
  buildGlReport,
} = require('../../src/services/business/financialLedgers/glMethods');

const codes = {
  CASH: '1001',
  ACCOUNTS_PAYABLE: '2202',
  VAT_PAYABLE: '222101',
  VAT_INPUT_TAX: '222101001',
  VAT_OUTPUT_TAX: '222101005',
};
const account = (id, code, name, parentId = null, debit = 0, credit = 0, openingDate = null) => ({
  id,
  account_code: code,
  account_name: name,
  parent_id: parentId,
  opening_debit: debit,
  opening_credit: credit,
  opening_balance_date: openingDate,
});
const entry = (id, accountId, date, debit, credit, extra = {}) => ({
  id,
  account_id: accountId,
  date,
  debit,
  credit,
  entry_id: id,
  entry_number: `J-${id}`,
  description: `entry-${id}`,
  ...extra,
});
const filters = (startMonth = '2026-09', endMonth = '2026-09', extra = {}) =>
  normalizeFilters('general', { startMonth, endMonth, ...extra });
const build = (type, accounts, entries, currentFilters = filters(), beforeYear = []) =>
  buildGlReport(
    type,
    currentFilters,
    selectScopes(type, currentFilters, accounts, codes),
    { entries, beforeYear },
    codes
  );

describe('financial ledger accounting', () => {
  test('rolls up root and descendants once, preserves inactive historical accounts and excludes opening from turnover', () => {
    const accounts = [
      account(1, '1002', '银行'),
      { ...account(2, '100201', '旧账户', 1, 100, 0, '2026-01-01'), is_active: 0 },
    ];
    const result = build('general', accounts, [
      entry(1, 2, '2026-08-01', 30, 0),
      entry(2, 2, '2026-09-10', 0, 20),
    ]);
    expect(result.summary).toMatchObject({
      openingBalance: 130,
      totalDebit: 0,
      totalCredit: 20,
      closingBalance: 110,
      groupCount: 1,
    });
    expect(result.rows.map((row) => row.rowType)).toEqual(['opening', 'subtotal', 'cumulative']);
    expect(result.rows[2]).toMatchObject({ debit: 30, credit: 20, balance: 110, direction: '借' });
  });

  test('an opening first effective mid-range appears on its date without inventing January opening or turnover', () => {
    const result = build(
      'cash',
      [account(1, '1001', '库存现金', null, 100, 0, '2026-08-01')],
      [entry(1, 1, '2026-09-01', 10, 0)],
      filters('2026-07', '2026-09')
    );
    expect(result.summary).toMatchObject({
      openingBalance: 0,
      totalDebit: 10,
      closingBalance: 110,
    });
    expect(result.rows.find((row) => row.description.includes('期初余额启用'))).toMatchObject({
      rowType: 'opening',
      date: '2026-08-01',
      debit: 0,
      balance: 100,
    });
    expect(result.rows.filter((row) => row.rowType === 'cumulative').at(-1).debit).toBe(10);
    expect(result.warnings.join('')).toContain('2026-08-01');
  });

  test('combines opening warnings by date and preserves the single-account explanation', () => {
    const accounts = Array.from({ length: 8 }, (_, i) =>
      account(i + 1, String(1001 + i), '科目', null, 10, 0, '2026-08-01')
    );
    accounts.push(account(9, '1010', '其他科目', null, 20, 0, '2026-07-01'));
    const result = build('general', accounts, [], filters('2026-08', '2026-09'));
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('8 个科目的期初余额自 2026-08-01');
    expect(result.warnings[0]).toContain('1001、1002、1003、1004、1005、1006等（共 8 个）');
    expect(result.warnings[0]).not.toContain('1007');
    expect(result.warnings[1]).toBe(
      '科目 1010 的期初余额自 2026-07-01 启用；此前发生额仅包含系统已过账记录，本年累计不含导入期初余额。'
    );
  });

  test('cash receipt/payment and reversal retain the audit trail and correct running credit direction', () => {
    const result = build(
      'cash',
      [account(1, '1001', '库存现金', null, 0.1)],
      [
        entry(1, 1, '2026-09-01', 0.2, 0),
        entry(2, 1, '2026-09-02', 0, 0.4),
        entry(3, 1, '2026-09-03', 0.4, 0),
      ]
    );
    expect(
      result.rows
        .filter((row) => row.rowType === 'entry')
        .map((row) => [row.balance, row.direction])
    ).toEqual([
      [0.3, '借'],
      [0.1, '贷'],
      [0.3, '借'],
    ]);
    expect(result.summary.closingBalance).toBe(0.3);
  });

  test('supplier-specific balances remain unknown when the only opening is at account level', () => {
    const result = build(
      'payable',
      [account(1, '2202', '应付账款', null, 0, 100, '2026-01-01')],
      [entry(1, 1, '2026-09-01', 30, 0)],
      { ...filters(), supplierId: 7 }
    );
    expect(result.summary).toMatchObject({
      openingBalance: null,
      closingBalance: null,
      totalDebit: 30,
    });
    expect(result.rows.every((row) => row.balance === null)).toBe(true);
    expect(result.warnings.join('')).toContain('供应商分项');
  });

  test('year-to-date resets in January while running balance carries forward', () => {
    const result = build(
      'cash',
      [account(1, '1001', '库存现金')],
      [entry(1, 1, '2026-12-10', 70, 0), entry(2, 1, '2027-01-10', 30, 0)],
      filters('2026-12', '2027-01')
    );
    expect(result.rows.at(-1)).toMatchObject({ debit: 30, credit: 0, balance: 100 });
  });

  test('VAT scope excludes other taxes and merges voucher lines with signed opposite-side columns', () => {
    const accounts = [
      account(1, '2221', '应交税费'),
      account(2, '222101', '应交增值税', 1),
      account(3, '222101001', '进项税额', 2),
      account(4, '222101005', '销项税款', 2),
      account(5, '222120', '待抵扣进项税额', 1),
      account(6, '222105', '应交所得税', 1),
    ];
    expect(
      availableAccounts('vat', accounts, codes)
        .map((row) => row.id)
        .sort()
    ).toEqual([2, 3, 4, 5]);
    const result = build('vat', accounts, [
      entry(1, 3, '2026-09-01', 13, 0, { entry_id: 9 }),
      entry(2, 4, '2026-09-01', 0, 20, { entry_id: 9 }),
      entry(3, 3, '2026-09-02', 0, 3),
      entry(4, 6, '2026-09-02', 0, 999),
    ]);
    const lines = result.rows.filter((row) => row.rowType === 'entry');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      inputTax: 13,
      outputTax: 20,
      debit: 13,
      credit: 20,
      balance: 7,
      direction: '贷',
    });
    expect(lines[1].inputTax).toBe(-3);
    expect(result.summary.closingBalance).toBe(-10);
  });

  test('unrecognized VAT subaccounts remain visible without misclassifying their tax', () => {
    const result = build(
      'vat',
      [account(1, '222101', '应交增值税'), account(2, '222101011', '加计抵减进项税', 1)],
      [entry(1, 2, '2026-09-01', 20, 0)]
    );
    expect(result.rows.find((row) => row.rowType === 'entry')).toMatchObject({
      inputTax: 0,
      unclassifiedTax: 20,
    });
    expect(result.warnings.join('')).toContain('加计抵减进项税');
  });
});

describe('financial ledger API boundaries', () => {
  test.each([
    ['general', { startMonth: '2026-00', endMonth: '2026-09' }],
    ['cash', { startMonth: '2026-10', endMonth: '2026-09' }],
    ['vat', { startMonth: '2026-01', endMonth: '2026-09', supplierId: 1 }],
    ['general', { startMonth: '2026-01', endMonth: '2026-09', accountId: '1 OR 1=1' }],
    ['general', { startMonth: '2026-01', endMonth: '2026-09', pageSize: 10001 }],
    ['unknown', { startMonth: '2026-01', endMonth: '2026-09' }],
  ])('rejects invalid %s filters before querying', (type, query) =>
    expect(() => normalizeFilters(type, query)).toThrow()
  );

  test('a selected account cannot escape the cash scope', () => {
    expect(() =>
      selectScopes(
        'cash',
        { accountId: 2 },
        [account(1, '1001', '库存现金'), account(2, '2202', '应付')],
        codes
      )
    ).toThrow('不属于');
  });

  test('query uses posted records, bound supplier/account dates and refuses excess results', async () => {
    const connection = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([Array(10001).fill({})]),
    };
    await expect(loadGlData(connection, [1], { ...filters(), supplierId: 9 })).rejects.toThrow(
      '10000'
    );
    expect(connection.execute.mock.calls[0][0]).toContain('e.is_posted = 1');
    expect(connection.execute.mock.calls[2][0]).toContain('i.supplier_id = ?');
    expect(connection.execute.mock.calls[2][1]).toEqual(['2026-09-01', '2026-09-30', 1, 9]);
    expect(connection.execute.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
  });

  test('more than 10000 earlier-year transactions do not consume the selected month detail limit', async () => {
    const accounts = [account(1, '1001', '库存现金')];
    const connection = {
      execute: jest.fn(async (sql, params) => {
        if (sql.includes('GROUP BY') && params[0] === '2026-01-01' && params[1] === '2026-09-01') {
          return [[{ account_id: 1, debit: 10001, credit: 0 }]];
        }
        if (sql.includes('GROUP BY')) return [[]];
        expect(params[0]).toBe('2026-09-01');
        return [[entry(10002, 1, '2026-09-01', 1, 0)]];
      }),
    };
    const currentFilters = filters();
    const data = await loadGlData(connection, [1], currentFilters);
    const report = buildGlReport(
      'cash',
      currentFilters,
      selectScopes('cash', currentFilters, accounts, codes),
      data,
      codes
    );
    expect(report.summary).toMatchObject({
      openingBalance: 10001,
      totalDebit: 1,
      closingBalance: 10002,
      entryCount: 1,
    });
    expect(report.rows.filter((row) => row.rowType === 'entry')).toHaveLength(1);
    expect(report.rows.at(-1).debit).toBe(10002);
  });

  test('page totals and full export include subtotal and cumulative rows without slicing summary', () => {
    const report = {
      rows: Array.from({ length: 101 }, (_, id) => ({ id })),
      summary: { totalDebit: 500 },
    };
    const page = FinancialLedgerService.paginateReport(report, {
      page: 2,
      pageSize: 50,
      exportAll: false,
    });
    expect(page.rows[0].id).toBe(50);
    expect(page.pagination.total).toBe(101);
    expect(page.summary.totalDebit).toBe(500);
    expect(
      FinancialLedgerService.paginateReport(report, { page: 2, pageSize: 50, exportAll: true }).rows
    ).toHaveLength(101);
  });

  test('service reads a consistent read-only snapshot and releases the connection', async () => {
    accountingConfig.getAllAccountCodes.mockReturnValue(codes);
    const connection = {
      execute: jest.fn(async (sql) => {
        if (sql.includes('FROM gl_accounts')) return [[account(1, '1001', '库存现金', null, 10)]];
        if (sql.includes('FROM system_settings')) return [[{ value: '测试单位' }]];
        return [[]];
      }),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
      query: jest.fn(),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    const report = await FinancialLedgerService.getLedger('cash', {
      startMonth: '2026-09',
      endMonth: '2026-09',
    });
    expect(report.filters.organizationName).toBe('测试单位');
    expect(report.summary.closingBalance).toBe(10);
    expect(connection.query.mock.calls[0][0]).toContain('READ ONLY');
    expect(
      connection.execute.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT|DELETE)/.test(sql))
    ).toBe(false);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
