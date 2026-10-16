jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/models/ar', () => ({ createReceipt: jest.fn(), getInvoiceById: jest.fn() }));
jest.mock('../../src/models/ap', () => ({ createPayment: jest.fn(), getInvoiceById: jest.fn() }));
jest.mock('../../src/models/cash/Account', () => ({}));
jest.mock('../../src/authorization/ScopeGuard', () => ({ denyUnlessAccess: jest.fn(), stampOwner: jest.fn() }));
jest.mock('../../src/services/business/CodeGeneratorService', () => ({ nextCode: jest.fn().mockResolvedValue('TEST-1') }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));

const arController = require('../../src/controllers/business/finance/arController');
const apController = require('../../src/controllers/business/finance/apController');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const arModel = require('../../src/models/ar');
const apModel = require('../../src/models/ap');

describe('settlement HTTP input validation', () => {
  beforeEach(() => jest.clearAllMocks());
  test.each([
    ['ar', arController.createReceipt], ['ap', apController.createPayment],
  ])('%s rejects a partial numeric string before querying the invoice or creating settlement records', async (_, handler) => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    await handler({ body: { invoiceId: 31, receiptDate: '2026-09-18', amount: '100oops' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/有效数字/);
    expect(ScopeGuard.denyUnlessAccess).not.toHaveBeenCalled();
  });

  test.each([
    ['ar', arController.createReceipt, arModel, 'createReceipt', 'cash'],
    ['ar', arController.createReceipt, arModel, 'createReceipt', '现金'],
    ['ap', apController.createPayment, apModel, 'createPayment', 'cash'],
    ['ap', apController.createPayment, apModel, 'createPayment', '现金'],
  ])('%s accepts %s cash without silently converting it to bank transfer', async (_kind, handler, model, method, paymentMethod) => {
    ScopeGuard.denyUnlessAccess.mockResolvedValue(true);
    ScopeGuard.stampOwner.mockReturnValue({ created_by: 42 });
    model.getInvoiceById.mockResolvedValue({
      status: '已确认', balanceAmount: 100, customerId: 7, supplierId: 7,
      customerName: '客户', supplierName: '供应商',
    });
    model[method].mockResolvedValue(51);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    await handler({
      user: { id: 42 }, body: { invoiceId: 31, receiptDate: '2026-10-01',
        paymentDate: '2026-10-01', amount: 100, paymentMethod },
    }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(model[method]).toHaveBeenCalledWith(expect.objectContaining({
      payment_method: '现金', bank_account_id: null,
    }), expect.any(Array));
  });
});
