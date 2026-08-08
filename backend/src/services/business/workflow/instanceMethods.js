/**
 * WorkflowService — instance methods (mixin)
 */

const runtime = require('./runtime');
const {
  pool,
  logger,
  parsePagination,
  appendPaginationSQL,
  PermissionService,
} = runtime;

module.exports = {
  /** 发起审批 */
    async startWorkflow({ business_type, business_id, business_code, title, initiator_id, connection = null }) {
      const businessType = this._assertSupportedBusinessType(business_type);
      const businessId = Number(business_id);
      const initiatorId = Number(initiator_id);
      if (!Number.isInteger(businessId) || businessId <= 0) throw new Error('Invalid workflow business ID');
      if (!Number.isInteger(initiatorId) || initiatorId <= 0) throw new Error('Invalid workflow initiator');
      const queryExecutor = connection || pool;
  
      // 1. 查找匹配的活跃模板
      const [[template]] = await queryExecutor.query(
        `SELECT id, code, name, business_type, description, trigger_condition, is_active, version, created_by, created_at, updated_at, deleted_at FROM workflow_templates
         WHERE business_type = ? AND is_active = 1 AND deleted_at IS NULL
         ORDER BY version DESC LIMIT 1`,
        [businessType]
      );
  
      if (!template) {
        throw new Error(`业务类型 ${businessType} 未配置启用的审批流程，单据已挂起，请先配置工作流模板`);
      }
  
      // 2. 获取模板节点
      const [templateNodes] = await queryExecutor.query(
        'SELECT id, template_id, node_name, node_type, sequence, approver_type, approver_ids, multi_approve_type, allow_self_approval, condition_expression, timeout_hours, timeout_action, created_at FROM workflow_template_nodes WHERE template_id = ? ORDER BY sequence',
        [template.id]
      );
  
      if (templateNodes.length === 0) {
        throw new Error(`业务类型 ${businessType} 的审批流程没有节点，单据已挂起，请完善工作流模板`);
      }
  
      if (!templateNodes.some(node => node.node_type === 'approval')) {
        throw new Error(`业务类型 ${businessType} 的审批流程缺少审批节点，单据已挂起，请完善工作流模板`);
      }
  
      const ownsConnection = !connection;
      const conn = connection || await pool.getConnection();
      try {
        if (ownsConnection) await conn.beginTransaction();

        await this._assertBusinessReadyForWorkflow(conn, businessType, businessId, initiatorId);
  
        const [[existingInstance]] = await conn.query(
          `SELECT id, status
           FROM workflow_instances
           WHERE business_type = ?
             AND business_id = ?
             AND deleted_at IS NULL
             AND status IN ('pending', 'in_progress')
           ORDER BY id DESC
           LIMIT 1
           FOR UPDATE`,
          [businessType, businessId]
        );
        if (existingInstance) {
          throw new Error(`该单据已有进行中的审批流程，审批实例ID: ${existingInstance.id}`);
        }
  
        // 3. 创建流程实例
        const [instResult] = await conn.query(
          `INSERT INTO workflow_instances
           (template_id, business_type, business_id, business_code, title, status, initiator_id, started_at)
           VALUES (?, ?, ?, ?, ?, 'in_progress', ?, NOW())`,
          [template.id, businessType, businessId, business_code || '', title, initiatorId]
        );
        const instanceId = instResult.insertId;
  
        // 4. 创建实例节点
        let firstApprovalNodeId = null;
        for (const tn of templateNodes) {
          const [nodeResult] = await conn.query(
            `INSERT INTO workflow_instance_nodes
             (instance_id, template_node_id, node_name, node_type, sequence, status,
              approver_type, approver_ids, multi_approve_type, allow_self_approval)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [instanceId, tn.id, tn.node_name, tn.node_type, tn.sequence,
             tn.node_type === 'start' ? 'approved' : 'pending', tn.approver_type,
             tn.approver_ids
               ? (typeof tn.approver_ids === 'string' ? tn.approver_ids : JSON.stringify(tn.approver_ids))
               : null,
             tn.multi_approve_type || 'any', tn.allow_self_approval ? 1 : 0]
          );
          if (!firstApprovalNodeId && tn.node_type === 'approval') {
            firstApprovalNodeId = nodeResult.insertId;
          }
        }
  
        // 5. 激活第一个审批节点
        if (firstApprovalNodeId) {
          await conn.query(
            "UPDATE workflow_instance_nodes SET status = 'in_progress' WHERE id = ?",
            [firstApprovalNodeId]
          );
          await conn.query(
            'UPDATE workflow_instances SET current_node_id = ? WHERE id = ?',
            [firstApprovalNodeId, instanceId]
          );
  
          // 为审批节点分配审批人
          const [[currentTplNode]] = await conn.query(
            `SELECT wtn.* FROM workflow_instance_nodes win
             JOIN workflow_template_nodes wtn ON wtn.id = win.template_node_id
             WHERE win.id = ?`, [firstApprovalNodeId]
          );
          if (currentTplNode) {
            await this._assignApprover(conn, firstApprovalNodeId, currentTplNode, initiatorId, instanceId);
          }
        }

        await this._updateBusinessWorkflowLink(conn, businessType, businessId, instanceId, 'in_progress');
        await this._logAction(conn, {
          instanceId,
          action: 'start',
          actorId: initiatorId,
          fromStatus: null,
          toStatus: 'in_progress',
        });

        if (ownsConnection) await conn.commit();
        return { auto_approved: false, instance_id: instanceId, message: '审批流程已发起' };
      } catch (err) {
        if (ownsConnection) await conn.rollback();
        throw err;
      } finally {
        if (ownsConnection) conn.release();
      }
    },

  /** 审批操作（通过/拒绝） */
    async handleApproval({ instance_id, node_id, action, comment, approver_id }) {
      if (!['approve', 'reject'].includes(action)) {
        throw new Error('无效的审批动作');
      }
  
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
  
        // 1. 验证节点状态
        const [[node]] = await conn.query(
          "SELECT id, instance_id, template_node_id, node_name, node_type, sequence, status, approver_id, approver_name, comment, acted_at, created_at, approver_type, multi_approve_type, allow_self_approval FROM workflow_instance_nodes WHERE id = ? AND instance_id = ? AND status = 'in_progress' FOR UPDATE",
          [node_id, instance_id]
        );
        if (!node) throw new Error('审批节点不存在或已处理');
  
        const [[instLock]] = await conn.query(
          "SELECT id, status, initiator_id, business_type, business_id FROM workflow_instances WHERE id = ? AND status IN ('pending','in_progress') FOR UPDATE",
          [instance_id]
        );
        if (!instLock) throw new Error('Workflow instance is not pending or in progress');

        const [[assignment]] = await conn.query(
          `SELECT id, instance_node_id, approver_id, sequence, status
           FROM workflow_node_approvers
           WHERE instance_node_id = ? AND approver_id = ? AND status = 'pending'
           FOR UPDATE`,
          [node_id, approver_id]
        );
        const [[{ assignment_count: assignmentCount }]] = await conn.query(
          'SELECT COUNT(*) AS assignment_count FROM workflow_node_approvers WHERE instance_node_id = ?',
          [node_id]
        );
        if (!assignment) {
          const legacyAdmin = Number(assignmentCount) === 0 && await PermissionService.isAdmin(approver_id);
          if (!legacyAdmin || (node.approver_id && Number(node.approver_id) !== Number(approver_id))) {
            throw new Error('您不是该审批节点当前待处理的审批人，无权操作');
          }
        }
        if (
          Number(instLock.initiator_id) === Number(approver_id) &&
          !node.allow_self_approval &&
          node.approver_type !== 'self'
        ) {
          throw new Error('发起人不能审批自己的单据');
        }

        const [[user]] = await conn.query('SELECT real_name, username FROM users WHERE id = ?', [approver_id]);
        const approverName = user?.real_name || user?.username || String(approver_id);

        if (assignment) {
          await conn.query(
            `UPDATE workflow_node_approvers
             SET status = ?, comment = ?, acted_at = NOW() WHERE id = ?`,
            [action === 'approve' ? 'approved' : 'rejected', comment || null, assignment.id]
          );
        }
  
        if (action === 'reject') {
          await conn.query(
            `UPDATE workflow_instance_nodes
             SET status = 'rejected', approver_id = ?, approver_name = ?, comment = ?, acted_at = NOW()
             WHERE id = ?`,
            [approver_id, approverName, comment || null, node_id]
          );
          await conn.query(
            `UPDATE workflow_node_approvers SET status = 'skipped'
             WHERE instance_node_id = ? AND status IN ('pending', 'waiting')`,
            [node_id]
          );
          // 拒绝 → 整个流程终止
          await conn.query(
            "UPDATE workflow_instances SET status = 'rejected', result_comment = ?, completed_at = NOW() WHERE id = ?",
            [comment || '审批被拒绝', instance_id]
          );
          // 其余待审批节点设为 skipped
          await conn.query(
            "UPDATE workflow_instance_nodes SET status = 'skipped' WHERE instance_id = ? AND status IN ('pending','in_progress') AND id != ?",
            [instance_id, node_id]
          );
          // 回调更新业务单据状态为拒绝
          await this._onWorkflowRejected(conn, instLock.business_type, instLock.business_id);
          await this._logAction(conn, {
            instanceId: Number(instance_id), nodeId: Number(node_id), action: 'reject',
            actorId: Number(approver_id), actorName: approverName,
            fromStatus: 'in_progress', toStatus: 'rejected', comment,
          });
        } else {
          const mode = node.multi_approve_type || 'any';
          let nodeComplete = true;
          if (mode === 'any') {
            await conn.query(
              `UPDATE workflow_node_approvers SET status = 'skipped'
               WHERE instance_node_id = ? AND status IN ('pending', 'waiting')`,
              [node_id]
            );
          } else if (mode === 'all') {
            const [[{ remaining }]] = await conn.query(
              `SELECT COUNT(*) AS remaining FROM workflow_node_approvers
               WHERE instance_node_id = ? AND status IN ('pending', 'waiting')`,
              [node_id]
            );
            nodeComplete = Number(remaining) === 0;
          } else if (mode === 'sequential') {
            const [[nextAssignment]] = await conn.query(
              `SELECT id, approver_id FROM workflow_node_approvers
               WHERE instance_node_id = ? AND status = 'waiting'
               ORDER BY sequence LIMIT 1 FOR UPDATE`,
              [node_id]
            );
            if (nextAssignment) {
              await conn.query(
                "UPDATE workflow_node_approvers SET status = 'pending' WHERE id = ?",
                [nextAssignment.id]
              );
              await conn.query(
                'UPDATE workflow_instance_nodes SET approver_id = ? WHERE id = ?',
                [nextAssignment.approver_id, node_id]
              );
              nodeComplete = false;
            }
          }

          await this._logAction(conn, {
            instanceId: Number(instance_id), nodeId: Number(node_id), action: 'approve',
            actorId: Number(approver_id), actorName: approverName,
            fromStatus: 'in_progress', toStatus: nodeComplete ? 'approved' : 'in_progress', comment,
            metadata: { mode, nodeComplete },
          });

          if (!nodeComplete) {
            await conn.commit();
            return this.getInstanceById(instance_id);
          }

          await conn.query(
            `UPDATE workflow_instance_nodes
             SET status = 'approved', approver_id = ?, approver_name = ?, comment = ?, acted_at = NOW()
             WHERE id = ?`,
            [approver_id, approverName, comment || null, node_id]
          );

          // 通过 → 预查询实例数据（合并两次查询为一次）
          const [pendingNodes] = await conn.query(
            "SELECT id, instance_id, template_node_id, node_name, node_type, sequence, status, approver_id, approver_name, comment, acted_at, created_at FROM workflow_instance_nodes WHERE instance_id = ? AND status = 'pending' AND node_type = 'approval' ORDER BY sequence LIMIT 1 FOR UPDATE",
            [instance_id]
          );
  
          if (pendingNodes.length > 0) {
            // 推进到下一个审批节点
            const nextNode = pendingNodes[0];
            await conn.query(
              "UPDATE workflow_instance_nodes SET status = 'in_progress' WHERE id = ?",
              [nextNode.id]
            );
            await conn.query(
              'UPDATE workflow_instances SET current_node_id = ? WHERE id = ?',
              [nextNode.id, instance_id]
            );
  
            // 分配下一审批人
            if (nextNode.template_node_id) {
              const [[tplNode]] = await conn.query(
                'SELECT id, template_id, node_name, node_type, sequence, approver_type, approver_ids, multi_approve_type, allow_self_approval, condition_expression, timeout_hours, timeout_action, created_at FROM workflow_template_nodes WHERE id = ?', [nextNode.template_node_id]
              );
              if (tplNode) {
                await this._assignApprover(
                  conn,
                  nextNode.id,
                  tplNode,
                  instLock.initiator_id,
                  Number(instance_id)
                );
              }
            }
          } else {
            // 所有审批节点都已通过 → 结束节点
            await conn.query(
              "UPDATE workflow_instance_nodes SET status = 'approved' WHERE instance_id = ? AND node_type = 'end' AND status = 'pending'",
              [instance_id]
            );
            await conn.query(
              "UPDATE workflow_instances SET status = 'approved', current_node_id = NULL, completed_at = NOW() WHERE id = ?",
              [instance_id]
            );
  
            // 回调更新业务单据状态
            await this._onWorkflowApproved(conn, instLock.business_type, instLock.business_id, approver_id);
            await this._logAction(conn, {
              instanceId: Number(instance_id), action: 'complete', actorId: Number(approver_id),
              actorName: approverName, fromStatus: 'in_progress', toStatus: 'approved', comment,
            });
          }
        }
  
        await conn.commit();
  
        // 返回实例最新状态
        return this.getInstanceById(instance_id);
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    },

  /** 撤回审批（同时回退业务单据状态） */
    async withdrawWorkflow(instance_id, userId) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
  
        const [[inst]] = await conn.query(
          "SELECT id, template_id, business_type, business_id, business_code, title, status, current_node_id, initiator_id, result_comment, started_at, completed_at, created_at, updated_at, deleted_at FROM workflow_instances WHERE id = ? AND initiator_id = ? AND status IN ('pending','in_progress') FOR UPDATE",
          [instance_id, userId]
        );
        if (!inst) throw new Error('流程不存在或无法撤回');
  
        await conn.query(
          "UPDATE workflow_instances SET status = 'withdrawn', completed_at = NOW() WHERE id = ?",
          [instance_id]
        );
        await conn.query(
          "UPDATE workflow_instance_nodes SET status = 'skipped' WHERE instance_id = ? AND status IN ('pending','in_progress')",
          [instance_id]
        );
        await conn.query(
          `UPDATE workflow_node_approvers wna
           JOIN workflow_instance_nodes win ON win.id = wna.instance_node_id
           SET wna.status = 'skipped'
           WHERE win.instance_id = ? AND wna.status IN ('pending', 'waiting')`,
          [instance_id]
        );
  
        // 回退业务单据状态到初始状态
        await this._onWorkflowWithdrawn(conn, inst.business_type, inst.business_id);
        await this._logAction(conn, {
          instanceId: Number(instance_id), action: 'withdraw', actorId: Number(userId),
          fromStatus: inst.status, toStatus: 'withdrawn',
        });
  
        await conn.commit();
        return { success: true };
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    },

  /** 获取审批实例详情 */
    async getInstanceById(id) {
      const [[instance]] = await pool.query(
        `SELECT wi.*, wt.name AS template_name, wt.code AS template_code,
                u.real_name AS initiator_name
         FROM workflow_instances wi
         LEFT JOIN workflow_templates wt ON wt.id = wi.template_id
         LEFT JOIN users u ON u.id = wi.initiator_id
         WHERE wi.id = ? AND wi.deleted_at IS NULL`, [id]
      );
      if (!instance) return null;
  
      const [nodes] = await pool.query(
        'SELECT id, instance_id, template_node_id, node_name, node_type, sequence, status, approver_id, approver_name, comment, acted_at, created_at, approver_type, approver_ids, multi_approve_type, allow_self_approval FROM workflow_instance_nodes WHERE instance_id = ? ORDER BY sequence', [id]
      );
      const nodeIds = nodes.map((node) => Number(node.id));
      if (nodeIds.length) {
        const [approvers] = await pool.query(
          `SELECT wna.id, wna.instance_node_id, wna.approver_id, wna.sequence, wna.status,
                  wna.comment, wna.acted_at, wna.assigned_at,
                  COALESCE(u.real_name, u.username) AS approver_name
           FROM workflow_node_approvers wna
           LEFT JOIN users u ON u.id = wna.approver_id
           WHERE wna.instance_node_id IN (?)
           ORDER BY wna.instance_node_id, wna.sequence`,
          [nodeIds]
        );
        const byNode = new Map();
        for (const approver of approvers) {
          const key = Number(approver.instance_node_id);
          if (!byNode.has(key)) byNode.set(key, []);
          byNode.get(key).push(approver);
        }
        nodes.forEach((node) => { node.approvers = byNode.get(Number(node.id)) || []; });
      }
      instance.nodes = nodes;
      const [actions] = await pool.query(
        `SELECT id, instance_id, node_id, action, actor_id, actor_name, from_status,
                to_status, comment, metadata, created_at
         FROM workflow_action_logs WHERE instance_id = ? ORDER BY id`,
        [id]
      );
      instance.actions = actions;
      return instance;
    },

  async canAccessInstance(instanceId, userId) {
      if (!userId) return false;
  
      const permissions = await PermissionService.getUserPermissions(userId);
      if (
        permissions.includes('*') ||
        permissions.includes('system:workflow:*') ||
        permissions.includes('system:workflow:view')
      ) {
        return true;
      }
  
      const [[row]] = await pool.query(
        `SELECT 1 AS allowed
         FROM workflow_instances wi
         WHERE wi.id = ?
           AND wi.deleted_at IS NULL
           AND (
             wi.initiator_id = ?
              OR EXISTS (
                SELECT 1
                FROM workflow_instance_nodes win
                WHERE win.instance_id = wi.id AND win.approver_id = ?
              )
              OR EXISTS (
                SELECT 1
                FROM workflow_instance_nodes win
                JOIN workflow_node_approvers wna ON wna.instance_node_id = win.id
                WHERE win.instance_id = wi.id AND wna.approver_id = ?
              )
           )
         LIMIT 1`,
        [instanceId, userId, userId, userId]
      );
  
      return Boolean(row);
    },

  /** 查询我发起的审批 */
    async getMyInitiated(userId, params = {}) {
      const { status, page = 1, pageSize = 20 } = params;
      const pagination = parsePagination(page, pageSize, { defaultPageSize: 20, maxPageSize: 100 });
      let where = 'WHERE wi.initiator_id = ? AND wi.deleted_at IS NULL';
      const values = [userId];
  
      if (status) {
        where += ' AND wi.status = ?';
        values.push(status);
      }
  
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM workflow_instances wi ${where}`, values
      );
      const listSql = appendPaginationSQL(
        `SELECT wi.*, wt.name AS template_name, u.real_name AS initiator_name
         FROM workflow_instances wi
         LEFT JOIN workflow_templates wt ON wt.id = wi.template_id
         LEFT JOIN users u ON u.id = wi.initiator_id
         ${where} ORDER BY wi.created_at DESC`,
        pagination.limit,
        pagination.offset
      );
      const [rows] = await pool.query(listSql, values);
      return { list: rows, total, page: pagination.page, pageSize: pagination.pageSize };
    },

  /** 查询我待审批的 */
    async getMyPending(userId, params = {}) {
      const { page = 1, pageSize = 20 } = params;
      const pagination = parsePagination(page, pageSize, { defaultPageSize: 20, maxPageSize: 100 });
  
      const businessStatusSql = this._buildPendingBusinessStatusSql();
      const fromSql = `FROM workflow_instance_nodes win
         JOIN workflow_instances wi ON wi.id = win.instance_id
         LEFT JOIN workflow_node_approvers wna
           ON wna.instance_node_id = win.id AND wna.approver_id = ? AND wna.status = 'pending'
         ${businessStatusSql.joins}`;
      const where = `WHERE win.status = 'in_progress'
         AND wi.status IN ('pending','in_progress')
         AND wi.deleted_at IS NULL
         AND (
           wna.id IS NOT NULL
           OR (
             win.approver_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM workflow_node_approvers existing
               WHERE existing.instance_node_id = win.id
             )
           )
         )
         ${businessStatusSql.filter}`;
      const values = [userId, userId, ...businessStatusSql.values];
  
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total ${fromSql} ${where}`, values
      );
  
      const listSql = appendPaginationSQL(
         `SELECT win.*, wna.id AS assignment_id, wna.sequence AS approval_sequence,
                  wi.title, wi.business_type, wi.business_id, wi.business_code,
                 wi.status AS instance_status, u.real_name AS initiator_name
         ${fromSql}
         LEFT JOIN users u ON u.id = wi.initiator_id
         ${where} ORDER BY win.created_at DESC`,
        pagination.limit,
        pagination.offset
      );
      const [rows] = await pool.query(listSql, values);
      return { list: rows, total, page: pagination.page, pageSize: pagination.pageSize };
    },

  /** 根据业务单据获取审批状态 */
    async getWorkflowByBusiness(business_type, business_id) {
      const [[instance]] = await pool.query(
        `SELECT id, template_id, business_type, business_id, business_code, title, status, current_node_id, initiator_id, result_comment, started_at, completed_at, created_at, updated_at, deleted_at FROM workflow_instances
         WHERE business_type = ? AND business_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [business_type, business_id]
      );
      if (!instance) return null;
      return this.getInstanceById(instance.id);
    },

  /**
     * 便捷方法：尝试发起审批流。审批配置缺失或启动失败时必须抛错，避免业务单据绕过审批。
     * @returns {{ auto_approved: boolean, instance_id?: number }}
     */
    async tryStartWorkflow(businessType, businessId, businessCode, title, userId, connection = null) {
      try {
        return await this.startWorkflow({
          business_type: businessType,
          business_id: businessId,
          business_code: businessCode,
          title: title || `${businessType} ${businessCode || businessId} 审批`,
          initiator_id: userId,
          connection,
        });
      } catch (e) {
        logger.warn(`审批流发起失败 [${businessType}:${businessId}]: ${e.message}`);
        throw e;
      }
    },
};
