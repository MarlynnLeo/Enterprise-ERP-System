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

    // 表结构由迁移管理。MySQL DDL 会隐式提交，不能在付款事务中建表。
    try {
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
      // 兼容尚未安装可选审计表的旧库；死锁等错误必须交给付款事务回滚，
      // 避免事务已被数据库中止后继续执行付款写入。
      if (e.code !== 'ER_NO_SUCH_TABLE' || !/finance_payment_approvals/i.test(e.message || '')) {
        throw e;
      }
      logger.warn('[PaymentApprovalGuard] audit insert skipped', e.message);
    }

    return { required: true, threshold, allowed: true, approvalNo };
  }
}

module.exports = PaymentApprovalGuard;
