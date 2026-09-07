jest.mock('../../src/config/db', () => ({
  getConnection: jest.fn(),
  pool: { getConnection: jest.fn(), execute: jest.fn() },
}));
jest.mock('../../src/models/finance', () => ({}));
jest.mock('../../src/services/finance/PaymentApprovalGuard', () => ({
  assertPayable: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const db = require('../../src/config/db');
const apModel = require('../../src/models/ap');
const arModel = require('../../src/models/ar');
const BankTransactionModel = require('../../src/models/cash/Transaction');
const { getPoolConfig } = require('../../src/config/database-config');
const { INVOICE_STATUS } = require('../../src/constants/financeConstants');

describe('frozen bank accounts across cash settlement entry points', () => {
  beforeEach(() => jest.clearAllMocks());

  function frozenConnection(isActive, kind) {
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
      execute: jest.fn(async (sql) => {
        if (/FROM bank_accounts/.test(sql)) {
          return [[{
            id: 2,
            account_name: 'Frozen account',
            currency_code: 'CNY',
            current_balance: 1000,
            is_active: isActive,
          }]];
        }
        if (/FROM (ap|ar)_invoices/.test(sql)) {
          return [[{
            id: 3,
            invoice_number: 'INV-3',
            supplier_id: 4,
            customer_id: 4,
            total_amount: 100,
            paid_amount: 0,
            balance_amount: 100,
            currency_code: 'CNY',
            exchange_rate: 1,
            status: INVOICE_STATUS.CONFIRMED,
          }]];
        }
        if (/INSERT INTO (ap_payments|ar_receipts|ap_payment_items|ar_receipt_items)/.test(sql)) {
          return [{ insertId: 10, affectedRows: 1 }];
        }
        if (/UPDATE (ap|ar)_invoices/.test(sql)) return [{ affectedRows: 1 }];
        if (kind === 'cash' && /INSERT INTO bank_transactions/.test(sql)) {
          return [{ insertId: 10 }];
        }
        throw new Error(`Unexpected operation after frozen-account validation: ${sql}`);
      }),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    db.getConnection.mockResolvedValue(connection);
    return connection;
  }

  test('MySQL TINYINT(1) decoding returns boolean false for a frozen account', () => {
    expect(getPoolConfig().typeCast({ type: 'TINY', length: 1, string: () => '0' }, jest.fn()))
      .toBe(false);
  });

  test.each([false, 0, '0'])('AP payment rejects frozen account flag %p and rolls back', async (flag) => {
    const connection = frozenConnection(flag, 'ap');

    await expect(apModel.createPayment({
      payment_number: 'PAY-1', supplier_id: 4, payment_date: '2026-09-05',
      total_amount: 100, payment_method: '银行转账', bank_account_id: 2, created_by: 1,
    }, [{ invoice_id: 3, amount: 100 }])).rejects.toThrow(/已被冻结/);

    expect(connection.execute.mock.calls.some(([sql]) => /INSERT INTO bank_transactions/.test(sql)))
      .toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test.each([false, 0, '0'])('AR receipt rejects frozen account flag %p and rolls back', async (flag) => {
    const connection = frozenConnection(flag, 'ar');

    await expect(arModel.createReceipt({
      receipt_number: 'RCPT-1', customer_id: 4, receipt_date: '2026-09-05',
      total_amount: 100, payment_method: '银行转账', bank_account_id: 2, created_by: 1,
    }, [{ invoice_id: 3, amount: 100 }])).rejects.toThrow(/已被冻结/);

    expect(connection.execute.mock.calls.some(([sql]) => /INSERT INTO bank_transactions/.test(sql)))
      .toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test.each([false, 0, '0'])('cash transaction rejects inactive account flag %p', async (flag) => {
    const connection = frozenConnection(flag, 'cash');

    await expect(BankTransactionModel.createBankTransaction({
      transaction_number: 'BANK-1', bank_account_id: 2, created_by: 1,
      transaction_date: '2026-09-05', transaction_type: '转出', amount: 100,
    })).rejects.toThrow(/已停用/);

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test.each([true, 1, '1'])('cash transaction accepts active account flag %p', async (flag) => {
    const connection = frozenConnection(flag, 'cash');

    await expect(BankTransactionModel.createBankTransaction({
      transaction_number: 'BANK-1', bank_account_id: 2, created_by: 1,
      transaction_date: '2026-09-05', transaction_type: '转出', amount: 100,
    })).resolves.toMatchObject({ success: true, transactionId: 10 });

    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
  });
});
