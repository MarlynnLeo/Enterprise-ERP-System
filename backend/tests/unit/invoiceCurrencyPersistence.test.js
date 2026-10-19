/* global jest, describe, beforeEach, test, expect */
jest.mock('../../src/config/db', () => ({ getConnection: jest.fn(), pool: { getConnection: jest.fn() } }));
jest.mock('../../src/models/finance', () => ({ createEntry: jest.fn() }));
jest.mock('../../src/services/business/DocumentLinkService', () => ({ tryAutoLink: jest.fn() }));
jest.mock('../../src/services/finance/VoucherReversalService', () => ({}));
jest.mock('../../src/services/finance/SettlementCashService', () => ({}));
jest.mock('../../src/config/accountingConfig', () => ({ accountingConfig: { getAccountCode: jest.fn() } }));
jest.mock('../../src/config/financeConfig', () => ({ financeConfig: { get: jest.fn(() => 'USD') } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));

const db = require('../../src/config/db');
const ar = require('../../src/models/ar');
const ap = require('../../src/models/ap');
const { resolveVoucherCurrency } = require('../../src/services/finance/invoiceVoucherLines');
let connection;
let current;
const draft = () => ({
  id: 1, invoice_number: 'TEST-USD-1', customer_id: 1, supplier_id: 2,
  invoice_date: '2026-10-17', due_date: '2026-10-31', status: '草稿',
  total_amount: 100, amount_excluding_tax: 100, tax_amount: 0, tax_rate: 0,
  paid_amount: 0, balance_amount: 100, currency_code: 'USD', exchange_rate: '7.12345678',
});

beforeEach(() => {
  jest.clearAllMocks();
  current = draft();
  const query = jest.fn(async sql => {
    if (/SELECT id, status/.test(sql)) return [[current]];
    if (/INSERT INTO (ar|ap)_invoices/.test(sql)) return [{ insertId: 71 }];
    if (/UPDATE (ar|ap)_invoices/.test(sql)) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  });
  connection = { query, execute: query, beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
  db.getConnection.mockResolvedValue(connection);
  db.pool.getConnection.mockResolvedValue(connection);
});

describe.each([['ar', ar], ['ap', ap]])('%s invoice currency evidence', (kind, model) => {
  test.each([undefined, null, '', 0, -1, '7.123456789', true])('rejects USD with invalid rate %s before inserting', async rate => {
    await expect(model.createInvoice({ ...draft(), exchange_rate: rate })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
    expect(connection.query).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('stores all eight submitted exchange-rate decimals', async () => {
    await expect(model.createInvoice({ ...draft(), created_by: 75, updated_by: 999 })).resolves.toBe(71);
    const [sql, params] = connection.query.mock.calls.find(([sql]) => /INSERT INTO/.test(sql));
    expect(sql).toContain(`${kind}_invoices`);
    expect(params.slice(10, 12)).toEqual(['USD', 7.12345678]);
    expect(params.slice(-2)).toEqual([75, 75]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test('missing currency means CNY at one, regardless of a default USD finance setting', async () => {
    const invoice = draft();
    delete invoice.currency_code;
    delete invoice.exchange_rate;
    await model.createInvoice(invoice);
    const [, params] = connection.query.mock.calls.find(([sql]) => /INSERT INTO/.test(sql));
    expect(params.slice(10, 12)).toEqual(['CNY', 1]);
  });

  test('draft edits keep the recorded USD rate when the request omits currency fields', async () => {
    const invoice = draft();
    delete invoice.currency_code;
    delete invoice.exchange_rate;
    await expect(model.updateInvoice(invoice)).resolves.toBe(true);
    const [sql, params] = connection.execute.mock.calls.find(([sql]) => /^UPDATE/.test(sql));
    expect(sql).toContain('currency_code = ?');
    expect(sql).toContain('exchange_rate = ?');
    expect(params.slice(10, 12)).toEqual(['USD', 7.12345678]);
  });

  test('draft edits persist a new explicit actual USD rate', async () => {
    await model.updateInvoice({ ...draft(), exchange_rate: 7.98765432, updated_by: 76 });
    const [sql, params] = connection.execute.mock.calls.find(([sql]) => /^UPDATE/.test(sql));
    expect(params.slice(10, 12)).toEqual(['USD', 7.98765432]);
    expect(sql).toContain('updated_by = COALESCE(?, updated_by)');
    expect(params.at(-2)).toBe(76);
    expect(sql).not.toContain('created_by =');
  });

  test('changing a draft from CNY to USD cannot inherit the CNY rate', async () => {
    Object.assign(current, { currency_code: 'CNY', exchange_rate: 1 });
    const invoice = draft();
    delete invoice.exchange_rate;
    await expect(model.updateInvoice(invoice)).rejects.toMatchObject({ statusCode: 400 });
    expect(connection.execute.mock.calls.some(([sql]) => /^UPDATE/.test(sql))).toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  test('changing a draft to CNY resets only the CNY rate to one', async () => {
    const invoice = { ...draft(), currency_code: 'CNY' };
    delete invoice.exchange_rate;
    await model.updateInvoice(invoice);
    const [, params] = connection.execute.mock.calls.find(([sql]) => /^UPDATE/.test(sql));
    expect(params.slice(10, 12)).toEqual(['CNY', 1]);
  });

  test.each([{ exchange_rate: 7.2 }, { currency_code: 'CNY', exchange_rate: 1 }])('confirmed currency evidence is frozen: %j', async update => {
    current.status = '已确认';
    await expect(model.updateInvoice({ id: 1, ...update })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
    expect(connection.execute.mock.calls.some(([sql]) => /^UPDATE/.test(sql))).toBe(false);
  });

  test('confirmed notes-only edit preserves even legacy incomplete currency evidence', async () => {
    current.status = '已确认';
    current.exchange_rate = null;
    await expect(model.updateInvoice({ id: 1, notes: 'checked source', updated_by: 76 })).resolves.toBe(true);
    const [sql, params] = connection.execute.mock.calls.find(([sql]) => /^UPDATE/.test(sql));
    expect(sql).not.toContain('exchange_rate =');
    expect(sql).toContain('updated_by = COALESCE(?, updated_by)');
    expect(params.at(-2)).toBe(76);
    expect(sql).not.toContain('created_by =');
  });
});

test('the shared currency resolver rejects excess precision before any DB rounding', () => {
  expect(() => resolveVoucherCurrency({ currencyCode: 'USD', exchangeRate: '7.123456789' })).toThrow('最多8位');
});
