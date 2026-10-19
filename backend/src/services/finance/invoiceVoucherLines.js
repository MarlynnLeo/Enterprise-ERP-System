'use strict';

const Decimal = require('decimal.js');
const {
  pickLineMetadata,
  pickCommonLineMetadata,
  singleMaterialMetadata,
} = require('./voucherLineMetadata');

const cents = (value) =>
  new Decimal(value || 0).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
const converted = (amount, rate) =>
  new Decimal(amount || 0).times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

function currencyValidationError(message) {
  return Object.assign(new Error(message), { code: 'VALIDATION_ERROR', statusCode: 400 });
}

function resolveVoucherCurrency(source = {}) {
  const currencyCode = String(
    source.currency_code ?? source.currencyCode ?? source.currency ?? 'CNY'
  )
    .trim()
    .toUpperCase();
  if (!['CNY', 'USD'].includes(currencyCode)) {
    throw currencyValidationError(`币种 ${currencyCode} 暂不支持生成凭证，请先配置支持的币种`);
  }
  const rawRate = source.exchange_rate ?? source.exchangeRate;
  const rate =
    rawRate == null || rawRate === '' ? (currencyCode === 'CNY' ? 1 : NaN) : Number(rawRate);
  if (
    (rawRate != null && rawRate !== '' && !['number', 'string'].includes(typeof rawRate)) ||
    !Number.isFinite(rate) ||
    rate <= 0 ||
    (currencyCode === 'CNY' && rate !== 1)
  ) {
    throw currencyValidationError(
      `${currencyCode} 凭证缺少有效汇率；人民币汇率必须为1，美元必须填写实际汇率`
    );
  }
  const decimalRate = new Decimal(
    rawRate == null || rawRate === '' ? rate : String(rawRate).trim()
  );
  if (decimalRate.decimalPlaces() > 8 || decimalRate.gte('10000000000')) {
    throw currencyValidationError('发票汇率最多8位小数，且必须小于10000000000');
  }
  return { currency_code: currencyCode, exchange_rate: rate };
}

// Missing fields preserve draft evidence. A currency change must never inherit
// the previous currency's rate, especially CNY's implicit rate of one.
function resolveInvoiceUpdateCurrency(source, current) {
  const currencyCode =
    source.currency_code !== undefined ? source.currency_code : current.currency_code;
  const currencyChanged =
    String(currencyCode ?? 'CNY')
      .trim()
      .toUpperCase() !==
    String(current.currency_code ?? 'CNY')
      .trim()
      .toUpperCase();
  return resolveVoucherCurrency({
    currency_code: currencyCode,
    exchange_rate:
      source.exchange_rate !== undefined
        ? source.exchange_rate
        : currencyChanged
          ? undefined
          : current.exchange_rate,
  });
}

function assertInvoiceCurrencyUnchanged(source, current) {
  if (source.currency_code === undefined && source.exchange_rate === undefined) return;
  const requested = resolveInvoiceUpdateCurrency(source, current);
  const recorded = resolveVoucherCurrency(current);
  if (
    requested.currency_code !== recorded.currency_code ||
    requested.exchange_rate !== recorded.exchange_rate
  ) {
    throw currencyValidationError(
      '已确认发票的币种和汇率已进入财务闭环，不能直接修改，请走红字或调整流程'
    );
  }
}

function resolveSameVoucherCurrency(sources = []) {
  const currencies = sources.map(resolveVoucherCurrency);
  const first = currencies[0] || resolveVoucherCurrency();
  if (
    currencies.some(
      (currency) =>
        currency.currency_code !== first.currency_code ||
        currency.exchange_rate !== first.exchange_rate
    )
  ) {
    throw new Error('不同币种或汇率的业务单据不能合并生成凭证，请按币种和汇率分别生成');
  }
  return first;
}

// Input debit/credit here are invoice-currency amounts. This function is never
// used for inventory cost lines, which already contain CNY book values.
function convertInvoiceCurrencyLines(lines, source = {}, { roleByAccount = {} } = {}) {
  const currency = resolveVoucherCurrency(source);
  const result = lines.map((line) => {
    const debit = Number(line.debit_amount) || 0;
    const credit = Number(line.credit_amount) || 0;
    return {
      ...line,
      ...currency,
      foreign_amount: currency.currency_code === 'USD' ? Math.abs(debit || credit) : null,
      base_rounding_adjustment: 0,
      debit_amount: converted(debit, currency.exchange_rate),
      credit_amount: converted(credit, currency.exchange_rate),
    };
  });
  const originalDifference = lines.reduce(
    (sum, line) => sum + cents(line.debit_amount) - cents(line.credit_amount),
    0
  );
  if (originalDifference !== 0) throw new Error('发票原币分录借贷不平，请核对价税合计');
  let difference = result.reduce(
    (sum, line) => sum + cents(line.debit_amount) - cents(line.credit_amount),
    0
  );
  // Rounding each tax/net amount may differ from rounding the invoice total.
  // Keep receivable/payable at round(invoice total * rate) so settlement can
  // clear its exact booked balance. Only net/tax splits may absorb the cent.
  if (currency.currency_code === 'USD') {
    for (let index = result.length - 1; index >= 0 && difference !== 0; index--) {
      const line = result[index];
      const role = roleByAccount[line.account_id] || line.role;
      if (role === 'receivable' || role === 'payable') continue;
      const side = line.credit_amount > 0 ? 'credit_amount' : 'debit_amount';
      const adjustment = side === 'credit_amount' ? Math.sign(difference) : -Math.sign(difference);
      if (cents(line[side]) + adjustment <= 0) continue;
      line[side] = (cents(line[side]) + adjustment) / 100;
      line.base_rounding_adjustment = adjustment / 100;
      difference += side === 'credit_amount' ? -adjustment : adjustment;
    }
  }
  if (difference !== 0) throw new Error('凭证本位币舍入差额超出允许范围，请核对原币和汇率');
  return result;
}

