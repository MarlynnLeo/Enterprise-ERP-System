/**
 * enhancedModulesController.js
 * @description 编码规则 / 单据关联 / 汇率 / 绩效 / ECN / 文档 / 告警 — 统一控制器
 * @date 2026-04-21
 */

const CodeGeneratorService = require('../../services/business/CodeGeneratorService');
const DocumentLinkService = require('../../services/business/DocumentLinkService');
const { pool } = require('../../config/db');
const { softDelete } = require('../../utils/softDelete');
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');
const { parsePagination } = require('../../utils/safePagination');

// ==================== 编码规则 ====================
const codingRules = {
  async getList(req, res) {
    try { ResponseHandler.success(res, await CodeGeneratorService.getRules(req.query)); }
    catch (e) { logger.error('获取编码规则失败:', e); ResponseHandler.error(res, e.message); }
  },
  async getById(req, res) {
    try { ResponseHandler.success(res, await CodeGeneratorService.getRuleById(req.params.id)); }
    catch (e) { ResponseHandler.error(res, e.message); }
  },
  async create(req, res) {
    try { ResponseHandler.success(res, await CodeGeneratorService.createRule(req.body), '创建成功'); }
    catch (e) { logger.error('创建编码规则失败:', e); ResponseHandler.error(res, e.message); }
  },
  async update(req, res) {
    try { ResponseHandler.success(res, await CodeGeneratorService.updateRule(req.params.id, req.body), '更新成功'); }
    catch (e) { logger.error('更新编码规则失败:', e); ResponseHandler.error(res, e.message); }
  },
  async preview(req, res) {
    try { ResponseHandler.success(res, { preview: await CodeGeneratorService.previewCode(req.params.type) }); }
    catch (e) { ResponseHandler.error(res, e.message); }
  },
  async resetSequence(req, res) {
    try { ResponseHandler.success(res, await CodeGeneratorService.resetSequence(req.body.business_type, req.body.period_key), '已重置'); }
    catch (e) { ResponseHandler.error(res, e.message); }
  },
  async deleteRule(req, res) {
    try { ResponseHandler.success(res, await CodeGeneratorService.deleteRule(req.params.id), '删除成功'); }
    catch (e) { logger.error('删除编码规则失败:', e); ResponseHandler.error(res, e.message); }
  },
  async getSequences(req, res) {
    try { ResponseHandler.success(res, await CodeGeneratorService.getSequences(req.params.type)); }
    catch (e) { ResponseHandler.error(res, e.message); }
  },
};

// ==================== 单据关联 ====================
const docLinks = {
  async getLinks(req, res) {
    try { ResponseHandler.success(res, await DocumentLinkService.getLinks(req.query.business_type, req.query.business_id)); }
    catch (e) { ResponseHandler.error(res, e.message); }
  },
  async getFullChain(req, res) {
    try { ResponseHandler.success(res, await DocumentLinkService.getFullChain(req.query.business_type, req.query.business_id)); }
    catch (e) { ResponseHandler.error(res, e.message); }
  },
  async createLink(req, res) {
    try { await DocumentLinkService.createLink(req.body); ResponseHandler.success(res, null, '关联已创建'); }
    catch (e) { ResponseHandler.error(res, e.message); }
  },
  async deleteLink(req, res) {
    try { await DocumentLinkService.deleteLink(req.params.id); ResponseHandler.success(res, null, '关联已删除'); }
    catch (e) { ResponseHandler.error(res, e.message); }
  },
  async getTypeLabels(req, res) {
    try { ResponseHandler.success(res, DocumentLinkService.getTypeLabels()); }
    catch (e) { ResponseHandler.error(res, e.message); }
  },
};

