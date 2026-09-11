'use strict';

const db = require('../../config/db');
const { resolveActorUserId } = require('../../utils/userUtils');

function normalizeIds(values) {
  const source = Array.isArray(values) ? values : values == null ? [] : [values];
  return [...new Set(source.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function approvalError(message, code = 'PAYMENT_APPROVAL_INVALID', statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

class PaymentApprovalService {
  static async create(input = {}, actorId, connection = null) {
    const conn = connection || db.pool;
    const amount = Math.abs(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw approvalError('审批金额必须大于0');
    const createdBy = await resolveActorUserId(conn, actorId);
    const invoiceIds = normalizeIds(input.invoiceIds || input.invoice_ids || input.invoiceId);
    const approvalNo = String(input.approvalNo || input.approval_no || '').trim();
    if (!approvalNo) throw approvalError('付款审批单号不能为空');
    if (input.supplierId && !Number.isInteger(Number(input.supplierId))) {
      throw approvalError('供应商参数无效');
    }

    const [result] = await conn.execute(
      `INSERT INTO finance_payment_approvals
        (payment_ref, amount, threshold, approval_no, workflow_status, status,
         supplier_id, invoice_id, invoice_ids, created_by, remark)
       VALUES (?, ?, ?, ?, 'pending', 'pending', ?, ?, ?, ?, ?)`,
      [
        input.paymentRef || input.payment_ref || null,
        amount,
        input.threshold == null ? 0 : Number(input.threshold),
        approvalNo,
        input.supplierId || input.supplier_id || null,
        invoiceIds[0] || null,
        JSON.stringify(invoiceIds),
        createdBy,
        input.remark || null,
      ]
    );
    return { id: result.insertId, approvalNo, status: 'pending' };
  }

  static async approve(id, actorId, remark = '') {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const approverId = await resolveActorUserId(connection, actorId);
      const [[approval]] = await connection.execute(
        'SELECT * FROM finance_payment_approvals WHERE id = ? FOR UPDATE',
        [id]
      );
      if (!approval) throw approvalError('付款审批记录不存在', 'NOT_FOUND', 404);
      if (approval.status !== 'pending')
        throw approvalError(`当前审批状态 ${approval.status} 不允许审核`, 'INVALID_STATUS', 409);
      if (approval.created_by && Number(approval.created_by) === Number(approverId)) {
        throw approvalError('付款申请人与财务审核人必须分离', 'SEPARATION_OF_DUTIES', 403);
      }
      await connection.execute(
        `UPDATE finance_payment_approvals
            SET status = 'approved', workflow_status = 'approved', approved_by = ?,
                approved_at = NOW(), remark = COALESCE(?, remark)
          WHERE id = ? AND status = 'pending'`,
        [approverId, remark || null, id]
      );
      await connection.commit();
      return { id: Number(id), status: 'approved', approvedBy: approverId };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async reject(id, actorId, remark = '') {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const approverId = await resolveActorUserId(connection, actorId);
      const [[approval]] = await connection.execute(
        'SELECT * FROM finance_payment_approvals WHERE id = ? FOR UPDATE',
        [id]
      );
      if (!approval) throw approvalError('付款审批记录不存在', 'NOT_FOUND', 404);
      if (approval.status !== 'pending')
        throw approvalError(`当前审批状态 ${approval.status} 不允许驳回`, 'INVALID_STATUS', 409);
      if (approval.created_by && Number(approval.created_by) === Number(approverId)) {
        throw approvalError('付款申请人与财务审核人必须分离', 'SEPARATION_OF_DUTIES', 403);
      }
      await connection.execute(
        `UPDATE finance_payment_approvals
            SET status = 'rejected', workflow_status = 'rejected', approved_by = ?,
                approved_at = NOW(), remark = ?
          WHERE id = ? AND status = 'pending'`,
        [approverId, remark || null, id]
      );
      await connection.commit();
      return { id: Number(id), status: 'rejected', rejectedBy: approverId };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = PaymentApprovalService;
