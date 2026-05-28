const Precision = require('./precision');

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;

  const normalized = typeof value === 'string'
    ? value.trim().replace(/,/g, '').replace(/%$/, '')
    : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function roundMoney(value) {
  return Precision.round2(toNumber(value, 0));
}

function normalizeTaxRate(value, fallback = 0) {
  const numeric = toNumber(value, fallback);
  if (numeric <= 0) return 0;
  const ratio = numeric > 1 ? Precision.div(numeric, 100) : numeric;
  return Precision.round(ratio, 6);
}

function lineAmount(quantity, unitPrice) {
  return roundMoney(Precision.mul(toNumber(quantity, 0), toNumber(unitPrice, 0)));
}

function taxAmount(amountExcludingTax, taxRate) {
  return roundMoney(Precision.mul(amountExcludingTax, normalizeTaxRate(taxRate, 0)));
}

function totalWithTax(amountExcludingTax, taxRate) {
  return roundMoney(Precision.add(amountExcludingTax, taxAmount(amountExcludingTax, taxRate)));
}

function splitTaxIncluded(totalAmount, taxRate) {
  const total = roundMoney(totalAmount);
  const rate = normalizeTaxRate(taxRate, 0);
  if (total <= 0 || rate <= 0) {
    return {
      subtotal: total,
      taxRate: rate,
      taxAmount: 0,
      totalAmount: total,
    };
  }

  const subtotal = roundMoney(Precision.div(total, Precision.add(1, rate)));
  const tax = roundMoney(Precision.sub(total, subtotal));
  return {
    subtotal,
    taxRate: rate,
    taxAmount: tax,
    totalAmount: total,
  };
}

function sumMoney(values) {
  return roundMoney((values || []).reduce((sum, value) => Precision.add(sum, toNumber(value, 0)), 0));
}

function calculateLines(items = [], options = {}) {
  const defaultTaxRate = normalizeTaxRate(options.defaultTaxRate ?? 0, 0);

  const lines = items.map((item) => {
    const quantity = toNumber(item.quantity, 0);
    const price = toNumber(item.price ?? item.unit_price ?? item.unitPrice, 0);
    const rate = normalizeTaxRate(item.tax_rate ?? item.taxRate ?? item.tax_percent ?? item.taxPercent, defaultTaxRate);
    const amount = lineAmount(quantity, price);
    const tax = item.tax_amount !== undefined || item.taxAmount !== undefined
      ? roundMoney(item.tax_amount ?? item.taxAmount)
      : taxAmount(amount, rate);

    return {
      ...item,
      quantity,
      price,
      unit_price: price,
      tax_rate: rate,
      tax_percent: rate,
      tax_amount: tax,
      amount,
      total: amount,
      total_price: amount,
      total_amount: roundMoney(Precision.add(amount, tax)),
    };
  });

  const subtotal = sumMoney(lines.map((item) => item.amount));
  const tax = sumMoney(lines.map((item) => item.tax_amount));

  return {
    items: lines,
    subtotal,
    taxAmount: tax,
    totalAmount: roundMoney(Precision.add(subtotal, tax)),
    taxRate: defaultTaxRate,
  };
}

module.exports = {
  toNumber,
  roundMoney,
  normalizeTaxRate,
  lineAmount,
  taxAmount,
  totalWithTax,
  splitTaxIncluded,
  sumMoney,
  calculateLines,
};
