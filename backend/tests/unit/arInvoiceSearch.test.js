/* global jest, beforeEach, afterEach, test, expect */
jest.mock('../../src/config/db', () => ({ getConnection: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));
jest.mock('../../src/models/finance', () => ({}));
jest.mock('../../src/config/accountingConfig', () => ({ accountingConfig: {} }));
jest.mock('../../src/config/financeConfig', () => ({ financeConfig: {} }));
jest.mock('../../src/services/business/DocumentLinkService', () => ({}));
jest.mock('../../src/services/finance/VoucherReversalService', () => ({}));
jest.mock('../../src/services/finance/SettlementCashService', () => ({}));

const { DatabaseSync } = require('node:sqlite');
const db = require('../../src/config/db');
const ar = require('../../src/models/ar');
const { fromInvoiceListQuery } = require('../../src/utils/finance/invoiceFieldMap');
let fixture, connection;
beforeEach(() => {
  jest.clearAllMocks();
  fixture = new DatabaseSync(':memory:');
  fixture.function('DATE_FORMAT', (value, _format) => value);
  fixture.exec(`
    CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE users (id INTEGER PRIMARY KEY, real_name TEXT, username TEXT);
    CREATE TABLE sales_orders (id INTEGER PRIMARY KEY, order_no TEXT, deleted_at TEXT);
    CREATE TABLE sales_outbound (id INTEGER PRIMARY KEY, order_id INTEGER, deleted_at TEXT);
    CREATE TABLE materials (id INTEGER PRIMARY KEY, code TEXT, name TEXT, specs TEXT);
    CREATE TABLE ar_invoice_items (id INTEGER PRIMARY KEY, invoice_id INTEGER, product_id INTEGER,
      description TEXT, quantity NUMERIC, unit_price NUMERIC, amount NUMERIC);
    CREATE TABLE ar_invoices (
      id INTEGER PRIMARY KEY, invoice_number TEXT, customer_id INTEGER, invoice_date TEXT,
      due_date TEXT, total_amount NUMERIC, amount_excluding_tax NUMERIC, tax_amount NUMERIC,
      tax_rate NUMERIC, paid_amount NUMERIC, balance_amount NUMERIC, status TEXT,
      currency_code TEXT, exchange_rate NUMERIC, terms TEXT, customer_invoice_number TEXT,
      source_type TEXT, source_id INTEGER, approved_by INTEGER, approved_at TEXT, created_by INTEGER, updated_by INTEGER,
      created_at TEXT, updated_at TEXT, notes TEXT
    );
    INSERT INTO customers VALUES (7, 'O''Reilly 客户'), (9, '其他客户');
  `);
  const insert = fixture.prepare(`INSERT INTO ar_invoices
    (id, invoice_number, customer_id, invoice_date, total_amount, paid_amount, balance_amount, status, customer_invoice_number, created_by)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`);
  const seed = (id, overrides = {}) => {
    const row = { customerId: 7, date: `2026-10-0${id}`, status: '已确认', owner: 7, customerNumber: '', ...overrides };
    insert.run(id, `AR-${id}`, row.customerId, row.date, id * 100, id * 100, row.status, row.customerNumber, row.owner);
  };
  seed(1); seed(2); seed(3, { date: '2026-09-30' }); seed(4, { owner: 99 });
  seed(5, { status: '已付款' }); seed(6, { customerId: 9, customerNumber: '客户-特批' });
  seed(7, { customerId: 999 });
  connection = { execute: jest.fn(async (sql, params) => [fixture.prepare(sql).all(...params)]), release: jest.fn() };
  db.getConnection.mockResolvedValue(connection);
});
afterEach(() => fixture.close());

test.each(['ar', 'ap'])('%s keyword maps independently without changing existing invoice filters', kind => {
  expect(fromInvoiceListQuery({ keyword: '  O\'Reilly  ', invoiceNumber: 'AR', status: '已确认' }, kind))
    .toEqual({ keyword: "O'Reilly", invoice_number: 'AR', status: '已确认' });
  expect(fromInvoiceListQuery({ keyword: ' ' }, kind)).toEqual({});
});

test('customer search keeps dates, status, scope and paginated totals aligned with bound input', async () => {
  const filters = { ...fromInvoiceListQuery({ keyword: "O'Reilly", startDate: '2026-10-01', endDate: '2026-10-17', status: '已确认' }, 'ar'),
    scopeClause: { join: '', where: ' AND a.created_by = ?', params: [7] } };
  const first = await ar.getInvoices(filters, 1, 1);
  const second = await ar.getInvoices(filters, 2, 1);
  expect(first.invoices.map(row => row.id)).toEqual([2]);
  expect(second.invoices.map(row => row.id)).toEqual([1]);
  expect(first.pagination).toEqual({ total: 2, page: 1, pageSize: 1, totalPages: 2 });
  expect(first.invoices[0]).toMatchObject({ totalAmount: 200, paidAmount: 0, balanceAmount: 200 });
  expect(first.invoices[0].createdBy).toBe(7);
  for (const [sql, params] of connection.execute.mock.calls) {
    expect(sql).not.toContain("O'Reilly");
    expect(params).toEqual(["%O'Reilly%", "%O'Reilly%", "%O'Reilly%", '2026-10-01', '2026-10-17', '已确认', 7]);
  }
  expect(connection.release).toHaveBeenCalledTimes(2);
});

test.each([['AR-6', 6], ['客户-特批', 6], ['AR-7', 7]])('searches invoice and customer invoice numbers including missing customer master data: %s', async (keyword, id) => {
  const result = await ar.getInvoices(fromInvoiceListQuery({ keyword }, 'ar'));
  expect(result.invoices.map(row => row.id)).toEqual([id]);
  expect(result.pagination.total).toBe(1);
});

test('invoice list returns the stored eight-digit USD rate needed by the receipt form', async () => {
  fixture.exec("UPDATE ar_invoices SET currency_code = 'USD', exchange_rate = 6.50000001 WHERE id = 6");
  const result = await ar.getInvoices({ invoice_number: 'AR-6' });
  expect(result.invoices).toEqual([expect.objectContaining({ id: 6, currencyCode: 'USD', exchangeRate: 6.50000001, totalAmount: 600 })]);
});

test('invoice detail and edit source retain the actual creator, editor and update date', async () => {
  fixture.exec("UPDATE ar_invoices SET created_by = 75, updated_by = 76, updated_at = '2026-10-17', currency_code = 'USD', exchange_rate = 6.50000001 WHERE id = 6");
  const result = await ar.getInvoiceById(6);
  expect(result).toMatchObject({ id: 6, createdBy: 75, updatedBy: 76, updatedAt: '2026-10-17', currencyCode: 'USD', exchangeRate: 6.50000001, totalAmount: 600 });
});
