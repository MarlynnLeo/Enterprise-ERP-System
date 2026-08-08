/**
 * NonconformingProductService — concession methods (mixin)
 * @module nonconformingProduct/concessionMethods
 */

const runtime = require('./runtime');
const {
  logger,
  STATUS,
} = runtime;


module.exports = {
  /**
     * 申请特采 (让步接收)
     */
    async applyConcession(ncpId, { reason, applicant }) {
      const db = require('../../config/db');
      let connection;
      try {
        if (!reason || !String(reason).trim()) {
          throw new Error('Concession reason is required');
        }
  
        connection = await db.pool.getConnection();
        await connection.beginTransaction();
  
        // H13: 事务 + 行锁 + 锁内复检，避免并发重复申请，并保证主更新与审计日志原子落库
        const [rows] = await connection.query(
          'SELECT id, ncp_no, inspection_id, inspection_no, material_id, material_code, material_name, batch_no, quantity, unit, defect_type, defect_description, severity, supplier_id, supplier_name, disposition, disposition_reason, disposition_by, disposition_date, handled_quantity, handling_cost, status, current_location, isolation_area, responsible_party, responsible_person, attachments, note, created_by, created_at, updated_by, updated_at, concession_reason, concession_approver_id, concession_approval_date, concession_status, deleted_at FROM nonconforming_products WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
          [ncpId]
        );
        if (rows.length === 0) throw new Error('NCP not found');
  
        const ncp = rows[0];
        if (ncp.status === STATUS.NCP.COMPLETED || ncp.status === STATUS.NCP.CLOSED) {
          throw new Error('该单据已完结，无法申请特采');
        }
        if (ncp.concession_status === 'pending') {
          throw new Error('该单据已有待审特采申请');
        }
  
        await connection.query(
          `UPDATE nonconforming_products
           SET concession_status = 'pending',
               concession_reason = ?,
               disposition = 'use_as_is',
               status = 'processing'
           WHERE id = ? AND deleted_at IS NULL`,
          [String(reason).trim(), ncpId]
        );
  
        // 记录操作日志
        await connection.query(
          `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
           VALUES (?, 'evaluate', ?, ?)`,
          [ncpId, `申请特采，理由: ${reason}`, applicant]
        );
  
        await connection.commit();
        logger.info(`Concession applied for NCP ${ncp.ncp_no} by ${applicant}`);
        return true;
      } catch (error) {
        if (connection) await connection.rollback();
        logger.error('Failed to apply concession:', error);
        throw error;
      } finally {
        if (connection) connection.release();
      }
    },

  /**
     * 审批特采
     */
    async approveConcession(ncpId, { status, approverId, approverName }) {
      const db = require('../../config/db');
      let connection;
      try {
        if (!['approved', 'rejected'].includes(status)) {
          throw new Error('Invalid concession approval status');
        }
  
        connection = await db.pool.getConnection();
        await connection.beginTransaction();
  
        const [rows] = await connection.query(
          'SELECT id, ncp_no, inspection_id, inspection_no, material_id, material_code, material_name, batch_no, quantity, unit, defect_type, defect_description, severity, supplier_id, supplier_name, disposition, disposition_reason, disposition_by, disposition_date, handled_quantity, handling_cost, status, current_location, isolation_area, responsible_party, responsible_person, attachments, note, created_by, created_at, updated_by, updated_at, concession_reason, concession_approver_id, concession_approval_date, concession_status, deleted_at FROM nonconforming_products WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
          [ncpId]
        );
        if (rows.length === 0) throw new Error('NCP not found');
  
        const ncp = rows[0];
        if (ncp.status === STATUS.NCP.COMPLETED || ncp.status === STATUS.NCP.CLOSED) {
          throw new Error('NCP already completed or closed');
        }
        if (ncp.concession_status !== 'pending') throw new Error('该单据非特采待审状态');
  
        const approvalDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
        await connection.query(
          `UPDATE nonconforming_products
           SET concession_status = ?,
               concession_approver_id = ?,
               concession_approval_date = ?
           WHERE id = ?`,
          [status, approverId, approvalDate, ncpId]
        );
  
        let actionDesc = `驳回特采申请`;
        if (status === 'approved') {
          actionDesc = `批准特采申请`;
  
          // 关键业务逻辑：特采批准后，自动触发“让步接收(use_as_is)”的入库流转逻辑
          ncp.disposition = 'use_as_is';
          await this.handleUseAsIs(ncp, ncp.quantity, connection, approverId);
  
          // 并将该不合格品标记为已完成
          await connection.query(
            `UPDATE nonconforming_products
             SET status = 'completed', handled_quantity = quantity,
                 disposition = 'use_as_is', updated_by = ?
             WHERE id = ?`,
            [approverName, ncpId]
          );
        } else {
          await connection.query(
            `UPDATE nonconforming_products
             SET status = 'pending',
                 disposition = 'pending',
                 disposition_reason = NULL,
                 disposition_by = NULL,
                 disposition_date = NULL,
                 updated_by = ?
             WHERE id = ?`,
            [approverName, ncpId]
          );
        }
  
        await connection.query(
          `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
           VALUES (?, 'evaluate', ?, ?)`,
          [ncpId, actionDesc, approverName]
        );
  
        await connection.commit();
        logger.info(`Concession ${status} for NCP ${ncp.ncp_no} by ${approverName}`);
        return true;
      } catch (error) {
        if (connection) await connection.rollback();
        logger.error('Failed to approve concession:', error);
        throw error;
      } finally {
        if (connection) connection.release();
      }
    },
};
