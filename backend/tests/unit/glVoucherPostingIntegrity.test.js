/* global jest, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/config/financeConfig', () => ({ financeConfig: { get: (_key, fallback) => fallback } }));

const db = require('../../src/config/db');
const entriesModel = require('../../src/models/finance/entries');

function fixture({ patch = {}, entryPatch = {}, missingTable } = {}) {
  const entry = { id: 9, entry_date: '2026-10-17', posting_date: '2026-10-17', period_id: 1,
    created_by: 3, document_type: '记账凭证', transaction_type: '记账凭证', transaction_id: null,
    has_business_links: 0, is_posted: 0, is_reversed: 0, is_closed: 0, is_locked: 0,
    period_name: '2026-10', start_date: '2026-10-01', end_date: '2026-10-31', ...entryPatch };
  const items = [
    { id: 90, entry_id: 9, line_number: 1, account_id: 1, active_account_id: 1, account_code: '100202', account_currency_code: 'USD',
      debit_amount: '678.09', credit_amount: 0, currency_code: 'USD', exchange_rate: '6.78090000', foreign_amount: '100.00',
      customer_id: 12, has_customer: 1, ...patch },
    { id: 91, entry_id: 9, line_number: 2, account_id: 2, active_account_id: 2, debit_amount: 0, credit_amount: '678.09', currency_code: 'CNY', exchange_rate: 1 },
  ];
  const connection = {
    execute: jest.fn(async (sql) => {
      if (sql.includes('FROM gl_entries e')) return [[entry]];
      if (sql.includes('FROM gl_entry_items ei')) return [items];
      if (sql.includes('UPDATE gl_entries')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    }),
    query: jest.fn(async (sql, ids) => [sql.includes(`FROM ${missingTable} `) ? [] : ids.map((id) => ({ id }))]),
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
  };
  db.pool.getConnection.mockResolvedValue(connection);
  return { connection, items };
}

test('USD draft posting revalidates saved source amounts and locks required masters before updating', async () => {
  const { connection } = fixture();
  await expect(entriesModel.postEntry(9, 4)).resolves.toBe(true);
  const lineRead = connection.execute.mock.calls.find(([sql]) => sql.includes('FROM gl_entry_items'));
  expect(lineRead[0]).toContain('FOR UPDATE');
  expect(lineRead[0]).toContain('a.currency_code AS account_currency_code');
  expect(connection.query.mock.calls[0][0]).toContain('FROM customers');
  expect(connection.query.mock.calls[0][0]).toContain('LOCK IN SHARE MODE');
  const updateCall = connection.execute.mock.calls.findIndex(([sql]) => sql.includes('UPDATE gl_entries'));
  expect(connection.query.mock.invocationCallOrder[0]).toBeLessThan(connection.execute.mock.invocationCallOrder[updateCall]);
  expect(connection.execute.mock.calls[updateCall][1]).toEqual([1, '4', 4, 9]);
  expect(connection.commit).toHaveBeenCalled();
  expect(connection.rollback).not.toHaveBeenCalled();
});

test.each([
  [{ patch: { currency_code: 'CNY', exchange_rate: 1, foreign_amount: null } }, '美元专户'],
  [{ patch: { foreign_amount: null } }, '原币金额'],
  [{ patch: { foreign_amount: 99.99 } }, '不一致'],
  [{ patch: { exchange_rate: 0 } }, '汇率'],
  [{ patch: { customer_id: null } }, '客户辅助核算'],
  [{ patch: { active_account_id: null } }, '会计科目'],
  [{ patch: { employee_id: 99, employee_source: null } }, '明确来源'],
  [{ missingTable: 'customers' }, '客户不存在'],
  [{ patch: { department_id: 8 }, missingTable: 'departments' }, '部门不存在'],
  [{ patch: { cost_center_id: 8 }, missingTable: 'cost_centers' }, '成本中心不存在'],
  [{ entryPatch: { is_closed: 1 } }, '已关闭'],
  [{ entryPatch: { is_locked: 1 } }, '已锁定'],
])('posting rejects stale or incomplete saved evidence without partial writes: %p', async (options, message) => {
  const { connection } = fixture(options);
  await expect(entriesModel.postEntry(9, 4)).rejects.toThrow(message);
  expect(connection.execute.mock.calls.some(([sql]) => sql.includes('UPDATE gl_entries'))).toBe(false);
  expect([...connection.execute.mock.calls, ...connection.query.mock.calls].some(([sql]) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
  expect(connection.rollback).toHaveBeenCalled();
  expect(connection.commit).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalled();
});

test('USD on a general CNY control account remains valid for manual posting', async () => {
  const { connection } = fixture({ patch: { account_currency_code: 'CNY' } });
  await expect(entriesModel.postEntry(9, 4)).resolves.toBe(true);
  expect(connection.commit).toHaveBeenCalled();
});

test.each([
  { document_type: 'invoice' }, { transaction_type: 'ar_receipt' }, { transaction_id: 100 },
  { has_business_links: 1 }, { posting_method: 'automatic' },
])('automatic or linked drafts keep their original account-currency policy: %p', async entryPatch => {
  const { connection } = fixture({ entryPatch, patch: { currency_code: 'CNY', exchange_rate: 1, foreign_amount: null } });
  await expect(entriesModel.postEntry(9, 4)).resolves.toBe(true);
  expect(connection.commit).toHaveBeenCalled();
});

test('preserves separation of creator and reviewer', async () => {
  const { connection } = fixture();
  await expect(entriesModel.postEntry(9, 3)).rejects.toMatchObject({ errorCode: 'SEPARATION_OF_DUTIES' });
  expect(connection.execute).toHaveBeenCalledTimes(1);
  expect(connection.commit).not.toHaveBeenCalled();
});

test('accepts a saved explicit invoice rounding residual, maintaining exact base balance', async () => {
  const { connection, items } = fixture({ patch: {
    foreign_amount: 99.99, debit_amount: 678.03, base_rounding_adjustment: '0.01',
  } });
  items[1].credit_amount = 678.03;
  await expect(entriesModel.postEntry(9, 4)).resolves.toBe(true);
  expect(connection.commit).toHaveBeenCalled();
});