function prepareInvoiceVoucherLines(
  lines,
  invoice,
  { quantityAccountId, roleByAccount = {} } = {}
) {
  const sourceItems = Array.isArray(invoice.items) ? invoice.items : [];
  const quantity = singleMaterialMetadata(sourceItems);
  const overrides = Array.isArray(invoice.gl_entry?.entry_lines)
    ? invoice.gl_entry.entry_lines
    : [];
  const common = pickCommonLineMetadata(invoice.gl_entry || {});
  // Document parties and physical quantities are authoritative source values,
  // not common dimensions that may be copied onto every account.
  const enriched = lines.map((line) => {
    const role = roleByAccount[line.account_id];
    const override = overrides.find((candidate) => candidate.role === role) || {};
    const metadata = pickLineMetadata(override);
    for (const field of ['quantity', 'unit_name', 'unit_price']) delete metadata[field];
    if (line.customer_id) metadata.customer_id = line.customer_id;
    if (line.supplier_id) metadata.supplier_id = line.supplier_id;
    return {
      ...line,
      ...common,
      ...metadata,
      ...(Number(line.account_id) === Number(quantityAccountId) ? quantity : {}),
      // The resulting invoice identity is authoritative, even after a preview.
      invoice_number: invoice.invoice_number,
    };
  });
  return convertInvoiceCurrencyLines(enriched, invoice, { roleByAccount });
}

async function loadInvoiceLineMetadata(connection, invoice, kind) {
  if (Array.isArray(invoice.items) || !invoice.id) return invoice;
  if (!['ar', 'ap'].includes(kind)) throw new Error('Unsupported invoice metadata source');
  const [items] = await connection.execute(
    `SELECT ii.* FROM ${kind}_invoice_items ii WHERE ii.invoice_id = ? ORDER BY ii.id`,
    [invoice.id]
  );
  // Reconfirmation must not replace a historical unit with today's material
  // default. Only the invoice or an exactly matching source line is evidence.
  let sourceItems = [];
  if (
    kind === 'ap' &&
    ['purchase_receipt', 'inbound'].includes(invoice.source_type) &&
    invoice.source_id
  ) {
    [sourceItems] = await connection.execute(
      `SELECT si.*, u.name AS unit_name, h.supplier_id AS source_party_id
         FROM purchase_receipt_items si JOIN purchase_receipts h ON h.id = si.receipt_id
         LEFT JOIN units u ON u.id = si.unit_id WHERE si.receipt_id = ?`,
      [invoice.source_id]
    );
  } else if (kind === 'ar' && invoice.source_type === 'sales_outbound' && invoice.source_id) {
    [sourceItems] = await connection.execute(
      `SELECT si.*, u.name AS unit_name, so.customer_id AS source_party_id
         FROM sales_outbound_items si JOIN sales_outbound h ON h.id = si.outbound_id
         LEFT JOIN sales_orders so ON so.id = COALESCE(si.source_order_id, h.order_id)
         LEFT JOIN units u ON u.id = si.unit_id WHERE si.outbound_id = ?`,
      [invoice.source_id]
    );
  }
  const partyId = Number(kind === 'ar' ? invoice.customer_id : invoice.supplier_id);
  const enriched = items.map((item) => {
    if (item.unit_name) return item;
    const candidates = sourceItems.filter(
      (source) =>
        Number(source.source_party_id) === partyId &&
        Number(source.material_id ?? source.product_id) ===
          Number(item.material_id ?? item.product_id) &&
        Number(kind === 'ap' ? source.qualified_quantity : source.quantity) ===
          Number(item.quantity) &&
        source.price != null &&
        Number(source.price) === Number(item.unit_price)
    );
    return candidates.length === 1 ? { ...item, unit_name: candidates[0].unit_name || null } : item;
  });
  return { ...invoice, items: enriched };
}

module.exports = {
  resolveVoucherCurrency,
  resolveInvoiceUpdateCurrency,
  assertInvoiceCurrencyUnchanged,
  resolveSameVoucherCurrency,
  convertInvoiceCurrencyLines,
  prepareInvoiceVoucherLines,
  loadInvoiceLineMetadata,
};
