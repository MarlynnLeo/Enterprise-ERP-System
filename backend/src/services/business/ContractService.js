/**
 * ContractService.js
 * @description 合同管理服务
 * @date 2026-04-21
 */

const { pool } = require('../../config/db');
const { softDelete, withNotDeleted } = require('../../utils/softDelete');
const CodeGeneratorService = require('./CodeGeneratorService');

class ContractService {

  /** 获取合同列表 */
  async getList(params = {}) {
    const { keyword, type, status, party_b_id, department_id, page = 1, pageSize = 20 } = params;
    let where = 'WHERE c.deleted_at IS NULL';
    const values = [];

    if (keyword) {
      where += ' AND (c.code LIKE ? OR c.name LIKE ? OR c.party_a LIKE ? OR c.party_b LIKE ?)';
      values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (type) { where += ' AND c.type = ?'; values.push(type); }
    if (status) { where += ' AND c.status = ?'; values.push(status); }
    if (party_b_id) { where += ' AND c.party_b_id = ?'; values.push(party_b_id); }
    if (department_id) { where += ' AND c.department_id = ?'; values.push(department_id); }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM contracts c ${where}`, values);
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
      `SELECT c.*, u.real_name AS created_by_name, d.name AS department_name
       FROM contracts c
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN departments d ON d.id = c.department_id
       ${where} ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`,
      [...values, Number(pageSize), offset]
    );

    return { list: rows, total, page: Number(page), pageSize: Number(pageSize) };
  }

  /** 获取合同详情 */
  async getById(id) {
    const [[contract]] = await pool.query(
      `SELECT c.*, u.real_name AS created_by_name, d.name AS department_name
       FROM contracts c
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN departments d ON d.id = c.department_id
       WHERE c.id = ? AND c.deleted_at IS NULL`, [id]
    );
    if (!contract) return null;

    const [items] = await pool.query(
      'SELECT * FROM contract_items WHERE contract_id = ? ORDER BY id', [id]
    );
    contract.items = items;

    // 执行记录
    const [executions] = await pool.query(
      'SELECT * FROM contract_executions WHERE contract_id = ? ORDER BY executed_at DESC', [id]
    );
    contract.executions = executions;

    // 计算执行进度
    const totalExecuted = executions.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    contract.executed_amount = totalExecuted;
    contract.execution_rate = contract.total_amount > 0
      ? Math.round(totalExecuted / contract.total_amount * 10000) / 100
      : 0;

    return contract;
  }

  /** 创建合同 */
  async create(data, userId) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 自动生成合同编号
      const code = data.code || await CodeGeneratorService.nextCode('contract', conn);

      const [result] = await conn.query(
        `INSERT INTO contracts (code, name, type, status, party_a, party_b, party_b_id, party_b_type,
         total_amount, currency, tax_rate, sign_date, effective_date, expiry_date,
         payment_terms, delivery_terms, warranty_terms, content, attachment_urls,
         signer_id, department_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [code, data.name, data.type, data.status || 'draft',
         data.party_a, data.party_b, data.party_b_id || null, data.party_b_type || null,
         data.total_amount || 0, data.currency || 'CNY', data.tax_rate || 0,
         data.sign_date || null, data.effective_date || null, data.expiry_date || null,
         data.payment_terms || null, data.delivery_terms || null, data.warranty_terms || null,
         data.content || null, data.attachment_urls ? JSON.stringify(data.attachment_urls) : null,
         data.signer_id || null, data.department_id || null, userId]
      );

      const contractId = result.insertId;

      // 插入明细
      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          await conn.query(
            `INSERT INTO contract_items (contract_id, material_id, material_code, material_name,
             specification, unit, quantity, unit_price, amount, tax_amount, delivery_date, remark)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [contractId, item.material_id || null, item.material_code || null, item.material_name || null,
             item.specification || null, item.unit || null, item.quantity || 0,
             item.unit_price || 0, item.amount || 0, item.tax_amount || 0,
             item.delivery_date || null, item.remark || null]
          );
        }
      }

      await conn.commit();
      return this.getById(contractId);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** 更新合同 */
  async update(id, data) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `UPDATE contracts SET name = ?, type = ?, status = ?, party_a = ?, party_b = ?,
         party_b_id = ?, party_b_type = ?, total_amount = ?, currency = ?, tax_rate = ?,
         sign_date = ?, effective_date = ?, expiry_date = ?,
         payment_terms = ?, delivery_terms = ?, warranty_terms = ?, content = ?,
         attachment_urls = ?, signer_id = ?, department_id = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [data.name, data.type, data.status, data.party_a, data.party_b,
         data.party_b_id || null, data.party_b_type || null,
         data.total_amount || 0, data.currency || 'CNY', data.tax_rate || 0,
         data.sign_date || null, data.effective_date || null, data.expiry_date || null,
         data.payment_terms || null, data.delivery_terms || null, data.warranty_terms || null,
         data.content || null, data.attachment_urls ? JSON.stringify(data.attachment_urls) : null,
         data.signer_id || null, data.department_id || null, id]
      );

      // 重建明细
      if (data.items) {
        await conn.query('DELETE FROM contract_items WHERE contract_id = ?', [id]);
        for (const item of data.items) {
          await conn.query(
            `INSERT INTO contract_items (contract_id, material_id, material_code, material_name,
             specification, unit, quantity, unit_price, amount, tax_amount, delivery_date, remark)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, item.material_id || null, item.material_code || null, item.material_name || null,
             item.specification || null, item.unit || null, item.quantity || 0,
             item.unit_price || 0, item.amount || 0, item.tax_amount || 0,
             item.delivery_date || null, item.remark || null]
          );
        }
      }

      await conn.commit();
      return this.getById(id);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** 删除合同 */
  async delete(id) {
    return softDelete(pool, 'contracts', 'id', id);
  }

  /** 更新状态（提交审批时自动发起工作流） */
  async updateStatus(id, status, userId) {
    // 审批结果状态只能由工作流回调变更，前端禁止直接传
    if (['active', 'rejected'].includes(status)) {
      throw new Error('审批通过/拒绝只能通过工作流完成，请先提交审批(pending_approval)');
    }

    // 校验当前状态是否允许目标转换
    const [[current]] = await pool.query('SELECT status FROM contracts WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!current) throw new Error('合同不存在');
    const allowedTransitions = {
      draft:            ['pending_approval', 'cancelled'],
      pending_approval: ['cancelled'],        // 等待工作流处理
      active:           ['executing', 'terminated', 'cancelled'],
      executing:        ['completed', 'terminated'],
      completed:        [],
      terminated:       [],
      cancelled:        ['draft'],
      rejected:         ['draft'],
    };
    const allowed = allowedTransitions[current.status] || [];
    if (!allowed.includes(status)) {
      throw new Error(`不允许从 [${current.status}] 转换到 [${status}]`);
    }

    let finalStatus = status;
    if (status === 'pending_approval') {
      const WorkflowService = require('./WorkflowService');
      const [[contract]] = await pool.query('SELECT code, name FROM contracts WHERE id = ? AND deleted_at IS NULL', [id]);
      const wfResult = await WorkflowService.tryStartWorkflow(
        'contract', id, contract?.code, `合同 ${contract?.code} ${contract?.name} 审批`, userId
      );
      if (wfResult.auto_approved) { finalStatus = 'active'; }
    }
    await pool.query('UPDATE contracts SET status = ? WHERE id = ? AND deleted_at IS NULL', [finalStatus, id]);
    return this.getById(id);
  }

  /** 记录合同执行 */
  async addExecution(contractId, executionData) {
    await pool.query(
      `INSERT INTO contract_executions (contract_id, execution_type, business_id, business_code, amount, remark)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [contractId, executionData.execution_type, executionData.business_id,
       executionData.business_code || null, executionData.amount || 0, executionData.remark || null]
    );
    return this.getById(contractId);
  }

  /** 获取即将到期的合同 */
  async getExpiring(daysBefore = 30) {
    const [rows] = await pool.query(
      `SELECT * FROM contracts
       WHERE deleted_at IS NULL AND status IN ('active','executing')
       AND expiry_date IS NOT NULL
       AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
       ORDER BY expiry_date`,
      [daysBefore]
    );
    return rows;
  }
}

module.exports = new ContractService();
