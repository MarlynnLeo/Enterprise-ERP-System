/* global jest, beforeEach, afterEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(), execute: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));
jest.mock('../../src/config/financeConfig', () => ({ financeConfig: {} }));
jest.mock('../../src/models/finance/helpers', () => ({}));

const { DatabaseSync } = require('node:sqlite');
const db = require('../../src/config/db');
const entries = require('../../src/models/finance/entries');
const { fromGlEntryListQuery, toGlEntryApi } = require('../../src/utils/finance/glFieldMap');
let fixture, connection;

beforeEach(() => {
  jest.clearAllMocks();
  fixture = new DatabaseSync(':memory:');
  fixture.function('regexp', (pattern, value) => Number(new RegExp(pattern).test(value ?? '')));
  fixture.exec(`
    CREATE TABLE gl_entries (
      id INTEGER PRIMARY KEY, entry_number TEXT, voucher_word TEXT, voucher_number INTEGER,
      description TEXT, is_posted INTEGER, created_at TEXT, period_id INTEGER,
      created_by INTEGER, approved_by TEXT, reversal_entry_id INTEGER, entry_date TEXT
    );
    CREATE TABLE gl_entry_items (
      id INTEGER PRIMARY KEY, entry_id INTEGER, debit_amount NUMERIC, credit_amount NUMERIC,
      line_number INTEGER, account_id INTEGER, description TEXT, cost_center_id INTEGER,
      project_id INTEGER, created_at TEXT, updated_at TEXT, currency_code TEXT,
      exchange_rate NUMERIC, customer_id INTEGER, supplier_id INTEGER, employee_id INTEGER
    );
    CREATE TABLE gl_periods (id INTEGER PRIMARY KEY, period_name TEXT, fiscal_year INTEGER);
    CREATE TABLE document_links (id INTEGER PRIMARY KEY, source_type TEXT, source_id INTEGER, target_type TEXT, target_id INTEGER);
    CREATE TABLE users (id INTEGER PRIMARY KEY, real_name TEXT, username TEXT);
    CREATE TABLE gl_accounts (id INTEGER PRIMARY KEY, account_code TEXT, account_name TEXT, is_active INTEGER);
    CREATE TABLE cost_centers (id INTEGER PRIMARY KEY, name TEXT, department_id INTEGER);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE suppliers (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE hr_employees (id INTEGER PRIMARY KEY, name TEXT);
    ALTER TABLE gl_entry_items ADD COLUMN department_id INTEGER;
    ALTER TABLE gl_entry_items ADD COLUMN employee_source TEXT;
    INSERT INTO gl_entries VALUES
      (1, 'JE-1001', '记', 17, '采购材料', 1, '2026-10-17', 1, 7, NULL, NULL, '2026-10-17'),
      (2, 'JE-1002', '转', 18, '生产入库', 1, '2026-10-17', 1, 7, NULL, NULL, '2026-10-17'),
      (3, 'JE-1003', NULL, NULL, '待记账', 0, '2026-10-17', 1, 7, NULL, NULL, '2026-10-17'),
      (4, 'JE-1004', '记', 17, '其他部门采购', 1, '2026-10-17', 1, 99, NULL, NULL, '2026-10-17'),
      (5, 'JE-1005', '记', 17, '采购草稿', 0, '2026-10-17', 1, 7, NULL, NULL, '2026-10-17');
    INSERT INTO gl_entry_items (entry_id, debit_amount, credit_amount) VALUES
      (1, 10, 0), (1, 0, 10), (2, 20, 0), (3, 30, 0), (4, 40, 0), (5, 50, 0);
    ALTER TABLE gl_entries ADD COLUMN posted_by INTEGER;
  `);
  connection = { execute: jest.fn(async (sql, params) => [fixture.prepare(sql).all(...params)]), release: jest.fn() };
  db.pool.getConnection.mockResolvedValue(connection);
  db.pool.execute.mockImplementation(connection.execute);
});
afterEach(() => fixture.close());

test('maps nonblank mobile search separately from the existing PC entryNumber filter', () => {
  expect(fromGlEntryListQuery({ search: '  记-17  ', entryNumber: 'JE', isPosted: 'false' }))
    .toEqual({ search: '记-17', entry_number: 'JE', is_posted: false });
  expect(fromGlEntryListQuery({ search: '  ' })).toEqual({});
  expect(fromGlEntryListQuery({ search: ['not', 'a string'] })).toEqual({});
});

test.each([
  ['记-17', [5, 4, 1], 100],
  ['生产入库', [2], 20],
  ['JE-1003', [3], 30],
])('searches visible voucher number, summary, or technical ID using one paged filter: %s', async (search, ids, amount) => {
  const filters = fromGlEntryListQuery({ search });
  const first = await entries.getEntries(filters, 1, 1);
  expect(first.entries.map(row => row.id)).toEqual(ids.slice(0, 1));
  expect(first.pagination.total).toBe(ids.length);
  expect(first.statistics.totalAmount).toBe(amount);
  expect(toGlEntryApi(first.entries[0]).entryNumber).toBe(search === 'JE-1003' ? search : search === '生产入库' ? '转-18' : search);
  const remaining = await entries.getEntries(filters, 2, 1);
  expect(remaining.entries.map(row => row.id)).toEqual(ids.slice(1, 2));
  expect(remaining.statistics).toEqual(first.statistics);
});

test('search remains inside posting and owner scope, and binds quoted input', async () => {
  fixture.prepare('UPDATE gl_entries SET description = ? WHERE id = 1').run("采购 O'Reilly");
  const scoped = { scopeClause: { join: '', where: ' AND e.created_by = ?', params: [7] } };
  const byNumber = await entries.getEntries({ ...fromGlEntryListQuery({ search: '记-17', isPosted: true }), ...scoped });
  expect(byNumber.entries.map(row => row.id)).toEqual([1]);
  expect(byNumber.statistics).toEqual({ total: 1, posted: 1, unposted: 0, totalAmount: 10 });
  connection.execute.mockClear();
  const bySummary = await entries.getEntries({ ...fromGlEntryListQuery({ search: "O'Reilly" }), ...scoped });
  expect(bySummary.entries.map(row => row.id)).toEqual([1]);
  for (const [sql, params] of connection.execute.mock.calls.filter(([sql]) => sql.includes('LIKE'))) {
    expect(sql).not.toContain("O'Reilly");
    expect(params).toEqual(["%O'Reilly%", "%O'Reilly%", "%O'Reilly%", 7]);
  }
});

test('legacy PC entryNumber retains its technical-ID contract and combines with mobile search', async () => {
  const existing = await entries.getEntries(fromGlEntryListQuery({ entryNumber: 'JE-1002' }));
  expect(existing.entries.map(row => row.id)).toEqual([2]);
  const combined = await entries.getEntries(fromGlEntryListQuery({ entryNumber: 'JE-1002', search: '采购' }));
  expect(combined.entries).toEqual([]);
  expect(combined.pagination.total).toBe(0);
});

test('detail totals equal their actual lines and the same voucher in the list', async () => {
  fixture.exec(`INSERT INTO gl_entry_items (entry_id, debit_amount, credit_amount) VALUES
    (1, 0.1, 0), (1, 0.2, 0), (1, 0, 0.3);`);
  const detail = toGlEntryApi(await entries.getEntryById(1));
  const list = await entries.getEntries(fromGlEntryListQuery({ entryNumber: 'JE-1001' }));
  const listed = toGlEntryApi(list.entries[0]);
  expect(detail).toMatchObject({ totalDebit: 10.3, totalCredit: 10.3, totalAmount: 10.3 });
  expect(detail.items).toHaveLength(5);
  expect(detail.totalDebit).toBe(listed.totalDebit);
  expect(detail.totalCredit).toBe(listed.totalCredit);
  expect(detail.totalAmount).toBe(listed.totalAmount);
});

test('detail sums debit and credit separately without hiding an unbalanced or empty voucher', async () => {
  expect(toGlEntryApi(await entries.getEntryById(2))).toMatchObject({ totalDebit: 20, totalCredit: 0 });
  fixture.exec('DELETE FROM gl_entry_items WHERE entry_id = 3');
  expect(toGlEntryApi(await entries.getEntryById(3))).toMatchObject({ totalDebit: 0, totalCredit: 0, items: [] });
  expect(await entries.getEntryById(999)).toBeNull();
});
