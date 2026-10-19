/* global jest, beforeEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/utils/userUtils', () => ({ resolveActorUserId: jest.fn().mockResolvedValue(99) }));

const db = require('../../src/config/db');
const GLService = require('../../src/services/finance/GLService');
const entries = require('../../src/models/finance/entries');
const header = { period_id: 1, entry_date: '2026-10-17', entry_number: 'MANUAL-USD', voucher_number: 1, document_type: '记账凭证' };
const pair = patch => [
  { account_id: 1, debit_amount: '678.09', currency_code: 'USD', exchange_rate: '6.78090000', foreign_amount: '100.00', ...patch },
  { account_id: 2, credit_amount: '678.09', currency_code: 'CNY', exchange_rate: 1 },
];
const cny = { currency_code: 'CNY', exchange_rate: 1, foreign_amount: null };
let connection;
let accountCurrency;

beforeEach(() => {
  jest.clearAllMocks();
  accountCurrency = 'USD';
  connection = {
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    execute: jest.fn(async sql => {
      if (sql.includes('FROM gl_periods')) return [[{ id: 1, is_closed: 0, is_locked: 0, start_date: '2026-10-01', end_date: '2026-10-31' }]];
      if (sql.includes('INSERT INTO gl_entries')) return [{ insertId: 35 }];
      return [[]];
    }),
    query: jest.fn(async sql => {
      if (sql.includes('FROM gl_accounts')) return [[{ id: 1, account_code: '100202', currency_code: accountCurrency }, { id: 2, account_code: '1122', currency_code: 'CNY' }]];
      if (sql.includes('INSERT INTO gl_entry_items')) return [{ affectedRows: 2 }];
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
  db.pool.getConnection.mockResolvedValue(connection);
});

const writes = () => [...connection.execute.mock.calls, ...connection.query.mock.calls].filter(([sql]) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql));

test('manual creation rejects CNY in a USD account under the account lock before any writes', async () => {
  await expect(GLService.createEntry(header, pair(cny), null, { requireManualAccountCurrency: true })).rejects.toThrow('第1行科目 100202 为美元专户');
  const accountRead = connection.query.mock.calls.find(([sql]) => sql.includes('FROM gl_accounts'))[0];
  expect(accountRead).toContain('currency_code');
  expect(accountRead).toContain('LOCK IN SHARE MODE');
  expect(writes()).toEqual([]);
  expect(connection.rollback).toHaveBeenCalled();
  expect(connection.commit).not.toHaveBeenCalled();
});

test.each(['USD', 'CNY'])('manual creation permits explicit USD evidence on a %s account', async currency => {
  accountCurrency = currency;
  await expect(GLService.createEntry(header, pair(), null, { requireManualAccountCurrency: true })).resolves.toBe(35);
  const [itemSql, [values]] = connection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO gl_entry_items'));
  const columns = itemSql.match(/\(([^)]+)\)/)[1].split(',').map(value => value.trim());
  const saved = Object.fromEntries(columns.map((column, i) => [column, values[0][i]]));
  expect(saved).toMatchObject({ currency_code: 'USD', exchange_rate: '6.78090000', foreign_amount: '100.00', debit_amount: 678.09 });
  expect(connection.commit).toHaveBeenCalled();
});

test.each([{ exchange_rate: null }, { foreign_amount: null }, { foreign_amount: 99.99 }])('manual USD account creation still requires valid original-currency evidence: %p', async patch => {
  await expect(GLService.createEntry(header, pair(patch), null, { requireManualAccountCurrency: true })).rejects.toThrow();
  expect(writes()).toEqual([]);
});

test('automatic GL does not inherit the manual-only currency restriction', async () => {
  await expect(GLService.createEntry({ ...header, document_type: 'invoice' }, pair(cny))).resolves.toBe(35);
  expect(connection.commit).toHaveBeenCalled();
});

test('controlled reversal preserves historical CNY values on USD accounts', async () => {
  const original = { id: 7, entry_number: 'LEGACY-7', document_type: '记账凭证', transaction_type: '记账凭证', is_posted: 1, is_reversed: 0, created_by: 2 };
  const baseExecute = connection.execute.getMockImplementation();
  connection.execute.mockImplementation(async (sql, params) => {
    if (sql.includes('SELECT * FROM gl_entries WHERE id = ?')) return [[original]];
    if (sql.includes('FROM gl_entry_items')) return [pair(cny)];
    return baseExecute(sql, params);
  });
  jest.spyOn(GLService, 'nextVoucherNumber').mockResolvedValue(2);
  jest.spyOn(GLService, 'generateEntryNumber').mockResolvedValue('REV-7');
  await expect(entries.reverseEntry(7, { entry_date: '2026-10-17', created_by: 99, requireManualSource: true }, connection)).resolves.toBe(35);
  const [itemSql, [values]] = connection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO gl_entry_items'));
  const columns = itemSql.match(/\(([^)]+)\)/)[1].split(',').map(value => value.trim());
  const saved = Object.fromEntries(columns.map((column, i) => [column, values[0][i]]));
  expect(saved).toMatchObject({ currency_code: 'CNY', exchange_rate: 1, foreign_amount: null, debit_amount: 0, credit_amount: 678.09 });
});
