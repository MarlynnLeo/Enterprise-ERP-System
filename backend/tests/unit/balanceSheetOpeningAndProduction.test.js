/* global jest, beforeEach, afterEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../../src/config/accountingConfig', () => ({ accountingConfig: {
  loadFromDatabase: jest.fn(), getAccountCode: (key) => ({
    BANK_DEPOSIT: '1002', INVENTORY: '1405', PRODUCTION_COST: '4001',
    MANUFACTURING_EXPENSE: '4101', SALES_COST: '6401', COST_OF_GOODS_SOLD: '6401',
    CURRENT_YEAR_PROFIT: '3103', RETAINED_EARNINGS: '3104',
  })[key],
} }));
jest.mock('../../src/config/financeConfig', () => ({ financeConfig: { get: (_key, fallback) => fallback } }));

const { DatabaseSync } = require('node:sqlite');
const db = require('../../src/config/db');
const reports = require('../../src/services/business/FinancialReportsService');
let database;
let nextEntry;

function post(date, lines, type = 'manual', posted = 1) {
  const id = nextEntry++;
  expect(lines.reduce((total, [, debit, credit]) => total + debit - credit, 0)).toBeCloseTo(0, 6);
  database.prepare('INSERT INTO gl_entries VALUES (?, ?, ?, ?)').run(id, date, posted, type);
  for (const [account, debit, credit] of lines)
    database.prepare('INSERT INTO gl_entry_items VALUES (?, ?, ?, ?)').run(id, account, debit, credit);
}

beforeEach(() => {
  database = new DatabaseSync(':memory:');
  nextEntry = 1;
  database.exec(`
    CREATE TABLE gl_accounts (id INTEGER PRIMARY KEY, account_code TEXT, account_name TEXT,
      account_type TEXT, parent_id INTEGER, is_debit INTEGER, is_active INTEGER,
      currency_code TEXT, opening_balance_date TEXT, opening_debit REAL, opening_credit REAL);
    INSERT INTO gl_accounts VALUES
      (1,'1002','银行存款','资产',NULL,1,1,'CNY','2026-08-01',800,0),
      (2,'6001','主营业务收入','收入',NULL,0,1,'CNY','2026-08-01',0,1000),
      (3,'6401','主营业务成本','费用',NULL,1,1,'CNY','2026-08-01',150,0),
      (4,'5601','销售费用','费用',NULL,1,0,'CNY','2026-08-01',50,0),
      (5,'4001','生产成本','成本',NULL,1,1,'CNY',NULL,0,0),
      (6,'4101','制造费用','成本',NULL,1,1,'CNY',NULL,0,0),
      (7,'1405','库存商品','资产',NULL,1,1,'CNY',NULL,0,0),
      (8,'3103','本年利润','所有者权益',NULL,0,1,'CNY',NULL,0,0),
      (9,'3104','利润分配','所有者权益',NULL,0,1,'CNY',NULL,0,0),
      (10,'SHOP-A','车间在产品','成本',5,1,1,'CNY',NULL,0,0);
    CREATE TABLE gl_entries (id INTEGER PRIMARY KEY, entry_date TEXT, is_posted INTEGER, document_type TEXT);
    CREATE TABLE gl_entry_items (entry_id INTEGER, account_id INTEGER, debit_amount REAL, credit_amount REAL);
  `);
  db.pool.getConnection.mockImplementation(async () => ({
    execute: async (sql, params = []) => [database.prepare(sql).all(...params)], release() {},
  }));
});
afterEach(() => database.close());

test('midyear opening profit balances the statement and is absent before its effective date', async () => {
  const result = await reports.generateBalanceSheet('2026-08-01', '2026-07-31');
  expect(result.summary).toMatchObject({ assetsTotal: 800, equityBeforeProfit: 0, unclosedProfit: 800, equityTotal: 800, balanceDifference: 0, isBalanced: true });
  expect(result.assets.totalCompareAmount).toBe(0);
  expect(result.equity.totalCompareAmount).toBe(0);
  expect(result.equity.items.find(row => row.code === 'CYP')).toMatchObject({ name: '未结转利润', amount: 800, compareAmount: 0 });
  const prior = await reports.generateBalanceSheet('2026-07-31');
  expect(prior.summary).toMatchObject({ assetsTotal: 0, unclosedProfit: 0, isBalanced: true });
});

test('unfinished production and overapplied overhead remain signed current assets, never period expenses', async () => {
  post('2026-09-01', [[10,60,0], [1,0,60]]);
  post('2026-09-02', [[7,7.5,0], [6,0,7.5]]);
  const result = await reports.generateBalanceSheet('2026-10-17');
  expect(result.summary).toMatchObject({ assetsTotal: 800, unclosedProfit: 800, equityTotal: 800, isBalanced: true });
  expect(result.assets.subCategories.currentAssets.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'SHOP-A', amount: 60 }),
    expect.objectContaining({ code: '4101', amount: -7.5 }),
  ]));
  const income = await reports.generateIncomeStatement('2026-09-01','2026-10-17');
  expect(income.find(row => row.code === 'NET_INCOME').amount).toBe(0);
});

test('an asset-typed production account and its separately posted child are each counted once', async () => {
  database.exec("UPDATE gl_accounts SET account_type='资产' WHERE id=5");
  post('2026-09-01', [[5,40,0], [10,20,0], [1,0,60]]);
  const result = await reports.generateBalanceSheet('2026-10-17');
  expect(result.summary.assetsTotal).toBe(800);
  expect(result.assets.items.filter(row => row.code==='4001')).toHaveLength(1);
  expect(result.assets.items.find(row=>row.code==='4001').amount).toBe(40);
  expect(result.assets.items.find(row=>row.code==='SHOP-A').amount).toBe(20);
});

test('unclosed profit survives January and closing plus year-end transfer does not duplicate it', async () => {
  post('2026-09-01', [[1,120,0], [2,0,120]]);
  post('2026-09-02', [[4,20,0], [1,0,20]]);
  post('2027-01-31', [[2,1120,0], [3,0,150], [4,0,70], [8,0,900]], 'profit_loss_transfer');
  post('2027-01-31', [[8,900,0], [9,0,900]], 'year_end_transfer');
  const before = await reports.generateBalanceSheet('2027-01-01', '2026-12-31');
  expect(before.summary).toMatchObject({ assetsTotal: 900, unclosedProfit: 900, equityTotal: 900, isBalanced: true });
  expect(before.equity.totalCompareAmount).toBe(900);
  const after = await reports.generateBalanceSheet('2027-02-01', '2027-01-01');
  expect(after.summary).toMatchObject({ assetsTotal: 900, unclosedProfit: 0, equityBeforeProfit: 900, equityTotal: 900, isBalanced: true });
  expect(after.equity.totalCompareAmount).toBe(900);
  expect(after.equity.items.find(row=>row.code==='CYP')).toMatchObject({ amount:0, compareAmount:900 });
});

test('posted closing reversals restore unclosed profit while drafts and future movements stay excluded', async () => {
  post('2026-12-31', [[2,1000,0], [3,0,150], [4,0,50], [8,0,800]], 'profit_loss_transfer');
  post('2027-02-01', [[2,0,1000], [3,150,0], [4,50,0], [8,800,0]], 'profit_loss_transfer');
  post('2027-02-02', [[1,10,0], [2,0,10]], 'manual', 0);
  post('2027-03-01', [[1,20,0], [2,0,20]]);
  const result = await reports.generateBalanceSheet('2027-02-15', '2027-01-31');
  expect(result.summary).toMatchObject({ assetsTotal: 800, unclosedProfit: 800, equityBeforeProfit: 0, equityTotal: 800, isBalanced: true });
  expect(result.equity.totalCompareAmount).toBe(800);
  expect(result.equity.items.find(row=>row.code==='CYP')).toMatchObject({ amount:800, compareAmount:0 });
});
