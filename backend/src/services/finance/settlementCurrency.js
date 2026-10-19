'use strict';

const Decimal = require('decimal.js');
const BusinessError = require('../../utils/BusinessError');
const { requirePositiveInteger } = require('../../models/finance/helpers');
const { BANK_BACKED_PAYMENT_METHODS } = require('../../constants/financeConstants');
const {
  parseSettlementLine,
  assertInvoiceSettlementsEligible,
} = require('../../utils/finance/settlementMath');

const round = (value) => new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const amount = (value, label) => {
  try {
    if (!['string', 'number'].includes(typeof value) || String(value).trim() === '')
      throw new Error();
    const result = new Decimal(value);
    if (!result.isFinite()) throw new Error();
    return result;
  } catch {
    throw new BusinessError(`${label}必须为有效数字`);
  }
};

function allocateBaseSettlement({ invoice, originalBase, previous = [], cashAmount }) {
  const total = amount(invoice.total_amount, '发票原币总额');
  const paid = amount(invoice.paid_amount ?? 0, '发票已核销原币金额');
  const rate = amount(invoice.exchange_rate, '发票确认汇率');
  const book = amount(originalBase, '发票原本位币金额');
  const cash = amount(cashAmount, '本次原币金额');
  if (
    cash.decimalPlaces() > 2 ||
    cash.lte(0) ||
    total.lte(0) ||
    paid.lt(0) ||
    paid.plus(cash).gt(total)
  ) {
    throw new BusinessError('美元收付金额必须大于0、最多2位小数且不能超过发票余额');
  }
  if (!book.eq(round(total.times(rate))))
    throw new BusinessError('原美元发票控制科目本位金额与确认汇率不一致，请先核对');
  let previousForeign = new Decimal(0),
    previousBase = new Decimal(0);
  for (const row of previous) {
    if (
      row.base_settlement_amount == null ||
      row.currency_code !== 'USD' ||
      !amount(row.exchange_rate, '历史确认汇率').eq(rate) ||
      Number(row.discount_amount || 0) !== 0
    ) {
      throw new BusinessError('历史美元核销缺少本位币分配记录或汇率不一致，不能继续核销');
    }
    const foreign = amount(row.amount, '历史原币金额');
    const base = amount(row.base_settlement_amount, '历史本位核销金额');
    if (foreign.lte(0) || base.lte(0)) throw new BusinessError('历史美元核销记录无效，请先核对');
    previousForeign = previousForeign.plus(foreign);
    previousBase = previousBase.plus(base);
  }
  if (
    !previousForeign.eq(paid) ||
    previousBase.gt(book) ||
    !amount(invoice.balance_amount, '发票余额').eq(total.minus(paid))
  ) {
    throw new BusinessError('发票历史核销与原币/本位币记录不一致，不能继续核销');
  }
  const cumulative = paid.plus(cash);
  const base = (cumulative.eq(total) ? book : round(cumulative.times(rate))).minus(previousBase);
  const adjustment = base.minus(round(cash.times(rate)));
  if (base.lte(0) || base.gt(book.minus(previousBase)) || adjustment.abs().gt('0.01')) {
    throw new BusinessError('美元部分核销的本位币尾差无法可靠分配，请核对历史核销记录');
  }
  return { baseAmount: base.toFixed(2), roundingAdjustment: adjustment.toFixed(2) };
}

