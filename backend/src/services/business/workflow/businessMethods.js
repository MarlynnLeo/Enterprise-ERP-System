/**
 * WorkflowService — business methods (mixin)
 */

const runtime = require('./runtime');
const {
  logger,
  PermissionService,
  BUSINESS_STATUS_MAP,
} = runtime;

module.exports = {
  async _assertBusinessReadyForWorkflow(conn, businessType, businessId, initiatorId) {
      const cfg = BUSINESS_STATUS_MAP[businessType];
      const deletedFilter = cfg.hasDeletedAt === false ? '' : ' AND deleted_at IS NULL';
      const ownerSelect = cfg.ownerColumn ? `, ${cfg.ownerColumn} AS owner_id` : '';
      const [[document]] = await conn.query(
        `SELECT id, status${ownerSelect} FROM \`${cfg.table}\`
         WHERE id = ?${deletedFilter} FOR UPDATE`,
        [businessId]
      );
      if (!document) throw new Error(`Business document not found [${businessType}:${businessId}]`);
      if (!cfg.pendingStatuses.includes(document.status)) {
        throw new Error(`Business document must be in approval-pending status, received [${document.status}]`);
      }
      if (cfg.ownerColumn && Number(document.owner_id) !== Number(initiatorId)) {
        const isAdmin = await PermissionService.isAdmin(initiatorId);
        if (!isAdmin) throw new Error('Only the document owner can initiate its approval workflow');
      }
    },

  async _updateBusinessWorkflowLink(conn, businessType, businessId, instanceId, workflowStatus) {
      const cfg = BUSINESS_STATUS_MAP[businessType];
      await conn.query(
        `UPDATE \`${cfg.table}\`
         SET workflow_instance_id = ?, workflow_status = ?, workflow_error = NULL
         WHERE id = ?`,
        [instanceId, workflowStatus, businessId]
      );
    },

  async _logAction(conn, data = {}) {
      await conn.query(
        `INSERT INTO workflow_action_logs
         (instance_id, node_id, action, actor_id, actor_name, from_status, to_status,
          comment, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [data.instanceId, data.nodeId || null, data.action, data.actorId || null,
         data.actorName || null, data.fromStatus || null, data.toStatus || null,
         data.comment || null, data.metadata ? JSON.stringify(data.metadata) : null]
      );
    },

  /** 为审批节点分配审批人 */
    async _assignApprover(conn, nodeId, templateNode, initiatorId, instanceId = null) {
      let candidateIds = [];
      const label = templateNode.node_name || '审批节点';

      switch (templateNode.approver_type) {
        case 'user': {
          const ids = this._parseApproverIds(templateNode.approver_ids, label);
          if (ids.length) {
            const [users] = await conn.query(
              'SELECT id FROM users WHERE id IN (?) AND status = 1 ORDER BY id',
              [ids]
            );
            candidateIds = users.map((user) => Number(user.id));
          }
          break;
        }
        case 'manager': {
          const [[manager]] = await conn.query(
            `SELECT d.manager_id AS id
             FROM users u JOIN departments d ON d.id = u.department_id
             JOIN users manager_user ON manager_user.id = d.manager_id AND manager_user.status = 1
             WHERE u.id = ?`,
            [initiatorId]
          );
          if (manager?.id) candidateIds = [Number(manager.id)];
          break;
        }
        case 'role': {
          const roleIds = this._parseApproverIds(templateNode.approver_ids, label);
          if (roleIds.length) {
            const [users] = await conn.query(
              `SELECT DISTINCT u.id
               FROM user_roles ur JOIN users u ON u.id = ur.user_id AND u.status = 1
               WHERE ur.role_id IN (?) ORDER BY u.id`,
              [roleIds]
            );
            candidateIds = users.map((user) => Number(user.id));
          }
          break;
        }
        case 'department': {
          const departmentIds = this._parseApproverIds(templateNode.approver_ids, label);
          if (departmentIds.length) {
            const [users] = await conn.query(
              `SELECT u.id
               FROM users u LEFT JOIN departments d ON d.id = u.department_id
               WHERE u.department_id IN (?) AND u.status = 1
               ORDER BY CASE WHEN d.manager_id = u.id THEN 0 ELSE 1 END, u.id`,
              [departmentIds]
            );
            candidateIds = users.map((user) => Number(user.id));
          }
          break;
        }
        case 'self':
          candidateIds = [Number(initiatorId)];
          break;
        default:
          throw new Error(`Unsupported approver type: ${templateNode.approver_type}`);
      }

      candidateIds = [...new Set(candidateIds.filter((id) => Number.isInteger(id) && id > 0))];
      const allowSelf = templateNode.approver_type === 'self' || Boolean(templateNode.allow_self_approval);
      if (!allowSelf) candidateIds = candidateIds.filter((id) => id !== Number(initiatorId));
      const authorizedIds = [];
      for (const candidateId of candidateIds) {
        const [[access]] = await conn.query(
          `SELECT 1 AS allowed
           FROM users u
           LEFT JOIN user_roles ur ON ur.user_id = u.id
           LEFT JOIN roles r ON r.id = ur.role_id AND r.status = 1
           LEFT JOIN role_permissions rp ON rp.role_id = r.id
           LEFT JOIN permissions p ON p.id = rp.permission_id AND p.status = 1
           WHERE u.id = ? AND u.status = 1
             AND (r.is_super_admin = 1 OR p.code IN ('*', 'system:workflow:*', 'system:workflow:use'))
           LIMIT 1`,
          [candidateId]
        );
        if (access) authorizedIds.push(candidateId);
      }
      candidateIds = authorizedIds;
      if (!candidateIds.length) {
        throw new Error(`审批节点 ${nodeId} 无可用审批人：请检查账号状态、职责分离和审批中心权限`);
      }

      const mode = templateNode.multi_approve_type || 'any';
      await conn.query('DELETE FROM workflow_node_approvers WHERE instance_node_id = ?', [nodeId]);
      for (let index = 0; index < candidateIds.length; index += 1) {
        const status = mode === 'sequential' && index > 0 ? 'waiting' : 'pending';
        await conn.query(
          `INSERT INTO workflow_node_approvers
           (instance_node_id, approver_id, sequence, status, assigned_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [nodeId, candidateIds[index], index + 1, status]
        );
      }
      await conn.query(
        `UPDATE workflow_instance_nodes
         SET approver_id = ?, approver_type = ?, approver_ids = ?,
             multi_approve_type = ?, allow_self_approval = ?
         WHERE id = ?`,
        [candidateIds[0], templateNode.approver_type,
         JSON.stringify(candidateIds), mode, allowSelf ? 1 : 0, nodeId]
      );

      if (instanceId) {
        await this._logAction(conn, {
          instanceId,
          nodeId,
          action: 'assign',
          toStatus: 'in_progress',
          metadata: { approverIds: candidateIds, mode },
        });
      }
    },

  _parseApproverIds(rawIds, label) {
      if (!rawIds) return [];
  
      let ids = rawIds;
      if (typeof rawIds === 'string') {
        try {
          ids = JSON.parse(rawIds);
        } catch (error) {
          throw new Error(`${label}审批人配置格式无效`, { cause: error });
        }
      }
  
      if (!Array.isArray(ids)) {
        throw new Error(`${label}审批人配置格式无效`);
      }
  
      return ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    },

  _assertSupportedBusinessType(businessType) {
      const normalizedBusinessType = String(businessType || '').trim();
      if (!normalizedBusinessType) {
        throw new Error('工作流模板业务类型不能为空');
      }
      if (!BUSINESS_STATUS_MAP[normalizedBusinessType]) {
        throw new Error(`业务类型 ${normalizedBusinessType} 未配置审批状态回调，无法创建审批流程`);
      }
      return normalizedBusinessType;
    },

  _buildPendingBusinessStatusSql() {
      const entries = Object.entries(BUSINESS_STATUS_MAP)
        .filter(([, cfg]) => Array.isArray(cfg.pendingStatuses) && cfg.pendingStatuses.length > 0);
      const joins = [];
      const checks = [];
      const values = [];
  
      entries.forEach(([businessType, cfg], index) => {
        const alias = `biz${index}`;
        const deletedAtFilter = cfg.hasDeletedAt === false ? '' : ` AND ${alias}.deleted_at IS NULL`;
        joins.push(`LEFT JOIN \`${cfg.table}\` ${alias} ON wi.business_type = '${businessType}' AND ${alias}.id = wi.business_id${deletedAtFilter}`);
        checks.push(`(wi.business_type = '${businessType}' AND ${alias}.status IN (?))`);
        values.push(cfg.pendingStatuses);
      });
  
      if (entries.length === 0) {
        return { joins: '', filter: '', values: [] };
      }
  
      const knownBusinessTypes = entries.map(([businessType]) => `'${businessType}'`).join(', ');
      return {
        joins: joins.join('\n       '),
        filter: `AND (wi.business_type NOT IN (${knownBusinessTypes}) OR ${checks.join(' OR ')})`,
        values,
      };
    },

  /**
     * 统一更新业务单据状态（通过/拒绝/撤回共用）
     * @param {'approved'|'rejected'|'withdrawn'} action - 动作类型
     */
    async _updateBusinessStatus(conn, action, businessType, businessId, approverId) {
      const cfg = BUSINESS_STATUS_MAP[businessType];
      if (!cfg) {
        throw new Error(`业务类型 ${businessType} 未配置审批状态回调，无法完成闭环更新`);
      }
      const targetStatus = cfg[action];
      if (!targetStatus) {
        throw new Error(`业务类型 ${businessType} 未配置 ${action} 状态，无法完成闭环更新`);
      }
  
      try {
        const [[businessRow]] = await conn.query(
          `SELECT id, status FROM ${cfg.table} WHERE id = ? FOR UPDATE`,
          [businessId]
        );
        if (!businessRow) {
          throw new Error(`Business document not found [${businessType}:${businessId}]`);
        }
  
        const allowedSourceStatuses = cfg.pendingStatuses;
        if (!allowedSourceStatuses.includes(businessRow.status)) {
          throw new Error(
            `Business document status [${businessRow.status}] cannot be changed to [${targetStatus}] by workflow callback`
          );
        }
  
        const params = [targetStatus, action];
        const extraSql = action === 'approved' ? (cfg.extra || '') : '';
        if (extraSql.includes('approved_by')) params.push(approverId);
        params.push(businessId);
        await conn.query(
          `UPDATE \`${cfg.table}\`
           SET status = ?, workflow_status = ?, workflow_error = NULL${extraSql}
           WHERE id = ?`,
          params
        );
        logger.info(`工作流${action}回调: ${businessType}#${businessId} → ${targetStatus}`);
  
        // 采购申购单批准后自动生成采购订单
        if (action === 'approved' && businessType === 'purchase_requisition') {
          try {
            const { generateOrdersFromRequisition } = require('../RequisitionAutoOrderService');
            await generateOrdersFromRequisition(businessId, conn);
          } catch (autoErr) {
            logger.error(`采购申请 ${businessId} 自动生成采购订单失败，审批回调已回滚:`, autoErr);
            throw autoErr;
          }
        }
      } catch (e) {
        logger.error(`工作流${action}回调失败 [${businessType}:${businessId}]:`, e);
        throw e;
      }
    },

  /** 审批通过回调 */
    async _onWorkflowApproved(conn, businessType, businessId, approverId) {
      return this._updateBusinessStatus(conn, 'approved', businessType, businessId, approverId);
    },

  /** 审批拒绝回调 */
    async _onWorkflowRejected(conn, businessType, businessId) {
      return this._updateBusinessStatus(conn, 'rejected', businessType, businessId);
    },

  /** 撤回回调 */
    async _onWorkflowWithdrawn(conn, businessType, businessId) {
      return this._updateBusinessStatus(conn, 'withdrawn', businessType, businessId);
    },
};
