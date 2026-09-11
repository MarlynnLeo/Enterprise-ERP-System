jest.mock('../../src/config/db', () => ({ pool: { execute: jest.fn() } }));
jest.mock('../../src/services/system/SystemConfigService', () => ({
  get: jest.fn().mockResolvedValue(50000),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const PaymentApprovalGuard = require('../../src/services/finance/PaymentApprovalGuard');

describe('payment approval transaction integrity', () => {
  const approvedPayment = {
    amount: 60000,
    approvalId: 7,
    approvalNo: 'APPROVAL-123',
    supplierId: 9,
    invoiceIds: [11],
  };

  test('validates an approved record without implicit-commit DDL on the payment transaction connection', async () => {
    const connection = {
      execute: jest.fn().mockResolvedValue([
        [
          {
            id: 7,
            amount: 60000,
            supplier_id: 9,
            invoice_id: 11,
            invoice_ids: '[11]',
            approved_by: 2,
            status: 'approved',
            used_at: null,
          },
        ],
      ]),
    };

    await expect(
      PaymentApprovalGuard.assertPayable({ ...approvedPayment, connection })
    ).resolves.toMatchObject({ required: true, allowed: true });

    expect(
      connection.execute.mock.calls.some(([sql]) => /^\s*(CREATE|ALTER|DROP|TRUNCATE)\s/i.test(sql))
    ).toBe(false);
    expect(connection.execute).toHaveBeenCalledTimes(1);
    expect(connection.execute.mock.calls[0][0]).toContain(
      'SELECT * FROM finance_payment_approvals'
    );
  });

  test('deduplicates legacy invoice_id and invoice_ids before comparing the approved scope', async () => {
    const connection = {
      execute: jest.fn().mockResolvedValue([
        [
          {
            id: 7,
            amount: 60000,
            supplier_id: 9,
            invoice_id: 11,
            invoice_ids: '[11]',
            approved_by: 2,
            status: 'approved',
            used_at: null,
          },
        ],
      ]),
    };

    await expect(
      PaymentApprovalGuard.assertPayable({ ...approvedPayment, connection })
    ).resolves.toMatchObject({ required: true, allowed: true, approvalId: 7 });
  });

  test('propagates a database rollback error so the outer payment cannot continue', async () => {
    const deadlock = Object.assign(new Error('Deadlock found when trying to get lock'), {
      code: 'ER_LOCK_DEADLOCK',
    });
    const connection = { execute: jest.fn().mockRejectedValue(deadlock) };

    await expect(
      PaymentApprovalGuard.assertPayable({ ...approvedPayment, connection })
    ).rejects.toBe(deadlock);
  });

  test('an absent approval table blocks payment and never triggers runtime schema creation', async () => {
    const missingTable = Object.assign(
      new Error("Table 'erp_test.finance_payment_approvals' doesn't exist"),
      {
        code: 'ER_NO_SUCH_TABLE',
      }
    );
    const connection = { execute: jest.fn().mockRejectedValue(missingTable) };

    await expect(
      PaymentApprovalGuard.assertPayable({ ...approvedPayment, connection })
    ).rejects.toBe(missingTable);

    expect(connection.execute).toHaveBeenCalledTimes(1);
    expect(connection.execute.mock.calls[0][0]).toContain(
      'SELECT * FROM finance_payment_approvals'
    );
  });

  test('large unapproved payments are rejected before any database mutation', async () => {
    const connection = { execute: jest.fn() };

    await expect(
      PaymentApprovalGuard.assertPayable({ amount: 60000, connection })
    ).rejects.toMatchObject({ code: 'PAYMENT_APPROVAL_REQUIRED' });

    expect(connection.execute).not.toHaveBeenCalled();
  });
});
