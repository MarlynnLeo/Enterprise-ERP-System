/* global jest, beforeEach, describe, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/models/ar', () => ({ createReceipt: jest.fn(), getInvoiceById: jest.fn() }));
jest.mock('../../src/models/ap', () => ({ createPayment: jest.fn(), getInvoiceById: jest.fn() }));
jest.mock('../../src/models/cash/Account', () => ({ getBankAccountById: jest.fn() }));
jest.mock('../../src/authorization/ScopeGuard', () => ({ denyUnlessAccess: jest.fn(), stampOwner: jest.fn() }));
jest.mock('../../src/services/business/CodeGeneratorService', () => ({ nextCode: jest.fn().mockResolvedValue('TEST-REQUEST-1') }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));

const db = require('../../src/config/db');
const service = require('../../src/services/finance/SettlementRequestService');
const { parseSettlementLine } = require('../../src/utils/finance/settlementMath');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const BankAccount = require('../../src/models/cash/Account');
const arModel = require('../../src/models/ar');
const apModel = require('../../src/models/ap');
const arController = require('../../src/controllers/business/finance/arController');
const apController = require('../../src/controllers/business/finance/apController');
const KEY = 'TESTUIAUDIT-request-0001';
const kinds = [
  ['ar', arController.createReceipt, arModel, 'createReceipt'],
  ['ap', apController.createPayment, apModel, 'createPayment'],
];
const req = (body = {}, actorId = 42, key = KEY) => ({
  user: { id: actorId }, headers: key === null ? {} : { 'idempotency-key': key },
  body: { invoiceId: 31, receiptDate: '2026-10-17', paymentDate: '2026-10-17', amount: 1,
    discountAmount: 0, currencyCode: 'USD', exchangeRate: 6.5, paymentMethod: '银行转账', bankAccountId: 9, ...body },
});
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const evidence = (request, kind = 'ar') => service.requestEvidence(request, kind, parseSettlementLine(request.body));
const stored = (request, kind = 'ar', overrides = {}) => ({ id: 81, number: 'RECORDED-81', created_by: request.user.id,
  idempotency_hash: evidence(request, kind).hash, status: 'normal', currency_code: 'USD', exchange_rate: 6.5, base_amount: 6.5, ...overrides });

function connection(rows = []) {
  return {
    beginTransaction: jest.fn().mockResolvedValue(), commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(), release: jest.fn(), destroy: jest.fn(),
    execute: jest.fn(async sql => [sql.includes('FOR UPDATE') ? [{ id: 31 }] : rows]),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.pool.getConnection.mockReset();
  ScopeGuard.denyUnlessAccess.mockResolvedValue(true);
  ScopeGuard.stampOwner.mockImplementation(request => ({ created_by: request.user.id }));
  BankAccount.getBankAccountById.mockResolvedValue({ id: 9, is_active: 1 });
  for (const [, , model, method] of kinds) {
    model[method].mockReset().mockResolvedValue(81);
    model.getInvoiceById.mockReset().mockResolvedValue({ status: '已确认', balanceAmount: 10, currencyCode: 'USD',
      customerId: 7, supplierId: 7, customerName: '客户', supplierName: '供应商', invoiceNumber: 'TEST-INVOICE' });
  }
});

describe('settlement request evidence', () => {
  test('header is optional and legacy requests do not acquire a transaction', async () => {
    expect(await service.begin(req({}, 42, null), 'ar', parseSettlementLine({ amount: 1 }))).toBeNull();
    expect(db.pool.getConnection).not.toHaveBeenCalled();
  });
  test.each(['short', 'TESTUIAUDIT key spaces', 'x'.repeat(129), ['TESTUIAUDIT-valid']])('rejects invalid key %p before the DB', key => {
    expect(() => evidence(req({}, 42, key))).toThrow(expect.objectContaining({ statusCode: 400, code: 'VALIDATION_ERROR' }));
    expect(db.pool.getConnection).not.toHaveBeenCalled();
  });
  test('equivalent amounts, currency, rate, method and identifiers hash identically', () => {
    const first = req();
    const second = req({ invoiceId: '31', amount: '1.00', discountAmount: '0.00', currencyCode: ' usd ',
      exchangeRate: '6.50000000', paymentMethod: 'bank_transfer', bankAccountId: '9' });
    expect(evidence(first).hash).toBe(evidence(second).hash);
  });
  test.each([{ amount: 2 }, { exchangeRate: 7 }, { bankAccountId: 10 }, { notes: 'changed' },
    { invoiceId: 32 }, { receiptDate: '2026-10-18' }, { discountAmount: 1 }])('business change %p changes the hash', change => {
    expect(evidence(req(change)).hash).not.toBe(evidence(req()).hash);
  });
  test('actor and AP approval evidence are bound; ignored forged fields cannot replace actor', () => {
    expect(evidence(req({}, 43)).hash).not.toBe(evidence(req()).hash);
    expect(evidence(req({ approvalId: 100 }), 'ap').hash).not.toBe(evidence(req(), 'ap').hash);
    expect(evidence(req({ createdBy: 43, created_by: 43, customerId: 900 })).hash).toBe(evidence(req()).hash);
  });
});

describe.each(kinds)('%s create request transaction and replay', (kind, handler, model, method) => {
  test('legacy request keeps the two-argument model contract', async () => {
    const res = response(); await handler(req({}, 42, null), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(model[method].mock.calls[0]).toHaveLength(2);
    expect(db.pool.getConnection).not.toHaveBeenCalled();
  });
  test('fresh request persists key/hash in the same transaction as the model', async () => {
    const conn = connection(); db.pool.getConnection.mockResolvedValue(conn);
    const request = req(); const res = response(); await handler(request, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(model[method]).toHaveBeenCalledWith(expect.objectContaining({ idempotency_key: KEY,
      idempotency_hash: evidence(request, kind).hash, created_by: 42 }), expect.any(Array), conn);
    expect(conn.commit).toHaveBeenCalledTimes(1); expect(conn.rollback).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);
  });
  test.each(['normal', 'void'])('replays %s original before current invoice state and creates nothing', async status => {
    const request = req(); const conn = connection([stored(request, kind, { status })]);
    db.pool.getConnection.mockResolvedValue(conn);
    model.getInvoiceById.mockResolvedValue({ status: '已付款', balanceAmount: 0 });
    const res = response(); await handler(request, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ id: 81, replayed: true, status }) }));
    expect(model.getInvoiceById).not.toHaveBeenCalled(); expect(model[method]).not.toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalledTimes(1); expect(conn.release).toHaveBeenCalledTimes(1);
  });
  test.each(['payload', 'actor'])('rejects same key with different %s and writes nothing', async changed => {
    const original = req(); const request = changed === 'actor' ? req({}, 43) : req({ amount: 2 });
    const conn = connection([stored(original, kind)]); db.pool.getConnection.mockResolvedValue(conn);
    const res = response(); await handler(request, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('IDEMPOTENCY_CONFLICT');
    expect(model[method]).not.toHaveBeenCalled(); expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.release).toHaveBeenCalledTimes(1);
  });
  test('failure rolls back and permits the unchanged key to succeed on retry', async () => {
    const first = connection(), second = connection();
    db.pool.getConnection.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    model[method].mockRejectedValueOnce(new Error('银行余额不足')).mockResolvedValueOnce(81);
    const failed = response(); await handler(req(), failed);
    expect(failed.status).toHaveBeenCalledWith(400); expect(first.rollback).toHaveBeenCalledTimes(1);
    expect(first.commit).not.toHaveBeenCalled(); expect(first.release).toHaveBeenCalledTimes(1);
    const retried = response(); await handler(req(), retried);
    expect(retried.status).toHaveBeenCalledWith(201); expect(second.commit).toHaveBeenCalledTimes(1);
    expect(model[method].mock.calls[0][0].idempotency_key).toBe(model[method].mock.calls[1][0].idempotency_key);
  });
  test('unknown commit result returns 503 instead of suggesting a new request', async () => {
    const conn = connection(); conn.commit.mockRejectedValue(new Error('connection lost after COMMIT'));
    db.pool.getConnection.mockResolvedValue(conn);
    const res = response(); await handler(req(), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0].code).toBe('SETTLEMENT_RESULT_UNKNOWN');
    expect(conn.release).toHaveBeenCalledTimes(1);
  });
  test('rollback uncertainty destroys the connection and returns 503', async () => {
    const conn = connection(); conn.rollback.mockRejectedValue(new Error('connection lost'));
    db.pool.getConnection.mockResolvedValue(conn); model[method].mockRejectedValue(new Error('write interrupted'));
    const res = response(); await handler(req(), res);
    expect(res.status).toHaveBeenCalledWith(503); expect(conn.destroy).toHaveBeenCalledTimes(1);
    expect(conn.release).not.toHaveBeenCalled();
  });
  test('unique-key race rolls back before lookup and detects different invoice payload', async () => {
    const request = req({ invoiceId: 32 }); const conn = connection();
    conn.execute.mockResolvedValueOnce([[{ id: 32 }]]).mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([ [stored(req(), kind)] ]);
    db.pool.getConnection.mockResolvedValue(conn);
    model[method].mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }));
    const res = response(); await handler(request, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.rollback.mock.invocationCallOrder[0]).toBeLessThan(conn.execute.mock.invocationCallOrder[2]);
    expect(conn.commit).not.toHaveBeenCalled(); expect(conn.release).toHaveBeenCalledTimes(1);
  });
});
