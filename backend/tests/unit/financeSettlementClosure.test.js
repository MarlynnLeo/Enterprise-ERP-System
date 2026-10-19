jest.mock('../../src/config/db', () => ({
  getConnection: jest.fn(),
  pool: { getConnection: jest.fn(), execute: jest.fn() },
}));
jest.mock('../../src/models/finance', () => ({ createEntry: jest.fn() }));
jest.mock('../../src/config/accountingConfig', () => ({
  accountingConfig: {
    loadFromDatabase: jest.fn(),
    getAccountCode: (key) => key,
  },
}));
jest.mock('../../src/config/financeConfig', () => ({
  financeConfig: {
    loadFromDatabase: jest.fn(),
    get: (_key, fallback) => fallback,
  },
}));
jest.mock('../../src/services/finance/PaymentApprovalGuard', () => ({
  assertPayable: jest.fn().mockResolvedValue({ approvalId: null }),
}));
jest.mock('../../src/services/finance/VoucherReversalService', () => ({
  reverseBusinessVouchers: jest.fn(),
}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({
  createLink: jest.fn(),
  tryAutoLink: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const db = require('../../src/config/db');
const financeModel = require('../../src/models/finance');
const VoucherReversalService = require('../../src/services/finance/VoucherReversalService');
const DocumentLinkService = require('../../src/services/business/DocumentLinkService');
const models = { ar: require('../../src/models/ar'), ap: require('../../src/models/ap') };
const CashTransaction = require('../../src/models/cash/CashTransaction');

function scenario(kind, { amount = 95, discount = 5, method = '现金', foreignParty = false } = {}) {
  const isAr = kind === 'ar';
  const party = isAr ? 'customer' : 'supplier';
  const action = isAr ? 'receipt' : 'payment';
  const total = amount < 0 ? -100 : 100;
  const invoice = {
    id: 11,
    invoice_number: 'INV-11',
    [`${party}_id`]: foreignParty ? 88 : 7,
    total_amount: total,
    paid_amount: 0,
    balance_amount: total,
    status: '已确认',
    currency_code: 'CNY',
    exchange_rate: 1,
    source_type: isAr ? 'sales_return' : 'purchase_return',
  };
  const state = { invoice, settlement: null, items: [], journals: [] };
  const connection = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    execute: jest.fn(async (sql, values = []) => {
      if (sql.includes(`FROM ${kind}_invoices WHERE id`)) return [[{ ...invoice }]];
      if (sql.startsWith(`UPDATE ${kind}_invoices`)) {
        [invoice.paid_amount, invoice.balance_amount, invoice.status] = values;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes(`INSERT INTO ${kind}_${action}s`)) {
        state.settlement = {
          id: 501,
          [`${action}_number`]: values[0],
          [`${party}_id`]: values[1],
          [`${action}_date`]: values[2],
          total_amount: values[3],
          payment_method: values[4],
          bank_account_id: values[6],
          status: 'normal',
        };
        return [{ insertId: 501 }];
      }
      if (sql.includes(`INSERT INTO ${kind}_${action}_items`)) {
        state.items.push({
          invoice_id: values[1],
          item_amount: values[2],
          item_discount_amount: values[3],
        });
        return [{ insertId: 601 }];
      }
      if (sql.includes(`FROM ${kind}_${action}s `)) {
        return [state.items.map((item) => ({ ...state.settlement, ...item }))];
      }
      if (sql.includes(`UPDATE ${kind}_${action}s`)) {
        state.settlement.status = 'void';
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('INSERT INTO cash_transactions')) {
        const [
          number,
          type,
          date,
          cashAmount,
          category,
          counterparty,
          description,
          reference,
          entryId,
        ] = values;
        const row = {
          id: 701 + state.journals.length,
          transaction_number: number,
          transaction_type: type,
          transaction_date: date,
          amount: cashAmount,
          category,
          counterparty,
          description,
          reference_number: reference,
          gl_entry_id: entryId,
          status: 'approved',
        };
        state.journals.push(row);
        return [{ insertId: row.id }];
      }
      if (sql.includes('FROM cash_transactions')) {
        return [
          state.journals.filter((row) =>
            sql.includes('transaction_number =')
              ? row.transaction_number === values[0]
              : row.id === values[0]
          ),
        ];
      }
      if (sql.startsWith('SELECT entry_number')) return [[{ entry_number: `GL-${values[0]}` }]];
      if (sql.includes('FROM gl_accounts'))
        return [
          [
            {
              id: {
                CASH: 1001,
                BANK_DEPOSIT: 1002,
                ACCOUNTS_RECEIVABLE: 1122,
                ACCOUNTS_PAYABLE: 2202,
                FINANCE_EXPENSE: 6603,
              }[values[0]],
            },
          ],
        ];
      if (sql.includes('FROM budgets')) return [[]];
      if (sql.includes('FROM gl_entries')) return [[{ id: 850, entry_date: '2026-10-01' }]];
      if (sql.includes('FROM gl_entry_items')) return [[{ account_id: 1405, department_id: null, recognized_amount: 100 }]];
      if (sql.includes('FROM gl_periods')) return [[{ id: 10 }]];
      throw new Error(`Unexpected settlement query: ${sql}`);
    }),
  };
  db.getConnection.mockResolvedValue(connection);
  db.pool.getConnection.mockResolvedValue(connection);
  financeModel.createEntry.mockResolvedValue(901);
  VoucherReversalService.reverseBusinessVouchers.mockResolvedValue([
    { originalEntryId: 901, entryId: 902, entryNumber: 'GL-902' },
  ]);
  const data = {
    [`${action}_number`]: `${kind.toUpperCase()}-501`,
    [`${action}_date`]: '2026-10-01',
    [`${party}_id`]: 7,
    [`${party}_name`]: '往来单位',
    total_amount: amount,
    payment_method: method,
    bank_account_id: method === '现金' ? null : 2,
    created_by: 42,
    is_refund: amount < 0,
    gl_entry: {
      period_id: 10,
      created_by: 42,
      bank_account_id: 1001,
      receivable_account_id: 1122,
      payable_account_id: 2202,
      discount_account_id: 6603,
    },
  };
  return {
    ...state,
    connection,
    data,
    create: () =>
      models[kind][isAr ? 'createReceipt' : 'createPayment'](data, [
        { invoice_id: 11, amount, discount_amount: discount },
      ]),
    void: () =>
      models[kind][isAr ? 'voidReceipt' : 'voidPayment'](501, {
        voided_by: 43,
        void_reason: '错误核销撤回',
      }),
  };
}

beforeEach(() => jest.clearAllMocks());

test('AP model gates both standalone and batch-owned transactions on trusted invoice budgets', async () => {
  const Budget = require('../../src/services/business/BudgetControlService');
  const gate = jest.spyOn(Budget, 'checkBudgetAvailability').mockResolvedValue({
    available: false, budget: { detail_id: 9 }, reason: '预算余额不足',
  });
  try {
    for (const external of [false, true]) {
      const state = scenario('ap');
      state.data.budget_account_id = 999;
      state.data.department_id = 666;
      await expect(models.ap.createPayment(state.data, [{ invoice_id: 11, amount: 95, discount_amount: 5 }], external ? state.connection : null)).rejects.toThrow(/预算余额不足/);
      expect(gate).toHaveBeenLastCalledWith(1405, null, 0, '2026-10-01', state.connection, null, { allowZeroAmount: true });
      expect(state.journals).toHaveLength(0);
      expect(financeModel.createEntry).not.toHaveBeenCalled();
      if (!external) expect(state.connection.rollback).toHaveBeenCalled();
    }
  } finally { gate.mockRestore(); }
});

describe.each(['ar', 'ap'])('%s settlement ledger closure', (kind) => {
  test('English cash uses the cash account and creates the cash journal', async () => {
    const state = scenario(kind, { method: 'cash' });
    delete state.data.gl_entry;
    await state.create();
    expect(state.journals).toHaveLength(1);
    const [, items] = financeModel.createEntry.mock.calls[0];
    expect(items.some((item) => item.account_id === 1001)).toBe(true);
    expect(items.some((item) => item.account_id === 1002)).toBe(false);
    expect(items.every(item => item.settlement_method === '现金' && item.invoice_number === 'INV-11')).toBe(true);
  });

  test.each(['other', '其他', 'invalid-method'])(
    'unsupported method %s cannot post a fictitious bank settlement',
    async (method) => {
      const state = scenario(kind, { method });
      await expect(state.create()).rejects.toThrow(/请选择现金/);
      expect(state.connection.execute).not.toHaveBeenCalled();
      expect(financeModel.createEntry).not.toHaveBeenCalled();
    }
  );

  test('cash and discount settle the invoice once and retain the counterparty dimension', async () => {
    const state = scenario(kind);
    await state.create();
    expect(state.invoice).toMatchObject({ paid_amount: 100, balance_amount: 0, status: '已付款' });
    expect(state.journals).toEqual([
      expect.objectContaining({
        amount: 95,
        transaction_type: kind === 'ar' ? 'income' : 'expense',
        status: 'approved',
        gl_entry_id: 901,
      }),
    ]);
    expect(financeModel.createEntry).toHaveBeenCalledTimes(1);
    const [, items, connection] = financeModel.createEntry.mock.calls[0];
    expect(items.every(item => item.settlement_method === '现金' && item.invoice_number === 'INV-11')).toBe(true);
    const partyAccount = kind === 'ar' ? 1122 : 2202;
    expect(items.find((item) => item.account_id === partyAccount)).toEqual(
      expect.objectContaining({
        [kind === 'ar' ? 'customer_id' : 'supplier_id']: 7,
        [kind === 'ar' ? 'credit_amount' : 'debit_amount']: 100,
      })
    );
    expect(items.reduce((sum, item) => sum + item.debit_amount, 0)).toBe(100);
    expect(items.reduce((sum, item) => sum + item.credit_amount, 0)).toBe(100);
    expect(connection).toBe(state.connection);
    expect(DocumentLinkService.createLink).toHaveBeenCalledWith(
      expect.objectContaining({
        source_type: 'cash_transaction',
        target_id: 901,
      }),
      state.connection
    );
  });

  test.each([
    [95, 5],
    [-40, 0],
  ])('void restores cash, invoice and voucher links for amount=%s', async (amount, discount) => {
    const state = scenario(kind, { amount, discount });
    await state.create();
    await state.void();
    expect(state.invoice).toMatchObject({
      paid_amount: 0,
      balance_amount: amount < 0 ? -100 : 100,
      status: '已确认',
    });
    expect(state.journals).toHaveLength(2);
    expect(state.journals.every((row) => row.status === 'approved')).toBe(true);
    expect(
      state.journals.reduce(
        (sum, row) => sum + (row.transaction_type === 'income' ? row.amount : -row.amount),
        0
      )
    ).toBe(0);
    expect(state.journals[1]).toMatchObject({
      transaction_number: `${kind.toUpperCase()}-501-VOID`,
      gl_entry_id: 902,
    });
    expect(state.journals[1].transaction_date).toBe(
      VoucherReversalService.reverseBusinessVouchers.mock.calls[0][1].entryDate
    );
    expect(financeModel.createEntry).toHaveBeenCalledTimes(1);
    expect(state.connection.commit).toHaveBeenCalledTimes(2);
  });

  test('cash page cannot reverse a generated settlement without restoring its invoice', async () => {
    const state = scenario(kind);
    await state.create();
    await expect(CashTransaction.voidApprovedTransaction(701, 43, '撤销')).rejects.toThrow(
      /原收付款单/
    );
    expect(VoucherReversalService.reverseBusinessVouchers).not.toHaveBeenCalled();
    expect(state.invoice.balance_amount).toBe(0);
    expect(state.connection.rollback).toHaveBeenCalledTimes(1);
  });

  test('full-discount bank settlements void without looking for a zero-value bank movement', async () => {
    const state = scenario(kind, { amount: 0, discount: 100, method: '银行转账' });
    await state.create();
    await state.void();
    expect(state.invoice).toMatchObject({ paid_amount: 0, balance_amount: 100 });
    expect(state.journals).toHaveLength(0);
    expect(
      state.connection.execute.mock.calls.some(([sql]) => sql.includes('bank_transactions'))
    ).toBe(false);
  });

  test('the locked invoice must belong to the settlement counterparty', async () => {
    const state = scenario(kind, { foreignParty: true });
    await expect(state.create()).rejects.toThrow(/与发票.*不一致/);
    expect(state.invoice.paid_amount).toBe(0);
    expect(state.journals).toHaveLength(0);
    expect(financeModel.createEntry).not.toHaveBeenCalled();
    expect(state.connection.rollback).toHaveBeenCalledTimes(1);
  });

  test('journal/link failures roll back the settlement transaction', async () => {
    const state = scenario(kind);
    DocumentLinkService.createLink.mockRejectedValueOnce(new Error('link write failed'));
    await expect(state.create()).rejects.toThrow('link write failed');
    expect(state.connection.rollback).toHaveBeenCalledTimes(1);
    expect(state.connection.commit).not.toHaveBeenCalled();
  });
});
