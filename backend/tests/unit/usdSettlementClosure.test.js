jest.mock('../../src/config/db', () => ({ getConnection: jest.fn(), pool: { getConnection: jest.fn(), execute: jest.fn() } }));
jest.mock('../../src/models/finance', () => ({ createEntry: jest.fn() }));
jest.mock('../../src/config/accountingConfig', () => ({ accountingConfig: { loadFromDatabase: jest.fn(), getAccountCode: (key) => key } }));
jest.mock('../../src/config/financeConfig', () => ({ financeConfig: { loadFromDatabase: jest.fn(), get: (_key, fallback) => fallback } }));
jest.mock('../../src/services/finance/PaymentApprovalGuard', () => ({ assertPayable: jest.fn().mockResolvedValue({ approvalId: null }) }));
jest.mock('../../src/services/finance/APPaymentBudgetService', () => ({ assertInvoiceWithinBudget: jest.fn() }));
jest.mock('../../src/services/business/BankBalanceService', () => ({ syncAccountBalance: jest.fn() }));
jest.mock('../../src/services/business/DocumentLinkService', () => ({ tryAutoLink: jest.fn(), createLink: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

const Decimal = require('decimal.js');
const db = require('../../src/config/db');
const finance = require('../../src/models/finance');
const Approval = require('../../src/services/finance/PaymentApprovalGuard');
const BankBalance = require('../../src/services/business/BankBalanceService');
const { allocateBaseSettlement, prepareSettlementCurrency } = require('../../src/services/finance/settlementCurrency');
const { normalizeEntryItems } = require('../../src/utils/finance/entryDataIntegrity');
const { toPaymentApi, toReceiptApi } = require('../../src/utils/finance/invoiceFieldMap');
const models = { ar: require('../../src/models/ar'), ap: require('../../src/models/ap') };

function fixture(kind, { total = '0.03', rate = '6.5', bankCurrency = 'USD', originalAdjustment = 0 } = {}) {
  const action = kind === 'ar' ? 'receipt' : 'payment';
  const party = kind === 'ar' ? 'customer' : 'supplier';
  const round = (value) => new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  const book = round(new Decimal(total).times(rate));
  const state = { invoice: { id: 11, invoice_number: 'USD-11', [`${party}_id`]: 7,
    total_amount: total, paid_amount: 0, balance_amount: total, currency_code: 'USD', exchange_rate: rate, status: '已确认' },
    headers: [], items: [], bank: [], journals: [], bankBalance: 100000 };
  const control = { id: 8001, entry_id: 800, line_number: 1, account_id: kind === 'ar' ? 112201 : 220201,
    [`${party}_id`]: 7, debit_amount: kind === 'ar' ? Number(book) + originalAdjustment : 0,
    credit_amount: kind === 'ap' ? Number(book) + originalAdjustment : 0,
    currency_code: 'USD', exchange_rate: rate, foreign_amount: total, invoice_number: 'USD-11', department_id: 9 };
  let snapshot;
  const connection = {
    beginTransaction: jest.fn(async () => { snapshot = JSON.stringify(state); }),
    commit: jest.fn(), rollback: jest.fn(async () => { if (snapshot) Object.assign(state, JSON.parse(snapshot)); }), release: jest.fn(),
    execute: jest.fn(async (sql, values = []) => {
      if (sql.includes(`FROM ${kind}_invoices WHERE id`)) return [[{ ...state.invoice }]];
      if (sql.includes('SELECT e.id FROM gl_entries e')) return [[{ id: 800 }]];
      if (sql.includes('SELECT * FROM gl_entry_items WHERE entry_id')) return [[{ ...control }]];
      if (sql.includes(`FROM ${kind}_${action}_items si JOIN`)) return [state.items.filter((item) => state.headers.find((header) => header.id === item.parent_id)?.status !== 'void').map((item) => ({ ...item, currency_code: 'USD', exchange_rate: rate }))];
      if (sql.includes(`INSERT INTO ${kind}_${action}s`)) {
        const header = { id: 500 + state.headers.length, amount: values[3], currency_code: values.at(-3), exchange_rate: values.at(-2), base_amount: values.at(-1), status: 'normal' };
        state.headers.push(header); return [{ insertId: header.id }];
      }
      if (sql.includes(`INSERT INTO ${kind}_${action}_items`)) { state.items.push({ parent_id: values[0], invoice_id: values[1], amount: values[2], discount_amount: values[3], base_settlement_amount: values[4] }); return [{ insertId: 600 }]; }
      if (sql.startsWith(`UPDATE ${kind}_invoices`)) { [state.invoice.paid_amount, state.invoice.balance_amount, state.invoice.status] = values; return [{ affectedRows: 1 }]; }
      if (sql.includes('FROM bank_accounts WHERE id')) return [[{ id: 2, account_name: 'USD银行', currency_code: bankCurrency, is_active: 1, current_balance: state.bankBalance }]];
      if (sql.includes('INSERT INTO bank_transactions')) { state.bank.push({ amount: values[4], transaction_type: values[3] }); return [{ insertId: 700 + state.bank.length }]; }
      if (sql.startsWith('UPDATE bank_transactions')) return [{ affectedRows: 1 }];
      if (sql.startsWith('SELECT entry_number')) return [[{ entry_number: 'GL-NEW' }]];
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };
  db.getConnection.mockResolvedValue(connection); db.pool.getConnection.mockResolvedValue(connection);
  finance.createEntry.mockImplementation(async (entry, lines, conn, options) => {
    expect(conn).toBe(connection);
    const normalized = normalizeEntryItems(lines, options);
    state.journals.push(normalized); return 900 + state.journals.length;
  });
  BankBalance.syncAccountBalance.mockImplementation(async () => {
    const movement = state.bank.reduce((sum, tx) => sum.plus(tx.transaction_type === '转入' ? tx.amount : -tx.amount), new Decimal(0));
    state.bankBalance = new Decimal(100000).plus(movement).toNumber();
  });
  const baseData = { [`${action}_number`]: 'SETTLEMENT-USD', [`${action}_date`]: '2026-10-17', [`${party}_id`]: 7,
    [`${party}_name`]: '往来单位', payment_method: '银行转账', bank_account_id: 2, currency_code: 'USD', exchange_rate: rate, created_by: 9,
    gl_entry: { period_id: 1, created_by: 9, bank_account_id: 1002, receivable_account_id: 1122, payable_account_id: 2202 } };
  return { state, connection, baseData,
    create: (cash = '0.01', overrides = {}, itemOverrides = {}) => models[kind][kind === 'ar' ? 'createReceipt' : 'createPayment'](
      { ...baseData, total_amount: cash, ...overrides }, [{ invoice_id: 11, amount: cash, ...itemOverrides }]
    ) };
}

beforeEach(() => jest.clearAllMocks());

describe.each(['ar', 'ap'])('%s USD settlement closure', (kind) => {
  test('three partial USD settlements clear the original CNY book value exactly', async () => {
    const setup = fixture(kind);
    for (let index = 0; index < 3; index++) await setup.create();
    expect(setup.state.items.map((item) => item.base_settlement_amount)).toEqual(['0.07', '0.06', '0.07']);
    expect(setup.state.headers.map((header) => header.base_amount)).toEqual(['0.07', '0.06', '0.07']);
    expect(setup.state.invoice).toMatchObject({ paid_amount: 0.03, balance_amount: 0, status: '已付款' });
    expect(setup.state.bank.map((tx) => tx.amount)).toEqual([0.01, 0.01, 0.01]);
    expect(setup.state.bankBalance).toBe(kind === 'ar' ? 100000.03 : 99999.97);
    const controlId = kind === 'ar' ? 112201 : 220201;
    expect(setup.state.journals.every((lines) => lines.some((line) => line.account_id === controlId && line.department_id === 9))).toBe(true);
    expect(setup.state.journals[1].map((line) => line.base_rounding_adjustment)).toEqual(['-0.01', '-0.01']);
    expect(setup.connection.commit).toHaveBeenCalledTimes(3);
  });

  test.each([
    [{ currency_code: 'CNY' }, {}, '币种'],
    [{ exchange_rate: 7 }, {}, '不同汇率'],
    [{ exchange_rate: null }, {}, '明确确认'],
    [{ payment_method: '现金' }, {}, '美元银行'],
    [{ is_refund: true }, {}, '退款'],
    [{}, { discount_amount: '0.01' }, '折扣'],
  ])('rejects unsupported scenarios with no partial invoice/bank updates', async (dataPatch, itemPatch, expected) => {
    const setup = fixture(kind);
    await expect(setup.create('0.01', dataPatch, itemPatch)).rejects.toThrow(expected);
    expect(setup.state.headers).toHaveLength(0); expect(setup.state.bank).toHaveLength(0);
    expect(setup.state.invoice.paid_amount).toBe(0);
    expect(setup.connection.rollback).toHaveBeenCalled();
  });

  test('cross-currency bank account rolls back the whole settlement', async () => {
    const setup = fixture(kind, { bankCurrency: 'CNY' });
    await expect(setup.create()).rejects.toThrow('币种与发票币种不一致');
    expect(setup.state.invoice.paid_amount).toBe(0); expect(setup.state.headers).toHaveLength(0);
    expect(finance.createEntry).not.toHaveBeenCalled();
  });

  test('legacy paid USD without recorded base allocation cannot be silently resumed', async () => {
    const setup = fixture(kind);
    setup.state.invoice.paid_amount = 0.01; setup.state.invoice.balance_amount = 0.02;
    await expect(setup.create()).rejects.toThrow('历史核销');
    expect(setup.state.headers).toHaveLength(0);
  });

  test('a legacy USD invoice without rate evidence cannot inherit a rate of one', async () => {
    const setup = fixture(kind);
    setup.state.invoice.exchange_rate = null;
    await expect(setup.create('0.01', { exchange_rate: 1 })).rejects.toThrow('缺少已确认的实际汇率');
    expect(setup.state.headers).toHaveLength(0);
    expect(finance.createEntry).not.toHaveBeenCalled();
  });

  test('an unexplained original control rounding difference blocks settlement', async () => {
    const setup = fixture(kind, { originalAdjustment: 0.01 });
    await expect(setup.create()).rejects.toThrow('未解释本位差额');
    expect(setup.state.headers).toHaveLength(0);
  });
});

test('large USD AP payment is approved using its CNY amount, not its lower USD nominal value', async () => {
  const setup = fixture('ap', { total: '10000', rate: '7' });
  await setup.create('10000');
  expect(Approval.assertPayable).toHaveBeenCalledWith(expect.objectContaining({ amount: 70000, invoiceIds: [11], supplierId: 7 }));
  expect(setup.state.headers[0]).toMatchObject({ amount: '10000', base_amount: '70000.00', currency_code: 'USD' });
  expect(setup.state.bank[0].amount).toBe(10000);
});

test('reallocation after void uses remaining active base records and clears the final residual', () => {
  const invoice = { total_amount: '0.03', paid_amount: '0.02', balance_amount: '0.01', exchange_rate: '6.5' };
  const previous = [1, 2].map(() => ({ amount: '0.01', discount_amount: 0, base_settlement_amount: '0.07', currency_code: 'USD', exchange_rate: '6.5' }));
  expect(allocateBaseSettlement({ invoice, originalBase: '0.20', previous, cashAmount: '0.01' })).toEqual({ baseAmount: '0.06', roundingAdjustment: '-0.01' });
});

test('duplicate invoice request is rejected before locking or allocating', async () => {
  const connection = { execute: jest.fn() };
  await expect(prepareSettlementCurrency(connection, 'ar', {}, [{ invoice_id: 1 }, { invoice_id: 1 }])).rejects.toThrow('重复');
  expect(connection.execute).not.toHaveBeenCalled();
});

test('receipt and payment API retain currency, original amount and allocated base evidence separately', () => {
  for (const mapper of [toReceiptApi, toPaymentApi]) {
    expect(mapper({ total_amount: '0.01', currency_code: 'USD', exchange_rate: '6.5', base_amount: '0.06', items: [{ amount: '0.01', base_settlement_amount: '0.06' }] })).toMatchObject({ amount: 0.01, currencyCode: 'USD', exchangeRate: 6.5, baseAmount: 0.06, items: [{ amount: 0.01, baseSettlementAmount: 0.06 }] });
  }
});
