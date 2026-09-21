const { RECEIPT_STATUS } = require('../../src/constants/purchaseConstants');
const businessConfig = require('../../src/config/businessConfig');
const { PURCHASE_RECEIPT_COUNTED_STATUSES } = require('../../src/constants/qualityReceipt');
const { getStatusValues, isValidTransition } = require('../../src/constants/statusRegistry');

test.each(['purchaseReceipt', 'purchaseReceiptStatus'])(
  '%s requires an inspected stage and has no legacy confirmation path',
  (domain) => {
    expect(new Set(getStatusValues(domain))).toEqual(new Set(Object.values(RECEIPT_STATUS)));
    expect(isValidTransition(domain, 'draft', 'inspected')).toBe(true);
    expect(isValidTransition(domain, 'inspected', 'completed')).toBe(true);
    expect(isValidTransition(domain, 'draft', 'completed')).toBe(false);
    expect(isValidTransition(domain, 'draft', 'confirmed')).toBe(false);
    expect(isValidTransition(domain, 'confirmed', 'completed')).toBe(false);
    for (const terminal of ['completed', 'cancelled']) {
      expect(isValidTransition(domain, terminal, 'draft')).toBe(false);
      expect(isValidTransition(domain, terminal, 'inspected')).toBe(false);
    }
    expect(isValidTransition(domain, 'draft', 'cancelled')).toBe(true);
    expect(isValidTransition(domain, 'inspected', 'cancelled')).toBe(true);
  }
);

test('configuration and order-quantity aggregation consume the canonical receipt lifecycle', () => {
  expect(businessConfig.status.receipt).toBe(RECEIPT_STATUS);
  expect(PURCHASE_RECEIPT_COUNTED_STATUSES).toEqual(['inspected', 'completed']);
});
