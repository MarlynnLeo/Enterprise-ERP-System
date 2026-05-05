/**
 * WorkflowService.js
 * @description 审批工作流引擎核心服务
 * @date 2026-04-21
 */

const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');
const { softDelete } = require('../../utils/softDelete');

class WorkflowService {

  // ==================== 模板管理 ====================

  /** 获取工作流模板列表 */
  async getTemplates(params = {}) {
    const { keyword, business_type, is_active, page = 1, pageSize = 20 } = params;
    let countWhere = 'WHERE deleted_at IS NULL';
    let listWhere = 'WHERE wt.deleted_at IS NULL';
    const values = [];

    if (keyword) {
      countWhere += ' AND (name LIKE ? OR code LIKE ?)';
      listWhere += ' AND (wt.name LIKE ? OR wt.code LIKE ?)';
      values.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (business_type) {
      countWhere += ' AND business_type = ?';
      listWhere += ' AND wt.business_type = ?';
      values.push(business_type);
    }
    if (is_active !== undefined && is_active !== '') {
      countWhere += ' AND is_active = ?';
      listWhere += ' AND wt.is_active = ?';
      values.push(Number(is_active));
    }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM workflow_templates ${countWhere}`, values);
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
      `SELECT wt.*, IFNULL(nc.node_count, 0) AS node_count
       FROM workflow_templates wt
       LEFT JOIN (SELECT template_id, COUNT(*) AS node_count FROM workflow_template_nodes GROUP BY template_id) nc ON nc.template_id = wt.id
       ${listWhere} ORDER BY wt.updated_at DESC LIMIT ? OFFSET ?`,
      [...values, Number(pageSize), offset]
    );

    return { list: rows, total, page: Number(page), pageSize: Number(pageSize) };
  }

  /** 获取模板详情（含节点） */
  async getTemplateById(id) {
    const [[template]] = await pool.query(
      'SELECT * FROM workflow_templates WHERE id = ? AND deleted_at IS NULL', [id]
    );
    if (!template) return null;

    const [nodes] = await pool.query(
      'SELECT * FROM workflow_template_nodes WHERE template_id = ? ORDER BY sequence', [id]
    );
    template.nodes = nodes;
    return template;
  }

  /** 创建模板 */
  async createTemplate(data, userId) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        `INSERT INTO workflow_templates (code, name, business_type, description, trigger_condition, is_active, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [data.code, data.name, data.business_type, data.description || null,
         data.trigger_condition ? JSON.stringify(data.trigger_condition) : null,
         data.is_active ?? 1, userId]
      );
      const templateId = result.insertId;

      // 插入节点
      if (data.nodes && data.nodes.length > 0) {
        for (const node of data.nodes) {
          await this._insertTemplateNode(conn, templateId, node);
        }
      }

      await conn.commit();
      return this.getTemplateById(templateId);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** 更新模板 */
  async updateTemplate(id, data) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `UPDATE workflow_templates SET name = ?, business_type = ?, description = ?,
         trigger_condition = ?, is_active = ?, version = version + 1 WHERE id = ?`,
        [data.name, data.business_type, data.description || null,
         data.trigger_condition ? JSON.stringify(data.trigger_condition) : null,
         data.is_active ?? 1, id]
      );

      // 重建节点
      if (data.nodes) {
        await conn.query('DELETE FROM workflow_template_nodes WHERE template_id = ?', [id]);
        for (const node of data.nodes) {
          await this._insertTemplateNode(conn, id, node);
        }
      }

      await conn.commit();
      return this.getTemplateById(id);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** 删除模板 */
  async deleteTemplate(id) {
    return softDelete(pool, 'workflow_templates', 'id', id);
  }

  // ==================== 审批流程发起 & 处理 ====================

  /** 发起审批 */
  async startWorkflow({ business_type, business_id, business_code, title, initiator_id }) {
    // 1. 查找匹配的活跃模板
    const [[template]] = await pool.query(
      `SELECT * FROM workflow_templates
       WHERE business_type = ? AND is_active = 1 AND deleted_at IS NULL
       ORDER BY version DESC LIMIT 1`,
      [business_type]
    );

    if (!template) {
      throw new Error(`业务类型 ${business_type} 未配置启用的审批流程，单据已挂起，请先配置工作流模板`);
    }

    // 2. 获取模板节点
    const [templateNodes] = await pool.query(
      'SELECT * FROM workflow_template_nodes WHERE template_id = ? ORDER BY sequence',
      [template.id]
    );

    if (templateNodes.length === 0) {
      throw new Error(`业务类型 ${business_type} 的审批流程没有节点，单据已挂起，请完善工作流模板`);
    }

    if (!templateNodes.some(node => node.node_type === 'approval')) {
      throw new Error(`业务类型 ${business_type} 的审批流程缺少审批节点，单据已挂起，请完善工作流模板`);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 3. 创建流程实例
      const [instResult] = await conn.query(
        `INSERT INTO workflow_instances
         (template_id, business_type, business_id, business_code, title, status, initiator_id, started_at)
         VALUES (?, ?, ?, ?, ?, 'in_progress', ?, NOW())`,
        [template.id, business_type, business_id, business_code || '', title, initiator_id]
      );
      const instanceId = instResult.insertId;

      // 4. 创建实例节点
      let firstApprovalNodeId = null;
      for (const tn of templateNodes) {
        const [nodeResult] = await conn.query(
          `INSERT INTO workflow_instance_nodes
           (instance_id, template_node_id, node_name, node_type, sequence, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [instanceId, tn.id, tn.node_name, tn.node_type, tn.sequence,
           tn.node_type === 'start' ? 'approved' : 'pending']
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
          await this._assignApprover(conn, firstApprovalNodeId, currentTplNode, initiator_id);
        }
      }

      await conn.commit();
      return { auto_approved: false, instance_id: instanceId, message: '审批流程已发起' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** 审批操作（通过/拒绝） */
  async handleApproval({ instance_id, node_id, action, comment, approver_id }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. 验证节点状态
      const [[node]] = await conn.query(
        "SELECT * FROM workflow_instance_nodes WHERE id = ? AND instance_id = ? AND status = 'in_progress'",
        [node_id, instance_id]
      );
      if (!node) throw new Error('审批节点不存在或已处理');

      // 1.5 验证审批人身份：只有节点指定的审批人或管理员可操作
      if (node.approver_id && node.approver_id !== approver_id) {
        const PermissionService = require('../../services/PermissionService');
        const isAdmin = await PermissionService.isAdmin(approver_id);
        if (!isAdmin) {
          throw new Error('您不是该审批节点的指定审批人，无权操作');
        }
      }

      // 获取审批人姓名
      const [[user]] = await conn.query('SELECT real_name, username FROM users WHERE id = ?', [approver_id]);
      const approverName = user?.real_name || user?.username || String(approver_id);

      // 2. 更新节点状态
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      await conn.query(
        `UPDATE workflow_instance_nodes SET status = ?, approver_id = ?, approver_name = ?, comment = ?, acted_at = NOW()
         WHERE id = ?`,
        [newStatus, approver_id, approverName, comment || null, node_id]
      );

      if (action === 'reject') {
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
        const [[instRej]] = await conn.query('SELECT business_type, business_id FROM workflow_instances WHERE id = ?', [instance_id]);
        if (instRej) {
          await this._onWorkflowRejected(conn, instRej.business_type, instRej.business_id);
        }
      } else {
        // 通过 → 预查询实例数据（合并两次查询为一次）
        const [[instData]] = await conn.query(
          'SELECT initiator_id, business_type, business_id FROM workflow_instances WHERE id = ?', [instance_id]
        );
        const [pendingNodes] = await conn.query(
          "SELECT * FROM workflow_instance_nodes WHERE instance_id = ? AND status = 'pending' AND node_type = 'approval' ORDER BY sequence LIMIT 1",
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
              'SELECT * FROM workflow_template_nodes WHERE id = ?', [nextNode.template_node_id]
            );
            if (tplNode) {
              await this._assignApprover(conn, nextNode.id, tplNode, instData?.initiator_id);
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
          if (instData) {
            await this._onWorkflowApproved(conn, instData.business_type, instData.business_id, approver_id);
          }
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
  }

  /** 撤回审批（同时回退业务单据状态） */
  async withdrawWorkflow(instance_id, userId) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[inst]] = await conn.query(
        "SELECT * FROM workflow_instances WHERE id = ? AND initiator_id = ? AND status IN ('pending','in_progress')",
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

      // 回退业务单据状态到初始状态
      await this._onWorkflowWithdrawn(conn, inst.business_type, inst.business_id);

      await conn.commit();
      return { success: true };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // ==================== 查询 ====================

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
      'SELECT * FROM workflow_instance_nodes WHERE instance_id = ? ORDER BY sequence', [id]
    );
    instance.nodes = nodes;
    return instance;
  }

  /** 查询我发起的审批 */
  async getMyInitiated(userId, params = {}) {
    const { status, page = 1, pageSize = 20 } = params;
    let where = 'WHERE wi.initiator_id = ? AND wi.deleted_at IS NULL';
    const values = [userId];

    if (status) {
      where += ' AND wi.status = ?';
      values.push(status);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM workflow_instances wi ${where}`, values
    );
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
      `SELECT wi.*, wt.name AS template_name, u.real_name AS initiator_name
       FROM workflow_instances wi
       LEFT JOIN workflow_templates wt ON wt.id = wi.template_id
       LEFT JOIN users u ON u.id = wi.initiator_id
       ${where} ORDER BY wi.created_at DESC LIMIT ? OFFSET ?`,
      [...values, Number(pageSize), offset]
    );
    return { list: rows, total, page: Number(page), pageSize: Number(pageSize) };
  }

  /** 查询我待审批的 */
  async getMyPending(userId, params = {}) {
    const { page = 1, pageSize = 20 } = params;

    // 获取用户角色和部门


    // 查找指派给本人的 in_progress 节点
    const where = `WHERE win.status = 'in_progress' AND wi.deleted_at IS NULL AND win.approver_id = ?`;
    const values = [userId];

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM workflow_instance_nodes win
       JOIN workflow_instances wi ON wi.id = win.instance_id ${where}`, values
    );

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
      `SELECT win.*, wi.title, wi.business_type, wi.business_id, wi.business_code,
              wi.status AS instance_status, u.real_name AS initiator_name
       FROM workflow_instance_nodes win
       JOIN workflow_instances wi ON wi.id = win.instance_id
       LEFT JOIN users u ON u.id = wi.initiator_id
       ${where} ORDER BY win.created_at DESC LIMIT ? OFFSET ?`,
      [...values, Number(pageSize), offset]
    );
    return { list: rows, total, page: Number(page), pageSize: Number(pageSize) };
  }

  /** 根据业务单据获取审批状态 */
  async getWorkflowByBusiness(business_type, business_id) {
    const [[instance]] = await pool.query(
      `SELECT * FROM workflow_instances
       WHERE business_type = ? AND business_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [business_type, business_id]
    );
    if (!instance) return null;
    return this.getInstanceById(instance.id);
  }

  // ==================== 内部方法 ====================

  /** 为审批节点分配审批人 */
  async _assignApprover(conn, nodeId, templateNode, initiatorId) {
    let approverId = null;

    switch (templateNode.approver_type) {
      case 'user': {
        const ids = templateNode.approver_ids ? JSON.parse(templateNode.approver_ids) : [];
        if (ids.length > 0) approverId = ids[0]; // 简化: 取第一个
        break;
      }
      case 'manager': {
        // 获取发起人的部门主管（通过 manager_id 外键精确匹配）
        const [[initiator]] = await conn.query(
          'SELECT department_id FROM users WHERE id = ?', [initiatorId]
        );
        if (initiator?.department_id) {
          const [[dept]] = await conn.query(
            'SELECT manager_id FROM departments WHERE id = ?', [initiator.department_id]
          );
          if (dept?.manager_id) {
            approverId = dept.manager_id;
          }
        }
        break;
      }
      case 'role': {
        const roleIds = templateNode.approver_ids ? JSON.parse(templateNode.approver_ids) : [];
        if (roleIds.length > 0) {
          const [users] = await conn.query(
            `SELECT DISTINCT ur.user_id FROM user_roles ur WHERE ur.role_id IN (?)`,
            [roleIds]
          );
          if (users.length > 0) approverId = users[0].user_id;
        }
        break;
      }
      case 'self':
        approverId = initiatorId;
        break;
    }

    if (approverId) {
      await conn.query(
        'UPDATE workflow_instance_nodes SET approver_id = ? WHERE id = ?',
        [approverId, nodeId]
      );
    } else {
      throw new Error(`审批节点 ${nodeId} 无法自动分配审批人，请检查流程模板审批人配置`);
    }
  }
  /** 插入模板节点（统一节点写入逻辑，消除 createTemplate/updateTemplate 重复） */
  async _insertTemplateNode(conn, templateId, node) {
    await conn.query(
      `INSERT INTO workflow_template_nodes
       (template_id, node_name, node_type, sequence, approver_type, approver_ids, multi_approve_type, condition_expression, timeout_hours, timeout_action)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [templateId, node.node_name, node.node_type || 'approval', node.sequence || 0,
       node.approver_type || 'user',
       node.approver_ids ? JSON.stringify(node.approver_ids) : null,
       node.multi_approve_type || 'any',
       node.condition_expression ? JSON.stringify(node.condition_expression) : null,
       node.timeout_hours || 0, node.timeout_action || 'notify']
    );
  }

  // ==================== 业务单据状态映射（统一配置） ====================

  /**
   * 业务类型 → 表名/回调状态 映射表（集中管理，消除重复）
   * approved: 审批通过后的目标状态
   * rejected: 审批拒绝后的目标状态
   * withdrawn: 撤回后的目标状态
   * extra: 审批通过时的附加SQL片段
   */
  static BUSINESS_STATUS_MAP = {
    purchase_order:       { table: 'purchase_orders',       approved: 'approved', rejected: 'draft',    withdrawn: 'draft', extra: '' },
    purchase_requisition: { table: 'purchase_requisitions', approved: 'approved', rejected: 'draft',    withdrawn: 'draft', extra: '' },
    contract:             { table: 'contracts',              approved: 'active',   rejected: 'draft',    withdrawn: 'draft', extra: '' },
    ecn:                  { table: 'ecn_orders',             approved: 'approved', rejected: 'rejected', withdrawn: 'draft', extra: ', approved_by = ?, approved_at = NOW()' },
  };

  /**
   * 统一更新业务单据状态（通过/拒绝/撤回共用）
   * @param {'approved'|'rejected'|'withdrawn'} action - 动作类型
   */
  async _updateBusinessStatus(conn, action, businessType, businessId, approverId) {
    const cfg = WorkflowService.BUSINESS_STATUS_MAP[businessType];
    if (!cfg) {
      throw new Error(`业务类型 ${businessType} 未配置审批状态回调，无法完成闭环更新`);
    }
    const targetStatus = cfg[action];
    if (!targetStatus) {
      throw new Error(`业务类型 ${businessType} 未配置 ${action} 状态，无法完成闭环更新`);
    }

    try {
      const params = [targetStatus];
      const extraSql = action === 'approved' ? (cfg.extra || '') : '';
      if (extraSql.includes('approved_by')) params.push(approverId);
      params.push(businessId);
      await conn.query(`UPDATE ${cfg.table} SET status = ?${extraSql} WHERE id = ?`, params);
      logger.info(`工作流${action}回调: ${businessType}#${businessId} → ${targetStatus}`);

      // 采购申购单批准后自动生成采购订单
      if (action === 'approved' && businessType === 'purchase_requisition') {
        try {
          const { generateOrdersFromRequisition } = require('./RequisitionAutoOrderService');
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
  }

  /** 审批通过回调 */
  async _onWorkflowApproved(conn, businessType, businessId, approverId) {
    return this._updateBusinessStatus(conn, 'approved', businessType, businessId, approverId);
  }

  /** 审批拒绝回调 */
  async _onWorkflowRejected(conn, businessType, businessId) {
    return this._updateBusinessStatus(conn, 'rejected', businessType, businessId);
  }

  /** 撤回回调 */
  async _onWorkflowWithdrawn(conn, businessType, businessId) {
    return this._updateBusinessStatus(conn, 'withdrawn', businessType, businessId);
  }

  /**
   * 便捷方法：尝试发起审批流。审批配置缺失或启动失败时必须抛错，避免业务单据绕过审批。
   * @returns {{ auto_approved: boolean, instance_id?: number }}
   */
  async tryStartWorkflow(businessType, businessId, businessCode, title, userId) {
    try {
      return await this.startWorkflow({
        business_type: businessType,
        business_id: businessId,
        business_code: businessCode,
        title: title || `${businessType} ${businessCode || businessId} 审批`,
        initiator_id: userId,
      });
    } catch (e) {
      logger.warn(`审批流发起失败 [${businessType}:${businessId}]: ${e.message}`);
      throw e;
    }
  }
}

const workflowService = new WorkflowService();
module.exports = workflowService;
