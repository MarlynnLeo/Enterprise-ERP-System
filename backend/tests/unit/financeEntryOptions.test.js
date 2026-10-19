/* global jest, beforeEach, afterEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { execute: jest.fn() } }));
const { DatabaseSync } = require('node:sqlite');
const db = require('../../src/config/db');
const { getEntryOptions } = require('../../src/services/finance/EntryOptionsService');
let fixture;

beforeEach(() => {
  jest.clearAllMocks();
  fixture = new DatabaseSync(':memory:');
  fixture.exec(`
    CREATE TABLE gl_accounts (id INTEGER PRIMARY KEY, account_code TEXT, account_name TEXT,
      account_type TEXT, parent_id INTEGER, is_debit INTEGER, is_active INTEGER, currency_code TEXT,
      has_customer INTEGER, has_supplier INTEGER, has_employee INTEGER, has_department INTEGER, has_project INTEGER);
    CREATE TABLE customers (id INTEGER PRIMARY KEY, code TEXT, name TEXT, status TEXT, deleted_at TEXT);
    CREATE TABLE suppliers (id INTEGER PRIMARY KEY, code TEXT, name TEXT, status INTEGER, deleted_at TEXT);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, code TEXT, name TEXT, parent_id INTEGER, status INTEGER);
    CREATE TABLE cost_centers (id INTEGER PRIMARY KEY, code TEXT, name TEXT, department_id INTEGER, is_active INTEGER, deleted_at TEXT);
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, real_name TEXT, department_id INTEGER, status INTEGER, password TEXT, salary NUMERIC);
    INSERT INTO gl_accounts VALUES (1,'1122','应收账款','asset',NULL,1,1,'CNY',1,0,0,0,0),
      (2,'2202','停用科目','liability',NULL,0,0,'CNY',0,1,0,0,0);
    INSERT INTO departments VALUES (8,'D8','财务部',NULL,1),(9,'D9','停用部门',NULL,0);
    INSERT INTO cost_centers VALUES (70,'CC70','成本中心',8,1,NULL),(8,'CC8','已删除',9,1,'2026-10-01');
    INSERT INTO users VALUES (3,'finance','财务人员',8,1,'private-password',12345),(4,'inactive','停用员工',9,0,'private',456);
    INSERT INTO suppliers VALUES (5,'S5','供应商',1,NULL),(6,'S6','停用供应商',0,NULL);
  `);
  const insert = fixture.prepare('INSERT INTO customers VALUES (?, ?, ?, ?, ?)');
  for (let id = 1; id <= 121; id++) insert.run(id, `C${String(id).padStart(3, '0')}`, `客户${id}`, 'active', null);
  insert.run(122, 'C122', '停用客户', 'inactive', null);
  insert.run(123, 'C123', '删除客户', 'active', '2026-10-01');
  db.pool.execute.mockImplementation(async sql => [fixture.prepare(sql).all()]);
});
afterEach(() => fixture.close());

test('voucher options include every active reference without the unrelated list page limit', async () => {
  const options = await getEntryOptions();
  expect(options.customers).toHaveLength(121);
  expect(options.customers.at(-1)).toMatchObject({ id: 121, name: '客户121' });
  expect(options.accounts).toHaveLength(1);
  expect(options.accounts[0]).toMatchObject({ id: 1, accountCode: '1122', hasCustomer: true });
  expect(options.suppliers.map(row => row.id)).toEqual([5]);
  expect(options.departments.map(row => row.id)).toEqual([8]);
  expect(options.costCenters).toEqual([{ id: 70, code: 'CC70', name: '成本中心', departmentId: 8 }]);
  expect(options.employees).toEqual([{ id: 3, username: 'finance', realName: '财务人员', departmentId: 8, employeeSource: 'user' }]);
  expect(JSON.stringify(options)).not.toContain('private');
  expect(options.baseCurrency).toBe('CNY');
  expect(options.currencies.map(row => row.code)).toEqual(['CNY', 'USD']);
});

test('an unavailable source fails the options request instead of reporting an incomplete success', async () => {
  db.pool.execute.mockRejectedValueOnce(new Error('temporary database failure'));
  await expect(getEntryOptions()).rejects.toThrow('temporary database failure');
});
