/**
 * 发票金额服务端权威计算
 * 明细 amount = qty * unit_price（未税）
 * 合计 = 明细未税合计 + 税额
 */

const { lineAmount, normalizeTaxRate, taxAmount, roundMoney, toNumber, sumMoney } =
  require('../money');

/**
 * 规范化发票明细并重算金额
 * @param {Array} items
 * @param {Object} options
 * @param {number|string} [options.taxRate] 整单税率（0-1 或百分数）
 * @param {number|string} [options.explicitTaxAmount] 外部给定税额（如集成侧已算好）
 * @param {number|string} [options.explicitTotalAmount] 外部给定总额（仅在无明细时使用）
 */
function normalizeInvoiceAmounts(items = [], options = {}) {
  const taxRate = normalizeTaxRate(options.taxRate ?? options.tax_rate ?? 0, 0);
  const hasItems = Array.isArray(items) && items.length > 0;

  if (!hasItems) {
    const total = roundMoney(options.explicitTotalAmount ?? options.total_amount ?? 0);
    const tax = roundMoney(
      options.explicitTaxAmount ?? options.tax_amount ?? taxAmount(total, taxRate)
    );
    // 无明细时：若给了 total，税从 total 反推或用 explicitTax
    let subtotal = roundMoney(options.amount_excluding_tax ?? options.subtotal ?? 0);
    if (!subtotal && total) {
      subtotal = taxRate > 0 ? roundMoney(total - tax) : total;
    }
    const finalTax =
      options.explicitTaxAmount !== undefined && options.explicitTaxAmount !== null
        ? roundMoney(options.explicitTaxAmount)
        : taxAmount(subtotal, taxRate);
    const finalTotal =
      options.explicitTotalAmount !== undefined && options.explicitTotalAmount !== null
        ? roundMoney(options.explicitTotalAmount)
        : roundMoney(subtotal + finalTax);

    return {
      items: [],
      subtotal,
      taxAmount: finalTax,
      taxRate,
      totalAmount: finalTotal,
    };
  }

  const normalizedItems = items.map((item) => {
    const quantity = toNumber(item.quantity, 0);
    const unitPrice = toNumber(item.unit_price ?? item.unitPrice, 0);
    const amount = lineAmount(quantity, unitPrice);
    return {
      ...item,
      quantity,
      unit_price: unitPrice,
      amount,
    };
  });

  const subtotal = sumMoney(normalizedItems.map((item) => item.amount));
  const finalTax =
    options.explicitTaxAmount !== undefined &&
    options.explicitTaxAmount !== null &&
    options.explicitTaxAmount !== ''
      ? roundMoney(options.explicitTaxAmount)
      : taxAmount(subtotal, taxRate);
  const totalAmount = roundMoney(subtotal + finalTax);

  return {
    items: normalizedItems,
    subtotal,
    taxAmount: finalTax,
    taxRate,
    totalAmount,
  };
}

/**
 * 将重算结果写回 invoiceData（就地）
 */
function applyNormalizedInvoiceAmounts(invoiceData = {}) {
  const normalized = normalizeInvoiceAmounts(invoiceData.items || [], {
    taxRate: invoiceData.tax_rate ?? invoiceData.taxRate,
    explicitTaxAmount: invoiceData.tax_amount ?? invoiceData.taxAmount,
    explicitTotalAmount: invoiceData.items?.length
      ? undefined
      : invoiceData.total_amount ?? invoiceData.totalAmount,
    amount_excluding_tax: invoiceData.amount_excluding_tax,
    subtotal: invoiceData.subtotal,
  });

  invoiceData.items = normalized.items.length ? normalized.items : invoiceData.items;
  invoiceData.amount_excluding_tax = normalized.subtotal;
  invoiceData.subtotal = normalized.subtotal;
  invoiceData.tax_amount = normalized.taxAmount;
  invoiceData.tax_rate = normalized.taxRate;
  invoiceData.total_amount = normalized.totalAmount;

  return normalized;
}

module.exports = {
  normalizeInvoiceAmounts,
  applyNormalizedInvoiceAmounts,
};
