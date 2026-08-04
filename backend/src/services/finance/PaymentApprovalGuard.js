/**
 * 大额付款审批钩子
 * - 阈值内：直接允许
 * - 超阈值：要求 workflow 已通过、审批单号、或管理员 skipApproval
 * - 可选：将审批记录写入 finance_payment_approvals（表存在时）
 */

const SystemConfigService = require('../system/SystemConfigService');
const { logger } = require('../../utils/logger');
const db = require('../../config/db');

class PaymentApprovalGuard {
  static async getThreshold() {
    const v = await SystemConfigService.get('ap_payment_approval_threshold', 50000);
    const n = Number(v);
    return Number.isFinite(n) ? n : 50000;
  }

  static async ensureApprovalTable(connection = null) {
    const exec = connection || db.pool;
    await exec.execute(`
      CREATE TABLE IF NOT EXISTS finance_payment_approvals (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        payment_ref VARCHAR(100) NULL,
        amount DECIMAL(18,2) NOT NULL DEFAULT 0,
        threshold DECIMAL(18,2) NOT NULL DEFAULT 0,
        approval_no VARCHAR(100) NULL,
        workflow_status VARCHAR(50) NULL,
        approved_by INT UNSIGNED NULL,
        skip_approval TINYINT(1) NOT NULL DEFAULT 0,
        remark VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_fpa_created (created_at),
        INDEX idx_fpa_approval_no (approval_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  /**
   * @param {object} opts
   * @param {number} opts.amount
   * @param {boolean} [opts.approved]
   * @param {boolean} [opts.skipApproval]
   * @param {string} [opts.workflowStatus]
   * @param {string} [opts.approvalNo] 审批单号
   * @param {number} [opts.approvedBy]
   * @param {string} [opts.paymentRef]
   * @param {string} [opts.remark]
   * @param {object} [opts.connection]
   */
  static async assertPayable(opts = {}) {
    const amount = Math.abs(Number(opts.amount || 0));
    const threshold = await this.getThreshold();
    if (amount <= threshold) {
      return { required: false, threshold, allowed: true };
    }

    const approvalNo = opts.approvalNo || opts.approval_no || null;
    const approved =
      opts.approved === true
      || opts.skipApproval === true
      || (approvalNo && String(approvalNo).trim().length >= 3)
      || ['approved', '已通过', 'completed', '已完成'].includes(
        String(opts.workflowStatus || '').toLowerCase()
      );

    if (!approved) {
      const msg =
        `付款金额 ${amount} 超过审批阈值 ${threshold}，请先完成付款审批（传 approvalNo / workflowStatus=approved，或管理员 skipApproval）`;
      logger.warn('[PaymentApprovalGuard] blocked', { amount, threshold });
      const err = new Error(msg);
      err.code = 'PAYMENT_APPROVAL_REQUIRED';
      err.statusCode = 400;
      err.threshold = threshold;
      throw err;
    }

    // 审计落库（失败不阻断付款）
    try {
      await this.ensureApprovalTable(opts.connection);
      const exec = opts.connection || db.pool;
      await exec.execute(
        `INSERT INTO finance_payment_approvals
          (payment_ref, amount, threshold, approval_no, workflow_status, approved_by, skip_approval, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          opts.paymentRef || opts.payment_number || null,
          amount,
          threshold,
          approvalNo,
          opts.workflowStatus || opts.workflow_status || null,
          opts.approvedBy || opts.approved_by || null,
          opts.skipApproval ? 1 : 0,
          opts.remark || null,
        ]
      );
    } catch (e) {
      logger.warn('[PaymentApprovalGuard] audit insert skipped', e.message);
    }

    return { required: true, threshold, allowed: true, approvalNo };
  }
}

module.exports = PaymentApprovalGuard;
