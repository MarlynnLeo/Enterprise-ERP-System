jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/config/financeConfig', () => ({
  financeConfig: { get: (_key, fallback) => fallback },
}));
jest.mock('../../src/config/accountingConfig', () => ({ accountingConfig: {} }));
jest.mock('../../src/services/business/OpeningBalanceService', () => ({}));
jest.mock('../../src/models/finance', () => ({
  createAccount: jest.fn(),
  updateAccount: jest.fn(),
  getAccountById: jest.fn(),
  getEntryById: jest.fn(),
  reverseEntry: jest.fn(),
}));
jest.mock('../../src/utils/responseHandler', () => ({
  ResponseHandler: { success: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  denyUnlessAccess: jest.fn().mockResolvedValue(true),
  stampOwner: jest.fn().mockReturnValue({ created_by: 2 }),
}));
jest.mock('../../src/utils/userUtils', () => ({
  resolveActorUserId: jest.fn().mockResolvedValue(2),
}));

const finance = require('../../src/models/finance');
const controller = require('../../src/controllers/business/finance/financeController');
const entries = require('../../src/models/finance/entries');
const { ResponseHandler } = require('../../src/utils/responseHandler');

describe('account auxiliary dimensions survive the HTTP boundary', () => {
  const body = {
    accountCode: '112201',
    accountName: '测试科目',
    accountType: '资产',
    hasCustomer: true,
    hasSupplier: false,
    hasEmployee: true,
    hasDepartment: true,
    hasProject: false,
  };
  test('create forwards all auxiliary flags', async () => {
    finance.createAccount.mockResolvedValue(1);
    await controller.createAccount({ body }, {});
    expect(finance.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        has_customer: true,
        has_supplier: false,
        has_employee: true,
        has_department: true,
        has_project: false,
      })
    );
    expect(ResponseHandler.error).not.toHaveBeenCalled();
  });
  test('updates can clear a flag while omitted flags retain stored values', async () => {
    finance.getAccountById.mockResolvedValue({
      id: 1,
      has_customer: 1,
      has_supplier: 1,
      has_employee: 1,
      has_department: 1,
      has_project: 1,
    });
    finance.updateAccount.mockResolvedValue(true);
    await controller.updateAccount(
      {
        params: { id: '1' },
        body: { accountName: '测试科目', accountType: '资产', hasCustomer: false },
      },
      {}
    );
    expect(finance.updateAccount).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        has_customer: false,
        has_supplier: 1,
        has_employee: 1,
        has_department: 1,
        has_project: 1,
      })
    );
  });
});

describe('public reversal preserves business accounting closure', () => {
  const period = {
    id: 1,
    is_closed: 0,
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    period_name: '2026-10',
  };
  const original = {
    id: 7,
    entry_number: 'JV7',
    document_type: '记账凭证',
    transaction_type: '记账凭证',
    is_posted: 1,
    is_reversed: 0,
    created_by: 2,
  };
  const data = { entry_date: '2026-10-13', created_by: 2, requireManualSource: true };
  function connectionFor(entry, links = []) {
    return {
      execute: jest.fn(async (sql) => {
        if (sql.includes('FROM gl_entries WHERE id = ?')) return [[entry]];
        if (sql.includes('FROM document_links')) return [links];
        if (sql.includes('FROM gl_periods')) return [[period]];
        if (sql.includes('FROM gl_entry_items'))
          return [
            [
              { account_id: 1, debit_amount: 100, credit_amount: 0 },
              { account_id: 2, debit_amount: 0, credit_amount: 100 },
            ],
          ];
        return [[]];
      }),
    };
  }
  test.each(['ar_invoice', 'ap_invoice', 'profit_loss_transfer', 'year_end_transfer'])(
    'public reversal rejects %s before writing',
    async (type) => {
      const connection = connectionFor({ ...original, document_type: type });
      await expect(entries.reverseEntry(7, data, connection)).rejects.toThrow(
        '通过原业务撤销或期间反结账'
      );
      expect(connection.execute.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE)/.test(sql))).toBe(
        false
      );
    }
  );
  test('manual-looking vouchers with document links are blocked', async () => {
    await expect(
      entries.reverseEntry(7, data, connectionFor(original, [{ id: 5 }]))
    ).rejects.toThrow('关联业务单据');
  });
  test('unlinked manual voucher can still be reversed', async () => {
    const createEntry = jest.spyOn(entries, 'createEntry').mockResolvedValue(77);
    await expect(entries.reverseEntry(7, data, connectionFor(original))).resolves.toBe(77);
    expect(createEntry.mock.calls[0][1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ account_id: 1, debit_amount: 0, credit_amount: 100 }),
      ])
    );
  });
  test('domain reversal retains the internal transaction path', async () => {
    jest.spyOn(entries, 'createEntry').mockResolvedValue(78);
    await expect(
      entries.reverseEntry(
        7,
        { ...data, requireManualSource: false },
        connectionFor({ ...original, document_type: 'ar_invoice', transaction_id: 9 })
      )
    ).resolves.toBe(78);
  });
  test('HTTP always requests the manual-source guard regardless of client input', async () => {
    finance.getEntryById.mockResolvedValue(original);
    finance.reverseEntry.mockResolvedValue(77);
    await controller.reverseEntry(
      { params: { id: '7' }, body: { entryDate: '2026-10-13', requireManualSource: false } },
      {}
    );
    expect(finance.reverseEntry).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ requireManualSource: true })
    );
  });
});
