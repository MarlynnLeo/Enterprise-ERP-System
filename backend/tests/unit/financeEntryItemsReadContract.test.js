/* global jest, test, expect */
jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));
jest.mock('../../src/config/financeConfig', () => ({ financeConfig: { get: jest.fn(() => 'CNY') } }));
jest.mock('../../src/config/accountingConfig', () => ({ accountingConfig: {} }));
jest.mock('../../src/services/business/OpeningBalanceService', () => ({}));
jest.mock('../../src/models/finance', () => ({ getEntryById: jest.fn(), getEntryItems: jest.fn() }));
jest.mock('../../src/utils/responseHandler', () => ({ ResponseHandler: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/authorization/ScopeGuard', () => ({ denyUnlessAccess: jest.fn().mockResolvedValue(true) }));

const finance = require('../../src/models/finance');
const controller = require('../../src/controllers/business/finance/financeController');
const { ResponseHandler } = require('../../src/utils/responseHandler');
const { financeConfig } = require('../../src/config/financeConfig');

test('line detail preserves missing historical currency instead of applying the current invoice default', async () => {
  finance.getEntryById.mockResolvedValue({ id: 9 });
  finance.getEntryItems.mockResolvedValue([
    { id: 1, account_id: 2, account_code: '1001', account_is_active: 1, currency_code: null, exchange_rate: null },
    { id: 2, account_id: 2, account_code: '1001', account_is_active: 1, currency_code: 'USD', exchange_rate: 7.1 },
  ]);
  const res = {};
  await controller.getEntryItems({ params: { id: '9' } }, res);
  expect(ResponseHandler.error).not.toHaveBeenCalled();
  expect(ResponseHandler.success).toHaveBeenCalledWith(res, [
    expect.objectContaining({ currencyCode: null, exchangeRate: null }),
    expect.objectContaining({ currencyCode: 'USD', exchangeRate: 7.1 }),
  ], '获取会计分录明细成功');
  expect(financeConfig.get).not.toHaveBeenCalled();
});
