/**
 * 销售出库冲销的财务补偿闭环
 * - 成本结转 GL（document_number = outbound_no）
 * - 销项税票（related 销售出库单）
 * - 关联订单的 AR（仅当无其它已完成出库且未收款时取消）
 */

const { logger } = require('../../utils/logger');
const { currentDateString } = require('../../utils/dateUtils');
const {
  INVOICE_STATUS,
  TAX_INVOICE_STATUS,
  TAX_RELATED_DOCUMENT_TYPES,
} = require('../../constants/financeConstants');

class SalesOutboundReversalService {
  /**
   * @param {object} connection - 事务连接
   * @param {object} options
   * @param {string} options.outboundNo
   * @param {number} options.outboundId
   * @param {number|null} options.orderId
   * @param {string} options.operator
   * @returns {Promise<object>} 补偿摘要
   */
  static async compensateFinance(connection, options = {}) {
    const {
      outboundNo,
      outboundId,
      orderId = null,
      operator = 'system',
    } = options;

    const summary = {
      costGlReversed: 0,
      taxInvoicesVoided: 0,
      arInvoicesCancelled: 0,
      warnings: [],
      errors: [],
    };

    // 1) 冲销成本结转分录
    try {
      summary.costGlReversed = await this.reverseCostEntries(
        connection,
        outboundNo,
        operator
      );
    } catch (e) {
      summary.errors.push(`成本凭证冲销失败: ${e.message}`);
      logger.error(`[SalesOutboundReversal] cost GL: ${e.message}`);
      throw e;
    }

    // 2) 销项税票
    try {
      summary.taxInvoicesVoided = await this.voidRelatedTaxInvoices(
        connection,
        outboundId,
        operator
      );
    } catch (e) {
      summary.errors.push(`销项税处理失败: ${e.message}`);
      logger.error(`[SalesOutboundReversal] tax: ${e.message}`);
      throw e;
    }

    // 3) AR：仅在本订单无其它已完成出库、且未收款时取消
    if (orderId) {
      try {
        summary.arInvoicesCancelled = await this.cancelUnpaidArIfSafe(
          connection,
          orderId,
          outboundId,
          operator
        );
      } catch (e) {
        // AR 已收款时拒绝整个冲销（调用方在同一事务中 rollback）
        if (e.code === 'AR_HAS_PAYMENT' || e.code === 'OTHER_OUTBOUND_EXISTS') {
          throw e;
        }
        summary.warnings.push(`AR 处理: ${e.message}`);
        logger.warn(`[SalesOutboundReversal] AR: ${e.message}`);
      }
    }

    return summary;
  }

  static async reverseCostEntries(connection, outboundNo, operator) {
    const [entries] = await connection.execute(
      `SELECT id
       FROM gl_entries
       WHERE document_number = ?
         AND document_type = 'sales_outbound'
         AND COALESCE(is_posted, 0) = 1
         AND COALESCE(is_reversed, 0) = 0
         AND NOT EXISTS (
           SELECT 1 FROM gl_entries rev WHERE rev.reversal_entry_id = gl_entries.id
         )
       ORDER BY id ASC
       FOR UPDATE`,
      [outboundNo]
    );

    if (entries.length === 0) {
      // 也兼容未写 document_type 仅按单号的成本分录
      const [byNumber] = await connection.execute(
        `SELECT id
         FROM gl_entries
         WHERE document_number = ?
           AND COALESCE(is_posted, 0) = 1
           AND COALESCE(is_reversed, 0) = 0
           AND NOT EXISTS (
             SELECT 1 FROM gl_entries rev WHERE rev.reversal_entry_id = gl_entries.id
           )
         ORDER BY id ASC
         FOR UPDATE`,
        [outboundNo]
      );
      entries.push(...byNumber);
    }

    if (entries.length === 0) return 0;

    const financeModel = require('../../models/finance');
    const today = currentDateString();
    let count = 0;
    const seen = new Set();

    for (const entry of entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      await financeModel.reverseEntry(
        entry.id,
        {
          entry_date: today,
          posting_date: today,
          description: `销售出库冲销 ${outboundNo}`,
          created_by: operator || 'system',
        },
        connection
      );
      count += 1;
    }
    return count;
  }

