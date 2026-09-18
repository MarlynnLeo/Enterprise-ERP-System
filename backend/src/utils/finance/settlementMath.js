/**
 * 应收/应付核销金额与状态计算（纯函数）
 * 口径：核销额 = 实收(付)金额 + 现金折扣
 */

const Precision = require('../precision');
const { INVOICE_STATUS } = require('../../constants/financeConstants');

function toCents(value) {
  return Math.round(Precision.mul(Number(value) || 0, 100));
}

function fromCents(cents) {
  return Precision.div(Number(cents) || 0, 100);
}

/**
 * 解析一行收/付款明细的现金、折扣与核销额（单位：分）
 */
function parseSettlementLine(item = {}) {
  const cashCents = toCents(item.amount);
  const discountCents = toCents(item.discount_amount ?? item.discountAmount ?? 0);

  if (cashCents < 0 || discountCents < 0) {
    throw new Error('收付款金额与折扣金额不能为负数');
  }
  if (cashCents === 0 && discountCents === 0) {
    throw new Error('收付款金额与折扣金额不能同时为0');
  }

  return {
    cashCents,
    discountCents,
    settlementCents: cashCents + discountCents,
    cashAmount: fromCents(cashCents),
    discountAmount: fromCents(discountCents),
    settlementAmount: fromCents(cashCents + discountCents),
  };
}

/**
 * 校验核销额不超过发票余额（允许 1 分取整容差）
 */
function assertWithinBalance(settlementCents, balanceCents, label = '核销金额') {
  if (settlementCents > balanceCents + 1) {
    throw new Error(
      `${label} ${fromCents(settlementCents).toFixed(2)} 超过发票余额 ${fromCents(balanceCents).toFixed(2)}`
    );
  }
}

/**
 * 校验银行账户余额足以支付（单位：分）
 */
function assertBankBalanceSufficient(balanceCents, cashCents) {
  if (cashCents <= 0) return;
  if (balanceCents < cashCents) {
    throw new Error(
      `账户余额不足，当前余额: ${fromCents(balanceCents).toFixed(2)}, 需付款: ${fromCents(cashCents).toFixed(2)}`
    );
  }
}

/**
 * 收/付款后的发票状态
 */
function invoiceStatusAfterSettlement(paidCents, totalCents) {
  if (totalCents < 0) {
    if (paidCents >= 0) return INVOICE_STATUS.CONFIRMED;
    return paidCents <= totalCents ? INVOICE_STATUS.PAID : INVOICE_STATUS.PARTIAL_PAID;
  }
  if (paidCents <= 0) {
    return INVOICE_STATUS.CONFIRMED;
  }
  if (totalCents - paidCents <= 0) {
    return INVOICE_STATUS.PAID;
  }
  return INVOICE_STATUS.PARTIAL_PAID;
}

/** Signed settlement amounts are only accepted by the explicit return refund path. */
function parseRefundLine(item, invoice, sourceType) {
  const cashCents = toCents(item.amount);
  const discount = Number(item.discount_amount ?? item.discountAmount ?? 0);
  if (!Number.isFinite(Number(item.amount)) || cashCents >= 0 || discount !== 0) throw new Error('退款金额必须大于0且不能包含折扣');
  if (invoice.source_type !== sourceType || toCents(invoice.total_amount) >= 0) throw new Error('仅已确认的退货红字发票可办理退款');
  const balance = toCents(invoice.balance_amount);
  if (balance >= 0 || cashCents < balance) throw new Error('退款金额不能超过红字发票待退款余额');
  return { cashCents, discountCents: 0, settlementCents: cashCents, cashAmount: fromCents(cashCents), discountAmount: 0, settlementAmount: fromCents(cashCents) };
}

/**
 * 布尔/位标志（is_reconciled、is_active 等）
 */
function isTruthyFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

const SETTLEMENT_ELIGIBLE_STATUSES = Object.freeze([
  INVOICE_STATUS.CONFIRMED,
  INVOICE_STATUS.PARTIAL_PAID,
  INVOICE_STATUS.OVERDUE,
]);

function assertInvoiceSettlementsEligible(status, invoiceLabel = '发票') {
  if (!SETTLEMENT_ELIGIBLE_STATUSES.includes(status)) {
    throw new Error(`${invoiceLabel}当前状态为"${status}"，不能直接收付款`);
  }
}

module.exports = {
  toCents,
  fromCents,
  parseSettlementLine,
  parseRefundLine,
  assertWithinBalance,
  assertBankBalanceSufficient,
  invoiceStatusAfterSettlement,
  isTruthyFlag,
  SETTLEMENT_ELIGIBLE_STATUSES,
  assertInvoiceSettlementsEligible,
};
