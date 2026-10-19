/* global jest, describe, beforeEach, afterEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { execute: jest.fn(), getConnection: jest.fn() } }));
jest.mock('../../src/models/finance', () => ({}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({}));
jest.mock('../../src/services/finance/VoucherReversalService', () => ({}));
jest.mock('../../src/services/finance/SettlementCashService', () => ({}));
jest.mock('../../src/models/cash/Account', () => ({}));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));

const { DatabaseSync } = require('node:sqlite');
const db = require('../../src/config/db');
const ar = require('../../src/models/ar');
const ap = require('../../src/models/ap');
const arController = require('../../src/controllers/business/finance/arController');
const apController = require('../../src/controllers/business/finance/apController');
let fixture;
let connection;
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

beforeEach(() => {
  jest.clearAllMocks();
  fixture = new DatabaseSync(':memory:');
  fixture.function('CURDATE', () => '2026-10-17');
  fixture.function('DATEDIFF', (left, right) => Math.floor((new Date(left) - new Date(right)) / 86400000));
  fixture.exec(`
    CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, contact_person TEXT, contact_phone TEXT, email TEXT, status TEXT);
    CREATE TABLE suppliers (id INTEGER PRIMARY KEY, name TEXT, contact_person TEXT, contact_phone TEXT, email TEXT, status INTEGER);
    INSERT INTO customers VALUES (1, '往来甲', '联系人', '123', 'test@example.test', 'active'), (2, '空客户', NULL, NULL, NULL, 'active');
    INSERT INTO suppliers VALUES (1, '往来甲', '联系人', '123', 'test@example.test', 1), (2, '空供应商', NULL, NULL, NULL, 1);
  `);
  for (const [kind, party] of [['ar', 'customer'], ['ap', 'supplier']]) {
    fixture.exec(`CREATE TABLE ${kind}_invoices (
      id INTEGER PRIMARY KEY, ${party}_id INTEGER, invoice_number TEXT, invoice_date TEXT, due_date TEXT,
      total_amount NUMERIC, paid_amount NUMERIC, balance_amount NUMERIC, currency_code TEXT, exchange_rate NUMERIC, status TEXT
    )`);
  }
  const execute = jest.fn(async (sql, params = []) => [fixture.prepare(sql).all(...params)]);
  connection = { execute, release: jest.fn() };
  db.pool.execute.mockImplementation(execute);
  db.pool.getConnection.mockResolvedValue(connection);
});

afterEach(() => fixture.close());

function invoice(kind, id, overrides = {}) {
  const party = kind === 'ar' ? 'customer' : 'supplier';
  const row = { id, [`${party}_id`]: 1, invoice_number: `${kind}-${id}`, invoice_date: '2026-10-17', due_date: '2026-10-31',
    total_amount: 100, paid_amount: 20, balance_amount: 80, currency_code: 'CNY', exchange_rate: 1, status: '部分付款', ...overrides };
  fixture.prepare(`INSERT INTO ${kind}_invoices (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
}

describe.each([
  ['ar', ar.getCustomerReceivablesSummary, arController.getCustomerReceivablesById, 'customerName'],
  ['ap', ap.getSupplierPayablesSummary, apController.getSupplierPayablesById, 'supplierName'],
])('%s party original-currency summaries', (kind, list, detail, nameKey) => {
  test('mixed currencies stay separate through real SQL and the HTTP response, including legacy missing USD rates', async () => {
    invoice(kind, 1);
    invoice(kind, 2, { currency_code: 'USD', exchange_rate: 7.12345678, total_amount: 10, paid_amount: 2, balance_amount: 8 });
    invoice(kind, 3, { currency_code: 'USD', exchange_rate: null, total_amount: 5, paid_amount: 0, balance_amount: 5, status: '已确认' });
    for (const [offset, status] of ['草稿', '已取消', 'void', '已付款'].entries()) invoice(kind, offset + 10, { status, total_amount: 999, balance_amount: 999 });
    const expected = {
      amountBasis: 'original', hasMixedCurrencies: true, currencyCode: null,
      invoiceCount: 3, totalAmount: null, paidAmount: null, balance: null,
      currencyTotals: [
        { currencyCode: 'CNY', invoiceCount: 1, totalAmount: 100, paidAmount: 20, balance: 80 },
        { currencyCode: 'USD', invoiceCount: 2, totalAmount: 15, paidAmount: 2, balance: 13 },
      ],
    };
    expect(await list()).toEqual([expect.objectContaining(expected)]);
    const res = response();
    await detail({ params: { id: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining(expected));
    expect(data.invoices).toHaveLength(3);
    expect(data.invoices.find(row => row.id === 2)).toEqual(expect.objectContaining({ currencyCode: 'USD', exchangeRate: 7.12345678, totalAmount: 10, paidAmount: 2, balance: 8, amountBasis: 'original' }));
    expect(data.invoices.find(row => row.id === 3).exchangeRate).toBeNull();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test('CNY and legacy empty currency keep the existing numeric totals', async () => {
    invoice(kind, 1, { total_amount: 125.25, paid_amount: 15.25, balance_amount: 110, currency_code: null });
    invoice(kind, 2, { total_amount: 74.75, paid_amount: 4.75, balance_amount: 70, currency_code: ' cny ' });
    expect(await list()).toEqual([expect.objectContaining({ currencyCode: 'CNY', hasMixedCurrencies: false, totalAmount: 200, paidAmount: 20, balance: 180, invoiceCount: 2,
      currencyTotals: [{ currencyCode: 'CNY', invoiceCount: 2, totalAmount: 200, paidAmount: 20, balance: 180 }] })]);
  });

  test('a single USD group is labeled and keeps its original amount without conversion', async () => {
    invoice(kind, 1, { currency_code: 'USD', exchange_rate: null, total_amount: 0.03, paid_amount: 0.01, balance_amount: 0.02 });
    expect(await list()).toEqual([expect.objectContaining({ currencyCode: 'USD', hasMixedCurrencies: false, totalAmount: 0.03, paidAmount: 0.01, balance: 0.02 })]);
  });

  test('empty parties have a CNY zero detail and are absent from the balance list', async () => {
    expect(await list()).toEqual([]);
    const res = response();
    await detail({ params: { id: 2 } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toEqual(expect.objectContaining({ currencyCode: 'CNY', amountBasis: 'original', totalAmount: 0, paidAmount: 0, balance: 0, invoiceCount: 0, hasMixedCurrencies: false, currencyTotals: [], invoices: [] }));
    const missing = response();
    await detail({ params: { id: 999 } }, missing);
    expect(missing.status).toHaveBeenCalledWith(404);
  });

  test('filters constrain each currency group without losing a negative other-currency balance', async () => {
    invoice(kind, 1);
    invoice(kind, 2, { currency_code: 'USD', total_amount: -200, paid_amount: 0, balance_amount: -200 });
    invoice(kind, 3, { total_amount: 999, balance_amount: 999, status: '已确认' });
    const rows = await list({ [nameKey]: '往来', status: '部分付款' });
    expect(rows).toHaveLength(1);
    expect(rows[0].balance).toBeNull();
    expect(rows[0].currencyTotals).toEqual([
      { currencyCode: 'CNY', invoiceCount: 1, totalAmount: 100, paidAmount: 20, balance: 80 },
      { currencyCode: 'USD', invoiceCount: 1, totalAmount: -200, paidAmount: 0, balance: -200 },
    ]);
    expect(db.pool.execute.mock.calls[0][1]).toEqual(['%往来%', '部分付款']);
  });
});
