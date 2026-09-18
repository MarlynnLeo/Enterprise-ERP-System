/**
 * ContractService.js
 * @description 合同管理服务
 * @date 2026-04-21
 */

const { pool } = require('../../config/db');
const { softDelete } = require('../../utils/softDelete');
const { parsePagination, appendPaginationSQL } = require('../../utils/safePagination');
const CodeGeneratorService = require('./CodeGeneratorService');
const { financeConfig } = require('../../config/financeConfig');
const ScopeGuard = require('../../authorization/ScopeGuard');
const { roundMoney, sumMoney } = require('../../utils/money');
const contractError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode, code: 'CONTRACT_VALIDATION' });

function validateContract(data) {
  if (!data.name?.trim() || !data.party_a?.trim() || !data.party_b?.trim()) throw contractError('合同名称、甲方和乙方不能为空');
  if (!['sales','purchase','service','other'].includes(data.type)) throw contractError('合同类型无效');
  if (!Number.isFinite(Number(data.total_amount ?? 0)) || Number(data.total_amount) < 0) throw contractError('合同金额必须为有效的非负金额');
  for (const field of ['sign_date','effective_date','expiry_date']) {
    if (data[field] && !Number.isFinite(new Date(data[field]).getTime())) throw contractError('合同日期格式无效');
  }
  if (data.effective_date && data.expiry_date && new Date(data.expiry_date) < new Date(data.effective_date)) throw contractError('合同到期日期不能早于生效日期');
}

class ContractService {

