/**
 * 财务结算与凭证类型一致性
 */
const {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_MAPPING,
  INVOICE_STATUS,
} = require('../../src/constants/financeConstants');
const {
  parseSettlementLine,
  invoiceStatusAfterSettlement,
  assertWithinBalance,
  assertBankBalanceSufficient,
  SETTLEMENT_ELIGIBLE_STATUSES,
  toCents,
  fromCents,
} = require('../../src/utils/finance/settlementMath');

describe('finance settlement integrity', () => {
  test('业务映射使用规范英文 document_type', () => {
    expect(DOCUMENT_TYPES.COLLECTION).toBe('collection');
    expect(DOCUMENT_TYPE_MAPPING.SALES_COLLECTION).toBe(DOCUMENT_TYPES.COLLECTION);
    expect(DOCUMENT_TYPES.PAYMENT).toBe('payment');
    expect(DOCUMENT_TYPE_MAPPING.PURCHASE_PAYMENT).toBe(DOCUMENT_TYPES.PAYMENT);
  });

  test('核销额 = 实收/实付 + 折扣', () => {
    const line = parseSettlementLine({ amount: 950, discount_amount: 50 });
    expect(line.settlementCents).toBe(100000);
    expect(line.cashCents).toBe(95000);
    expect(line.discountCents).toBe(5000);
    expect(fromCents(line.settlementCents)).toBe(1000);
  });

  test.each(['invalid', '10abc', '', ' ', null, undefined, false, [], NaN, Infinity])(
    '拒绝无效实收实付金额 %p，不能将其当作零现金核销', (amount) => {
      expect(() => parseSettlementLine({ amount, discount_amount: 10 })).toThrow(/有效数字/);
    }
  );

  test.each(['invalid', ' ', false, [], NaN, Infinity])('拒绝无效折扣 %p', (discount) => {
    expect(() => parseSettlementLine({ amount: 10, discount_amount: discount })).toThrow(/有效数字/);
  });

  test('拒绝四舍五入为零的负金额和超出整数精度的核销', () => {
    expect(() => parseSettlementLine({ amount: -0.001, discount_amount: 10 })).toThrow(/负数/);
    expect(() => parseSettlementLine({ amount: 1e20 })).toThrow(/精确计算范围/);
    expect(parseSettlementLine({ amount: '0', discountAmount: '10.50' }).settlementCents).toBe(1050);
  });

  test('发票状态随核销进度变化', () => {
    expect(invoiceStatusAfterSettlement(0, 100000)).toBe(INVOICE_STATUS.CONFIRMED);
    expect(invoiceStatusAfterSettlement(40000, 100000)).toBe(INVOICE_STATUS.PARTIAL_PAID);
    expect(invoiceStatusAfterSettlement(100000, 100000)).toBe(INVOICE_STATUS.PAID);
  });

  test('余额与银行校验', () => {
    expect(() => assertWithinBalance(10002, 10000)).toThrow(/超过发票余额/);
    expect(() => assertWithinBalance(10001, 10000)).not.toThrow(); // 1 分取整容差
    expect(() => assertWithinBalance(10000, 10000)).not.toThrow();
    expect(() => assertBankBalanceSufficient(5000, 5001)).toThrow(/账户余额不足/);
    expect(() => assertBankBalanceSufficient(5000, 5000)).not.toThrow();
    expect(toCents('10.55')).toBe(1055);
  });

  test('可结算状态集合', () => {
    expect(SETTLEMENT_ELIGIBLE_STATUSES).toEqual(
      expect.arrayContaining([
        INVOICE_STATUS.CONFIRMED,
        INVOICE_STATUS.PARTIAL_PAID,
        INVOICE_STATUS.OVERDUE,
      ])
    );
    expect(SETTLEMENT_ELIGIBLE_STATUSES).not.toContain(INVOICE_STATUS.DRAFT);
    expect(SETTLEMENT_ELIGIBLE_STATUSES).not.toContain(INVOICE_STATUS.PAID);
  });
});
