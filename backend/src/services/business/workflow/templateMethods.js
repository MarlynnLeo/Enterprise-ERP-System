/**
 * WorkflowService — template methods (mixin)
 */

const runtime = require('./runtime');
const {
  pool,
  softDelete,
  parsePagination,
  appendPaginationSQL,
} = runtime;

module.exports = {
  /** 获取工作流模板列表 */
    async getTemplates(params = {}) {
      const { keyword, business_type, is_active, page = 1, pageSize = 20 } = params;
      const pagination = parsePagination(page, pageSize, { defaultPageSize: 20, maxPageSize: 100 });
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
      const listSql = appendPaginationSQL(
        `SELECT wt.*, IFNULL(nc.node_count, 0) AS node_count
         FROM workflow_templates wt
         LEFT JOIN (SELECT template_id, COUNT(*) AS node_count FROM workflow_template_nodes GROUP BY template_id) nc ON nc.template_id = wt.id
         ${listWhere} ORDER BY wt.updated_at DESC`,
        pagination.limit,
        pagination.offset
      );
      const [rows] = await pool.query(listSql, values);
  
      return { list: rows, total, page: pagination.page, pageSize: pagination.pageSize };
    },

  /** 获取模板详情（含节点） */
    async getTemplateById(id) {
      const [[template]] = await pool.query(
        'SELECT id, code, name, business_type, description, trigger_condition, is_active, version, created_by, created_at, updated_at, deleted_at FROM workflow_templates WHERE id = ? AND deleted_at IS NULL', [id]
      );
      if (!template) return null;
  
      const [nodes] = await pool.query(
        'SELECT id, template_id, node_name, node_type, sequence, approver_type, approver_ids, multi_approve_type, allow_self_approval, condition_expression, timeout_hours, timeout_action, created_at FROM workflow_template_nodes WHERE template_id = ? ORDER BY sequence', [id]
      );
      template.nodes = nodes;
      return template;
    },

  /** 创建模板 */
    async createTemplate(data, userId) {
      this._validateTemplateData(data);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        if (data.is_active ?? 1) {
          await conn.query(
            `UPDATE workflow_templates SET is_active = 0
             WHERE business_type = ? AND is_active = 1 AND deleted_at IS NULL`,
            [data.business_type]
          );
        }

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
    },

  /** 更新模板 */
    async updateTemplate(id, data, userId) {
      this._validateTemplateData(data, { requireCode: false });
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [[current]] = await conn.query(
          `SELECT id, code, business_type, version, created_by
           FROM workflow_templates WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
          [id]
        );
        if (!current) throw new Error('Workflow template not found');

        const nextActive = data.is_active ?? 1;
        if (nextActive) {
          await conn.query(
            `UPDATE workflow_templates SET is_active = 0
             WHERE business_type = ? AND is_active = 1 AND deleted_at IS NULL`,
            [data.business_type]
          );
        } else {
          await conn.query('UPDATE workflow_templates SET is_active = 0 WHERE id = ?', [id]);
        }

        const [result] = await conn.query(
          `INSERT INTO workflow_templates
           (code, name, business_type, description, trigger_condition, is_active, version, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [data.code || current.code, data.name, data.business_type, data.description || null,
           data.trigger_condition ? JSON.stringify(data.trigger_condition) : null,
           nextActive, Number(current.version) + 1, userId || current.created_by]
        );
        const newTemplateId = result.insertId;
        for (const node of data.nodes) {
          await this._insertTemplateNode(conn, newTemplateId, node);
        }

        await conn.commit();
        return this.getTemplateById(newTemplateId);
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    },

  /** 删除模板 */
    async deleteTemplate(id) {
      const [[usage]] = await pool.query(
        'SELECT COUNT(*) AS count FROM workflow_instances WHERE template_id = ?',
        [id]
      );
      if (Number(usage?.count) > 0) {
        const [result] = await pool.query(
          'UPDATE workflow_templates SET is_active = 0 WHERE id = ? AND deleted_at IS NULL',
          [id]
        );
        return result.affectedRows > 0;
      }
      return softDelete(pool, 'workflow_templates', 'id', id);
    },

  _validateTemplateData(data = {}, options = {}) {
      const { requireCode = true } = options;
      if (requireCode && !String(data.code || '').trim()) {
        throw new Error('工作流模板编码不能为空');
      }
      if (!String(data.name || '').trim()) {
        throw new Error('工作流模板名称不能为空');
      }
      const businessType = String(data.business_type || '').trim();
      if (!businessType) {
        throw new Error('工作流模板业务类型不能为空');
      }
      data.business_type = this._assertSupportedBusinessType(businessType);
      if (!Array.isArray(data.nodes) || data.nodes.length === 0) {
        throw new Error('工作流模板至少需要一个审批节点');
      }
  
      const allowedApproverTypes = new Set(['user', 'role', 'department', 'self', 'manager']);
      const allowedMultiApproveTypes = new Set(['any', 'all', 'sequential']);
      const allowedNodeTypes = new Set(['start', 'approval', 'end']);
      const sequences = new Set();
      data.nodes.forEach((node, index) => {
        const label = `第 ${index + 1} 个审批节点`;
        if (!String(node.node_name || '').trim()) {
          throw new Error(`${label}名称不能为空`);
        }
        const nodeType = node.node_type || 'approval';
        if (!allowedNodeTypes.has(nodeType)) {
          throw new Error(`${label}类型尚未实现，当前仅支持开始、审批和结束节点`);
        }
        const sequence = Number(node.sequence ?? index);
        if (!Number.isInteger(sequence) || sequences.has(sequence)) {
          throw new Error(`${label}顺序必须是唯一整数`);
        }
        sequences.add(sequence);
        node.sequence = sequence;
        if (nodeType !== 'approval') {
          node.approver_ids = null;
          node.allow_self_approval = false;
          return;
        }
        const approverType = node.approver_type || 'user';
        if (!allowedApproverTypes.has(approverType)) {
          throw new Error(`${label}审批人类型无效`);
        }
        const multiApproveType = node.multi_approve_type || 'any';
        if (!allowedMultiApproveTypes.has(multiApproveType)) {
          throw new Error(`${label}多人审批类型无效`);
        }
        if ((node.timeout_hours || 0) > 0 && (node.timeout_action || 'notify') !== 'notify') {
          throw new Error(`${label}仅支持超时提醒，不允许未实现的自动通过或自动拒绝`);
        }
  
        if (['user', 'role', 'department'].includes(approverType)) {
          const validIds = this._parseApproverIds(node.approver_ids, label);
          if (validIds.length === 0) {
            throw new Error(`${label}需要配置审批人/角色/部门 ID`);
          }
          node.approver_ids = validIds;
        } else {
          node.approver_ids = null;
        }
        node.allow_self_approval = approverType === 'self' || Boolean(node.allow_self_approval);
      });
      if (!data.nodes.some((node) => (node.node_type || 'approval') === 'approval')) {
        throw new Error('工作流模板至少需要一个审批节点');
      }
    },

  /** 插入模板节点（统一节点写入逻辑，消除 createTemplate/updateTemplate 重复） */
    async _insertTemplateNode(conn, templateId, node) {
      await conn.query(
        `INSERT INTO workflow_template_nodes
         (template_id, node_name, node_type, sequence, approver_type, approver_ids,
          multi_approve_type, allow_self_approval, condition_expression, timeout_hours, timeout_action)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [templateId, node.node_name, node.node_type || 'approval', node.sequence || 0,
         node.approver_type || 'user',
         node.approver_ids ? JSON.stringify(node.approver_ids) : null,
         node.multi_approve_type || 'any',
         node.allow_self_approval ? 1 : 0,
         node.condition_expression ? JSON.stringify(node.condition_expression) : null,
         node.timeout_hours || 0, node.timeout_action || 'notify']
      );
    },
};
