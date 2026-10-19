'use strict';
const crypto = require('node:crypto');
const Decimal = require('decimal.js');
const db = require('../../config/db');
const { getAuthenticatedUserId } = require('../../utils/authContext');
const { normalizeSettlementPaymentMethod } = require('../../utils/finance/settlementMath');

const fail = (message, code = 'IDEMPOTENCY_CONFLICT', statusCode = 409) =>
  Object.assign(new Error(message), { code, statusCode });
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  return value;
};
const rateValue = (value) => {
  if (value == null || value === '') return null;
  try {
    return new Decimal(value).toString();
  } catch {
    return value;
  }
};

function requestEvidence(req, kind, line) {
  const key = req.get?.('Idempotency-Key') ?? req.headers?.['idempotency-key'];
  if (key == null) return null;
  if (typeof key !== 'string' || !/^[A-Za-z0-9_:-]{16,128}$/.test(key)) {
    throw fail(
      'Idempotency-Key 必须为16至128位字母、数字、下划线、冒号或短横线',
      'VALIDATION_ERROR',
      400
    );
  }
  const input = req.body;
  const actorId = getAuthenticatedUserId(req);
  const invoiceId = Number(input.invoiceId);
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0)
    throw fail('发票ID无效', 'VALIDATION_ERROR', 400);
  const payload = {
    invoiceId,
    date: input[kind === 'ar' ? 'receiptDate' : 'paymentDate'] ?? null,
    cashCents: line.cashCents,
    discountCents: line.discountCents,
    currencyCode:
      input.currencyCode == null ? null : String(input.currencyCode).trim().toUpperCase(),
    exchangeRate: rateValue(input.exchangeRate),
    paymentMethod: normalizeSettlementPaymentMethod(input.paymentMethod || '银行转账'),
    bankAccountId: Number(input.bankAccountId) || null,
    referenceNumber: input.referenceNumber || null,
    notes: input.notes || '',
    ...(kind === 'ap'
      ? {
          paymentNumber: input.paymentNumber || null,
          approvalId: Number(input.approvalId) || null,
          approvalNo: input.approvalNo || null,
          skipApproval: input.skipApproval === true,
        }
      : {}),
  };
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(canonical({ version: 1, kind, actorId, payload })))
    .digest('hex');
  return { key, hash, actorId, invoiceId };
}

class SettlementRequest {
  constructor(connection, kind, evidence) {
    this.connection = connection;
    this.kind = kind;
    this.evidence = evidence;
    this.table = kind === 'ar' ? 'ar_receipts' : 'ap_payments';
    this.numberField = kind === 'ar' ? 'receipt_number' : 'payment_number';
    this.active = false;
    this.closed = false;
  }
  get fields() {
    return { idempotency_key: this.evidence.key, idempotency_hash: this.evidence.hash };
  }
  async findReplay() {
    const [rows] = await this.connection.execute(
      `SELECT id, ${this.numberField} AS number, created_by, idempotency_hash, status, currency_code, exchange_rate, base_amount
       FROM ${this.table} WHERE idempotency_key = ?`,
      [this.evidence.key]
    );
    const row = rows[0];
    if (!row) return null;
    if (
      Number(row.created_by) !== this.evidence.actorId ||
      row.idempotency_hash !== this.evidence.hash
    ) {
      throw fail('该请求编号已用于其他收付款内容或操作人，请核对原记录后重新发起');
    }
    return {
      id: row.id,
      [this.kind === 'ar' ? 'receiptNumber' : 'paymentNumber']: row.number,
      replayed: true,
      status: row.status,
      currencyCode: row.currency_code,
      exchangeRate: row.exchange_rate,
      baseAmount: row.base_amount,
    };
  }
  async commit() {
    try {
      await this.connection.commit();
      this.active = false;
    } catch {
      throw fail(
        '收付款提交结果暂未确认，请保留原请求编号并原样重试',
        'SETTLEMENT_RESULT_UNKNOWN',
        503
      );
    }
  }
  async resolveDuplicate(error) {
    if (error?.code !== 'ER_DUP_ENTRY') return null;
    if (this.active) {
      await this.connection.rollback();
      this.active = false;
    }
    return this.findReplay();
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    let destroyed = false;
    try {
      if (this.active) await this.connection.rollback();
    } catch {
      this.connection.destroy?.();
      destroyed = true;
      throw fail(
        '收付款处理结果暂未确认，请保留原请求编号并原样重试',
        'SETTLEMENT_RESULT_UNKNOWN',
        503
      );
    } finally {
      this.active = false;
      if (!destroyed) this.connection.release();
    }
  }
}

async function begin(req, kind, line) {
  if (!['ar', 'ap'].includes(kind)) throw new Error('Unsupported settlement request kind');
  const evidence = requestEvidence(req, kind, line);
  if (!evidence) return null;
  const request = new SettlementRequest(await db.pool.getConnection(), kind, evidence);
  try {
    await request.connection.beginTransaction();
    request.active = true;
    // Reuse the invoice's existing row lock as the request serialization point.
    // Check replay before current status/balance, since the first attempt may
    // already have fully settled this invoice or later have been voided.
    const [invoices] = await request.connection.execute(
      `SELECT id FROM ${kind}_invoices WHERE id = ? FOR UPDATE`,
      [evidence.invoiceId]
    );
    if (!invoices.length) throw fail('发票不存在或已被删除', 'NOT_FOUND', 404);
    request.replay = await request.findReplay();
    return request;
  } catch (error) {
    await request.close();
    throw error;
  }
}

module.exports = { begin, requestEvidence };
