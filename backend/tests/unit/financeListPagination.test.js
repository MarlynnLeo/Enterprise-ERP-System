/* global jest, beforeEach, afterEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn(), execute: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../../src/models/finance', () => ({}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({}));

const db = require('../../src/config/db');
const taxModel = require('../../src/models/tax');
const BankTransaction = require('../../src/models/cash/Transaction');
const { createFinanceListFixture, seedTaxInvoice, seedBankTransaction } = require('../helpers/financeListFixture');
let fixture;

beforeEach(() => {
  jest.clearAllMocks();
  fixture = createFinanceListFixture();
  const execute = async (sql, params = []) => [fixture.prepare(sql).all(...params)];
  db.pool.execute.mockImplementation(execute);
  db.pool.query.mockImplementation(execute);
});
afterEach(() => fixture.close());

const scoped = {
  join: 'LEFT JOIN users finance_owner ON finance_owner.id = t.created_by',
  where: ' AND finance_owner.department_id = ?', params: [8],
};

test('tax pagination preserves complete fields, tied-date order and totals beyond the current page', async () => {
  const original = [];
  for (let id = 1; id <= 5; id++) original.push(seedTaxInvoice(fixture, id));
  const first = await taxModel.getTaxInvoices({ limit: 2 });
  const second = await taxModel.getTaxInvoices({ limit: 2, offset: 2 });
  expect(first.list.map(row => row.id)).toEqual([5, 4]);
  expect(second.list.map(row => row.id)).toEqual([3, 2]);
  expect(first.total).toBe(5);
  expect(first.stats.pending).toBe(5);
  expect(first.stats.input_tax).toBeCloseTo(65.05, 8);
  expect(first.stats).toEqual(second.stats);
  for (const row of [...first.list, ...second.list]) {
    expect(row).toEqual(expect.objectContaining(original[row.id - 1]));
    expect(row).toEqual(expect.objectContaining({ supplier_name: '供应商甲', customer_name: '客户甲', creator_name: '财务甲', linked_document_number: 'AP-21', linked_document_amount: 113.01, linked_document_status: '已确认' }));
  }
  const empty = await taxModel.getTaxInvoices({ limit: 2, offset: 100 });
  expect(empty.list).toEqual([]);
  expect(empty.stats).toEqual(first.stats);
});

test.each([
  ['ap_invoice', 21, 'AP-21', 113.01, '已确认'],
  ['ar_invoice', 22, 'AR-22', 226.02, '部分付款'],
  ['purchase_receipt', 23, 'REC-23', 339.03, 'completed'],
  ['采购收货单', 23, 'REC-23', 339.03, 'completed'],
  ['采购入库单', 23, 'REC-23', 339.03, 'completed'],
  ['sales_outbound', 24, 'OUT-24', null, 'completed'],
  ['销售出库单', 24, 'OUT-24', null, 'completed'],
  ['ap_invoice', 999, null, null, null],
])('tax page retains the %s source link including legacy and missing sources', async (type, id, number, amount, status) => {
  seedTaxInvoice(fixture, 1, { related_document_type: type, related_document_id: id });
  const { list } = await taxModel.getTaxInvoices({ limit: 1 });
  expect(list).toEqual([expect.objectContaining({ linked_document_number: number, linked_document_amount: amount, linked_document_status: status })]);
});

test('tax totals include red letters and exclude void tax without dropping void rows or absent counterparties', async () => {
  seedTaxInvoice(fixture, 1);
  seedTaxInvoice(fixture, 2, { amount_excluding_tax: -50, tax_amount: -6.51, total_amount: -56.51, original_tax_invoice_id: 1, status: '已认证' });
  seedTaxInvoice(fixture, 3, { status: '已作废', tax_amount: 900 });
  seedTaxInvoice(fixture, 4, { invoice_type: '销项', tax_amount: 26.02, supplier_id: 999, customer_id: 999, created_by: 999 });
  const data = await taxModel.getTaxInvoices();
  expect(data.total).toBe(4);
  expect(data.stats.pending).toBe(2);
  expect(data.stats.input_tax).toBeCloseTo(6.5, 8);
  expect(data.stats.output_tax).toBeCloseTo(26.02, 8);
  expect(data.list[0]).toEqual(expect.objectContaining({ id: 4, supplier_name: null, customer_name: null, creator_name: null }));
  expect(data.list.find(row => row.id === 2)).toEqual(expect.objectContaining({ total_amount: -56.51, original_tax_invoice_id: 1 }));
});

test('all tax filters constrain both full summary and page selection with parameterized values', async () => {
  const target = seedTaxInvoice(fixture, 1, { invoice_number: "T'1", invoice_date: '2026-10-01' });
  for (const [index, override] of [
    { invoice_type: '销项' }, { status: '已认证' }, { invoice_number: 'OTHER' },
    { invoice_date: '2026-09-30' }, { invoice_date: '2026-10-18' }, { supplier_id: 9 }, { customer_id: 10 },
  ].entries()) seedTaxInvoice(fixture, index + 2, { ...target, ...override, id: index + 2 });
  const data = await taxModel.getTaxInvoices({ invoice_type: '进项', status: '未认证', invoice_number: "T'1", start_date: '2026-10-01', end_date: '2026-10-17', supplier_id: 7, customer_id: 8, limit: 1 });
  expect(data.total).toBe(1);
  expect(data.list.map(row => row.id)).toEqual([1]);
  expect(data.stats.input_tax).toBeCloseTo(13.01, 8);
  for (const [sql, params] of db.pool.execute.mock.calls) {
    expect(sql).not.toContain("T'1");
    expect(params).toEqual(['进项', '未认证', "%T'1%", '2026-10-01', '2026-10-17', 7, 8]);
  }
});

test('bank scope is applied before paging and count while complete amounts and invoice joins survive', async () => {
  const rows = [];
  for (let id = 1; id <= 7; id++) rows.push(seedBankTransaction(fixture, id, { created_by: id === 7 ? 99 : 7, amount: id === 6 ? 999999999.99 : 113.01 }));
  const first = await BankTransaction.getBankTransactions({ scopeClause: scoped }, 1, 2);
  const second = await BankTransaction.getBankTransactions({ scopeClause: scoped }, 2, 2);
  expect(first.pagination).toEqual({ total: 6, page: 1, pageSize: 2, totalPages: 3 });
  expect(first.transactions.map(row => row.id)).toEqual([6, 5]);
  expect(second.transactions.map(row => row.id)).toEqual([4, 3]);
  expect(first.transactions[0]).toEqual(expect.objectContaining(rows[5]));
  expect(first.transactions[0]).toEqual(expect.objectContaining({ related_invoice_number: 'AR-22', bank_name: '银行甲', account_name: '经营户', transaction_category: 'sales_income' }));
  const beyond = await BankTransaction.getBankTransactions({ scopeClause: scoped }, 9, 2);
  expect(beyond.transactions).toEqual([]);
  expect(beyond.pagination.total).toBe(6);
});

test.each([['AR', 22, 'AR-22'], ['AP', 21, 'AP-21'], ['AR', 999, null], ['other', 21, null]])(
  'bank page preserves %s invoice links and missing account records', async (type, id, number) => {
    seedBankTransaction(fixture, 1, { related_invoice_type: type, related_invoice_id: id, bank_account_id: 999 });
    const result = await BankTransaction.getBankTransactions();
    expect(result.transactions).toEqual([expect.objectContaining({ id: 1, account_name: null, bank_name: null, related_invoice_number: number, amount: 113.01 })]);
  }
);

test('all bank filters constrain count and page together, including zero min, false reconciled and type aliases', async () => {
  const target = seedBankTransaction(fixture, 1, { transaction_number: "B'1", amount: 0.01, related_party: '目标客户', transaction_date: '2026-10-01' });
  for (const [index, override] of [
    { transaction_number: 'OTHER' }, { bank_account_id: 999 }, { transaction_type: 'expense' },
    { transaction_date: '2026-09-30' }, { transaction_date: '2026-10-18' }, { is_reconciled: 1 },
    { status: 'draft' }, { amount: 100.01 }, { related_party: '其他客户' }, { created_by: 99 },
  ].entries()) seedBankTransaction(fixture, index + 2, { ...target, ...override, id: index + 2 });
  const filters = { transaction_number: "B'1", accountId: 7, transaction_type: ['income', '收入', ''], start_date: '2026-10-01', end_date: '2026-10-17', isReconciled: false, status: 'approved', minAmount: 0, maxAmount: 100, related_party: '目标', scopeClause: scoped };
  const result = await BankTransaction.getBankTransactions(filters, 1, 1);
  expect(result.pagination.total).toBe(1);
  expect(result.transactions).toEqual([expect.objectContaining(target)]);
  expect(db.pool.query.mock.calls[0][1]).toEqual(db.pool.execute.mock.calls[0][1]);
});

test('bank export keeps more than 100 complete scoped rows and performs no count query', async () => {
  for (let id = 1; id <= 130; id++) seedBankTransaction(fixture, id, { created_by: id > 125 ? 99 : 7 });
  const result = await BankTransaction.getBankTransactions({ noPagination: true, scopeClause: scoped }, 1, 10);
  expect(result.transactions).toHaveLength(125);
  expect(result.transactions[0].id).toBe(125);
  expect(result.transactions.at(-1).id).toBe(1);
  expect(result.pagination).toEqual({ total: 125, page: 1, pageSize: 125, totalPages: 1 });
  expect(db.pool.execute).not.toHaveBeenCalled();
  expect(db.pool.query).toHaveBeenCalledTimes(1);
  expect(db.pool.query.mock.calls[0][0]).not.toContain('LIMIT');
});

test('tax summary and bank count avoid display joins while paging precedes enrichment', async () => {
  seedTaxInvoice(fixture, 1);
  seedBankTransaction(fixture, 1);
  await taxModel.getTaxInvoices({ limit: 20 });
  await BankTransaction.getBankTransactions({ scopeClause: scoped }, 1, 20);
  const [[taxSummary], [taxList], [bankCount]] = db.pool.execute.mock.calls;
  expect(taxSummary).not.toContain('JOIN');
  expect(taxList.indexOf('LIMIT 20 OFFSET 0')).toBeLessThan(taxList.indexOf('LEFT JOIN suppliers'));
  expect(bankCount).toContain('finance_owner.department_id = ?');
  expect(bankCount).not.toContain('bank_accounts');
  expect(bankCount).not.toContain('ar_invoices');
  expect(bankCount).not.toContain('ap_invoices');
  const bankList = db.pool.query.mock.calls[0][0];
  expect(bankList.indexOf('LIMIT 20 OFFSET 0')).toBeLessThan(bankList.indexOf('LEFT JOIN bank_accounts'));
});

test('display lookups stay bounded by page size when historical rows require a sort', async () => {
  fixture.exec('DROP INDEX tax_invoice_date_id; DROP INDEX bank_transaction_date_id');
  for (let id = 1; id <= 250; id++) {
    seedTaxInvoice(fixture, id);
    seedBankTransaction(fixture, id);
  }
  let taxLookups = 0;
  let bankLookups = 0;
  fixture.function('observe_tax_party', value => { taxLookups++; return value; });
  fixture.function('observe_bank_account', value => { bankLookups++; return value; });
  const execute = async (sql, params = []) => [fixture.prepare(sql
    .replace('ON ti.supplier_id = s.id', 'ON observe_tax_party(ti.supplier_id) = s.id')
    .replace('ON t.bank_account_id = b.id', 'ON observe_bank_account(t.bank_account_id) = b.id')
  ).all(...params)];
  db.pool.execute.mockImplementation(execute);
  db.pool.query.mockImplementation(execute);
  const tax = await taxModel.getTaxInvoices({ limit: 2, offset: 4 });
  const bank = await BankTransaction.getBankTransactions({}, 3, 2);
  expect(tax.list.map(row => row.id)).toEqual([246, 245]);
  expect(bank.transactions.map(row => row.id)).toEqual([246, 245]);
  expect(tax.total).toBe(250);
  expect(bank.pagination.total).toBe(250);
  expect(taxLookups).toBe(2);
  expect(bankLookups).toBe(2);
});