  static async voidRelatedTaxInvoices(connection, outboundId, operator) {
    const [taxRows] = await connection.execute(
      `SELECT id, status, gl_entry_id, invoice_number
       FROM tax_invoices
       WHERE related_document_type = ?
         AND related_document_id = ?
       FOR UPDATE`,
      [TAX_RELATED_DOCUMENT_TYPES.SALES_OUTBOUND, outboundId]
    );

    if (taxRows.length === 0) return 0;

    const financeModel = require('../../models/finance');
    const today = currentDateString();
    let voided = 0;

    for (const tax of taxRows) {
      if (tax.status === TAX_INVOICE_STATUS.VOIDED) continue;

      if (tax.status === TAX_INVOICE_STATUS.DEDUCTED) {
        const err = new Error(
          `销项税票 ${tax.invoice_number || tax.id} 已抵扣，禁止直接冲销出库；请走红字/退货流程`
        );
        err.code = 'TAX_LOCKED';
        err.statusCode = 400;
        throw err;
      }

      // 已认证且有凭证：先冲凭证
      if (tax.gl_entry_id && tax.status === TAX_INVOICE_STATUS.CERTIFIED) {
        try {
          await financeModel.reverseEntry(
            tax.gl_entry_id,
            {
              entry_date: today,
              posting_date: today,
              description: `销售出库冲销回冲销项税 ${tax.invoice_number || tax.id}`,
              created_by: operator || 'system',
            },
            connection
          );
        } catch (e) {
          // 凭证可能已冲销
          logger.warn(`[SalesOutboundReversal] tax GL reverse: ${e.message}`);
        }
      }

      await connection.execute(
        `UPDATE tax_invoices
         SET status = ?,
             remark = CONCAT(COALESCE(remark, ''), ' [出库冲销自动作废]'),
             updated_at = NOW()
         WHERE id = ?`,
        [TAX_INVOICE_STATUS.VOIDED, tax.id]
      );
      voided += 1;
    }
    return voided;
  }

  static async cancelUnpaidArIfSafe(connection, orderId, outboundId, operator) {
    // 其它未冲销的已完成出库仍在 → 不取消 AR（多出库共享一张 AR）
    const [otherOut] = await connection.execute(
      `SELECT COUNT(*) AS cnt
       FROM sales_outbound
       WHERE order_id = ?
         AND id <> ?
         AND deleted_at IS NULL
         AND status = 'completed'`,
      [orderId, outboundId]
    );
    if (Number(otherOut[0]?.cnt || 0) > 0) {
      const err = new Error('该订单仍有其它已完成出库单，保留应收发票，请用退货/红冲处理');
      err.code = 'OTHER_OUTBOUND_EXISTS';
      // 不阻断库存冲销：降级为可忽略
      logger.info(`[SalesOutboundReversal] ${err.message}`);
      return 0;
    }

    const [ars] = await connection.execute(
      `SELECT id, invoice_number, status, total_amount, paid_amount, balance_amount
       FROM ar_invoices
       WHERE source_type = 'sales_order' AND source_id = ?
       FOR UPDATE`,
      [orderId]
    );

    if (ars.length === 0) return 0;

    const financeModel = require('../../models/finance');
    const today = currentDateString();
    let cancelled = 0;

    for (const inv of ars) {
      if (inv.status === INVOICE_STATUS.CANCELLED || inv.status === 'void') continue;

      const paid = Number(inv.paid_amount) || 0;
      if (paid > 0 || inv.status === INVOICE_STATUS.PAID || inv.status === INVOICE_STATUS.PARTIAL_PAID) {
        const err = new Error(
          `应收发票 ${inv.invoice_number} 已有收款，请先作废收款或走销售退货红冲后再冲销出库`
        );
        err.code = 'AR_HAS_PAYMENT';
        err.statusCode = 400;
        throw err;
      }

      // 冲销确认时生成的 AR 凭证（document_number 通常为发票号）
      if (inv.status === INVOICE_STATUS.CONFIRMED || inv.status === INVOICE_STATUS.OVERDUE) {
        const [entries] = await connection.execute(
          `SELECT id FROM gl_entries
           WHERE document_number = ?
             AND COALESCE(is_posted, 0) = 1
             AND COALESCE(is_reversed, 0) = 0
             AND NOT EXISTS (
               SELECT 1 FROM gl_entries rev WHERE rev.reversal_entry_id = gl_entries.id
             )
           FOR UPDATE`,
          [inv.invoice_number]
        );
        for (const entry of entries) {
          await financeModel.reverseEntry(
            entry.id,
            {
              entry_date: today,
              posting_date: today,
              description: `销售出库冲销取消应收 ${inv.invoice_number}`,
              created_by: operator || 'system',
            },
            connection
          );
        }
      }

      await connection.execute(
        `UPDATE ar_invoices
         SET status = ?, notes = CONCAT(COALESCE(notes, ''), ' [出库冲销自动取消]'), updated_at = NOW()
         WHERE id = ?`,
        [INVOICE_STATUS.CANCELLED, inv.id]
      );
      cancelled += 1;
    }

    return cancelled;
  }
}

module.exports = SalesOutboundReversalService;
