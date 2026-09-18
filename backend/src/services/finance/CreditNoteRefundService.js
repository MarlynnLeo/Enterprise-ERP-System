'use strict';

const db = require('../../config/db');
const CodeGeneratorService = require('../business/CodeGeneratorService');
const { validateBusinessDate } = require('../../utils/finance/businessDate');
const { toCents, parseRefundLine, assertInvoiceSettlementsEligible } = require('../../utils/finance/settlementMath');

class CreditNoteRefundService {
  static async create(kind, data, userId) {
    if (!['ar', 'ap'].includes(kind)) throw new Error('退款类型无效');
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || toCents(amount) <= 0) throw new Error('退款金额必须大于0');
    if (!Number.isInteger(Number(data.bankAccountId)) || Number(data.bankAccountId) <= 0) throw new Error('请选择退款银行账户');
    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(data.requestId || '')) throw new Error('缺少有效退款请求编号');
    const date = validateBusinessDate(data.refundDate, '退款日期');
    const numberField = kind === 'ar' ? 'receipt_number' : 'payment_number';
    const dateField = kind === 'ar' ? 'receipt_date' : 'payment_date';
    const table = kind === 'ar' ? 'ar_receipts' : 'ap_payments';
    const partner = kind === 'ar' ? 'customer' : 'supplier';
    const sourceType = kind === 'ar' ? 'sales_return' : 'purchase_return';
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [invoices] = await connection.execute(`SELECT * FROM ${kind}_invoices WHERE id = ? FOR UPDATE`, [data.invoiceId]);
      const invoice = invoices[0];
      if (!invoice) throw new Error('红字发票不存在');
      const [existing] = await connection.execute(`SELECT r.*, i.invoice_id FROM ${table} r JOIN ${kind === 'ar' ? 'ar_receipt_items' : 'ap_payment_items'} i ON i.${kind === 'ar' ? 'receipt_id' : 'payment_id'} = r.id WHERE r.refund_request_id = ?`, [data.requestId]);
      if (existing.length) {
        const row = existing[0];
        if (Number(row.invoice_id) !== Number(invoice.id) || toCents(row.total_amount) !== -toCents(amount) || Number(row.bank_account_id) !== Number(data.bankAccountId) || String(row[dateField]).slice(0, 10) !== date) throw new Error('退款请求编号已用于其他退款内容');
        if (row.status === 'void') throw new Error('此退款已作废，请重新发起退款');
        await connection.commit();
        return { id: row.id, number: row[numberField], replayed: true };
      }
      assertInvoiceSettlementsEligible(invoice.status, '红字发票');
      parseRefundLine({ amount: -amount }, invoice, sourceType);
      const model = require(`../../models/${kind}`);
      const details = await model.getInvoiceById(invoice.id);
      const number = await CodeGeneratorService.nextCode(kind === 'ar' ? 'ar_receipt' : 'ap_payment');
      const refundData = {
        [numberField]: number, [dateField]: date, [`${partner}_id`]: invoice[`${partner}_id`],
        [`${partner}_name`]: details[`${partner}Name`], total_amount: -amount,
        payment_method: '银行转账', bank_account_id: Number(data.bankAccountId),
        reference_number: data.referenceNumber || null, notes: data.notes || '', created_by: userId,
        is_refund: true, refund_request_id: data.requestId,
      };
      const items = [{ invoice_id: invoice.id, amount: -amount, discount_amount: 0 }];
      const id = await (kind === 'ar' ? model.createReceipt : model.createPayment)(refundData, items, connection);
      await connection.commit();
      return { id, number, replayed: false };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }
}
module.exports = CreditNoteRefundService;
