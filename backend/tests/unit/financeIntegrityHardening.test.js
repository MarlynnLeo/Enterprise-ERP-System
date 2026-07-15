/**
 * 财务完整性加固回归
 */
const {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_MAPPING,
} = require('../../src/constants/financeConstants');
const {
  normalizeInvoiceAmounts,
} = require('../../src/utils/finance/invoiceAmounts');
const {
  parseSettlementLine,
  SETTLEMENT_ELIGIBLE_STATUSES,
} = require('../../src/utils/finance/settlementMath');

describe('finance integrity hardening', () => {
  test('费用单据类型为规范英文 expense', () => {
    expect(DOCUMENT_TYPES.EXPENSE).toBe('expense');
    expect(DOCUMENT_TYPE_MAPPING.EXPENSE_PAYMENT).toBe('expense');
  });

  test('发票金额权威计算覆盖错误前端合计', () => {
    const result = normalizeInvoiceAmounts(
      [{ quantity: 10, unit_price: 12.5, amount: 1 }],
      { taxRate: 0.13, explicitTotalAmount: 99999 }
    );
    expect(result.subtotal).toBe(125);
    expect(result.taxAmount).toBe(16.25);
    expect(result.totalAmount).toBe(141.25);
  });

  test('批量核销明细可解析', () => {
    const line = parseSettlementLine({ amount: 80, discount_amount: 20 });
    expect(line.settlementCents).toBe(10000);
    expect(SETTLEMENT_ELIGIBLE_STATUSES).toContain('已确认');
  });
});
