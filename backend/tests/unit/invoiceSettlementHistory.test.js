/* global jest, beforeEach, afterEach, test, expect */
jest.mock('../../src/config/db', () => ({ getConnection: jest.fn(), pool: { execute: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../../src/models/finance', () => ({}));
jest.mock('../../src/config/accountingConfig', () => ({ accountingConfig: {} }));
jest.mock('../../src/config/financeConfig', () => ({ financeConfig: {} }));
jest.mock('../../src/services/business/DocumentLinkService', () => ({}));
jest.mock('../../src/services/finance/VoucherReversalService', () => ({}));
jest.mock('../../src/services/finance/SettlementCashService', () => ({}));
const { DatabaseSync } = require('node:sqlite');
const db = require('../../src/config/db');
const ar = require('../../src/models/ar');
const ap = require('../../src/models/ap');
let fixture;
let connection;

beforeEach(() => {
  jest.clearAllMocks();
  fixture = new DatabaseSync(':memory:');
  fixture.function('DATE_FORMAT', (value, _format) => value);
  fixture.exec(`CREATE TABLE users (id INTEGER, real_name TEXT, username TEXT);
    INSERT INTO users VALUES (76, '财务审核人', 'auditor');
    CREATE TABLE materials (id INTEGER, code TEXT, name TEXT, specs TEXT);
    INSERT INTO materials VALUES (1, 'MAT-1', '物料', '规格');
    CREATE TABLE ar_invoice_items (id INTEGER, invoice_id INTEGER, product_id INTEGER,
      description TEXT, quantity NUMERIC, unit_price NUMERIC, amount NUMERIC);`);
  for (const kind of ['ar', 'ap']) {
    const action = kind === 'ar' ? 'receipt' : 'payment';
    fixture.exec(`CREATE TABLE ${kind}_${action}s (id INTEGER, ${action}_number TEXT, ${action}_date TEXT,
      payment_method TEXT, reference_number TEXT, currency_code TEXT, exchange_rate NUMERIC, base_amount NUMERIC,
      status TEXT, voided_by INTEGER, void_reason TEXT, voided_at TEXT, created_at TEXT, notes TEXT);
      CREATE TABLE ${kind}_${action}_items (id INTEGER, ${action}_id INTEGER, invoice_id INTEGER,
        amount NUMERIC, discount_amount NUMERIC, base_settlement_amount NUMERIC);`);
    for (let id = 1; id <= 31; id++) {
      const isVoid = id === 5;
      fixture.prepare(`INSERT INTO ${kind}_${action}s VALUES (?, ?, '2026-10-17', '银行转账', 'REF', ?, ?, ?, ?, ?, ?, ?, '2026-10-17 12:00:00', 'history')`)
        .run(id, `${kind}-${id}`, id === 30 ? null : 'USD', id === 30 ? null : 6.50000001, id === 30 ? null : 0.07,
          isVoid ? 'void' : 'normal', isVoid ? 76 : null, isVoid ? '测试作废原因' : null, isVoid ? '2026-10-17 13:00:00' : null);
      fixture.prepare(`INSERT INTO ${kind}_${action}_items VALUES (?, ?, ?, 0.01, 0, ?)`)
        .run(id + 100, id, id === 31 ? 2 : 1, id === 30 ? null : 0.07);
    }
  }
  const execute = jest.fn(async (sql, values = []) => [fixture.prepare(sql).all(...values)]);
  connection = { execute, release: jest.fn() };
  db.getConnection.mockResolvedValue(connection);
  db.pool.execute.mockImplementation(execute);
});
afterEach(() => fixture.close());

test.each([['ar', ar], ['ap', ap]])('%s returns every allocation with stable order, original currency and explicit void evidence', async (kind, model) => {
  const rows = await model.getInvoicePayments(1);
  expect(rows).toHaveLength(30);
  expect(rows.map(row => row.itemId)).toEqual(Array.from({ length: 30 }, (_, i) => 130 - i));
  expect(rows[0]).toMatchObject({ currencyCode: null, exchangeRate: null, baseSettlementAmount: null, amount: 0.01 });
  expect(rows.find(row => row.itemId === 105)).toMatchObject({
    invoiceId: 1, status: 'void', voidedBy: 76, voidedByName: '财务审核人', voidReason: '测试作废原因',
    voidedAt: '2026-10-17 13:00:00', currencyCode: 'USD', exchangeRate: 6.50000001,
    amount: 0.01, discountAmount: 0, settlementAmount: 0.01, baseSettlementAmount: 0.07,
    [kind === 'ar' ? 'receiptNumber' : 'paymentNumber']: `${kind}-5`, paymentDate: '2026-10-17',
  });
  expect(rows.filter(row => row.status === 'normal')).toHaveLength(29);
  expect(connection.execute.mock.calls[0][1]).toEqual([1]);
});

test('the dedicated AR invoice-item endpoint no longer loses lines after number 50', async () => {
  const insert = fixture.prepare("INSERT INTO ar_invoice_items VALUES (?, 1, 1, '完整明细', 1, 0.01, 0.01)");
  for (let id = 1; id <= 60; id++) insert.run(id);
  const rows = await ar.getInvoiceItems(1);
  expect(rows).toHaveLength(60);
  expect(rows.at(-1)).toMatchObject({ id: 60, unitPrice: 0.01, amount: 0.01 });
});
