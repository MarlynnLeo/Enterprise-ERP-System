jest.mock('../../src/config/db', () => ({
  pool: { getConnection: jest.fn(), execute: jest.fn() },
}));
jest.mock('../../src/models/finance', () => ({ createEntry: jest.fn() }));
jest.mock('../../src/config/accountingConfig', () => ({
  accountingConfig: {
    loadFromDatabase: jest.fn(),
    getAccountCode: (key) => key,
  },
}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({ tryAutoLink: jest.fn() }));
jest.mock('../../src/services/business/BudgetControlService', () => ({
  executeBudgetControl: jest.fn(),
}));
jest.mock('../../src/utils/codeGenerator', () => ({
  CodeGenerators: {
    generateExpensePaymentCode: jest.fn().mockResolvedValue('EXP-PAY-11'),
  },
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
const expenseModel = require('../../src/models/expense');

function fixture(currency = 'CNY', paymentGate = null) {
  const expense = {
    id: 11,
    expense_number: 'EXP-11',
    title: '管理费用',
    category_id: 3,
    amount: 100,
    status: 'approved',
    approved_by: 41,
    created_by: 40,
  };
  const bank = {
    id: 7,
    account_name: '付款账户',
    currency_code: currency,
    current_balance: 1000,
    is_active: 1,
  };
  const journals = [];
  const connections = [];
  let lockTail = Promise.resolve();
  let announcePaymentLock;
  const paymentLocked = new Promise((resolve) => {
    announcePaymentLock = resolve;
  });

  const query = async (sql, values) => {
    if (sql.includes('FROM expenses')) return [[{ ...expense }]];
    if (sql.includes('FROM bank_accounts')) {
      announcePaymentLock();
      if (paymentGate) await paymentGate;
      return [[{ ...bank }]];
    }
    if (sql.includes('FROM bank_transactions')) return [[]];
    if (sql.includes('FROM gl_entries') && sql.includes('document_number')) return [[]];
    if (sql.includes('FROM expense_categories'))
      return [[{ id: 3, gl_account_code: 'ADMIN_EXPENSE' }]];
    if (sql.includes('FROM gl_accounts'))
      return [[{ id: values[0] === 'BANK_DEPOSIT' ? 1002 : 6602 }]];
    if (sql.includes('FROM gl_periods')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT entry_number')) return [[{ entry_number: 'GL-901' }]];
    if (sql.includes('INSERT INTO bank_transactions')) {
      journals.push({ amount: values[4], type: values[3] });
      return [{ insertId: 501 }];
    }
    if (sql.startsWith('UPDATE bank_accounts')) {
      bank.current_balance -= values[0];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('UPDATE expenses')) {
      expense.status = sql.includes("'cancelled'") ? 'cancelled' : 'paid';
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE bank_transactions')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected expense query: ${sql}`);
  };
  db.pool.execute.mockImplementation(query);
  db.pool.getConnection.mockImplementation(async () => {
    let unlock = null;
    const releaseLock = () => {
      unlock?.();
      unlock = null;
    };
    const connection = {
      beginTransaction: jest.fn(),
      commit: jest.fn(releaseLock),
      rollback: jest.fn(releaseLock),
      release: jest.fn(releaseLock),
      execute: jest.fn(async (sql, values = []) => {
        if (sql.includes('FROM expenses') && sql.includes('FOR UPDATE')) {
          const previous = lockTail;
          lockTail = new Promise((resolve) => {
            unlock = resolve;
          });
          await previous;
        }
        return query(sql, values);
      }),
    };
    connections.push(connection);
    return connection;
  });
  financeModel.createEntry.mockResolvedValue(901);
  return { expense, bank, journals, connections, paymentLocked };
}

const paymentData = { bank_account_id: 7, payment_date: '2026-10-01', created_by: 42 };

beforeEach(() => jest.clearAllMocks());

test('a completed payment wins the expense row lock and cannot be cancelled concurrently', async () => {
  let allowPayment;
  const paymentGate = new Promise((resolve) => {
    allowPayment = resolve;
  });
  const state = fixture('CNY', paymentGate);
  const payment = expenseModel.payExpense(11, paymentData);
  await state.paymentLocked;
  const cancellation = expenseModel.cancelExpense(11);
  const cancellationResult = expect(cancellation).rejects.toThrow(/已付款的费用无法取消/);
  allowPayment();
  await payment;
  await cancellationResult;

  expect(state.expense.status).toBe('paid');
  expect(state.bank.current_balance).toBe(900);
  expect(state.journals).toEqual([{ amount: 100, type: '费用' }]);
  expect(financeModel.createEntry).toHaveBeenCalledTimes(1);
  expect(db.pool.execute).not.toHaveBeenCalled();
  expect(state.connections[1].rollback).toHaveBeenCalledTimes(1);
});

test('cancellation committed before payment prevents any bank or GL movement', async () => {
  const state = fixture();
  await expenseModel.cancelExpense(11);
  await expect(expenseModel.payExpense(11, paymentData)).rejects.toThrow(/只有已审批/);
  expect(state.expense.status).toBe('cancelled');
  expect(state.bank.current_balance).toBe(1000);
  expect(state.journals).toHaveLength(0);
  expect(financeModel.createEntry).not.toHaveBeenCalled();
});

test.each(['USD', 'TWD', 'eur'])(
  'rejects paying a CNY expense from %s before monetary writes',
  async (currency) => {
    const state = fixture(currency);
    await expect(expenseModel.payExpense(11, paymentData)).rejects.toThrow(/非人民币账户/);
    expect(state.expense.status).toBe('approved');
    expect(state.bank.current_balance).toBe(1000);
    expect(state.journals).toHaveLength(0);
    expect(financeModel.createEntry).not.toHaveBeenCalled();
    expect(state.connections[0].rollback).toHaveBeenCalledTimes(1);
  }
);

test('CNY expense payment posts equal expense and bank amounts', async () => {
  const state = fixture();
  await expenseModel.payExpense(11, paymentData);
  expect(state.bank.current_balance).toBe(900);
  const [, lines] = financeModel.createEntry.mock.calls[0];
  expect(lines).toEqual([
    expect.objectContaining({ account_id: 6602, debit_amount: 100, credit_amount: 0 }),
    expect.objectContaining({ account_id: 1002, debit_amount: 0, credit_amount: 100 }),
  ]);
});
