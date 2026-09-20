jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/models/ar', () => ({ createReceipt: jest.fn() }));
jest.mock('../../src/models/ap', () => ({ createPayment: jest.fn() }));
jest.mock('../../src/models/cash/Account', () => ({}));
jest.mock('../../src/authorization/ScopeGuard', () => ({ denyUnlessAccess: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));

const arController = require('../../src/controllers/business/finance/arController');
const apController = require('../../src/controllers/business/finance/apController');
const ScopeGuard = require('../../src/authorization/ScopeGuard');

describe('settlement HTTP input validation', () => {
  test.each([
    ['ar', arController.createReceipt], ['ap', apController.createPayment],
  ])('%s rejects a partial numeric string before querying the invoice or creating settlement records', async (_, handler) => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    await handler({ body: { invoiceId: 31, receiptDate: '2026-09-18', amount: '100oops' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/有效数字/);
    expect(ScopeGuard.denyUnlessAccess).not.toHaveBeenCalled();
  });
});
