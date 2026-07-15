const {
  getInventoryTransactionTypeText,
  isIncreaseTransaction,
  isDecreaseTransaction,
  isTransferTransaction,
} = require('../../src/constants/systemConstants');

describe('inventory reversal transaction type mapping', () => {
  test.each([
    ['inbound', '其他入库'],
    ['outbound', '其他出库'],
    ['inbound_cancel', '撤销入库'],
    ['outbound_cancel', '撤销出库'],
    ['transfer_cancel_in', '撤销调拨入库'],
    ['transfer_cancel_out', '撤销调拨出库'],
  ])('maps %s to a Chinese label', (code, label) => {
    expect(getInventoryTransactionTypeText(code)).toBe(label);
  });

  test('keeps reversal inventory directions and transfer grouping explicit', () => {
    expect(isDecreaseTransaction('inbound_cancel')).toBe(true);
    expect(isIncreaseTransaction('outbound_cancel')).toBe(true);
    expect(isDecreaseTransaction('transfer_cancel_in')).toBe(true);
    expect(isIncreaseTransaction('transfer_cancel_out')).toBe(true);
    expect(isTransferTransaction('transfer_cancel_in')).toBe(true);
    expect(isTransferTransaction('transfer_cancel_out')).toBe(true);
  });
});
