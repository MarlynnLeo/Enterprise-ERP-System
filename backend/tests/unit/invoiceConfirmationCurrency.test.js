/* global jest, beforeEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/models/finance', () => ({ createEntry: jest.fn(async () => 77) }));
jest.mock('../../src/services/business/DocumentLinkService', () => ({ tryAutoLink: jest.fn() }));
jest.mock('../../src/services/finance/VoucherReversalService', () => ({}));
jest.mock('../../src/services/finance/SettlementCashService', () => ({}));
jest.mock('../../src/utils/userUtils', () => ({ resolveActorUserId: jest.fn(async () => 8) }));
jest.mock('../../src/config/accountingConfig', () => ({ accountingConfig: { loadFromDatabase: jest.fn(), getAccountCode: jest.fn(key => key) } }));
jest.mock('../../src/config/financeConfig', () => ({ financeConfig: { loadFromDatabase: jest.fn(), get: jest.fn((key, fallback) => fallback) } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));

const db = require('../../src/config/db');
const finance = require('../../src/models/finance');
const links = require('../../src/services/business/DocumentLinkService');
const ar = require('../../src/models/ar');
const ap = require('../../src/models/ap');
const Decimal = require('decimal.js');
let invoice;
let connection;

beforeEach(() => {
  jest.clearAllMocks();
  invoice = {
    id: 6, invoice_number: 'USD-6', invoice_date: '2026-10-17', status: '已确认',
    customer_id: 12, supplier_id: 15, total_amount: 113, amount_excluding_tax: 100, tax_amount: 13,
    currency_code: 'USD', exchange_rate: 7.2,
    items: [{ product_id: 3, material_id: 3, quantity: 2, unit_price: 50, unit_name: '个' }],
    gl_entry: { receivable_account_id: 1, income_account_id: 2, output_tax_account_id: 3,
      purchase_cost_account_id: 4, payable_account_id: 5, input_tax_account_id: 6, department_id: 10 },
  };
  connection = {
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    execute: jest.fn(async sql => {
      if (sql.includes('FROM ar_invoices') || sql.includes('FROM ap_invoices')) return [[invoice]];
      if (sql.includes('FROM gl_periods')) return [[{ id: 2 }]];
      if (sql.includes('SELECT entry_number')) return [[{ entry_number: 'GL-77' }]];
      if (sql.includes('FROM gl_entries')) return [[]];
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
  db.pool.getConnection.mockResolvedValue(connection);
});

test.each([['ar', ar, 1, 2], ['ap', ap, 4, 5]])('%s confirmation converts USD and keeps voucher/document links in its transaction', async (kind, model, debitAccount, creditAccount) => {
  const result = await model.ensureConfirmationGlEntry(6);
  expect(result).toMatchObject({ created: true, entryId: 77 });
  const [header, items, suppliedConnection, options] = finance.createEntry.mock.calls[0];
  expect(suppliedConnection).toBe(connection);
  expect(options).toEqual({ allowFxRoundingAdjustment: true });
  expect(header.document_number).toBe('USD-6');
  expect(items.find(row => row.account_id === debitAccount).debit_amount).toBe(kind === 'ar' ? 813.6 : 720);
  expect(items.find(row => row.account_id === creditAccount).credit_amount).toBe(kind === 'ar' ? 720 : 813.6);
  expect(items.every(row => row.currency_code === 'USD' && row.exchange_rate === 7.2 && row.foreign_amount > 0 && row.invoice_number === 'USD-6')).toBe(true);
  expect(items.find(row => row.account_id === (kind === 'ar' ? 2 : 4))).toMatchObject({ quantity: 2, unit_price: 50, unit_name: '个', department_id: 10 });
  expect(links.tryAutoLink.mock.calls[0].at(-1)).toBe(connection);
  expect(connection.commit).toHaveBeenCalledTimes(1);
});

test('sales-return USD confirmation reverses original-currency sides without dropping the rate', async () => {
  Object.assign(invoice, { source_type: 'sales_return', total_amount: -113, amount_excluding_tax: -100, tax_amount: -13 });
  invoice.items[0].quantity = -2;
  await ar.ensureConfirmationGlEntry(6);
  const items = finance.createEntry.mock.calls[0][1];
  expect(items[0]).toMatchObject({ debit_amount: 0, credit_amount: 813.6, foreign_amount: 113 });
  expect(items[1]).toMatchObject({ debit_amount: 720, credit_amount: 0, foreign_amount: 100, quantity: 2 });
});

test('missing actual USD rate rolls back rather than silently posting at rate one', async () => {
  delete invoice.exchange_rate;
  await expect(ar.ensureConfirmationGlEntry(6)).rejects.toThrow('美元必须填写实际汇率');
  expect(connection.rollback).toHaveBeenCalledTimes(1);
  expect(finance.createEntry).not.toHaveBeenCalled();
});

const roundingCases = [
  { net: 100.01, tax: 13.01, total: 113.02, rate: 7.5, control: 847.65, adjustment: -0.01 },
  { net: 100.02, tax: 13.02, total: 113.04, rate: 7.2, control: 813.89, adjustment: 0.01 },
];
const roundingScenarios = ['ar', 'ap'].flatMap(kind => [false, true].flatMap(creditNote =>
  roundingCases.map(amounts => ({ kind, creditNote, ...amounts }))));

test.each(roundingScenarios)('$kind taxed USD, credit note $creditNote, adjustment $adjustment keeps control at invoice-total conversion', async scenario => {
  const { kind, creditNote, net, tax, total, rate, control, adjustment } = scenario;
  const sign = creditNote ? -1 : 1;
  Object.assign(invoice, { total_amount: sign * total, amount_excluding_tax: sign * net,
    tax_amount: sign * tax, exchange_rate: rate,
    source_type: creditNote ? (kind === 'ar' ? 'sales_return' : 'purchase_return') : (kind === 'ar' ? 'sales_outbound' : 'purchase_receipt') });
  Object.assign(invoice.items[0], { quantity: sign * 2, unit_price: net / 2 });
  await (kind === 'ar' ? ar : ap).ensureConfirmationGlEntry(6);
  const items = finance.createEntry.mock.calls[0][1];
  const controlLine = items.find(line => line.account_id === (kind === 'ar' ? 1 : 5));
  const taxLine = items.find(line => line.account_id === (kind === 'ar' ? 3 : 6));
  const controlSide = (kind === 'ar') !== creditNote ? 'debit_amount' : 'credit_amount';
  expect(controlLine[controlSide]).toBe(control);
  expect(controlLine).toMatchObject({ foreign_amount: total, exchange_rate: rate, base_rounding_adjustment: 0,
    invoice_number: 'USD-6', [kind === 'ar' ? 'customer_id' : 'supplier_id']: kind === 'ar' ? 12 : 15 });
  expect(taxLine).toMatchObject({ foreign_amount: tax, base_rounding_adjustment: adjustment });
  const baseDifference = items.reduce((sum, line) => sum.plus(line.debit_amount).minus(line.credit_amount), new Decimal(0));
  expect(baseDifference.isZero()).toBe(true);
  expect(items.every(line => line.invoice_number === 'USD-6')).toBe(true);
});
