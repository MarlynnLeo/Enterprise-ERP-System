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
      const { from_currency, to_currency, page = 1, pageSize = 50 } = req.query;
      let where = 'WHERE deleted_at IS NULL';
      const vals = [];
      if (from_currency) { where += ' AND from_currency = ?'; vals.push(from_currency); }
      if (to_currency) { where += ' AND to_currency = ?'; vals.push(to_currency); }
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM exchange_rates ${where}`, vals);
      const [rows] = await pool.query(
        `SELECT * FROM exchange_rates ${where} ORDER BY effective_date DESC, from_currency LIMIT ? OFFSET ?`,
        [...vals, Number(pageSize), (page - 1) * pageSize]
      );
      ResponseHandler.success(res, { list: rows, total });
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async create(req, res) {
    try {
      const { from_currency, to_currency, rate, effective_date } = req.body;
      const userId = req.user?.userId || req.user?.id;
      await pool.query(
        `INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, source, created_by)
         VALUES (?, ?, ?, ?, 'manual', ?) ON DUPLICATE KEY UPDATE rate = ?, source = 'manual'`,
        [from_currency, to_currency || 'CNY', rate, effective_date, userId, rate]
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
      const [[row]] = await pool.query(
        `SELECT * FROM exchange_rates WHERE from_currency = ? AND to_currency = ? AND effective_date <= CURDATE() AND deleted_at IS NULL
         ORDER BY effective_date DESC LIMIT 1`,
        [from, to || 'CNY']
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
        if (d.items) {
          for (const item of d.items) {
            await conn.query(
              `INSERT INTO ecn_order_items (ecn_id, change_type, material_id, material_code, material_name, bom_id, field_name, old_value, new_value, remark)
               VALUES (?,?,?,?,?,?,?,?,?,?)`,
              [ecnId, item.change_type, item.material_id, item.material_code, item.material_name, item.bom_id, item.field_name, item.old_value, item.new_value, item.remark]
            );
          }
        }
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
        return ResponseHandler.error(res, '审批通过/拒绝只能通过工作流完成，请先提交审批(pending_approval)', 400);
      }

      // 状态流转合法性校验（前端可操作的状态转换）
      const allowedTransitions = {
        draft: ['pending_approval', 'cancelled'],
        pending_approval: [],           // 等待工作流处理，前端不可操作
        approved: ['implementing', 'cancelled'],
        implementing: ['completed', 'cancelled'],
        rejected: ['draft'],
      };
      const [[current]] = await pool.query('SELECT status FROM ecn_orders WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
      if (!current) return ResponseHandler.error(res, 'ECN不存在', 404);
      const allowed = allowedTransitions[current.status] || [];
      if (!allowed.includes(status)) {
        return ResponseHandler.error(res, `不允许从 [${current.status}] 转换到 [${status}]`, 400);
      }

      // 提交审批时发起工作流
      let finalStatus = status;
      if (status === 'pending_approval') {
        const WorkflowService = require('../../services/business/WorkflowService');
        const [[ecn]] = await pool.query('SELECT code, title FROM ecn_orders WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
        const wfResult = await WorkflowService.tryStartWorkflow(
          'ecn', req.params.id, ecn?.code, `ECN ${ecn?.code} ${ecn?.title} 审批`, userId
        );
        if (wfResult.auto_approved) { finalStatus = 'approved'; }
      }

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
      vals.push(req.params.id);
      await pool.query(`UPDATE ecn_orders SET status = ?${extra} WHERE id = ? AND deleted_at IS NULL`, vals);

      // ECN 进入实施阶段时自动应用BOM变更
      if (finalStatus === 'implementing') {
        await applyEcnChanges(req.params.id, userId);
      }
      ResponseHandler.success(res, null, '状态已更新');
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async update(req, res) {
    try {
      const d = req.body;
      const conn = await pool.getConnection();
      try {
        // 仅草稿状态允许编辑
        const [[current]] = await conn.query('SELECT status FROM ecn_orders WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
        if (!current) { conn.release(); return ResponseHandler.error(res, 'ECN不存在', 404); }
        if (current.status !== 'draft') { conn.release(); return ResponseHandler.error(res, '仅草稿状态允许编辑', 400); }

        await conn.beginTransaction();
        await conn.query(
          `UPDATE ecn_orders SET title=?, type=?, priority=?, reason=?, description=?, impact_analysis=?, effective_date=?, disposition=?, updated_at=NOW()
           WHERE id=? AND deleted_at IS NULL`,
          [d.title, d.type || 'ecn', d.priority || 'medium', d.reason, d.description, d.impact_analysis, d.effective_date, d.disposition || 'use_existing', req.params.id]
        );
        // 重建变更明细（先删后插）
        await conn.query('DELETE FROM ecn_order_items WHERE ecn_id = ?', [req.params.id]);
        if (d.items && d.items.length) {
          for (const item of d.items) {
            await conn.query(
              `INSERT INTO ecn_order_items (ecn_id, change_type, material_id, material_code, material_name, bom_id, field_name, old_value, new_value, remark)
               VALUES (?,?,?,?,?,?,?,?,?,?)`,
              [req.params.id, item.change_type, item.material_id, item.material_code, item.material_name, item.bom_id, item.field_name, item.old_value, item.new_value, item.remark]
            );
          }
        }
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
      if (!current) return ResponseHandler.error(res, 'ECN不存在', 404);
      if (!['draft', 'rejected', 'cancelled'].includes(current.status)) {
        return ResponseHandler.error(res, `当前状态[${current.status}]不允许删除`, 400);
      }
      await softDelete(pool, 'ecn_orders', 'id', req.params.id);
      ResponseHandler.success(res, null, '已删除');
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
};

/** 应用ECN变更明细到BOM（独立函数，避免this绑定丢失） */
async function applyEcnChanges(ecnId, userId) {
  const { logger } = require('../../utils/logger');
  const [items] = await pool.query('SELECT * FROM ecn_order_items WHERE ecn_id = ?', [ecnId]);
  if (!items.length) return;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const item of items) {
      switch (item.change_type) {
        case 'bom_add': {
          if (item.bom_id && item.material_id) {
            await conn.query(
              `INSERT IGNORE INTO bom_details (bom_id, material_id, quantity, remark)
               VALUES (?, ?, ?, ?)`,
              [item.bom_id, item.material_id, item.new_value || 1, `ECN#${ecnId}新增`]
            );
            logger.info(`ECN#${ecnId}: BOM ${item.bom_id} 新增物料 ${item.material_code}`);
          }
          break;
        }
        case 'bom_remove': {
          if (item.bom_id && item.material_id) {
            await conn.query(
              'DELETE FROM bom_details WHERE bom_id = ? AND material_id = ?',
              [item.bom_id, item.material_id]
            );
            logger.info(`ECN#${ecnId}: BOM ${item.bom_id} 移除物料 ${item.material_code}`);
          }
          break;
        }
        case 'bom_modify': {
          if (item.bom_id && item.material_id && item.field_name) {
            const allowedFields = ['quantity', 'remark', 'unit_id', 'level', 'parent_id'];
            if (allowedFields.includes(item.field_name)) {
              await conn.query(
                `UPDATE bom_details SET ${item.field_name} = ? WHERE bom_id = ? AND material_id = ?`,
                [item.new_value, item.bom_id, item.material_id]
              );
              logger.info(`ECN#${ecnId}: BOM ${item.bom_id} 物料 ${item.material_code} ${item.field_name}: ${item.old_value} → ${item.new_value}`);
            }
          }
          break;
        }
        case 'material_modify': {
          if (item.material_id && item.field_name) {
            const allowedFields = ['name', 'specification', 'unit_id', 'safety_stock', 'min_stock', 'max_stock', 'price'];
            if (allowedFields.includes(item.field_name)) {
              await conn.query(
                `UPDATE materials SET ${item.field_name} = ? WHERE id = ?`,
                [item.new_value, item.material_id]
              );
              logger.info(`ECN#${ecnId}: 物料 ${item.material_code} ${item.field_name}: ${item.old_value} → ${item.new_value}`);
            }
          }
          break;
        }
        default:
          break;
      }
    }
    // 更新BOM版本号（版本号为 VARCHAR 格式如 "V1.3"，需字符串递增）
    const bomIds = [...new Set(items.filter(i => i.bom_id).map(i => i.bom_id))];
    for (const bomId of bomIds) {
      const [[bom]] = await conn.query('SELECT version FROM bom_masters WHERE id = ?', [bomId]);
      if (bom) {
        const ver = bom.version || 'V1.0';
        const match = ver.match(/^(.*?)(\d+)$/);
        const newVer = match ? `${match[1]}${parseInt(match[2], 10) + 1}` : `${ver}.1`;
        await conn.query('UPDATE bom_masters SET version = ?, updated_at = NOW() WHERE id = ?', [newVer, bomId]);
        logger.info(`ECN#${ecnId}: BOM ${bomId} 版本 ${ver} → ${newVer}`);
      }
    }
    await conn.commit();
    logger.info(`ECN#${ecnId}: 已自动应用 ${items.length} 条变更明细`);
  } catch (err) {
    await conn.rollback();
    logger.error(`ECN#${ecnId} 应用BOM变更失败:`, err);
  } finally {
    conn.release();
  }
}