async function originalInvoiceControl(connection, kind, invoice) {
  const [entries] = await connection.execute(
    `SELECT e.id FROM gl_entries e WHERE e.document_type = 'invoice' AND e.is_posted = 1
       AND COALESCE(e.is_reversed, 0) = 0 AND e.reversal_entry_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM gl_entries original WHERE original.reversal_entry_id = e.id)
       AND (EXISTS (SELECT 1 FROM document_links dl WHERE dl.source_type = ? AND dl.source_id = ?
         AND dl.target_type = 'finance_voucher' AND dl.target_id = e.id) OR e.document_number = ?)
       ORDER BY e.id LOCK IN SHARE MODE`,
    [`${kind}_invoice`, invoice.id, invoice.invoice_number]
  );
  if (entries.length !== 1)
    throw new BusinessError(`美元发票 ${invoice.invoice_number} 缺少唯一原始已过账凭证，不能核销`);
  const [items] = await connection.execute(
    'SELECT * FROM gl_entry_items WHERE entry_id = ? ORDER BY line_number, id LOCK IN SHARE MODE',
    [entries[0].id]
  );
  const party = kind === 'ar' ? 'customer_id' : 'supplier_id';
  const side = kind === 'ar' ? 'debit_amount' : 'credit_amount';
  const opposite = kind === 'ar' ? 'credit_amount' : 'debit_amount';
  const candidates = items.filter(
    (item) =>
      item.currency_code === 'USD' &&
      Number(item[party]) === Number(invoice[party]) &&
      Number(item[side]) > 0 &&
      Number(item[opposite] || 0) === 0 &&
      item.foreign_amount != null &&
      amount(item.foreign_amount, '原凭证外币金额').eq(invoice.total_amount) &&
      amount(item.exchange_rate, '原凭证汇率').eq(invoice.exchange_rate) &&
      (!item.invoice_number || item.invoice_number === invoice.invoice_number)
  );
  if (candidates.length !== 1)
    throw new BusinessError(
      `美元发票 ${invoice.invoice_number} 无法唯一追溯原应收/应付控制行，不能核销`
    );
  const control = candidates[0];
  if (
    !amount(control[side], '原本位金额').eq(
      round(amount(invoice.total_amount, '发票总额').times(invoice.exchange_rate))
    )
  ) {
    throw new BusinessError(
      `美元发票 ${invoice.invoice_number} 原控制行存在未解释本位差额，不能核销`
    );
  }
  return { control, baseAmount: control[side] };
}

async function prepareSettlementCurrency(connection, kind, data, rawItems) {
  if (!['ar', 'ap'].includes(kind)) throw new Error('Unsupported settlement kind');
  if (!Array.isArray(rawItems) || !rawItems.length) throw new BusinessError('收付款明细不能为空');
  const ids = rawItems.map((item) => requirePositiveInteger(item.invoice_id, '发票ID'));
  if (new Set(ids).size !== ids.length) throw new BusinessError('同一张发票不能在收付款明细中重复');
  const invoices = new Map();
  let currencyCode = null,
    rate = null;
  for (const invoiceId of [...ids].sort((a, b) => a - b)) {
    const [rows] = await connection.execute(
      `SELECT * FROM ${kind}_invoices WHERE id = ? FOR UPDATE`,
      [invoiceId]
    );
    if (rows.length !== 1) throw new BusinessError('发票不存在或已被删除');
    const invoice = rows[0];
    const currentCurrency = String(invoice.currency_code || 'CNY').toUpperCase();
    if (
      currentCurrency === 'USD' &&
      (invoice.exchange_rate == null || invoice.exchange_rate === '')
    ) {
      throw new BusinessError('美元发票缺少已确认的实际汇率，不能核销');
    }
    const currentRate = amount(invoice.exchange_rate ?? 1, '发票确认汇率');
    if (
      !['CNY', 'USD'].includes(currentCurrency) ||
      currentRate.lte(0) ||
      currentRate.decimalPlaces() > 8 ||
      (currentCurrency === 'CNY' && !currentRate.eq(1))
    ) {
      throw new BusinessError('收付款仅支持有效人民币或美元确认汇率');
    }
    if (currencyCode && (currencyCode !== currentCurrency || !rate.eq(currentRate)))
      throw new BusinessError('不同币种或不同确认汇率的发票必须分别收付款');
    currencyCode = currentCurrency;
    rate = currentRate;
    invoices.set(invoiceId, invoice);
  }
  if (data.currency_code && String(data.currency_code).toUpperCase() !== currencyCode)
    throw new BusinessError('收付款币种必须与发票币种一致');
  if (data.exchange_rate != null && !amount(data.exchange_rate, '收付款汇率').eq(rate))
    throw new BusinessError('收付款须使用发票确认汇率；不同汇率结算暂不支持');
  const result = {
    currencyCode,
    exchangeRate: rate.toFixed(8),
    baseAmount: round(data.total_amount).toFixed(2),
    invoices,
    allocations: new Map(),
  };
  if (currencyCode === 'CNY') return result;
  if (data.exchange_rate == null || data.exchange_rate === '')
    throw new BusinessError('美元收付款必须明确确认发票汇率');
  if (data.is_refund) throw new BusinessError('美元退货退款暂不支持，请使用已支持的结算业务');
  if (!BANK_BACKED_PAYMENT_METHODS.has(data.payment_method) || !data.bank_account_id)
    throw new BusinessError('美元收付款必须选择美元银行账户，暂不支持美元现金');
  const party = kind === 'ar' ? 'customer_id' : 'supplier_id';
  const settlement = kind === 'ar' ? 'receipt' : 'payment';
  let totalBase = new Decimal(0),
    totalForeign = new Decimal(0);
  for (const item of rawItems) {
    const invoice = invoices.get(Number(item.invoice_id));
    if (Number(invoice[party]) !== Number(data[party]))
      throw new BusinessError('收付款往来单位与发票不一致');
    assertInvoiceSettlementsEligible(invoice.status, `发票 ${invoice.invoice_number}`);
    const parsed = parseSettlementLine(item);
    if (parsed.discountCents !== 0 || parsed.cashCents <= 0)
      throw new BusinessError('美元收付款暂不支持折扣，实收付金额必须大于0');
    const original = await originalInvoiceControl(connection, kind, invoice);
    const [previous] = await connection.execute(
      `SELECT si.amount, si.discount_amount, si.base_settlement_amount, s.currency_code, s.exchange_rate
       FROM ${kind}_${settlement}_items si JOIN ${kind}_${settlement}s s ON s.id = si.${settlement}_id
       WHERE si.invoice_id = ? AND COALESCE(s.status, 'normal') NOT IN ('void', 'cancelled')
       ORDER BY si.id FOR UPDATE`,
      [invoice.id]
    );
    const allocation = allocateBaseSettlement({
      invoice,
      originalBase: original.baseAmount,
      previous,
      cashAmount: item.amount,
    });
    result.allocations.set(Number(item.invoice_id), {
      ...allocation,
      foreignAmount: amount(item.amount, '原币金额').toFixed(2),
      control: original.control,
      invoice,
    });
    totalBase = totalBase.plus(allocation.baseAmount);
    totalForeign = totalForeign.plus(item.amount);
  }
  if (!totalForeign.eq(amount(data.total_amount, '收付款总额')))
    throw new BusinessError('美元收付款总额必须等于原币明细合计');
  result.baseAmount = totalBase.toFixed(2);
  return result;
}