  /** 获取合同列表 */
  async getList(params = {}, req = null) {
    const { keyword, type, status, party_b_id, department_id, page = 1, pageSize = 20 } = params;
    const pagination = parsePagination(page, pageSize, { defaultPageSize: 20, maxPageSize: 100 });
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

    const scopeClause = req
      ? await ScopeGuard.applyListScope(req, 'contract', { tableAlias: 'c', ownerAlias: 'contract_owner_scope' })
      : { join: '', where: '', params: [] };
    where += scopeClause.where || '';
    values.push(...(scopeClause.params || []));

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM contracts c ${scopeClause.join || ''} ${where}`, values);
    const listSql = appendPaginationSQL(
      `SELECT c.*, u.real_name AS created_by_name, d.name AS department_name
       FROM contracts c
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN departments d ON d.id = c.department_id
       ${scopeClause.join || ''}
       ${where} ORDER BY c.updated_at DESC`,
      pagination.limit,
      pagination.offset
    );
    const [rows] = await pool.query(listSql, values);

    return { list: rows, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  /** 获取合同详情 */
  async getById(id, req = null) {
    if (req && !(await ScopeGuard.assertAccess(pool, req, 'contract', id, { accessMode: 'read' }))) return null;
    const [[contract]] = await pool.query(
      `SELECT c.*, u.real_name AS created_by_name, d.name AS department_name
       FROM contracts c
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN departments d ON d.id = c.department_id
       WHERE c.id = ? AND c.deleted_at IS NULL`, [id]
    );
    if (!contract) return null;

    const [items] = await pool.query(
      'SELECT id, contract_id, material_id, material_code, material_name, specification, unit, quantity, unit_price, amount, tax_amount, delivery_date, remark, created_at FROM contract_items WHERE contract_id = ? ORDER BY id', [id]
    );
    contract.items = items;

    // 执行记录
    const [executions] = await pool.query(
      'SELECT id, contract_id, execution_type, business_id, business_code, amount, executed_at, remark FROM contract_executions WHERE contract_id = ? ORDER BY executed_at DESC', [id]
    );
    contract.executions = executions;

    // 计算执行进度
    // 订单、发货、发票、收付款分别记录履约阶段，不能把同一笔业务跨阶段重复相加。
    const stages = {};
    executions.forEach(e => { stages[e.execution_type] = roundMoney((stages[e.execution_type] || 0) + Number(e.amount)); });
    const totalExecuted = Math.max(0, ...Object.values(stages));
    contract.executed_amount = totalExecuted;
    contract.execution_rate = contract.total_amount > 0
      ? Math.round(totalExecuted / contract.total_amount * 10000) / 100
      : 0;

    return contract;
  }

  /** 创建合同 */
  async create(data, userId, req = null) {
    validateContract(data);
    if (data.status && data.status !== 'draft') throw contractError('新合同必须从草稿开始审批');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const departmentId = data.department_id ?? req?.authzScope?.departmentId ?? null;

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
         data.total_amount || 0, data.currency || financeConfig.get('invoice.defaultCurrency', 'CNY'), data.tax_rate || 0,
         data.sign_date || null, data.effective_date || null, data.expiry_date || null,
         data.payment_terms || null, data.delivery_terms || null, data.warranty_terms || null,
         data.content || null, data.attachment_urls ? JSON.stringify(data.attachment_urls) : null,
         data.signer_id || null, departmentId, userId]
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
      return this.getById(contractId, req);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** 更新合同 */
  async update(id, data, req = null) {
    validateContract(data);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[current]] = await conn.query(
        'SELECT status, department_id FROM contracts WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
        [id]
      );
      if (!current) {
        throw contractError('合同不存在');
      }
      if (req && !(await ScopeGuard.assertAccess(conn, req, 'contract', id))) throw contractError('无权修改该合同');
      const nextDepartmentId = data.department_id === undefined
        ? current.department_id
        : (data.department_id === '' ? null : data.department_id);
      if (!['draft', 'rejected'].includes(current.status)) {
        throw contractError(`当前状态[${current.status}]不允许直接编辑合同正文，请走变更或终止流程`);
      }

      await conn.query(
        `UPDATE contracts SET name = ?, type = ?, status = ?, party_a = ?, party_b = ?,
         party_b_id = ?, party_b_type = ?, total_amount = ?, currency = ?, tax_rate = ?,
         sign_date = ?, effective_date = ?, expiry_date = ?,
         payment_terms = ?, delivery_terms = ?, warranty_terms = ?, content = ?,
         attachment_urls = ?, signer_id = ?, department_id = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [data.name, data.type, current.status, data.party_a, data.party_b,
         data.party_b_id || null, data.party_b_type || null,
         data.total_amount || 0, data.currency || financeConfig.get('invoice.defaultCurrency', 'CNY'), data.tax_rate || 0,
         data.sign_date || null, data.effective_date || null, data.expiry_date || null,
         data.payment_terms || null, data.delivery_terms || null, data.warranty_terms || null,
         data.content || null, data.attachment_urls ? JSON.stringify(data.attachment_urls) : null,
         data.signer_id || null, nextDepartmentId, id]
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
      return this.getById(id, req);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** 删除合同 */
  async delete(id, req = null) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[current]] = await conn.query('SELECT status, workflow_status FROM contracts WHERE id=? AND deleted_at IS NULL FOR UPDATE', [id]);
      if (!current) throw contractError('合同不存在', 404);
      if (req && !(await ScopeGuard.assertAccess(conn, req, 'contract', id))) throw contractError('无权删除该合同', 403);
      if (!['draft','rejected','cancelled'].includes(current.status) || ['pending','in_progress','running'].includes(current.workflow_status)) throw contractError('审批中或已生效的合同不能删除，请先撤回审批或办理终止');
      const [[execution]] = await conn.query('SELECT id FROM contract_executions WHERE contract_id=? LIMIT 1', [id]);
      if (execution) throw contractError('已有执行记录的合同不能删除');
      const result = await softDelete(conn, 'contracts', 'id', id);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally { conn.release(); }
  }

  /** 更新状态（提交审批时自动发起工作流） */
  async updateStatus(id, status, userId, req = null) {
    // 审批结果状态只能由工作流回调变更，前端禁止直接传
    if (['active', 'rejected'].includes(status)) {
      throw contractError('审批通过/拒绝只能通过工作流完成，请先提交审批');
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[current]] = await conn.query(
        'SELECT status, code, name FROM contracts WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
        [id]
      );
      if (!current) throw contractError('合同不存在');
      if (req && !(await ScopeGuard.assertAccess(conn, req, 'contract', id))) throw contractError('无权变更该合同状态');
      const allowedTransitions = {
        draft:            ['pending_approval', 'cancelled'],
        pending_approval: [],                   // 等待工作流处理；需先撤回后再改状态
        active:           ['executing', 'terminated', 'cancelled'],
        executing:        ['completed', 'terminated'],
        completed:        [],
        terminated:       [],
        cancelled:        ['draft'],
        rejected:         ['draft'],
      };
      const allowed = allowedTransitions[current.status] || [];
      if (!allowed.includes(status)) {
        throw contractError(`不允许从 [${current.status}] 转换到 [${status}]`);
      }

      let finalStatus = status;
      if (status === 'pending_approval') {
        const WorkflowService = require('./WorkflowService');
        await conn.query(
          "UPDATE contracts SET status = 'pending_approval' WHERE id = ? AND deleted_at IS NULL",
          [id]
        );
        const wfResult = await WorkflowService.tryStartWorkflow(
          'contract', id, current.code, `合同 ${current.code} ${current.name} 审批`, userId, conn
        );
        if (wfResult.auto_approved) { finalStatus = 'active'; }
      }
      await conn.query('UPDATE contracts SET status = ? WHERE id = ? AND deleted_at IS NULL', [finalStatus, id]);

      await conn.commit();
      return this.getById(id, req);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** 记录合同执行 */
  async addExecution(contractId, executionData, req = null) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[contract]] = await conn.query('SELECT * FROM contracts WHERE id=? AND deleted_at IS NULL FOR UPDATE', [contractId]);
      if (!contract) throw contractError('合同不存在', 404);
      if (req && !(await ScopeGuard.assertAccess(conn, req, 'contract', contractId))) throw contractError('无权添加合同执行记录', 403);
      const type = executionData.execution_type;
      const businessId = Number(executionData.business_id);
      const amount = Number(executionData.amount);
      if (!Number.isSafeInteger(businessId) || businessId <= 0 || !Number.isFinite(amount) || amount <= 0 || roundMoney(amount) !== amount) {
        throw contractError('执行单据、金额无效；金额须大于 0 且最多保留两位小数');
      }
      const [[existing]] = await conn.query(
        'SELECT * FROM contract_executions WHERE contract_id=? AND execution_type=? AND business_id=? FOR UPDATE',
        [contractId,type,businessId]
      );
      if (existing) {
        if (Number(existing.amount) !== amount || (executionData.business_code && executionData.business_code !== existing.business_code)) throw contractError('同一业务单据已记录执行，不能重复提交不同金额', 409);
        await conn.commit();
        return this.getById(contractId, req);
      }
      if (!['active','executing'].includes(contract.status)) throw contractError('只有已生效或执行中的合同可以记录执行');
      const purchase = contract.type === 'purchase' || contract.party_b_type === 'supplier';
      const sources = purchase ? {
        order: ['purchase_orders','order_no','supplier_id','purchase_order'],
        receipt: ['purchase_receipts','receipt_no','supplier_id','purchase_receipt'],
        payment: ['ap_payments','payment_number','supplier_id','ap_payment'],
        invoice: ['ap_invoices','invoice_number','supplier_id','ap_invoice'],
      } : {
        order: ['sales_orders','order_no','customer_id','sales_order'],
        receipt: ['ar_receipts','receipt_number','customer_id','ar_receipt'],
        invoice: ['ar_invoices','invoice_number','customer_id','ar_invoice'],
        shipment: ['sales_outbound','outbound_no',null,'sales_outbound'],
      };
      const source = sources[type];
      if (!source) throw contractError('执行类型与合同类型不匹配');
      const [table,codeField,partyField,scopeType] = source;
      const [[business]] = await conn.query(`SELECT * FROM ${table} WHERE id=? FOR UPDATE`, [businessId]);
      if (!business || business.deleted_at || ['cancelled','reversed','voided','rejected'].includes(business.status)) throw contractError('执行来源单据不存在或已作废');
      if (req && !(await ScopeGuard.assertAccess(conn, req, scopeType, businessId, { accessMode: 'read' }))) throw contractError('无权访问执行来源单据', 403);
      if (executionData.business_code && executionData.business_code !== business[codeField]) throw contractError('执行来源单据编号与 ID 不一致');
      if (contract.party_b_id && partyField && Number(contract.party_b_id) !== Number(business[partyField])) throw contractError('执行来源单据与合同客户/供应商不一致');
      if (business.contract_code && business.contract_code !== contract.code) throw contractError('来源订单已关联其他合同');
      if (type === 'shipment') {
        const [orders] = await conn.query(
          'SELECT DISTINCT o.customer_id, o.contract_code FROM sales_outbound_items i JOIN sales_orders o ON o.id=COALESCE(i.source_order_id, ?) WHERE i.outbound_id=?',
          [business.order_id,businessId]
        );
        if (!orders.length || orders.some(o => (contract.party_b_id && Number(o.customer_id) !== Number(contract.party_b_id)) || (o.contract_code && o.contract_code !== contract.code))) throw contractError('出库单不属于当前合同');
      }
      if (amount > Number(business.total_amount)) throw contractError('执行金额不能超过来源单据金额');
      const [stage] = await conn.query('SELECT amount FROM contract_executions WHERE contract_id=? AND execution_type=? FOR UPDATE', [contractId,type]);
      if (sumMoney([...stage.map(row => row.amount),amount]) > Number(contract.total_amount)) throw contractError('累计执行金额不能超过合同金额');
      await conn.query(
        'INSERT INTO contract_executions (contract_id,execution_type,business_id,business_code,amount,remark) VALUES (?,?,?,?,?,?)',
        [contractId,type,businessId,business[codeField],amount,executionData.remark || null]
      );
      await conn.commit();
      return this.getById(contractId, req);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally { conn.release(); }
  }

  /** 获取即将到期的合同 */
  async getExpiring(daysBefore = 30, req = null) {
    const scopeClause = req
      ? await ScopeGuard.applyListScope(req, 'contract', { tableAlias: 'c', ownerAlias: 'contract_expiring_owner_scope' })
      : { join: '', where: '', params: [] };
    const [rows] = await pool.query(
      `SELECT c.id, c.code, c.name, c.type, c.status, c.party_a, c.party_b, c.party_b_id, c.party_b_type, c.total_amount, c.currency, c.tax_rate, c.sign_date, c.effective_date, c.expiry_date, c.payment_terms, c.delivery_terms, c.warranty_terms, c.content, c.attachment_urls, c.signer_id, c.department_id, c.created_by, c.created_at, c.updated_at, c.deleted_at FROM contracts c
       ${scopeClause.join || ''}
       WHERE c.deleted_at IS NULL${scopeClause.where || ''} AND c.status IN ('active','executing')
       AND expiry_date IS NOT NULL
       AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
       ORDER BY expiry_date`,
        [...(scopeClause.params || []), daysBefore]
    );
    return rows;
  }
}

module.exports = new ContractService();
