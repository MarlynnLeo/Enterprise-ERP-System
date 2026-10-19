/* global jest, describe, beforeEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/models/ar', () => ({ createInvoice: jest.fn(), updateInvoice: jest.fn(), getInvoiceById: jest.fn(), getInvoicePayments: jest.fn() }));
jest.mock('../../src/models/ap', () => ({ createInvoice: jest.fn(), updateInvoice: jest.fn(), getInvoiceById: jest.fn(), getUnpaidInvoices: jest.fn(), getInvoicePayments: jest.fn() }));
jest.mock('../../src/models/cash/Account', () => ({}));
jest.mock('../../src/authorization/ScopeGuard', () => ({ denyUnlessAccess: jest.fn(), stampOwner: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));

const arController = require('../../src/controllers/business/finance/arController');
const apController = require('../../src/controllers/business/finance/apController');
const ar = require('../../src/models/ar');
const ap = require('../../src/models/ap');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const invalidRate = () => Object.assign(new Error('美元必须填写实际汇率'), { code: 'VALIDATION_ERROR', statusCode: 400 });
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const body = () => ({ invoiceNumber: 'USD-1', customerId: 1, supplierId: 2, invoiceDate: '2026-10-17', dueDate: '2026-10-31', totalAmount: 100, currencyCode: 'USD' });

beforeEach(() => {
  jest.clearAllMocks();
  ScopeGuard.denyUnlessAccess.mockResolvedValue(true);
  ScopeGuard.stampOwner.mockReturnValue({ created_by: 1 });
});

test.each([
  { id: 5, invoiceNumber: 'AP-5', supplierId: 2, amount: 0.03, paidAmount: 0.01, balance: 0.02, currencyCode: 'USD', exchangeRate: '6.50000001' },
  { id: 5, invoice_number: 'AP-5', supplier_id: 2, total_amount: 0.03, paid_amount: 0.01, balance_amount: 0.02, currency_code: 'USD', exchange_rate: '6.50000001' },
])('AP unpaid selector keeps the actual currency/rate through the final controller mapping', async row => {
  ap.getUnpaidInvoices.mockResolvedValue([row]);
  const res = response();
  await apController.getUnpaidInvoices({ query: {} }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json.mock.calls[0][0].data).toEqual([expect.objectContaining({
    id: 5, currencyCode: 'USD', exchangeRate: 6.50000001, totalAmount: 0.03, paidAmount: 0.01, balanceAmount: 0.02, amount: 0.03, balance: 0.02,
  })]);
});

test('AP payment-history header preserves canonical invoice money and currency', async () => {
  ap.getInvoiceById.mockResolvedValue({ id: 5, invoiceNumber: 'AP-5', totalAmount: 0.03, paidAmount: 0.01, balanceAmount: 0.02, currencyCode: 'USD', exchangeRate: 6.50000001 });
  ap.getInvoicePayments.mockResolvedValue([]);
  const res = response();
  await apController.getInvoicePayments({ params: { id: '5' } }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json.mock.calls[0][0].data.invoice).toMatchObject({ id: 5, totalAmount: 0.03, amount: 0.03, paidAmount: 0.01, balance: 0.02, balanceAmount: 0.02, currencyCode: 'USD', exchangeRate: 6.50000001 });
});

describe.each([['ar', arController, ar], ['ap', apController, ap]])('%s invoice currency HTTP boundary', (_kind, controller, model) => {
  test('history HTTP output preserves all records and keeps void audit evidence', async () => {
    const history = Array.from({ length: 26 }, (_, index) => ({ id: index + 1, amount: 0.01, currencyCode: 'USD', exchangeRate: 6.50000001,
      baseSettlementAmount: 0.07, status: index === 25 ? 'void' : 'normal', voidReason: index === 25 ? '测试作废原因' : null }));
    model.getInvoiceById.mockResolvedValue({ id: 1, totalAmount: 0.3, paidAmount: 0.25, balanceAmount: 0.05 });
    model.getInvoicePayments.mockResolvedValue(history);
    const res = response();
    await controller.getInvoicePayments({ params: { id: '1' } }, res);
    const result = res.json.mock.calls[0][0].data;
    expect(_kind === 'ar' ? result : result.data).toEqual(history);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('edit data preserves nonzero monetary values and currency evidence from canonical model data', async () => {
    const invoice = { id: 1, invoiceNumber: 'USD-1', totalAmount: 0.03, paidAmount: 0.01, balanceAmount: 0.02,
      currencyCode: 'USD', exchangeRate: 6.50000001, items: [{ quantity: 1, unitPrice: 0.03, amount: 0.03 }] };
    model.getInvoiceById.mockResolvedValue(invoice);
    const res = response();
    await controller.getInvoiceForEdit({ params: { id: '1' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toEqual(expect.objectContaining(invoice));
  });

  test('invalid create rate is a readable 400 validation error', async () => {
    model.createInvoice.mockRejectedValue(invalidRate());
    const res = response();
    await controller.createInvoice({ body: body() }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toContain('美元必须填写实际汇率');
  });

  test('invalid draft update rate is a 400 validation error', async () => {
    model.getInvoiceById.mockResolvedValue({ status: '草稿' });
    model.updateInvoice.mockRejectedValue(invalidRate());
    const res = response();
    await controller.updateInvoice({ params: { id: '1' }, user: { id: 75 }, body: body() }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toContain('美元必须填写实际汇率');
  });

  test.each([{ currencyCode: 'CNY' }, { exchangeRate: 1 }])('confirmed invoice rejects submitted financial currency field %j', async update => {
    model.getInvoiceById.mockResolvedValue({ status: '已确认' });
    const res = response();
    await controller.updateInvoice({ params: { id: '1' }, body: update }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(model.updateInvoice).not.toHaveBeenCalled();
  });

  test('create owner overrides forged client authors with the authenticated scope owner', async () => {
    model.createInvoice.mockResolvedValue(81);
    ScopeGuard.stampOwner.mockReturnValue({ created_by: 75 });
    const res = response();
    await controller.createInvoice({ user: { id: 75 }, body: { ...body(), exchangeRate: 6.50000001, createdBy: 999, updatedBy: 999 } }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(model.createInvoice).toHaveBeenCalledWith(expect.objectContaining({ created_by: 75 }));
  });

  test.each(['草稿', '已确认'])('%s updates use authenticated editor and never client author fields', async status => {
    model.getInvoiceById.mockResolvedValue({ status });
    model.updateInvoice.mockResolvedValue(true);
    const payload = status === '草稿' ? { ...body(), exchangeRate: 6.50000001 } : { notes: 'checked' };
    const res = response();
    await controller.updateInvoice({ params: { id: '1' }, user: { id: 76 }, body: { ...payload, createdBy: 999, updatedBy: 999 } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(model.updateInvoice).toHaveBeenCalledWith(expect.objectContaining({ updated_by: 76 }));
    expect(model.updateInvoice.mock.calls[0][0].created_by).toBeUndefined();
  });
});
