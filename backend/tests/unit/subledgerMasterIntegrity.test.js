jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() } }));
const db = require('../../src/config/db');
const accounts = require('../../src/models/cash/Account');
const ap = require('../../src/models/ap');

describe('subledger master data conservation', () => {
  let connection;
  beforeEach(() => {
    connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), execute: jest.fn(), query: jest.fn() };
    db.pool.getConnection.mockResolvedValue(connection);
  });

  test.each([
    [{ currency_code: 'CNY', opening_balance: 50 }, []],
    [{ currency_code: 'CNY', current_balance: 20 }, []],
    [{ currency_code: 'CNY' }, [{ id: 8 }]],
  ])('currency cannot reinterpret existing balances or journals', async (account, history) => {
    connection.execute.mockResolvedValueOnce([[account]]).mockResolvedValueOnce([history]);
    await expect(accounts.updateBankAccount(1, { currency_code: 'USD' })).rejects.toThrow('不能变更币种');
    expect(connection.execute.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(connection.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  test('metadata update preserves omitted currency and frozen state', async () => {
    connection.execute.mockResolvedValueOnce([[{ currency_code: 'USD', is_active: 0, account_type: '定期' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    await accounts.updateBankAccount(1, { account_number: '100', account_name: 'bank', bank_name: 'test' });
    expect(connection.execute.mock.calls[1][1].slice(4, 7)).toEqual(['USD', '定期', 0]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test('AP draft balance is derived from the locked record, not client paid_amount', async () => {
    connection.execute.mockResolvedValueOnce([[{ id: 1, status: '草稿', paid_amount: 0 }]])
      .mockResolvedValue([{ affectedRows: 1 }]);
    await ap.updateInvoice({ id: 1, invoice_number: 'AP1', supplier_id: 3, invoice_date: '2026-10-15', due_date: '2026-10-15', total_amount: 100, amount_excluding_tax: 100, tax_amount: 0, tax_rate: 0, paid_amount: 99 });
    const [, params] = connection.execute.mock.calls.find(([sql]) => sql.includes('UPDATE ap_invoices'));
    expect(params[9]).toBe(100);
  });
});