// ==================== 文档管理 ====================
const documents = {
  async getList(req, res) {
    try {
      const { keyword, category, business_type, business_id, page = 1, pageSize = 20 } = req.query;
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
        [...vals, Number(pageSize), (page - 1) * pageSize]
      );
      ResponseHandler.success(res, { list: rows, total });
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async create(req, res) {
    try {
      const d = req.body;
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
      await pool.query(
        'UPDATE documents SET name=?, category=?, version=?, description=?, tags=?, is_public=? WHERE id=? AND deleted_at IS NULL',
        [d.name, d.category, d.version, d.description, d.tags ? JSON.stringify(d.tags) : null, d.is_public || 0, req.params.id]
      );
      ResponseHandler.success(res, null, '更新成功');
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
  async delete(req, res) {
    try { await softDelete(pool, 'documents', 'id', req.params.id); ResponseHandler.success(res, null, '已删除'); }
    catch (e) { ResponseHandler.error(res, e.message); }
  },
  async download(req, res) {
    try {
      await pool.query('UPDATE documents SET download_count = download_count + 1 WHERE id = ?', [req.params.id]);
      const [[doc]] = await pool.query('SELECT file_url, file_name FROM documents WHERE id = ?', [req.params.id]);
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
      await pool.query(
        'UPDATE business_alerts SET name=?, condition_params=?, severity=?, notify_roles=?, notify_users=?, is_active=?, check_interval_minutes=? WHERE id=?',
        [d.name, d.condition_params ? JSON.stringify(d.condition_params) : null, d.severity, d.notify_roles ? JSON.stringify(d.notify_roles) : null,
         d.notify_users ? JSON.stringify(d.notify_users) : null, d.is_active ?? 1, d.check_interval_minutes || 60, req.params.id]
      );
      ResponseHandler.success(res, null, '更新成功');
    } catch (e) { ResponseHandler.error(res, e.message); }
  },
};

module.exports = { codingRules, docLinks, exchangeRates, performance, ecn, documents, alerts };