function buildUsdSettlementLines(fx, { kind, bankAccountId, paymentMethod }) {
  const rows = [];
  for (const allocation of fx.allocations.values()) {
    const { invoice, control, baseAmount, foreignAmount, roundingAdjustment } = allocation;
    const dimensions = Object.fromEntries(
      [
        'department_id',
        'cost_center_id',
        'customer_id',
        'supplier_id',
        'employee_id',
        'employee_source',
        'project_id',
        'project_name',
      ].map((field) => [field, control[field] ?? null])
    );
    const common = {
      ...dimensions,
      currency_code: 'USD',
      exchange_rate: fx.exchangeRate,
      foreign_amount: foreignAmount,
      base_rounding_adjustment: roundingAdjustment,
      invoice_number: invoice.invoice_number,
      settlement_method: paymentMethod,
    };
    // Both sides use the same documented cumulative allocation at the invoice
    // rate. Actual bank movement and invoice balances remain original USD.
    rows.push({
      ...common,
      account_id: bankAccountId,
      debit_amount: kind === 'ar' ? baseAmount : 0,
      credit_amount: kind === 'ap' ? baseAmount : 0,
      description: `美元${kind === 'ar' ? '收款' : '付款'} - ${invoice.invoice_number}`,
    });
    rows.push({
      ...common,
      account_id: control.account_id,
      debit_amount: kind === 'ap' ? baseAmount : 0,
      credit_amount: kind === 'ar' ? baseAmount : 0,
      description: `${kind === 'ar' ? '应收' : '应付'}核销 - ${invoice.invoice_number}`,
    });
  }
  return rows;
}

module.exports = { allocateBaseSettlement, prepareSettlementCurrency, buildUsdSettlementLines };
