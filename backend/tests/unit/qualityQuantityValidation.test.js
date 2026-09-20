/* global describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/utils/logger', () => ({ logger: {} }));
jest.mock('../../src/services/business/NonconformingProductService', () => ({}));
jest.mock('../../src/services/business/PurchaseOrderStatusService', () => ({}));
jest.mock('../../src/services/quality/PurchaseReceiptService', () => ({}));

const ClosureService = require('../../src/services/quality/InspectionClosureService');

describe('inspection closure quantities cannot silently coerce corrupt numbers to zero', () => {
  test.each([
    { qualified_quantity: 'NaN', unqualified_quantity: 10, status: 'failed' },
    { qualified_quantity: 10, unqualified_quantity: 'Infinity', status: 'passed' },
    { qualified_quantity: 'Infinity', unqualified_quantity: 10, status: 'failed' },
    { quantity: 'NaN', qualified_quantity: 0, unqualified_quantity: 0, status: 'passed' },
  ])('rejects invalid quantities before producing receipt or nonconformance totals: %j', (values) => {
    expect(() => ClosureService.normalizeTerminalQuantities({ quantity: 10, ...values }, values)).toThrow('检验数量必须为有效数字');
  });

  test('continues to infer a complete pass when counts have not yet been entered', () => {
    expect(ClosureService.normalizeTerminalQuantities({ quantity: 10, status: 'passed' })).toEqual({
      inspectionQuantity: 10, qualifiedQuantity: 10, unqualifiedQuantity: 0,
    });
  });
});
