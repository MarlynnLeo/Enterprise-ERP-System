/* global jest, beforeEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/models/tax', () => ({ createTaxInvoice: jest.fn() }));
jest.mock('../../src/services/business/TaxAccountingService', () => ({}));
jest.mock('../../src/services/finance/CreditNoteRefundService', () => ({}));
jest.mock('../../src/authorization/ScopeGuard', () => ({ denyUnlessAccess: jest.fn(async () => true) }));
const db = require('../../src/config/db');
const tax = require('../../src/models/tax');
const service = require('../../src/services/finance/RedLetterTaxService');
const controller = require('../../src/controllers/business/finance/creditNoteController');
let invoice;
let connection;
beforeEach(() => {
  jest.clearAllMocks();
  invoice = { id: 7, total_amount: -113, currency_code: 'USD', exchange_rate: 6.50000001, status: '已确认', source_id: 8 };
  connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    execute: jest.fn(async sql => {
      if (sql.includes('_invoices')) return [[invoice]];
      if (sql.includes('_returns')) return [[{ id: 8 }]];
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
  db.pool.getConnection.mockResolvedValue(connection);
});

test.each(['ar', 'ap'])('%s USD source rejects both original-tax selection and direct create before tax writes', async kind => {
  invoice.source_type = kind === 'ar' ? 'sales_return' : 'purchase_return';
  await expect(service.originals(kind, 7)).rejects.toMatchObject({ code: 'UNSUPPORTED_TAX_CURRENCY', statusCode: 400 });
  await expect(service.create({ kind, invoiceId: 7, invoiceNumber: 'RED-TEST', invoiceDate: '2026-10-17', currencyCode: 'CNY' }, 76)).rejects.toMatchObject({ statusCode: 400 });
  expect(tax.createTaxInvoice).not.toHaveBeenCalled();
  expect(connection.commit).not.toHaveBeenCalled();
  expect(connection.rollback).toHaveBeenCalledTimes(2);
});

test.each(['ar', 'ap'])('%s CNY source remains eligible without estimating any exchange rate', async kind => {
  Object.assign(invoice, { currency_code: 'CNY', exchange_rate: null, source_type: kind === 'ar' ? 'sales_return' : 'purchase_return' });
  expect(await service.getContext(connection, kind, 7)).toEqual({ invoice, returned: { id: 8 } });
});

test('direct HTTP create reports a clear 400 for stored USD despite a forged CNY request field', async () => {
  invoice.source_type = 'sales_return';
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  await controller.createRedLetter({ user: { id: 76 }, body: { kind: 'ar', invoiceId: 7, invoiceNumber: 'RED-TEST', invoiceDate: '2026-10-17', currencyCode: 'CNY' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json.mock.calls[0][0].message).toContain('外币红字发票转人民币税票暂不支持');
  expect(tax.createTaxInvoice).not.toHaveBeenCalled();
});
