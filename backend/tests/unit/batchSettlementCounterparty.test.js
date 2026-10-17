jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));
jest.mock('../../src/models/ap', () => ({ getInvoiceById: jest.fn(), createPayment: jest.fn() }));
jest.mock('../../src/models/ar', () => ({ getInvoiceById: jest.fn(), createReceipt: jest.fn() }));
jest.mock('../../src/services/business/CodeGeneratorService', () => ({ nextCode: jest.fn() }));
jest.mock('../../src/authorization/ScopeGuard', () => ({ denyUnlessAllAccess: jest.fn() }));

const db = require('../../src/config/db');
const apModel = require('../../src/models/ap');
const arModel = require('../../src/models/ar');
const CodeGeneratorService = require('../../src/services/business/CodeGeneratorService');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const { batchPayments } = require('../../src/controllers/business/finance/apBatchController');
const { batchReceipts } = require('../../src/controllers/business/finance/arBatchController');

describe.each([
  ['AP', batchPayments, apModel, 'createPayment', 'payments', 'supplier', 'paymentDate'],
  ['AR', batchReceipts, arModel, 'createReceipt', 'receipts', 'customer', 'receiptDate'],
])('%s batch settlement invoice counterparty', (_kind, controller, model, createMethod, linesKey, party, dateKey) => {
  let connection;
  beforeEach(() => {
    jest.clearAllMocks();
    connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
    db.pool.getConnection.mockResolvedValue(connection);
    CodeGeneratorService.nextCode.mockResolvedValue('SETTLEMENT-TEST');
    ScopeGuard.denyUnlessAllAccess.mockResolvedValue(true);
    model.getInvoiceById.mockResolvedValue({
      id: 10, invoiceNumber: 'INV-10', status: '已确认', balanceAmount: 100,
      [`${party}Id`]: 7, [`${party}Name`]: 'Invoice counterparty',
    });
    model[createMethod].mockImplementation(async (data) => {
      if (data[`${party}_id`] == null) throw new Error('Undefined counterparty cannot be written');
      return 44;
    });
  });

  it.each([true, false])('checks the whole batch before any write when atomic=%s', async (atomic) => {
    ScopeGuard.denyUnlessAllAccess.mockImplementation(async (res) => {
      res.status(403).json({ success: false });
      return false;
    });
    const req = {
      user: { id: 42 },
      body: { [linesKey]: [{ invoiceId: 10, amount: 30 }, { invoiceId: 99, amount: 20 }], atomic },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    await controller(req, res);

    expect(ScopeGuard.denyUnlessAllAccess).toHaveBeenCalledWith(
      res, connection, req, `${_kind.toLowerCase()}_invoice`, [10, 99], expect.any(String)
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(model.getInvoiceById).not.toHaveBeenCalled();
    expect(model[createMethod]).not.toHaveBeenCalled();
    expect(CodeGeneratorService.nextCode).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('uses the canonical invoice party when client overrides are present=%s', async (forged) => {
    const line = { invoiceId: 10, amount: 30 };
    if (forged) Object.assign(line, { [`${party}Id`]: 999, [`${party}Name`]: 'Client forgery' });
    const req = {
      user: { id: 42 },
      body: { [linesKey]: [line], [dateKey]: '2026-09-06', paymentMethod: '银行转账', bankAccountId: 1 },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    await controller(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(model[createMethod]).toHaveBeenCalledWith(expect.objectContaining({
      [`${party}_id`]: 7, [`${party}_name`]: 'Invoice counterparty', created_by: 42,
    }), [expect.objectContaining({ invoice_id: 10, amount: 30 })], connection);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
  });
});
