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
  ])(
    'rejects invalid quantities before producing receipt or nonconformance totals: %j',
    (values) => {
      expect(() =>
        ClosureService.normalizeTerminalQuantities({ quantity: 10, ...values }, values)
      ).toThrow('检验数量必须为有效数字');
    }
  );

  test('continues to infer a complete pass when counts have not yet been entered', () => {
    expect(ClosureService.normalizeTerminalQuantities({ quantity: 10, status: 'passed' })).toEqual({
      inspectionQuantity: 10,
      qualifiedQuantity: 10,
      unqualifiedQuantity: 0,
    });
  });

  test('completed requires a complete quantity judgement and never assumes a pass', () => {
    expect(() =>
      ClosureService.normalizeTerminalQuantities({ quantity: 10, status: 'completed' })
    ).toThrow('检验数量不一致');
  });

  test('replaying a closed pass cannot invent missing persisted release quantities', async () => {
    await expect(ClosureService.closeIfTerminal({
      id: 7, status: 'passed', quantity: 10, qualified_quantity: 0, unqualified_quantity: 0,
    }, { status: 'passed' }, {})).rejects.toThrow('检验数量不一致');
  });

  test.each([
    [10, 0],
    [6, 4],
    [0, 10],
  ])('completed retains explicit qualified=%s/unqualified=%s', (qualified, unqualified) => {
    expect(
      ClosureService.normalizeTerminalQuantities({
        quantity: 10,
        status: 'completed',
        qualified_quantity: qualified,
        unqualified_quantity: unqualified,
      })
    ).toEqual({
      inspectionQuantity: 10,
      qualifiedQuantity: qualified,
      unqualifiedQuantity: unqualified,
    });
  });

  test.each([
    ['passed', 8, 2, '检验通过时不合格数量必须为0'],
    ['failed', 8, 2, '检验不合格时合格数量必须为0'],
    ['partial', 10, 0, '部分合格必须同时包含'],
    ['partial', 0, 10, '部分合格必须同时包含'],
  ])('%s must agree with its disposition quantities', (status, qualified, unqualified, message) => {
    expect(() =>
      ClosureService.normalizeTerminalQuantities({
        quantity: 10,
        status,
        qualified_quantity: qualified,
        unqualified_quantity: unqualified,
      })
    ).toThrow(message);
  });
});
