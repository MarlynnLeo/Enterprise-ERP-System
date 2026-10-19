jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));

const { DatabaseSync } = require('node:sqlite');
const { getTrialBalance } = require('../../src/models/finance/trialBalance');
let database;
let connection;

beforeEach(() => {
  database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE gl_accounts (id INTEGER PRIMARY KEY, account_code TEXT, account_name TEXT,
      account_type TEXT, is_debit INTEGER, is_active INTEGER, opening_debit REAL,
      opening_credit REAL, opening_balance_date TEXT);
    CREATE TABLE gl_entries (id INTEGER PRIMARY KEY, entry_date TEXT, is_posted INTEGER);
    CREATE TABLE gl_entry_items (entry_id INTEGER, account_id INTEGER, debit_amount REAL, credit_amount REAL);
    CREATE TABLE gl_periods (id INTEGER PRIMARY KEY, start_date TEXT, end_date TEXT);
    INSERT INTO gl_periods VALUES
      (9,'2026-09-01','2026-09-30'), (10,'2026-10-01','2026-10-31'), (11,'2026-11-01','2026-11-30');
    INSERT INTO gl_accounts VALUES
      (1,'1001','Cash','资产',1,1,1000,0,'2026-10-01'),
      (2,'3001','Equity','所有者权益',0,1,0,1000,'2026-10-01');
  `);
  connection = {
    execute: jest.fn(async (sql, params = []) => [database.prepare(sql).all(...params)]),
    query: jest.fn(async (sql, params = []) => [database.prepare(sql).all(...params)]),
  };
});
afterEach(() => database.close());

test.each([
  [9, 0],
  [10, 1000],
  [11, 1000],
  [null, 1000],
])(
  'opening balances become effective once, at the correct date (period %s)',
  async (periodId, expected) => {
    const result = await getTrialBalance(periodId, connection);
    expect(result.summary).toMatchObject({
      total_debit_balance: expected,
      total_credit_balance: expected,
      total_debit: 0,
      total_credit: 0,
      total_opening_adjustment_debit: 0,
      total_opening_adjustment_credit: 0,
    });
    expect(result.trialBalance[0].opening_balance).toBe(expected);
    expect(result.isBalanced).toBe(true);
  }
);

test('mid-period activation is separate from opening and voucher turnover', async () => {
  database.exec(`UPDATE gl_accounts SET opening_balance_date='2026-10-15';
    INSERT INTO gl_entries VALUES (1,'2026-10-20',1), (2,'2026-10-21',0), (3,'2026-11-05',1);
    INSERT INTO gl_entry_items VALUES (1,1,30,0),(1,2,0,30), (2,1,999,0),(2,2,0,999),
      (3,1,0,20),(3,2,20,0);`);
  const october = await getTrialBalance(10, connection);
  expect(october.trialBalance[0]).toMatchObject({
    opening_balance: 0,
    opening_adjustment_debit: 1000,
    opening_adjustment_credit: 0,
    total_debit: 30,
    total_credit: 0,
    debit_balance: 1030,
  });
  expect(october.summary).toMatchObject({
    total_opening_adjustment_debit: 1000,
    total_opening_adjustment_credit: 1000,
    total_debit: 30,
    total_credit: 30,
    total_debit_balance: 1030,
    total_credit_balance: 1030,
  });
  const november = await getTrialBalance(11, connection);
  expect(november.trialBalance[0]).toMatchObject({
    opening_balance: 1030,
    opening_adjustment_debit: 0,
    total_credit: 20,
    debit_balance: 1010,
  });
});

test('legacy undated opening remains effective, and differing effective dates expose imbalance', async () => {
  database.exec('UPDATE gl_accounts SET opening_balance_date=NULL WHERE id=1');
  const result = await getTrialBalance(9, connection);
  expect(result.summary).toMatchObject({ total_debit_balance: 1000, total_credit_balance: 0 });
  expect(result.isBalanced).toBe(false);
});

test('activation on the last day is included without inventing voucher turnover', async () => {
  database.exec("UPDATE gl_accounts SET opening_balance_date='2026-10-31'");
  const result = await getTrialBalance(10, connection);
  expect(result.summary).toMatchObject({
    total_debit: 0,
    total_credit: 0,
    total_opening_adjustment_debit: 1000,
    total_credit_balance: 1000,
  });
});
