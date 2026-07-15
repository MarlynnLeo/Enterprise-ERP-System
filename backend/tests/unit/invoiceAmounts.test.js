const {
  normalizeInvoiceAmounts,
  applyNormalizedInvoiceAmounts,
} = require('../../src/utils/finance/invoiceAmounts');

describe('invoiceAmounts server-side authority', () => {
  test('按明细与税率重算价税合计', () => {
    const result = normalizeInvoiceAmounts(
      [
        { quantity: 2, unit_price: 100 },
        { quantity: 1, unit_price: 50 },
      ],
      { taxRate: 0.13 }
    );

    expect(result.subtotal).toBe(250);
    expect(result.taxAmount).toBe(32.5);
    expect(result.totalAmount).toBe(282.5);
    expect(result.items[0].amount).toBe(200);
  });

  test('写回 invoiceData 覆盖前端 total_amount', () => {
    const invoiceData = {
      total_amount: 9999,
      tax_rate: 13,
      items: [{ quantity: 1, unit_price: 100, amount: 1 }],
    };
    applyNormalizedInvoiceAmounts(invoiceData);
    expect(invoiceData.subtotal).toBe(100);
    expect(invoiceData.tax_amount).toBe(13);
    expect(invoiceData.total_amount).toBe(113);
    expect(invoiceData.items[0].amount).toBe(100);
  });
});
