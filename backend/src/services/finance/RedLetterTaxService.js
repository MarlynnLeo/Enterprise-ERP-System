'use strict';
const db = require('../../config/db');
const taxModel = require('../../models/tax');
const TaxAccountingService = require('../business/TaxAccountingService');
const { validateBusinessDate } = require('../../utils/finance/businessDate');
const { toCents } = require('../../utils/finance/settlementMath');
const { taxRelatedDocumentTypeMatchList, TAX_RELATED_DOCUMENT_TYPES } = require('../../constants/financeConstants');

class RedLetterTaxService {
  static async getContext(connection, kind, invoiceId) {
    if (!['ar', 'ap'].includes(kind)) throw new Error('红字发票类型无效');
    const [invoices] = await connection.execute(`SELECT * FROM ${kind}_invoices WHERE id = ? FOR UPDATE`, [invoiceId]);
    const invoice = invoices[0];
    if (!invoice || Number(invoice.total_amount) >= 0 || invoice.source_type !== (kind === 'ar' ? 'sales_return' : 'purchase_return') || !['已确认', '部分付款', '已付款', '已逾期'].includes(invoice.status)) throw new Error('请选择已确认的退货红字发票');
    const [returns] = await connection.execute(`SELECT * FROM ${kind === 'ar' ? 'sales_returns' : 'purchase_returns'} WHERE id = ?`, [invoice.source_id]);
    if (!returns[0]) throw new Error('退货来源不存在');
    return { invoice, returned: returns[0] };
  }

  static async matchesSource(connection, kind, invoice, returned, original) {
    const isAR = kind === 'ar';
    if (original.invoice_type !== (isAR ? '销项' : '进项') || Number(original.total_amount) <= 0 || original.status === '已作废') return false;
    const partner = isAR ? 'customer_id' : 'supplier_id';
    if (Number(original[partner]) !== Number(invoice[partner])) return false;
    if (Math.abs(Number(original.tax_rate) / 100 - Number(invoice.tax_rate)) > 0.000001) return false;
    const type = original.related_document_type;
    const receiptTypes = taxRelatedDocumentTypeMatchList(isAR ? TAX_RELATED_DOCUMENT_TYPES.SALES_OUTBOUND : TAX_RELATED_DOCUMENT_TYPES.PURCHASE_RECEIPT);
    if (receiptTypes.includes(type)) return Number(original.related_document_id) === Number(isAR ? returned.outbound_id : returned.receipt_id);
    if (type !== `${kind}_invoice`) return false;
    const [sources] = await connection.execute(`SELECT source_type, source_id FROM ${kind}_invoices WHERE id = ?`, [original.related_document_id]);
    const source = sources[0];
    if (!source) return false;
    return isAR
      ? (source.source_type === 'sales_order' && Number(source.source_id) === Number(returned.order_id)) || (source.source_type === 'sales_outbound' && Number(source.source_id) === Number(returned.outbound_id))
      : ['purchase_receipt', 'inbound'].includes(source.source_type) && Number(source.source_id) === Number(returned.receipt_id);
  }

  static async originals(kind, invoiceId) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const { invoice, returned } = await this.getContext(connection, kind, invoiceId);
      const partner = kind === 'ar' ? 'customer_id' : 'supplier_id';
      const [candidates] = await connection.execute(`SELECT * FROM tax_invoices WHERE ${partner} = ? AND total_amount > 0 AND status IN ('已认证', '已抵扣') ORDER BY invoice_date DESC, id DESC`, [invoice[partner]]);
      const rows = [];
      for (const candidate of candidates) if (await this.matchesSource(connection, kind, invoice, returned, candidate)) rows.push({ id: candidate.id, invoice_number: candidate.invoice_number, total_amount: candidate.total_amount, invoice_type: candidate.invoice_type });
      await connection.commit();
      return rows;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }

  static async create(data, userId) {
    const kind = data.kind;
    const number = String(data.invoiceNumber || '').trim();
    if (!number || number.length > 100) throw new Error('请输入有效的红字税票号码');
    const date = validateBusinessDate(data.invoiceDate, '红字开票日期');
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const { invoice, returned } = await this.getContext(connection, kind, data.invoiceId);
      const [originals] = await connection.execute('SELECT * FROM tax_invoices WHERE id = ? FOR UPDATE', [data.originalTaxInvoiceId]);
      const original = originals[0];
      if (!original || !['已认证', '已抵扣'].includes(original.status) || !(await this.matchesSource(connection, kind, invoice, returned, original))) throw new Error('原税票必须已认证且与退货来源、往来单位及税率一致');
      if (date < String(original.invoice_date).slice(0, 10)) throw new Error('红字开票日期不能早于原税票日期');
      await TaxAccountingService.getCurrentPeriodId(date, connection);
      const [existing] = await connection.execute("SELECT id, invoice_number, original_tax_invoice_id FROM tax_invoices WHERE related_document_type = ? AND related_document_id = ? AND status <> '已作废'", [`${kind}_invoice`, invoice.id]);
      if (existing.length) {
        if (Number(existing[0].original_tax_invoice_id) !== Number(original.id) || existing[0].invoice_number !== number) throw new Error('该红字业务发票已有有效税票，请先核对或作废原红字税票');
        await connection.commit();
        return { id: existing[0].id, replayed: true };
      }
      const [sameNumber] = await connection.execute('SELECT id FROM tax_invoices WHERE invoice_number = ? LIMIT 1', [number]);
      if (sameNumber.length) throw new Error('税票号码已使用，作废重开时请填写新的红字税票号码');
      const [used] = await connection.execute("SELECT COALESCE(SUM(ABS(amount_excluding_tax)),0) net, COALESCE(SUM(ABS(tax_amount)),0) tax, COALESCE(SUM(ABS(total_amount)),0) total FROM tax_invoices WHERE original_tax_invoice_id = ? AND status <> '已作废' FOR UPDATE", [original.id]);
      for (const [field, usedField] of [['amount_excluding_tax', 'net'], ['tax_amount', 'tax'], ['total_amount', 'total']]) {
        if (toCents(used[0][usedField]) + Math.abs(toCents(invoice[field])) > toCents(original[field])) throw new Error('累计红字金额不能超过原税票金额');
      }
      const id = await taxModel.createTaxInvoice({
        invoice_type: original.invoice_type, invoice_number: number, invoice_date: date,
        supplier_id: original.supplier_id, customer_id: original.customer_id,
        supplier_or_customer_name: original.supplier_or_customer_name, supplier_tax_number: original.supplier_tax_number,
        amount_excluding_tax: invoice.amount_excluding_tax, tax_amount: invoice.tax_amount, total_amount: invoice.total_amount,
        tax_rate: Number(invoice.tax_rate) * 100, status: '未认证', related_document_type: `${kind}_invoice`, related_document_id: invoice.id,
        original_tax_invoice_id: original.id, remark: data.notes || `退货红字调整，原税票 ${original.invoice_number}`, created_by: userId,
      }, connection);
      await connection.commit();
      return { id, replayed: false };
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
}
module.exports = RedLetterTaxService;
