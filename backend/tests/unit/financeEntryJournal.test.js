/* global jest, beforeEach, afterEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(), execute: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));
jest.mock('../../src/config/financeConfig', () => ({ financeConfig: {} }));
jest.mock('../../src/models/finance/helpers', () => ({}));

const { DatabaseSync } = require('node:sqlite');
const db = require('../../src/config/db');
const entriesModel = require('../../src/models/finance/entries');
const { fromGlEntryListQuery, toGlEntryApi } = require('../../src/utils/finance/glFieldMap');
let fixture;
let connection;

const scopeClause = {
  join: 'LEFT JOIN users entry_owner ON entry_owner.id = e.created_by',
  where: ' AND entry_owner.department_id = ?',
  params: [10],
};

beforeEach(() => {
  jest.clearAllMocks();
  fixture = new DatabaseSync(':memory:');
  fixture.function('regexp', (pattern, value) => Number(new RegExp(pattern).test(value || '')));
  fixture.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, real_name TEXT, username TEXT, department_id INTEGER);
    CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE cost_centers (id INTEGER PRIMARY KEY, name TEXT, department_id INTEGER);
    CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE suppliers (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE gl_accounts (id INTEGER PRIMARY KEY, account_code TEXT, account_name TEXT, is_active INTEGER);
    CREATE TABLE gl_periods (id INTEGER PRIMARY KEY, period_name TEXT, fiscal_year INTEGER);
    CREATE TABLE document_links (id INTEGER PRIMARY KEY, source_type TEXT, source_id INTEGER, target_type TEXT, target_id INTEGER);
    CREATE TABLE gl_entries (
      id INTEGER PRIMARY KEY, entry_number TEXT, entry_date TEXT, document_type TEXT,
      document_number TEXT, period_id INTEGER, created_by INTEGER, approved_by TEXT,
      voucher_word TEXT, voucher_number INTEGER, is_posted INTEGER, reversal_entry_id INTEGER,
      created_at TEXT, transaction_type TEXT, transaction_id INTEGER
    );
    CREATE TABLE gl_entry_items (
      id INTEGER PRIMARY KEY, entry_id INTEGER, line_number INTEGER, account_id INTEGER,
      debit_amount NUMERIC, credit_amount NUMERIC, currency_code TEXT, exchange_rate NUMERIC,
      cost_center_id INTEGER, customer_id INTEGER, supplier_id INTEGER, employee_id INTEGER,
      description TEXT
    );
    INSERT INTO users VALUES (1, '制单员', 'creator', 10), (2, '', 'reviewer', 20), (3, '其他制单员', 'other', 20);
    INSERT INTO departments VALUES (41, '不能误关联的部门'), (501, '生产部');
    INSERT INTO cost_centers VALUES (41, '制造成本中心', 501);
    INSERT INTO customers VALUES (1, '客户甲');
    INSERT INTO suppliers VALUES (2, '供应商乙');
    INSERT INTO gl_accounts VALUES (1, '1001', '库存现金', 1), (2, '2202', '应付账款', 0);
    INSERT INTO gl_periods VALUES (1, '2026年10月', 2026);
  `);
  const insertEntry = fixture.prepare(`INSERT INTO gl_entries VALUES (?, ?, '2026-10-17', 'manual', ?, 1, ?, ?, '记', ?, 1, NULL, '2026-10-17', 'manual', NULL)`);
  for (let id = 1; id <= 4; id++) {
    insertEntry.run(id, `GL-${id}`, `DOC-${id}`, id === 4 ? 3 : 1, id === 1 ? '2legacy' : '2', id);
  }
  fixture.exec(`
    INSERT INTO gl_entry_items VALUES
      (201, 2, 20, 2, 0, 20, 'CNY', 1, 41, NULL, 2, 8, '应付明细'),
      (202, 2, 10, 1, 20, 0, 'CNY', 1, 41, 1, NULL, NULL, '现金明细'),
      (301, 3, 1, 999, 30, 0, 'CNY', 1, 999, 999, 999, NULL, '历史缺失资料'),
      (302, 3, 2, 1, 0, 30, 'CNY', 1, NULL, NULL, NULL, NULL, '现金贷方'),
      (401, 4, 1, 1, 999, 0, 'CNY', 1, NULL, NULL, NULL, NULL, '其他用户凭证');
    ALTER TABLE gl_entry_items ADD COLUMN department_id INTEGER;
    ALTER TABLE gl_entry_items ADD COLUMN employee_source TEXT;
    ALTER TABLE gl_entry_items ADD COLUMN foreign_amount NUMERIC;
    ALTER TABLE gl_entry_items ADD COLUMN quantity NUMERIC;
    ALTER TABLE gl_entry_items ADD COLUMN unit_name TEXT;
    ALTER TABLE gl_entry_items ADD COLUMN unit_price NUMERIC;
    ALTER TABLE gl_entry_items ADD COLUMN invoice_number TEXT;
    ALTER TABLE gl_entry_items ADD COLUMN settlement_method TEXT;
    ALTER TABLE gl_entry_items ADD COLUMN project_name TEXT;
    ALTER TABLE gl_entries ADD COLUMN attachment_count INTEGER;
    ALTER TABLE gl_entries ADD COLUMN approval_comment TEXT;
    ALTER TABLE gl_entries ADD COLUMN posted_by INTEGER;
    ALTER TABLE gl_entries ADD COLUMN posted_at TEXT;
    ALTER TABLE gl_entries ADD COLUMN posting_method TEXT;
    ALTER TABLE gl_entries ADD COLUMN approved_at TEXT;
    CREATE TABLE hr_employees (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO hr_employees VALUES (1, '同ID人事员工');
  `);
  const execute = async (sql, params = []) => [fixture.prepare(sql).all(...params)];
  connection = { execute: jest.fn(execute), release: jest.fn() };
  db.pool.getConnection.mockResolvedValue(connection);
  db.pool.execute.mockImplementation(execute);
});

afterEach(() => fixture.close());

test('journal batches only scoped page lines, preserves voucher and line order, and maps actual auxiliary names', async () => {
  const result = await entriesModel.getEntries({ ...fromGlEntryListQuery({ includeItems: 'true' }), scopeClause }, 1, 2);
  expect(result.entries.map(entry => entry.id)).toEqual([3, 2]);
  expect(result.entries.map(entry => entry.items.map(item => item.id))).toEqual([[301, 302], [202, 201]]);
  expect(result.pagination).toEqual({ total: 3, page: 1, pageSize: 2, totalPages: 2 });
  expect(result.statistics).toEqual({ total: 3, posted: 3, unposted: 0, totalAmount: 50 });
  expect(connection.execute).toHaveBeenCalledTimes(4);
  const [itemsSql, itemIds] = connection.execute.mock.calls[2];
  expect(itemsSql).toContain('WHERE ei.entry_id IN (?,?)');
  expect(itemIds).toEqual([3, 2]);
  expect(connection.release).toHaveBeenCalledTimes(1);

  const entry = toGlEntryApi(result.entries[1]);
  expect(entry).toMatchObject({ entryNumber: '记-2', approvedBy: '2', approverName: 'reviewer', transactionType: 'manual' });
  expect(entry.items[0]).toMatchObject({
    accountCode: '1001', accountName: '库存现金', debitAmount: 20, creditAmount: 0,
    costCenterId: 41, costCenterName: '制造成本中心', departmentId: 501, departmentName: '生产部',
    customerId: 1, customerName: '客户甲', currencyCode: 'CNY', exchangeRate: 1,
  });
  expect(entry.items[1]).toMatchObject({ supplierId: 2, supplierName: '供应商乙', employeeId: 8, accountIsActive: false });
  expect(toGlEntryApi(result.entries[0]).items[0]).toMatchObject({
    accountId: 999, accountCode: null, departmentName: null, customerName: null, supplierName: null,
    debitAmount: 30,
  });
});

test('empty vouchers have an empty line array and legacy approver text does not match a numeric user', async () => {
  const result = await entriesModel.getEntries({ include_items: true, scopeClause }, 2, 2);
  expect(result.entries.map(entry => entry.id)).toEqual([1]);
  expect(result.entries[0].items).toEqual([]);
  expect(toGlEntryApi(result.entries[0])).toMatchObject({ approvedBy: '2legacy', approverName: null });
});

test('default lists keep three queries and empty pages skip the line batch entirely', async () => {
  const result = await entriesModel.getEntries({ scopeClause }, 1, 2);
  expect(connection.execute).toHaveBeenCalledTimes(3);
  expect(result.entries.every(entry => !Object.hasOwn(entry, 'items'))).toBe(true);
  connection.execute.mockClear();
  const empty = await entriesModel.getEntries({ include_items: true, scopeClause }, 9, 2);
  expect(empty.entries).toEqual([]);
  expect(empty.statistics.totalAmount).toBe(50);
  expect(connection.execute).toHaveBeenCalledTimes(2);
});

test('individual item lookups use the same auxiliary mappings and stable line ordering', async () => {
  const items = await entriesModel.getEntryItems(2);
  expect(items.map(item => item.id)).toEqual([202, 201]);
  expect(items[0]).toMatchObject({ department_name: '生产部', customer_name: '客户甲' });
  expect(db.pool.execute.mock.calls[0][1]).toEqual([2]);
});

test('standalone voucher details have the same real names, metadata and line order as a journal lookup', async () => {
  fixture.exec(`UPDATE gl_entries SET attachment_count = 2, approval_comment = '审核通过' WHERE id = 2;
    UPDATE gl_entry_items SET department_id = 41, employee_id = 1, employee_source = 'user',
      currency_code = 'USD', exchange_rate = 6.7809, foreign_amount = 2.95,
      quantity = 2, unit_name = '箱', unit_price = 1.475, invoice_number = 'INV-1',
      settlement_method = '银行转账', project_name = '项目甲' WHERE id = 202;`);
  const individual = toGlEntryApi(await entriesModel.getEntryById(2));
  expect(individual).toMatchObject({ creatorName: '制单员', approverName: 'reviewer', attachmentCount: 2, approvalComment: '审核通过' });
  expect(individual.items.map(item => item.id)).toEqual([202, 201]);
  expect(individual.items[0]).toMatchObject({
    departmentId: 41, departmentName: '不能误关联的部门', costCenterId: 41,
    employeeName: '制单员', employeeSource: 'user', currencyCode: 'USD',
    exchangeRate: 6.7809, foreignAmount: 2.95, quantity: 2, unitName: '箱', unitPrice: 1.475,
    invoiceNumber: 'INV-1', settlementMethod: '银行转账', projectName: '项目甲',
  });
  const list = await entriesModel.getEntries({ include_items: true }, 1, 10);
  expect(toGlEntryApi(list.entries.find(entry => entry.id === 2)).items).toEqual(individual.items);
});

test('employee identity sources cannot collide and unknown historical values stay unknown', async () => {
  fixture.exec("UPDATE gl_entry_items SET employee_id = 1, employee_source = 'hr' WHERE id = 202");
  expect(toGlEntryApi(await entriesModel.getEntryById(2)).items[0].employeeName).toBe('同ID人事员工');
  fixture.exec('UPDATE gl_entry_items SET employee_source = NULL WHERE id = 202');
  const item = toGlEntryApi(await entriesModel.getEntryById(2)).items[0];
  expect(item.employeeName).toBeNull();
  expect(item.foreignAmount).toBeNull();
  expect(item.quantity).toBeNull();
  expect(item.unitPrice).toBeNull();
});

test('posting identity, full audit instants and reversal links survive both list and standalone reads', async () => {
  fixture.exec(`UPDATE gl_entries SET posted_by = 3, posted_at = '2026-10-17 20:48:14',
      approved_at = '2026-10-17 20:47:31', posting_method = 'manual', reversal_entry_id = 3 WHERE id = 2;
    UPDATE gl_entries SET posted_by = 2, posting_method = 'automatic', approved_by = NULL WHERE id = 3;`);
  const original = toGlEntryApi(await entriesModel.getEntryById(2));
  expect(original).toMatchObject({
    createdBy: 1, creatorName: '制单员', approvedBy: '2', approverName: 'reviewer',
    postedById: 3, postedBy: '其他制单员', postedAt: '2026-10-17 20:48:14',
    approvedAt: '2026-10-17 20:47:31', postingMethod: 'manual', reversalEntryId: 3,
    isReversalEntry: false, reversalOfEntryId: null,
  });
  const reversal = toGlEntryApi(await entriesModel.getEntryById(3));
  expect(reversal).toMatchObject({ postedById: 2, postedBy: 'reviewer', approvedBy: null,
    approverName: null, approvedAt: null, postingMethod: 'automatic', isReversalEntry: true,
    reversalOfEntryId: 2, reversalEntryId: null });
  const list = await entriesModel.getEntries({ include_items: true }, 1, 10);
  expect(toGlEntryApi(list.entries.find(row => row.id === 2))).toEqual(original);
  expect(toGlEntryApi(list.entries.find(row => row.id === 3))).toEqual(reversal);
  // Canonical payloads can safely pass through the boundary mapper again.
  expect(toGlEntryApi(original)).toMatchObject({ postedById: 3, postedBy: '其他制单员',
    postedAt: '2026-10-17 20:48:14', approvedAt: '2026-10-17 20:47:31', postingMethod: 'manual', reversalEntryId: 3 });
});

test('automatic or orphaned posting identities never borrow the creator or approver name', async () => {
  fixture.exec("UPDATE gl_entries SET posted_by = NULL, posting_method = 'automatic', approved_by = NULL WHERE id = 2");
  expect(toGlEntryApi(await entriesModel.getEntryById(2))).toMatchObject({
    creatorName: '制单员', approverName: null, postedById: null, postedBy: null,
    postedAt: null, approvedAt: null, postingMethod: 'automatic',
  });
  fixture.exec('UPDATE gl_entries SET posted_by = 999, approved_by = 2 WHERE id = 2');
  expect(toGlEntryApi(await entriesModel.getEntryById(2))).toMatchObject({
    postedById: 999, postedBy: null, approverName: 'reviewer',
  });
});

test('timestamp mapping retains hours, minutes and seconds for Date values and preserves missing history', () => {
  const instant = new Date('2026-10-17T12:48:14.567Z');
  expect(toGlEntryApi({ id: 1, posted_at: instant, approved_at: instant })).toMatchObject({
    postedAt: '2026-10-17T12:48:14.567Z', approvedAt: '2026-10-17T12:48:14.567Z',
  });
  expect(toGlEntryApi({ id: 1, posted_at: '', approved_at: null })).toMatchObject({ postedAt: null, approvedAt: null });
});

test('business-link eligibility checks both link directions and exposes only a boolean', async () => {
  fixture.exec(`INSERT INTO document_links VALUES
    (1, 'ar_invoice', 987, 'finance_voucher', 2),
    (2, 'finance_voucher', 3, 'ap_invoice', 654),
    (3, 'ar_invoice', 1, 'sales_order', 1);
    UPDATE gl_entries SET transaction_type = 'manual', transaction_id = 321 WHERE id = 2;`);
  const list = await entriesModel.getEntries({}, 1, 10);
  for (const id of [1, 2, 3]) {
    const detail = toGlEntryApi(await entriesModel.getEntryById(id));
    expect(detail.hasBusinessLinks).toBe(id !== 1);
    expect(toGlEntryApi(list.entries.find(row => row.id === id)).hasBusinessLinks).toBe(id !== 1);
    expect(detail).not.toHaveProperty('documentLinks');
    expect(detail).not.toHaveProperty('sourceId');
    expect(detail).not.toHaveProperty('targetId');
  }
  expect(toGlEntryApi(await entriesModel.getEntryById(2))).toMatchObject({ transactionType: 'manual', transactionId: 321 });
});

test('a line batch failure releases the connection without returning an incomplete journal', async () => {
  const actualExecute = connection.execute.getMockImplementation();
  connection.execute.mockImplementation(async (sql, params) => {
    if (sql.includes('ORDER BY ei.entry_id')) throw new Error('line lookup unavailable');
    return actualExecute(sql, params);
  });
  await expect(entriesModel.getEntries({ include_items: true })).rejects.toThrow('line lookup unavailable');
  expect(connection.release).toHaveBeenCalledTimes(1);
});

test.each([undefined, false, 'false', '', 'yes', ['true']])('line inclusion is opt-in for %j', includeItems => {
  expect(fromGlEntryListQuery({ includeItems })).not.toHaveProperty('include_items');
});

test('the boolean includeItems API option is accepted', () => {
  expect(fromGlEntryListQuery({ includeItems: true })).toEqual({ include_items: true });
});