// ==================== 汇率 ====================
const exchangeRates = {
  async getList(req, res) {
    try {
      const { from_currency, to_currency } = req.query;
      const pagination = parsePagination(req.query.page, req.query.pageSize, { defaultPageSize: 50, maxPageSize: 200 });
      let where = 'WHERE deleted_at IS NULL';
      const vals = [];
      if (from_currency) { where += ' AND from_currency = ?'; vals.push(from_currency); }
      if (to_currency) { where += ' AND to_currency = ?'; vals.push(to_currency); }
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM exchange_rates ${where}`, vals);
      const [rows] = await pool.query(
        `SELECT * FROM exchange_rates ${where} ORDER BY effective_date DESC, from_currency LIMIT ? OFFSET ?`,
        [...vals, pagination.limit, pagination.offset]
      );
      ResponseHandler.success(res, { list: rows, total, page: pagination.page, pageSize: pagination.pageSize });
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async create(req, res) {
    try {
      const { from_currency, to_currency, rate, effective_date } = req.body;
      const parsedRate = Number(rate);
      if (!from_currency || !effective_date || !Number.isFinite(parsedRate) || parsedRate <= 0) {
        return ResponseHandler.error(res, 'from_currency, effective_date and positive rate are required', 'VALIDATION_ERROR', 400);
      }
      const userId = req.user?.userId || req.user?.id;
      await pool.query(
        `INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, source, created_by)
         VALUES (?, ?, ?, ?, 'manual', ?) ON DUPLICATE KEY UPDATE rate = ?, source = 'manual'`,
        [String(from_currency).toUpperCase(), String(to_currency || 'CNY').toUpperCase(), parsedRate, effective_date, userId, parsedRate]
      );
      ResponseHandler.success(res, null, '汇率已保存');
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async delete(req, res) {
    try {
      await softDelete(pool, 'exchange_rates', 'id', req.params.id);
      ResponseHandler.success(res, null, '已删除');
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async getLatestRate(req, res) {
    try {
      const { from, to } = req.query;
      if (!from) {
        return ResponseHandler.error(res, 'from currency is required', 'VALIDATION_ERROR', 400);
      }
      const [[row]] = await pool.query(
        `SELECT * FROM exchange_rates WHERE from_currency = ? AND to_currency = ? AND effective_date <= CURDATE() AND deleted_at IS NULL
         ORDER BY effective_date DESC LIMIT 1`,
        [String(from).toUpperCase(), String(to || 'CNY').toUpperCase()]
      );
      ResponseHandler.success(res, row || null);
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
};

// ==================== 绩效管理 ====================
const performance = {
  // 指标库
  async getIndicators(req, res) {
    try {
      const { category, keyword, page = 1, pageSize = 50 } = req.query;
      let where = 'WHERE deleted_at IS NULL';
      const vals = [];
      if (category) { where += ' AND category = ?'; vals.push(category); }
      if (keyword) { where += ' AND (name LIKE ? OR code LIKE ?)'; vals.push(`%${keyword}%`, `%${keyword}%`); }
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM performance_indicators ${where}`, vals);
      const [rows] = await pool.query(`SELECT * FROM performance_indicators ${where} ORDER BY category, code LIMIT ? OFFSET ?`, [...vals, Number(pageSize), (page - 1) * pageSize]);
      ResponseHandler.success(res, { list: rows, total });
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async createIndicator(req, res) {
    try {
      const d = req.body;
      const [r] = await pool.query(
        'INSERT INTO performance_indicators (code, name, category, description, unit, target_value, weight, scoring_method, formula) VALUES (?,?,?,?,?,?,?,?,?)',
        [d.code, d.name, d.category || 'other', d.description, d.unit, d.target_value, d.weight || 0, d.scoring_method || 'manual', d.formula]
      );
      const [[row]] = await pool.query('SELECT * FROM performance_indicators WHERE id = ?', [r.insertId]);
      ResponseHandler.success(res, row, '创建成功');
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async updateIndicator(req, res) {
    try {
      const d = req.body;
      await pool.query(
        'UPDATE performance_indicators SET name=?, category=?, description=?, unit=?, target_value=?, weight=?, scoring_method=?, formula=?, is_active=? WHERE id=?',
        [d.name, d.category, d.description, d.unit, d.target_value, d.weight, d.scoring_method, d.formula, d.is_active ?? 1, req.params.id]
      );
      ResponseHandler.success(res, null, '更新成功');
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async deleteIndicator(req, res) {
    try {
      await pool.query('UPDATE performance_indicators SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
      ResponseHandler.success(res, null, '已删除');
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  // 考核周期
  async getPeriods(req, res) {
    try {
      const [rows] = await pool.query('SELECT * FROM performance_periods ORDER BY start_date DESC');
      ResponseHandler.success(res, rows);
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async createPeriod(req, res) {
    try {
      const d = req.body;
      const userId = req.user?.userId || req.user?.id;
      const [r] = await pool.query(
        'INSERT INTO performance_periods (name, type, start_date, end_date, status, created_by) VALUES (?,?,?,?,?,?)',
        [d.name, d.type || 'quarterly', d.start_date, d.end_date, 'draft', userId]
      );
      ResponseHandler.success(res, { id: r.insertId }, '创建成功');
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async updatePeriodStatus(req, res) {
    try {
      await pool.query('UPDATE performance_periods SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
      ResponseHandler.success(res, null, '状态已更新');
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  // 评估
  async getEvaluations(req, res) {
    try {
      const { period_id, department_id, status, page = 1, pageSize = 20 } = req.query;
      let where = 'WHERE 1=1';
      const vals = [];
      if (period_id) { where += ' AND pe.period_id = ?'; vals.push(period_id); }
      if (department_id) { where += ' AND pe.department_id = ?'; vals.push(department_id); }
      if (status) { where += ' AND pe.status = ?'; vals.push(status); }
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM performance_evaluations pe ${where}`, vals);
      const [rows] = await pool.query(
        `SELECT pe.*, pp.name AS period_name, u.real_name AS evaluator_name
         FROM performance_evaluations pe
         LEFT JOIN performance_periods pp ON pp.id = pe.period_id
         LEFT JOIN users u ON u.id = pe.evaluator_id
         ${where} ORDER BY pe.created_at DESC LIMIT ? OFFSET ?`,
        [...vals, Number(pageSize), (page - 1) * pageSize]
      );
      ResponseHandler.success(res, { list: rows, total });
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async getEvaluationById(req, res) {
    try {
      const [[ev]] = await pool.query('SELECT * FROM performance_evaluations WHERE id = ?', [req.params.id]);
      if (!ev) return ResponseHandler.error(res, '评估不存在', 'NOT_FOUND', 404);
      const [items] = await pool.query('SELECT * FROM performance_evaluation_items WHERE evaluation_id = ?', [ev.id]);
      ev.items = items;
      ResponseHandler.success(res, ev);
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async createEvaluation(req, res) {
    try {
      const d = req.body;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [r] = await conn.query(
          `INSERT INTO performance_evaluations (period_id, employee_id, employee_name, department_id, evaluator_id, status)
           VALUES (?,?,?,?,?,?)`,
          [d.period_id, d.employee_id, d.employee_name, d.department_id, d.evaluator_id, 'draft']
        );
        const evalId = r.insertId;
        if (d.items) {
          for (const item of d.items) {
            await conn.query(
              `INSERT INTO performance_evaluation_items (evaluation_id, indicator_id, indicator_name, weight, target_value)
               VALUES (?,?,?,?,?)`,
              [evalId, item.indicator_id, item.indicator_name, item.weight || 0, item.target_value]
            );
          }
        }
        await conn.commit();
        ResponseHandler.success(res, { id: evalId }, '创建成功');
      } catch (err) { await conn.rollback(); throw err; }
      finally { conn.release(); }
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async scoreEvaluation(req, res) {
    try {
      const { items, evaluator_comment, total_score, grade } = req.body;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        if (items) {
          for (const item of items) {
            await conn.query(
              'UPDATE performance_evaluation_items SET self_score=?, manager_score=?, final_score=?, actual_value=?, remark=? WHERE id=?',
              [item.self_score, item.manager_score, item.final_score, item.actual_value, item.remark, item.id]
            );
          }
        }
        await conn.query(
          'UPDATE performance_evaluations SET total_score=?, grade=?, evaluator_comment=?, status=?, completed_at=IF(?="completed",NOW(),completed_at) WHERE id=?',
          [total_score, grade, evaluator_comment, req.body.status || 'completed', req.body.status || 'completed', req.params.id]
        );
        await conn.commit();
        ResponseHandler.success(res, null, '评分已保存');
      } catch (err) { await conn.rollback(); throw err; }
      finally { conn.release(); }
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
};

// ==================== ECN 变更管理 ====================
const ECN_BOM_CHANGE_TYPES = new Set(['bom_add', 'bom_remove', 'bom_modify']);
const ECN_ALLOWED_CHANGE_TYPES = new Set([
  'bom_add',
  'bom_remove',
  'bom_modify',
  'material_modify',
]);
const ECN_BOM_FIELDS = new Set(['quantity', 'remark', 'unit_id', 'level', 'parent_id']);
const ECN_MATERIAL_FIELDS = new Set(['name', 'specs', 'specification', 'unit_id', 'safety_stock', 'min_stock', 'max_stock', 'price']);

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function normalizeEcnItem(item = {}) {
  const fieldName = item.field_name === 'specification' ? 'specs' : item.field_name;
  return {
    ...item,
    field_name: fieldName || null,
    bom_id: item.bom_id || null,
    material_id: item.material_id || null,
  };
}

function validateEcnPayload(data = {}, { requireItems = false } = {}) {
  if (isBlank(data.title)) return 'ECN标题不能为空';
  if (isBlank(data.reason)) return '变更原因不能为空';
  const items = Array.isArray(data.items) ? data.items.map(normalizeEcnItem) : [];
  if (requireItems && items.length === 0) return '提交审批前至少需要维护一条变更明细';

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const row = i + 1;
    if (!ECN_ALLOWED_CHANGE_TYPES.has(item.change_type)) return `第${row}行变更类型不支持`;
    if (ECN_BOM_CHANGE_TYPES.has(item.change_type) && !item.bom_id) return `第${row}行BOM不能为空`;
    if (['bom_add', 'bom_remove', 'bom_modify', 'material_modify'].includes(item.change_type) && !item.material_id) {
      return `第${row}行物料不能为空`;
    }
    if (item.change_type === 'bom_modify') {
      if (!ECN_BOM_FIELDS.has(item.field_name)) return `第${row}行BOM变更字段不支持`;
      if (isBlank(item.new_value)) return `第${row}行变更后不能为空`;
    }
    if (item.change_type === 'material_modify') {
      if (!ECN_MATERIAL_FIELDS.has(item.field_name)) return `第${row}行物料变更字段不支持`;
      if (isBlank(item.new_value)) return `第${row}行变更后不能为空`;
    }
    if (item.change_type === 'bom_add' && isBlank(item.new_value)) {
      item.new_value = 1;
    }
  }

  return null;
}

function sameValue(left, right) {
  if (isBlank(left)) return true;
  return String(left).trim() === String(right ?? '').trim();
}

async function syncEcnDocumentLinks(conn, ecnId, ecnCode, items, userId) {
  await conn.query(
    "DELETE FROM document_links WHERE source_type = 'ecn' AND source_id = ? AND target_type IN ('bom','material')",
    [ecnId]
  );

  const seen = new Set();
  for (const item of items.map(normalizeEcnItem)) {
    if (item.bom_id) {
      const key = `bom:${item.bom_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        await DocumentLinkService.createLink({
          source_type: 'ecn',
          source_id: ecnId,
          source_code: ecnCode,
          target_type: 'bom',
          target_id: item.bom_id,
          target_code: `BOM#${item.bom_id}`,
          link_type: 'related',
          remark: 'ECN影响BOM',
          created_by: userId,
        }, conn);
      }
    }
    if (item.material_id) {
      const key = `material:${item.material_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        await DocumentLinkService.createLink({
          source_type: 'ecn',
          source_id: ecnId,
          source_code: ecnCode,
          target_type: 'material',
          target_id: item.material_id,
          target_code: item.material_code || String(item.material_id),
          link_type: 'related',
          remark: 'ECN影响物料',
          created_by: userId,
        }, conn);
      }
    }
  }
}

const ecn = {
  async getList(req, res) {
    try {
      const { keyword, type, status, page = 1, pageSize = 20 } = req.query;
      let where = 'WHERE e.deleted_at IS NULL';
      const vals = [];
      if (keyword) { where += ' AND (e.code LIKE ? OR e.title LIKE ?)'; vals.push(`%${keyword}%`, `%${keyword}%`); }
      if (type) { where += ' AND e.type = ?'; vals.push(type); }
      if (status) { where += ' AND e.status = ?'; vals.push(status); }
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM ecn_orders e ${where}`, vals);
      const [rows] = await pool.query(
        `SELECT e.*, u.real_name AS requested_by_name FROM ecn_orders e LEFT JOIN users u ON u.id = e.requested_by
         ${where} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
        [...vals, Number(pageSize), (page - 1) * pageSize]
      );
      ResponseHandler.success(res, { list: rows, total });
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async getById(req, res) {
    try {
      const [[order]] = await pool.query('SELECT e.*, u.real_name AS requested_by_name FROM ecn_orders e LEFT JOIN users u ON u.id = e.requested_by WHERE e.id = ? AND e.deleted_at IS NULL', [req.params.id]);
      if (!order) return ResponseHandler.error(res, 'ECN不存在', 'NOT_FOUND', 404);
      const [items] = await pool.query('SELECT * FROM ecn_order_items WHERE ecn_id = ?', [order.id]);
      order.items = items;
      ResponseHandler.success(res, order);
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async create(req, res) {
    try {
      const d = req.body;
      const validationError = validateEcnPayload(d);
      if (validationError) return ResponseHandler.error(res, validationError, 'VALIDATION_ERROR', 400);
      const items = Array.isArray(d.items) ? d.items.map(normalizeEcnItem) : [];
      const userId = req.user?.userId || req.user?.id;
      const code = d.code || await CodeGeneratorService.nextCode('ecn');
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [r] = await conn.query(
          `INSERT INTO ecn_orders (code, title, type, priority, status, reason, description, impact_analysis, effective_date, disposition, requested_by, department_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [code, d.title, d.type || 'ecn', d.priority || 'medium', 'draft', d.reason, d.description, d.impact_analysis, d.effective_date, d.disposition || 'use_existing', userId, d.department_id]
        );
        const ecnId = r.insertId;
        if (items.length) {
          for (const item of items) {
            await conn.query(
              `INSERT INTO ecn_order_items (ecn_id, change_type, material_id, material_code, material_name, bom_id, field_name, old_value, new_value, remark)
               VALUES (?,?,?,?,?,?,?,?,?,?)`,
              [ecnId, item.change_type, item.material_id, item.material_code, item.material_name, item.bom_id, item.field_name, item.old_value, item.new_value, item.remark]
            );
          }
        }
        await syncEcnDocumentLinks(conn, ecnId, code, items, userId);
        await conn.commit();
        ResponseHandler.success(res, { id: ecnId, code }, '创建成功');
      } catch (err) { await conn.rollback(); throw err; }
      finally { conn.release(); }
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async updateStatus(req, res) {
    try {
      const { status } = req.body;
      const userId = req.user?.userId || req.user?.id;

      // 审批状态(approved/rejected)只能由工作流回调变更，前端禁止直接传
      if (['approved', 'rejected'].includes(status)) {
        return ResponseHandler.error(
          res,
          '审批通过/拒绝只能通过工作流完成，请先提交审批(pending_approval)',
          'VALIDATION_ERROR',
          400
        );
      }

      // 状态流转合法性校验（前端可操作的状态转换）
      const allowedTransitions = {
        draft: ['pending_approval', 'cancelled'],
        pending_approval: [],           // 等待工作流处理，前端不可操作
        approved: ['implementing', 'cancelled'],
        implementing: ['completed', 'cancelled'],
        rejected: ['draft'],
      };
      const [[current]] = await pool.query('SELECT * FROM ecn_orders WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
      if (!current) return ResponseHandler.error(res, 'ECN不存在', 'NOT_FOUND', 404);
      const allowed = allowedTransitions[current.status] || [];
      if (!allowed.includes(status)) {
        return ResponseHandler.error(
          res,
          `不允许从 [${current.status}] 转换到 [${status}]`,
          'VALIDATION_ERROR',
          400
        );
      }

      // 提交审批时发起工作流
      let finalStatus = status;
      if (status === 'pending_approval') {
        const [items] = await pool.query('SELECT * FROM ecn_order_items WHERE ecn_id = ?', [req.params.id]);
        const validationError = validateEcnPayload({ ...current, items }, { requireItems: true });
        if (validationError) return ResponseHandler.error(res, validationError, 'VALIDATION_ERROR', 400);

        const WorkflowService = require('../../services/business/WorkflowService');
        const wfResult = await WorkflowService.tryStartWorkflow(
          'ecn', req.params.id, current.code, `ECN ${current.code} ${current.title} 审批`, userId
        );
        if (wfResult.auto_approved) { finalStatus = 'approved'; }
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        let extra = '';
        const vals = [finalStatus];
        if (finalStatus === 'approved') {
          // 从WorkflowService映射表统一获取ECN审批通过的附加SQL，避免重复维护
          const WorkflowSvc = require('../../services/business/WorkflowService');
          const ecnCfg = WorkflowSvc.BUSINESS_STATUS_MAP?.ecn;
          extra = ecnCfg?.extra || ', approved_by = ?, approved_at = NOW()';
          if (extra.includes('approved_by')) vals.push(userId);
        }
        if (finalStatus === 'completed') { extra += ', completed_at = NOW()'; }

        if (finalStatus === 'implementing') {
          await applyEcnChanges(req.params.id, userId, conn);
        }

        vals.push(req.params.id);
        await conn.query(`UPDATE ecn_orders SET status = ?${extra} WHERE id = ? AND deleted_at IS NULL`, vals);
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }

      ResponseHandler.success(res, null, '状态已更新');
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async update(req, res) {
    try {
      const d = req.body;
      const validationError = validateEcnPayload(d);
      if (validationError) return ResponseHandler.error(res, validationError, 'VALIDATION_ERROR', 400);
      const items = Array.isArray(d.items) ? d.items.map(normalizeEcnItem) : [];
      const conn = await pool.getConnection();
      try {
        // 仅草稿状态允许编辑
        const [[current]] = await conn.query('SELECT code, status FROM ecn_orders WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
        if (!current) return ResponseHandler.error(res, 'ECN不存在', 'NOT_FOUND', 404);
        if (current.status !== 'draft') {
          return ResponseHandler.error(res, '仅草稿状态允许编辑', 'VALIDATION_ERROR', 400);
        }

        await conn.beginTransaction();
        await conn.query(
          `UPDATE ecn_orders SET title=?, type=?, priority=?, reason=?, description=?, impact_analysis=?, effective_date=?, disposition=?, updated_at=NOW()
           WHERE id=? AND deleted_at IS NULL`,
          [d.title, d.type || 'ecn', d.priority || 'medium', d.reason, d.description, d.impact_analysis, d.effective_date, d.disposition || 'use_existing', req.params.id]
        );
        // 重建变更明细（先删后插）
        await conn.query('DELETE FROM ecn_order_items WHERE ecn_id = ?', [req.params.id]);
        if (items.length) {
          for (const item of items) {
            await conn.query(
              `INSERT INTO ecn_order_items (ecn_id, change_type, material_id, material_code, material_name, bom_id, field_name, old_value, new_value, remark)
               VALUES (?,?,?,?,?,?,?,?,?,?)`,
              [req.params.id, item.change_type, item.material_id, item.material_code, item.material_name, item.bom_id, item.field_name, item.old_value, item.new_value, item.remark]
            );
          }
        }
        await syncEcnDocumentLinks(conn, req.params.id, current.code, items, req.user?.userId || req.user?.id);
        await conn.commit();
        ResponseHandler.success(res, null, '更新成功');
      } catch (err) { await conn.rollback(); throw err; }
      finally { conn.release(); }
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async delete(req, res) {
    try {
      // 仅草稿/已拒绝/已取消状态允许删除
      const [[current]] = await pool.query('SELECT status FROM ecn_orders WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
      if (!current) return ResponseHandler.error(res, 'ECN不存在', 'NOT_FOUND', 404);
      if (!['draft', 'rejected', 'cancelled'].includes(current.status)) {
        return ResponseHandler.error(
          res,
          `当前状态[${current.status}]不允许删除`,
          'VALIDATION_ERROR',
          400
        );
      }
      await pool.query("DELETE FROM document_links WHERE source_type = 'ecn' AND source_id = ?", [req.params.id]);
      await softDelete(pool, 'ecn_orders', 'id', req.params.id);
      ResponseHandler.success(res, null, '已删除');
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
};

/** 应用ECN变更明细到BOM/物料。必须在调用方事务内执行，失败即抛错回滚状态。 */
async function applyEcnChanges(ecnId, userId, conn) {
  const [[order]] = await conn.query('SELECT code, title, reason FROM ecn_orders WHERE id = ? AND deleted_at IS NULL', [ecnId]);
  if (!order) throw new Error('ECN不存在');

  const [rawItems] = await conn.query('SELECT * FROM ecn_order_items WHERE ecn_id = ?', [ecnId]);
  const items = rawItems.map(normalizeEcnItem);
  const validationError = validateEcnPayload({ ...order, items }, { requireItems: true });
  if (validationError) throw new Error(validationError);

  const changedBomIds = new Set();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const row = index + 1;

    if (['process_modify', 'drawing_modify'].includes(item.change_type)) {
      throw new Error(`第${row}行${item.change_type}暂未配置自动落地规则，不能直接实施`);
    }

    const [[material]] = await conn.query(
      'SELECT id, code, name, unit_id, specs, safety_stock, min_stock, max_stock, price FROM materials WHERE id = ? AND deleted_at IS NULL',
      [item.material_id]
    );
    if (!material) throw new Error(`第${row}行物料不存在或已删除`);

    if (ECN_BOM_CHANGE_TYPES.has(item.change_type)) {
      const [[bom]] = await conn.query('SELECT id, version FROM bom_masters WHERE id = ? AND deleted_at IS NULL', [item.bom_id]);
      if (!bom) throw new Error(`第${row}行BOM不存在或已删除`);
      changedBomIds.add(item.bom_id);
    }

    if (item.change_type === 'bom_add') {
      const [[existing]] = await conn.query(
        'SELECT id FROM bom_details WHERE bom_id = ? AND material_id = ? LIMIT 1',
        [item.bom_id, item.material_id]
      );
      if (existing) throw new Error(`第${row}行BOM中已存在该物料，不能重复新增`);
      const quantity = Number(item.new_value || 1);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`第${row}行新增数量必须大于0`);
      await conn.query(
        `INSERT INTO bom_details (bom_id, material_id, quantity, unit_id, remark, level, parent_id)
         VALUES (?, ?, ?, ?, ?, 1, 0)`,
        [item.bom_id, item.material_id, quantity, material.unit_id || null, item.remark || `ECN#${ecnId}新增`]
      );
      logger.info(`ECN#${ecnId}: BOM ${item.bom_id} 新增物料 ${item.material_code || material.code}`);
    }

    if (item.change_type === 'bom_remove') {
      const [[detail]] = await conn.query(
        'SELECT id FROM bom_details WHERE bom_id = ? AND material_id = ? LIMIT 1',
        [item.bom_id, item.material_id]
      );
      if (!detail) throw new Error(`第${row}行BOM中不存在该物料，不能移除`);
      await conn.query('DELETE FROM bom_details WHERE id = ?', [detail.id]);
      logger.info(`ECN#${ecnId}: BOM ${item.bom_id} 移除物料 ${item.material_code || material.code}`);
    }

    if (item.change_type === 'bom_modify') {
      const [[detail]] = await conn.query(
        `SELECT id, quantity, remark, unit_id, level, parent_id
         FROM bom_details WHERE bom_id = ? AND material_id = ? LIMIT 1`,
        [item.bom_id, item.material_id]
      );
      if (!detail) throw new Error(`第${row}行BOM中不存在该物料，不能修改`);
      if (!sameValue(item.old_value, detail[item.field_name])) {
        throw new Error(`第${row}行变更前值与当前BOM不一致，请刷新后重填`);
      }
      await conn.query(
        `UPDATE bom_details SET ${item.field_name} = ? WHERE id = ?`,
        [item.new_value, detail.id]
      );
      logger.info(`ECN#${ecnId}: BOM ${item.bom_id} 物料 ${item.material_code || material.code} ${item.field_name}: ${item.old_value} -> ${item.new_value}`);
    }

    if (item.change_type === 'material_modify') {
      const fieldName = item.field_name === 'specification' ? 'specs' : item.field_name;
      if (!ECN_MATERIAL_FIELDS.has(fieldName)) throw new Error(`第${row}行物料字段不支持`);
      if (!sameValue(item.old_value, material[fieldName])) {
        throw new Error(`第${row}行变更前值与当前物料不一致，请刷新后重填`);
      }
      await conn.query(
        `UPDATE materials SET ${fieldName} = ?, updated_at = NOW() WHERE id = ?`,
        [item.new_value, item.material_id]
      );
      logger.info(`ECN#${ecnId}: 物料 ${item.material_code || material.code} ${fieldName}: ${item.old_value} -> ${item.new_value}`);
    }
  }

  for (const bomId of changedBomIds) {
    const [[bom]] = await conn.query('SELECT version FROM bom_masters WHERE id = ?', [bomId]);
    const ver = bom?.version || 'V1.0';
    const match = ver.match(/^(.*?)(\d+)$/);
    const newVer = match ? `${match[1]}${parseInt(match[2], 10) + 1}` : `${ver}.1`;
    await conn.query('UPDATE bom_masters SET version = ?, updated_at = NOW() WHERE id = ?', [newVer, bomId]);
    logger.info(`ECN#${ecnId}: BOM ${bomId} 版本 ${ver} -> ${newVer}`);
  }

  await syncEcnDocumentLinks(conn, ecnId, order.code, items, userId);
  logger.info(`ECN#${ecnId}: 已应用 ${items.length} 条变更明细`);
}

// ==================== 文档管理 ====================
const documents = {
  async getList(req, res) {
    try {
      const { keyword, category, business_type, business_id, page = 1, pageSize = 20 } = req.query;
      const pagination = parsePagination(page, pageSize, { defaultPageSize: 20, maxPageSize: 100 });
      let where = 'WHERE d.deleted_at IS NULL';
      const vals = [];
      if (keyword) { where += ' AND (d.name LIKE ? OR d.code LIKE ?)'; vals.push(`%${keyword}%`, `%${keyword}%`); }
      if (category) { where += ' AND d.category = ?'; vals.push(category); }
      if (business_type) { where += ' AND d.business_type = ?'; vals.push(business_type); }
      if (business_id) { where += ' AND d.business_id = ?'; vals.push(business_id); }
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM documents d ${where}`, vals);
      const [rows] = await pool.query(
        `SELECT d.*, u.real_name AS created_by_name FROM documents d LEFT JOIN users u ON u.id = d.created_by
         ${where} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`,
        [...vals, pagination.limit, pagination.offset]
      );
      ResponseHandler.success(res, { list: rows, total, page: pagination.page, pageSize: pagination.pageSize });
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async create(req, res) {
    try {
      const d = req.body;
      if (!d.name) {
        return ResponseHandler.validationError(res, '文档名称不能为空');
      }
      const userId = req.user?.userId || req.user?.id;
      const code = d.code || await CodeGeneratorService.nextCode('document');
      const [r] = await pool.query(
        `INSERT INTO documents (code, name, category, file_url, file_name, file_size, file_type, version, description, business_type, business_id, tags, is_public, created_by, department_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [code, d.name, d.category || 'other', d.file_url, d.file_name, d.file_size || 0, d.file_type, d.version || '1.0', d.description,
         d.business_type, d.business_id, d.tags ? JSON.stringify(d.tags) : null, d.is_public || 0, userId, d.department_id]
      );
      ResponseHandler.success(res, { id: r.insertId }, '上传成功');
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async update(req, res) {
    try {
      const d = req.body;
      const [result] = await pool.query(
        'UPDATE documents SET name=?, category=?, version=?, description=?, tags=?, is_public=? WHERE id=? AND deleted_at IS NULL',
        [d.name, d.category, d.version, d.description, d.tags ? JSON.stringify(d.tags) : null, d.is_public || 0, req.params.id]
      );
      if (result.affectedRows === 0) return ResponseHandler.notFound(res, '文档不存在');
      ResponseHandler.success(res, null, '更新成功');
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async delete(req, res) {
    try {
      const affected = await softDelete(pool, 'documents', 'id', req.params.id);
      if (!affected) return ResponseHandler.notFound(res, '文档不存在');
      ResponseHandler.success(res, null, '已删除');
    }
    catch (e) { ResponseHandler.error(res, e.message); }
  },
  async download(req, res) {
    try {
      const [[doc]] = await pool.query('SELECT file_url, file_name FROM documents WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
      if (!doc) return ResponseHandler.notFound(res, '文档不存在');
      await pool.query('UPDATE documents SET download_count = download_count + 1 WHERE id = ?', [req.params.id]);
      ResponseHandler.success(res, doc);
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
};

// ==================== 业务告警 ====================
const alerts = {
  async getList(req, res) {
    try {
      const [rows] = await pool.query('SELECT * FROM business_alerts ORDER BY category, name');
      ResponseHandler.success(res, rows);
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async update(req, res) {
    try {
      const d = req.body;
      const [result] = await pool.query(
        'UPDATE business_alerts SET name=?, condition_params=?, severity=?, notify_roles=?, notify_users=?, is_active=?, check_interval_minutes=? WHERE id=?',
        [d.name, d.condition_params ? JSON.stringify(d.condition_params) : null, d.severity, d.notify_roles ? JSON.stringify(d.notify_roles) : null,
         d.notify_users ? JSON.stringify(d.notify_users) : null, d.is_active ?? 1, d.check_interval_minutes || 60, req.params.id]
      );
      if (result.affectedRows === 0) return ResponseHandler.notFound(res, '业务告警不存在');
      ResponseHandler.success(res, null, '更新成功');
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
};

module.exports = { codingRules, docLinks, exchangeRates, performance, ecn, documents, alerts };
