/* global jest, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { execute: jest.fn().mockResolvedValue([[{ id: 1, account_code: '100202' }, { id: 2, account_code: '1122' }]]) } }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));
jest.mock('../../src/config/accountingConfig', () => ({ accountingConfig: { loadFromDatabase: jest.fn(), getAccountCode: jest.fn(() => '') } }));
jest.mock('../../src/services/business/OpeningBalanceService', () => ({}));
jest.mock('../../src/services/business/PeriodValidationService', () => ({ validateFinanceEntry: jest.fn().mockResolvedValue({ allowed: true }) }));
jest.mock('../../src/models/finance', () => ({}));
jest.mock('../../src/services/finance/GLService', () => ({ createEntry: jest.fn().mockResolvedValue(35) }));
jest.mock('../../src/authorization/ScopeGuard', () => ({ stampOwner: jest.fn().mockReturnValue({ created_by: 3 }) }));
jest.mock('../../src/utils/responseHandler', () => ({ ResponseHandler: { success: jest.fn(), error: jest.fn() } }));

const controller = require('../../src/controllers/business/finance/financeController');
const GLService = require('../../src/services/finance/GLService');
const { ResponseHandler } = require('../../src/utils/responseHandler');

test('HTTP manual creation enables the currency guard regardless of client-provided bypass flags', async () => {
  const req = { body: { entryDate: '2026-10-17', periodId: 1, documentType: '记账凭证',
    requireManualAccountCurrency: false, allowHistoricalAuxiliaries: true,
    options: { requireManualAccountCurrency: false },
    items: [{ accountId: 1, debitAmount: 100, creditAmount: 0 }, { accountId: 2, debitAmount: 0, creditAmount: 100 }],
  } };
  await controller.createEntry(req, {});
  expect(ResponseHandler.error).not.toHaveBeenCalled();
  expect(GLService.createEntry).toHaveBeenCalledWith(expect.objectContaining({ created_by: 3 }), expect.any(Array), null, { requireManualAccountCurrency: true });
  expect(GLService.createEntry.mock.calls[0][0]).not.toHaveProperty('allow_historical_auxiliaries');
});
