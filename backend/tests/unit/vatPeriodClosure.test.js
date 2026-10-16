jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(), execute: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));
jest.mock('../../src/services/business/TaxAccountingService', () => ({
  getCurrentPeriodId: jest.fn().mockResolvedValue(1), generateInputTaxEntry: jest.fn(),
  generateOutputTaxEntry: jest.fn(), generateVATReturnEntry: jest.fn().mockResolvedValue({ entryId: 90, entryNumber: 'VAT90' }),
}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({ tryAutoLink: jest.fn() }));
jest.mock('../../src/services/business/CodeGeneratorService', () => ({ nextCode: jest.fn().mockResolvedValue('TAX-PAY-1') }));
jest.mock('../../src/services/business/BankBalanceService', () => ({ syncAccountBalance: jest.fn() }));
jest.mock('../../src/utils/responseHandler', () => ({ ResponseHandler: {
  success: (res, data, message, status = 200) => Object.assign(res, { status, data, message }),
  error: (res, message, code, status) => Object.assign(res, { status, message, code }),
} }));
const db = require('../../src/config/db');
const VAT = require('../../src/services/finance/VATReturnService');
const Guard = require('../../src/services/finance/TaxPeriodGuard');
const tax = require('../../src/models/tax');
const controller = require('../../src/controllers/business/finance/taxController');

function fixture({ prior = [], output = 0, deduction = 0, blocked = false, invoice = {}, taxReturn = {} } = {}) {
  const state = { prior, output, deduction, blocked, invoice, taxReturn, changes: [] };
  const connection = {
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    query: jest.fn(async (sql, args) => { state.changes.push([sql, args]); Object.assign(state.taxReturn, args[0]); return [{ affectedRows: 1 }]; }),
    execute: jest.fn(async (sql, args) => {
      if (sql.includes('tax_ledger_locks')) return [[{ id: 1 }]];
      if (sql.includes('return_period < ?')) return [state.prior];
      if (sql.includes('return_period >= ?') || sql.includes('return_period > ?')) return [state.blocked ? [{ id: 10, return_period: '2026-10' }] : []];
      if (sql.includes('tax_returns WHERE id')) return [[state.taxReturn]];
      if (sql.includes('FROM bank_accounts')) return [[{ id: 3, current_balance: 500, currency_code: 'CNY', is_active: 1 }]];
      if (sql.includes('tax_invoices WHERE id')) return [[state.invoice]];
      if (sql.includes('AS sales_output_tax')) return [[{ sales_amount: 100, sales_output_tax: state.output }]];
      if (sql.includes('AS purchase_input_tax')) return [[{ purchase_amount: 100, purchase_input_tax: state.deduction }]];
      if (sql.includes('AS input_tax_deduction')) return [[{ input_tax_deduction: state.deduction }]];
      if (sql.includes('SELECT id FROM tax_returns')) return [[]];
      if (/^(UPDATE|INSERT|DELETE)/.test(sql.trim())) { state.changes.push([sql, args]); return [{ insertId: 22, affectedRows: 1 }]; }
      throw new Error(`Unexpected VAT query ${sql}`);
    }),
  };
  db.pool.getConnection.mockResolvedValue(connection);
  return { state, connection };
}
const baseline = { opening_input_credit: 0, opening_credit_note: '首次启用，核对申报表无期初留抵' };
const req = (body = {}) => ({ params: { id: '1' }, user: { id: 7 }, body });
beforeEach(() => jest.clearAllMocks());

test('September excess input 100 carries into October output 80 and leaves 20', async () => {
  const { connection, state } = fixture({ deduction: 100 });
  const september = await VAT.calculate(connection, '2026-09', baseline);
  expect(september).toMatchObject({ tax_payable: 0, closing_input_credit: 100 });
  state.prior = [{ ...september, id: 8, return_period: '2026-09', status: '已申报', vat_snapshot_version: 1 }];
  state.output = 80; state.deduction = 0;
  const october = await VAT.calculate(connection, '2026-10', { opening_input_credit: 999 });
  expect(october).toMatchObject({ opening_input_credit: 100, tax_payable: 0, closing_input_credit: 20, previous_vat_return_id: 8, previous_vat_snapshot_version: 1 });
});

test('red input deduction and year boundary consume carry correctly', async () => {
  const { connection } = fixture({ prior: [{ id: 2, return_period: '2025-12', status: '已缴纳', vat_snapshot_version: 2, closing_input_credit: 30 }], output: 20, deduction: -40 });
  expect(await VAT.calculate(connection, '2026-01')).toMatchObject({ opening_input_credit: 30, tax_payable: 30, closing_input_credit: 0 });
});

test.each([
  [{ id: 1, return_period: '2026-08', status: '已申报' }, /逐月/],
  [{ id: 1, return_period: '2026-09', status: '草稿' }, /先提交上期/],
  [{ id: 1, return_period: '2026-09', status: '已缴纳', vat_snapshot_version: 0 }, /核对/],
])('missing, draft or legacy predecessor cannot silently discard credits', async (previous, message) => {
  const { connection } = fixture({ prior: [previous] });
  await expect(VAT.calculate(connection, '2026-10')).rejects.toThrow(message);
});

test('legacy boundary accepts a documented balance without modifying paid history', async () => {
  const { connection, state } = fixture({ prior: [{ id: 1, return_period: '2026-09', status: '已缴纳', vat_snapshot_version: 0 }], output: 80 });
  expect(await VAT.calculate(connection, '2026-10', { opening_input_credit: 100, opening_credit_note: '9 月实报表留抵 100' })).toMatchObject({ tax_payable: 0, closing_input_credit: 20, previous_vat_snapshot_version: 0 });
  expect(state.changes).toHaveLength(0);
});

test.each(['deductTaxInvoice', 'certifyTaxInvoice', 'voidTaxInvoice'])('%s rejects tax basis changes after declaration, including red invoices', async action => {
  const { connection, state } = fixture({ blocked: true, invoice: { id: 1, invoice_type: '进项', status: action === 'certifyTaxInvoice' ? '未认证' : '已认证', invoice_date: '2026-10-01', original_tax_invoice_id: 4 } });
  const res = {};
  await controller[action](req({ deductionDate: '2026-10-15', certificationDate: '2026-10-15' }), res);
  expect(res.status).toBe(400);
  expect(res.message).toMatch(/已申报/);
  expect(state.changes).toHaveLength(0);
  expect(connection.rollback).toHaveBeenCalled();
  expect(connection.execute.mock.calls[0][0]).toContain('tax_ledger_locks');
});

test('certified creation uses the same declaration guard before INSERT', async () => {
  const { connection, state } = fixture({ blocked: true });
  await expect(tax.createTaxInvoice({ invoice_type: '销项', status: '已认证', invoice_date: '2026-10-01', amount_excluding_tax: 100, tax_rate: 13, tax_amount: 13, total_amount: 113 }, connection)).rejects.toThrow(/已申报/);
  expect(state.changes).toHaveLength(0);
});

test('payment refuses a stale declaration before bank or voucher mutation', async () => {
  const { connection, state } = fixture({ output: 100, deduction: 0 });
  state.taxReturn = { ...(await VAT.calculate(connection, '2026-10', baseline)), ...baseline, id: 1, return_type: '增值税', return_period: '2026-10', status: '已申报', vat_snapshot_version: 1 };
  state.deduction = 40;
  const res = {};
  await controller.payTaxReturn(req({ paymentDate: '2026-10-15', bankAccountId: 3 }), res);
  expect(res.status).toBe(400); expect(res.message).toMatch(/旧快照/); expect(state.changes).toHaveLength(0);
});

test('upstream version change invalidates a same-amount snapshot', async () => {
  const { connection, state } = fixture({ prior: [{ id: 2, return_period: '2026-09', status: '已申报', vat_snapshot_version: 1, closing_input_credit: 30 }] });
  const snapshot = { ...(await VAT.calculate(connection, '2026-10')), vat_snapshot_version: 1, return_period: '2026-10' };
  state.prior[0].vat_snapshot_version = 2;
  await expect(VAT.assertSnapshot(connection, snapshot)).rejects.toThrow(/旧快照/);
});

test.each([[80, 100, 0, 20], [100, 40, 60, 0]])('fresh submitted VAT %s/%s pays the correct amount %s', async (output, deduction, payable, credit) => {
  const { connection, state } = fixture({ output, deduction,
    taxReturn: { ...baseline, id: 1, return_type: '增值税', return_period: '2026-10', status: '草稿', vat_snapshot_version: 0 },
  });
  const submitted = {}; await controller.submitTaxReturn(req({ declarationDate: '2026-10-15' }), submitted);
  expect(submitted.status).toBe(200);
  expect(state.taxReturn).toMatchObject({ tax_payable: payable, closing_input_credit: credit, vat_snapshot_version: 1 });
  state.taxReturn.status = '已申报';
  const paid = {}; await controller.payTaxReturn(req({ paymentDate: '2026-10-15', bankAccountId: 3 }), paid);
  expect(paid.status).toBe(200); expect(paid.data.taxPaid).toBe(payable);
  const bankWrites = state.changes.filter(([sql]) => sql.includes('INSERT INTO bank_transactions'));
  expect(bankWrites).toHaveLength(payable ? 1 : 0);
  if (payable) expect(bankWrites[0][1][4]).toBe(payable);
  expect(connection.commit).toHaveBeenCalledTimes(2);
});

test('new return persists calculated carryforward and evidence, ignoring manual tax payable', async () => {
  const { state } = fixture({ output: 80, deduction: 100 });
  const res = {};
  await controller.createTaxReturn(req({ returnType: '增值税', returnPeriod: '2026-10', openingInputCredit: 0, openingCreditNote: baseline.opening_credit_note, taxPayable: 999, autoCalculate: false }), res);
  expect(res.status).toBe(201);
  const [, values] = state.changes.find(([sql]) => sql.includes('INSERT INTO tax_returns'));
  expect(values[7]).toBe(0); expect(values[20]).toBe(20); expect(values[21]).toBe(baseline.opening_credit_note);
});

test('cannot reopen a predecessor while a later declaration is final', async () => {
  const { state } = fixture({ blocked: true, taxReturn: { id: 1, return_type: '增值税', return_period: '2026-09', status: '已申报', tax_paid: 0 } });
  const res = {}; await controller.reopenTaxReturn(req({ reason: '重算' }), res);
  expect(res.status).toBe(400); expect(res.message).toMatch(/后续/); expect(state.changes).toHaveLength(0);
});

test('submission waits for the ledger lock before reading invoice/return state', async () => {
  const { connection } = fixture();
  let unlock;
  connection.execute.mockImplementationOnce(() => new Promise(resolve => { unlock = () => resolve([[{ id: 1 }]]); }));
  const pending = controller.submitTaxReturn(req(), {});
  await new Promise(resolve => setImmediate(resolve));
  expect(connection.execute).toHaveBeenCalledTimes(1);
  unlock(); await pending;
});

test('no tax period lock row fails closed', async () => {
  await expect(Guard.lock({ execute: async () => [[]] })).rejects.toThrow(/迁移/);
});

test('generic legacy setters cannot bypass dedicated transactions', async () => {
  await expect(tax.updateTaxInvoiceStatus(1, '已抵扣')).rejects.toThrow(/事务/);
  await expect(tax.updateTaxReturnStatus(1, '已缴纳')).rejects.toThrow(/事务/);
});
