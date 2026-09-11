/** 服务端权威的大额付款审批校验。 */

const SystemConfigService = require('../system/SystemConfigService');
const { logger } = require('../../utils/logger');

class PaymentApprovalGuard {
  static async getThreshold() {
    const v = await SystemConfigService.get('ap_payment_approval_threshold', 50000);
    const n = Number(v);
    return Number.isFinite(n) ? n : 50000;
  }

  /**
   * @param {object} opts
   * @param {number} opts.amount
   * @param {number} [opts.approvalId]
   * @param {string} [opts.approvalNo]
   * @param {number} [opts.supplierId]
   * @param {number[]} [opts.invoiceIds]
   * @param {boolean} [opts.serverAdminOverride] 服务端校验过的管理员例外
   * @param {object} [opts.connection]
   */
  static async assertPayable(opts = {}) {
    const amount = Math.abs(Number(opts.amount || 0));
    const threshold = await this.getThreshold();
    if (amount <= threshold) {
      return { required: false, threshold, allowed: true };
    }

    if (opts.serverAdminOverride === true) {
      return { required: true, threshold, allowed: true, adminOverride: true };
    }

    const approvalId = Number(opts.approvalId || opts.approval_id || 0);
    const approvalNo = String(opts.approvalNo || opts.approval_no || '').trim();
    if (!approvalId && !approvalNo) {
      const error = new Error(
        `付款金额 ${amount} 超过审批阈值 ${threshold}，必须先完成服务端付款审批`
      );
      error.code = 'PAYMENT_APPROVAL_REQUIRED';
      error.statusCode = 400;
      error.threshold = threshold;
      throw error;
    }

    const connection = opts.connection;
    if (!connection) throw new Error('大额付款审批校验必须在付款事务连接中执行');
    const [rows] = await connection.execute(
      `SELECT * FROM finance_payment_approvals
        WHERE status = 'approved' AND used_at IS NULL
          AND (${approvalId ? 'id = ?' : 'approval_no = ?'})
        LIMIT 1 FOR UPDATE`,
      [approvalId || approvalNo]
    );
    const approval = rows[0];
    if (!approval) {
      const error = new Error('付款审批不存在、未通过或已被使用');
      error.code = 'PAYMENT_APPROVAL_INVALID';
      error.statusCode = 409;
      throw error;
    }
    if (Math.round(Number(approval.amount) * 100) !== Math.round(amount * 100)) {
      throw new Error('付款金额与审批金额不一致');
    }
    if (approval.supplier_id && Number(approval.supplier_id) !== Number(opts.supplierId)) {
      throw new Error('付款供应商与审批供应商不一致');
    }
    const requestedInvoiceIds = new Set((opts.invoiceIds || []).map(Number));
    const approvedInvoiceIds = (() => {
      try {
        const parsed = JSON.parse(approval.invoice_ids || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();
    if (approval.invoice_id) approvedInvoiceIds.push(Number(approval.invoice_id));
    const uniqueApprovedInvoiceIds = new Set(approvedInvoiceIds.map(Number));
    if (
      uniqueApprovedInvoiceIds.size &&
      (requestedInvoiceIds.size !== uniqueApprovedInvoiceIds.size ||
        [...uniqueApprovedInvoiceIds].some((id) => !requestedInvoiceIds.has(id)))
    ) {
      throw new Error('付款发票范围与审批范围不一致');
    }
    if (!approval.approved_by) throw new Error('付款审批缺少有效审核人');
    logger.info('[PaymentApprovalGuard] approved record validated', {
      approvalId: approval.id,
      amount,
    });
    return { required: true, threshold, allowed: true, approvalId: approval.id };
  }
}

module.exports = PaymentApprovalGuard;
