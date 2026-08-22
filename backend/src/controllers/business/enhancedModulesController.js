/**
 * enhancedModulesController.js
 * @description 编码规则 / 单据关联 / 汇率 / 绩效 / ECN / 文档 / 告警 — 统一控制器
 * @date 2026-04-21
 */

const CodeGeneratorService = require('../../services/business/CodeGeneratorService');
const DocumentLinkService = require('../../services/business/DocumentLinkService');
const { DOCUMENT_LINK_TYPES: DocType } = require('../../constants/documentLinkTypes');
const FileAccessService = require('../../services/FileAccessService');
const { pool } = require('../../config/db');
const { softDelete } = require('../../utils/softDelete');
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');
const { parsePagination, appendPaginationSQL } = require('../../utils/safePagination');

function buildDepartmentScopeClause() {
  return { sql: '', params: [] };
}

function canAccessDepartment() {
  return true;
}

// File authorization is intentionally evaluated per row.  Never allow a
// request to materialize the entire documents table before those checks; the
// candidate cap is a hard upper bound against authorization-filter DoS.
const DOCUMENT_CANDIDATE_SCAN_LIMIT = 500;

function scalarQueryValue(value) {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : null;
  return value;
}

function hasMultipleQueryValues(value) {
  return Array.isArray(value) && value.length !== 1;
}

function normalizePositiveQueryId(value) {
  const scalar = scalarQueryValue(value);
  if (scalar === undefined || scalar === null || scalar === '') return null;
  const id = Number(scalar);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ==================== 编码规则 ====================
// mapKeys 在下方 exchangeRates 前已复用声明；codingRules 使用局部 require 避免 TDZ
const { mapKeysToSnake: _toSnake } = require('../../utils/fieldMap');

const codingRules = {
  async getList(req, res) {
    try { ResponseHandler.success(res, await CodeGeneratorService.getRules(_toSnake(req.query || {}))); }
    catch (e) { logger.error('获取编码规则失败:', e); ResponseHandler.error(res, e.message); }
  },
  async getById(req, res) {
    try { ResponseHandler.success(res, await CodeGeneratorService.getRuleById(req.params.id)); }
    catch (e) { logger.error('获取编码规则详情失败:', e); ResponseHandler.error(res, e.message); }
  },
  async create(req, res) {
    try { ResponseHandler.success(res, await CodeGeneratorService.createRule(_toSnake(req.body || {})), '创建成功'); }
    catch (e) { logger.error('创建编码规则失败:', e); ResponseHandler.error(res, e.message); }
  },
  async update(req, res) {
    try { ResponseHandler.success(res, await CodeGeneratorService.updateRule(req.params.id, _toSnake(req.body || {})), '更新成功'); }
    catch (e) { logger.error('更新编码规则失败:', e); ResponseHandler.error(res, e.message); }
  },
  async preview(req, res) {
    try { ResponseHandler.success(res, { preview: await CodeGeneratorService.previewCode(req.params.type) }); }
    catch (e) { logger.error('预览编码失败:', e); ResponseHandler.error(res, e.message); }
  },
  async resetSequence(req, res) {
    try {
      const body = _toSnake(req.body || {});
      ResponseHandler.success(res, await CodeGeneratorService.resetSequence(body.business_type, body.period_key), '已重置');
    }
    catch (e) { logger.error('重置编码序列失败:', e); ResponseHandler.error(res, e.message); }
  },
  async deleteRule(req, res) {
    try { ResponseHandler.success(res, await CodeGeneratorService.deleteRule(req.params.id), '删除成功'); }
    catch (e) { logger.error('删除编码规则失败:', e); ResponseHandler.error(res, e.message); }
  },
  async getSequences(req, res) {
    try { ResponseHandler.success(res, await CodeGeneratorService.getSequences(req.params.type)); }
    catch (e) { logger.error('获取编码序列失败:', e); ResponseHandler.error(res, e.message); }
  },
};

// ==================== 单据关联 ====================
const docLinks = {
  async getLinks(req, res) {
    try {
      const q = _toSnake(req.query || {});
      ResponseHandler.success(res, await DocumentLinkService.getLinks(q.business_type, q.business_id, {
        userPermissions: req.documentLinkUserPermissions || req.userPermissions,
        req,
      }));
    }
    catch (e) { logger.error('获取单据关联失败:', e); ResponseHandler.error(res, e.statusCode === 403 ? '无权查看该单据关联' : e.statusCode === 400 ? e.message : '获取单据关联失败', e.code || (e.statusCode === 400 ? 'VALIDATION_ERROR' : e.statusCode === 403 ? 'FORBIDDEN' : 'SERVER_ERROR'), e.statusCode || 500, e); }
  },
  async getFullChain(req, res) {
    try {
      const q = _toSnake(req.query || {});
      ResponseHandler.success(res, await DocumentLinkService.getFullChain(q.business_type, q.business_id, {
        userPermissions: req.documentLinkUserPermissions || req.userPermissions,
        req,
      }));
    }
    catch (e) { logger.error('获取单据完整链路失败:', e); ResponseHandler.error(res, e.statusCode === 403 ? '无权查看该单据链路' : e.statusCode === 400 ? e.message : '获取单据完整链路失败', e.code || (e.statusCode === 400 ? 'VALIDATION_ERROR' : e.statusCode === 403 ? 'FORBIDDEN' : 'SERVER_ERROR'), e.statusCode || 500, e); }
  },
  async createLink(req, res) {
    try {
      await DocumentLinkService.createLink(_toSnake(req.body || {}), null, { req });
      ResponseHandler.success(res, null, '关联已创建');
    }
    catch (e) { logger.error('创建单据关联失败:', e); ResponseHandler.error(res, e.statusCode === 403 ? '无权关联该源或目标单据' : e.statusCode === 400 ? e.message : '创建单据关联失败', e.code || (e.statusCode === 400 ? 'VALIDATION_ERROR' : e.statusCode === 403 ? 'FORBIDDEN' : 'SERVER_ERROR'), e.statusCode || 500, e); }
  },
  async deleteLink(req, res) {
    try {
      await DocumentLinkService.deleteLink(req.params.id, { req });
      ResponseHandler.success(res, null, '关联已删除');
    }
    catch (e) { logger.error('删除单据关联失败:', e); ResponseHandler.error(res, e.statusCode === 403 ? '无权删除该单据关联' : e.statusCode === 404 ? '单据关联不存在' : e.statusCode === 400 ? e.message : '删除单据关联失败', e.code || (e.statusCode === 400 ? 'VALIDATION_ERROR' : e.statusCode === 403 ? 'FORBIDDEN' : e.statusCode === 404 ? 'NOT_FOUND' : 'SERVER_ERROR'), e.statusCode || 500, e); }
  },
  async getTypeLabels(req, res) {
    try { ResponseHandler.success(res, DocumentLinkService.getTypeLabels()); }
    catch (e) { logger.error('获取单据类型标签失败:', e); ResponseHandler.error(res, e.message); }
  },
};

// ==================== 汇率 ====================
const ExchangeRateService = require('../../services/business/ExchangeRateService');
const { mapKeysToSnake } = require('../../utils/fieldMap');

const exchangeRates = {
  async getList(req, res) {
    try {
      // HTTP query camel → service snake
      const q = mapKeysToSnake(req.query || {});
      const { rows, total, page, pageSize } = await ExchangeRateService.getList(q);
      ResponseHandler.paginated(res, rows, total, page, pageSize);
    } catch (e) { logger.error('获取汇率列表失败:', e); ResponseHandler.error(res, e.message); }
  },
  async create(req, res) {
    try {
      // HTTP body camel → service snake
      await ExchangeRateService.upsert(mapKeysToSnake(req.body || {}), req.user?.id);
      ResponseHandler.success(res, null, '汇率已保存');
    } catch (e) { logger.error('保存汇率失败:', e); ResponseHandler.error(res, e.message); }
  },
  async delete(req, res) {
    try {
      await ExchangeRateService.delete(req.params.id);
      ResponseHandler.success(res, null, '已删除');
    } catch (e) { logger.error('删除汇率失败:', e); ResponseHandler.error(res, e.message); }
  },
  async getLatestRate(req, res) {
    try {
      const row = await ExchangeRateService.getLatestRate(req.query.from, req.query.to);
      ResponseHandler.success(res, row, '获取最新汇率成功');
    } catch (e) { logger.error('获取最新汇率失败:', e); ResponseHandler.error(res, e.message); }
  },
  /** 从 public-apis 多源同步最新汇率到库 */
  async syncPublic(req, res) {
    try {
      const from = req.body?.from || req.query?.from || 'USD';
      const to = req.body?.to || req.query?.to || 'CNY';
      const row = await ExchangeRateService.syncFromPublicApi(from, to, req.user?.id);
      ResponseHandler.success(res, row, '公开汇率同步成功');
    } catch (e) {
      logger.error('同步公开汇率失败:', e);
      ResponseHandler.error(res, e.message || '同步公开汇率失败');
    }
  },
};

// ==================== 绩效管理 ====================
const performance = {
  // 指标库
  async getIndicators(req, res) {
    try {
      const { category, keyword, page = 1, pageSize = 50 } = req.query;
      const pagination = parsePagination(page, pageSize, { defaultPageSize: 50, maxPageSize: 100 });
      let where = 'WHERE deleted_at IS NULL';
      const vals = [];
      if (category) { where += ' AND category = ?'; vals.push(category); }
      if (keyword) { where += ' AND (name LIKE ? OR code LIKE ?)'; vals.push(`%${keyword}%`, `%${keyword}%`); }
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM performance_indicators ${where}`, vals);
      const listSql = appendPaginationSQL(
        `SELECT id, code, name, category, description, unit, target_value, weight, scoring_method, formula, is_active, created_at, updated_at, deleted_at FROM performance_indicators ${where} ORDER BY category, code`,
        pagination.limit,
        pagination.offset
      );
      const [rows] = await pool.query(listSql, vals);
      ResponseHandler.paginated(res, rows, total, pagination.page, pagination.pageSize);
    } catch (e) { logger.error('获取绩效指标失败:', e); ResponseHandler.error(res, e.message); }
  },
  async createIndicator(req, res) {
    try {
      const d = req.body;
      const [r] = await pool.query(
        'INSERT INTO performance_indicators (code, name, category, description, unit, target_value, weight, scoring_method, formula) VALUES (?,?,?,?,?,?,?,?,?)',
        [d.code, d.name, d.category || 'other', d.description, d.unit, d.target_value, d.weight || 0, d.scoring_method || 'manual', d.formula]
      );
      const [[row]] = await pool.query('SELECT id, code, name, category, description, unit, target_value, weight, scoring_method, formula, is_active, created_at, updated_at, deleted_at FROM performance_indicators WHERE id = ?', [r.insertId]);
      ResponseHandler.success(res, row, '创建成功');
    } catch (e) { logger.error('创建绩效指标失败:', e); ResponseHandler.error(res, e.message); }
  },
  async updateIndicator(req, res) {
    try {
      const d = req.body;
      await pool.query(
        'UPDATE performance_indicators SET name=?, category=?, description=?, unit=?, target_value=?, weight=?, scoring_method=?, formula=?, is_active=? WHERE id=?',
        [d.name, d.category, d.description, d.unit, d.target_value, d.weight, d.scoring_method, d.formula, d.is_active ?? 1, req.params.id]
      );
      ResponseHandler.success(res, null, '更新成功');
    } catch (e) { logger.error('更新绩效指标失败:', e); ResponseHandler.error(res, e.message); }
  },
  async deleteIndicator(req, res) {
    try {
      await pool.query('UPDATE performance_indicators SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
      ResponseHandler.success(res, null, '已删除');
    } catch (e) { logger.error('删除绩效指标失败:', e); ResponseHandler.error(res, e.message); }
  },
  // 考核周期
  async getPeriods(req, res) {
    try {
      const [rows] = await pool.query('SELECT id, name, type, start_date, end_date, status, created_by, created_at, updated_at FROM performance_periods ORDER BY start_date DESC');
      ResponseHandler.success(res, rows);
    } catch (e) { logger.error('获取考核周期失败:', e); ResponseHandler.error(res, e.message); }
  },
  async createPeriod(req, res) {
    try {
      const d = req.body;
      const userId = req.user?.id;
      const [r] = await pool.query(
        'INSERT INTO performance_periods (name, type, start_date, end_date, status, created_by) VALUES (?,?,?,?,?,?)',
        [d.name, d.type || 'quarterly', d.start_date, d.end_date, 'draft', userId]
      );
      ResponseHandler.success(res, { id: r.insertId }, '创建成功');
    } catch (e) { logger.error('创建考核周期失败:', e); ResponseHandler.error(res, e.message); }
  },
  async updatePeriodStatus(req, res) {
    try {
      await pool.query('UPDATE performance_periods SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
      ResponseHandler.success(res, null, '状态已更新');
    } catch (e) { logger.error('更新考核状态失败:', e); ResponseHandler.error(res, e.message); }
  },
  // 评估
  async getEvaluations(req, res) {
    try {
      const { period_id, department_id, status, page = 1, pageSize = 20 } = req.query;
      const pagination = parsePagination(page, pageSize, { defaultPageSize: 20, maxPageSize: 100 });
      let where = 'WHERE 1=1';
      const vals = [];
      const scopeClause = buildDepartmentScopeClause(req, 'pe');
      if (period_id) { where += ' AND pe.period_id = ?'; vals.push(period_id); }
      if (department_id) { where += ' AND pe.department_id = ?'; vals.push(department_id); }
      if (status) { where += ' AND pe.status = ?'; vals.push(status); }
      where += scopeClause.sql;
      vals.push(...scopeClause.params);
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM performance_evaluations pe ${where}`, vals);
      const listSql = appendPaginationSQL(
        `SELECT pe.id, pe.period_id, pe.employee_id, pe.employee_name, pe.department_id,
                pe.evaluator_id, pe.total_score, pe.grade, pe.self_comment, pe.evaluator_comment,
                pe.status, pe.completed_at, pe.created_at, pe.updated_at,
                pp.name AS period_name, u.real_name AS evaluator_name
         FROM performance_evaluations pe
         LEFT JOIN performance_periods pp ON pp.id = pe.period_id
         LEFT JOIN users u ON u.id = pe.evaluator_id
         ${where} ORDER BY pe.created_at DESC`,
        pagination.limit,
        pagination.offset
      );
      const [rows] = await pool.query(listSql, vals);
      ResponseHandler.paginated(res, rows, total, pagination.page, pagination.pageSize);
    } catch (e) { logger.error('获取绩效评估列表失败:', e); ResponseHandler.error(res, e.message); }
  },
  async getEvaluationById(req, res) {
    try {
      const [[ev]] = await pool.query('SELECT id, period_id, employee_id, employee_name, department_id, evaluator_id, total_score, grade, self_comment, evaluator_comment, status, completed_at, created_at, updated_at FROM performance_evaluations WHERE id = ?', [req.params.id]);
      if (!ev) return ResponseHandler.error(res, '评估不存在', 'NOT_FOUND', 404);
      if (!canAccessDepartment(req, ev.department_id)) return ResponseHandler.forbidden(res, '无权访问该绩效评估');
      const [items] = await pool.query('SELECT id, evaluation_id, indicator_id, indicator_name, weight, target_value, actual_value, self_score, manager_score, final_score, remark FROM performance_evaluation_items WHERE evaluation_id = ?', [ev.id]);
      ev.items = items;
      ResponseHandler.success(res, ev);
    } catch (e) { logger.error('获取绩效评估详情失败:', e); ResponseHandler.error(res, e.message); }
  },
  async createEvaluation(req, res) {
    try {
      const d = req.body;
      if (!canAccessDepartment(req, d.department_id)) return ResponseHandler.forbidden(res, '无权创建该部门绩效评估');
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
    } catch (e) { logger.error('创建绩效评估失败:', e); ResponseHandler.error(res, e.message); }
  },
  async scoreEvaluation(req, res) {
    try {
      const { items, evaluator_comment, total_score, grade } = mapKeysToSnake(req.body || {});
      const [[evaluation]] = await pool.query('SELECT department_id FROM performance_evaluations WHERE id = ?', [req.params.id]);
      if (!evaluation || !canAccessDepartment(req, evaluation.department_id)) return ResponseHandler.forbidden(res, '无权评分该绩效评估');
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
    } catch (e) { logger.error('绩效评分失败:', e); ResponseHandler.error(res, e.message); }
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
          source_type: DocType.ECN,
          source_id: ecnId,
          source_code: ecnCode,
          target_type: DocType.BOM,
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
          source_type: DocType.ECN,
          source_id: ecnId,
          source_code: ecnCode,
          target_type: DocType.MATERIAL,
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
      const pagination = parsePagination(page, pageSize, { defaultPageSize: 20, maxPageSize: 100 });
      let where = 'WHERE e.deleted_at IS NULL';
      const vals = [];
      const scopeClause = buildDepartmentScopeClause(req, 'e');
      if (keyword) { where += ' AND (e.code LIKE ? OR e.title LIKE ?)'; vals.push(`%${keyword}%`, `%${keyword}%`); }
      if (type) { where += ' AND e.type = ?'; vals.push(type); }
      if (status) { where += ' AND e.status = ?'; vals.push(status); }
      where += scopeClause.sql;
      vals.push(...scopeClause.params);
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM ecn_orders e ${where}`, vals);
      const listSql = appendPaginationSQL(
        `SELECT e.id, e.code, e.title, e.type, e.priority, e.status, e.reason, e.description,
                e.impact_analysis, e.effective_date, e.disposition, e.requested_by,
                e.department_id, e.approved_by, e.approved_at, e.completed_at,
                e.created_at, e.updated_at,
                u.real_name AS requested_by_name
         FROM ecn_orders e LEFT JOIN users u ON u.id = e.requested_by
         ${where} ORDER BY e.created_at DESC`,
        pagination.limit,
        pagination.offset
      );
      const [rows] = await pool.query(listSql, vals);
      ResponseHandler.paginated(res, rows, total, pagination.page, pagination.pageSize);
    } catch (e) { logger.error('获取ECN列表失败:', e); ResponseHandler.error(res, e.message); }
  },
  async getById(req, res) {
    try {
      const [[order]] = await pool.query('SELECT e.id, e.code, e.title, e.type, e.priority, e.status, e.reason, e.description, e.impact_analysis, e.effective_date, e.disposition, e.requested_by, e.department_id, e.approved_by, e.approved_at, e.completed_at, e.created_at, e.updated_at, u.real_name AS requested_by_name FROM ecn_orders e LEFT JOIN users u ON u.id = e.requested_by WHERE e.id = ? AND e.deleted_at IS NULL', [req.params.id]);
      if (!order) return ResponseHandler.error(res, 'ECN不存在', 'NOT_FOUND', 404);
      if (!canAccessDepartment(req, order.department_id)) return ResponseHandler.forbidden(res, '无权访问该ECN');
      const [items] = await pool.query('SELECT id, ecn_id, change_type, material_id, material_code, material_name, bom_id, field_name, old_value, new_value, remark FROM ecn_order_items WHERE ecn_id = ?', [order.id]);
      order.items = items;
      ResponseHandler.success(res, order);
    } catch (e) { logger.error('获取ECN详情失败:', e); ResponseHandler.error(res, e.message); }
  },
  async create(req, res) {
    try {
      const d = req.body;
      const validationError = validateEcnPayload(d);
      if (validationError) return ResponseHandler.error(res, validationError, 'VALIDATION_ERROR', 400);
      const items = Array.isArray(d.items) ? d.items.map(normalizeEcnItem) : [];
      const userId = req.user?.id;
      const departmentId = d.department_id ?? req.authzScope?.departmentId ?? null;
      if (!canAccessDepartment(req, departmentId)) return ResponseHandler.forbidden(res, '无权创建该部门ECN');
      const code = d.code || await CodeGeneratorService.nextCode('ecn');
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [r] = await conn.query(
          `INSERT INTO ecn_orders (code, title, type, priority, status, reason, description, impact_analysis, effective_date, disposition, requested_by, department_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [code, d.title, d.type || 'ecn', d.priority || 'medium', 'draft', d.reason, d.description, d.impact_analysis, d.effective_date, d.disposition || 'use_existing', userId, departmentId]
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
    } catch (e) { logger.error('创建ECN失败:', e); ResponseHandler.error(res, e.message); }
  },
  async updateStatus(req, res) {
    const conn = await pool.getConnection();
    try {
      const { status } = req.body;
      const userId = req.user?.id;

      if (!status) {
        return ResponseHandler.error(res, 'status is required', 'VALIDATION_ERROR', 400);
      }

      if (['approved', 'rejected'].includes(status)) {
        return ResponseHandler.error(
          res,
          'Approval result can only be changed by workflow callback; submit pending_approval first',
          'VALIDATION_ERROR',
          400
        );
      }

      await conn.beginTransaction();

      const allowedTransitions = {
        draft: ['pending_approval', 'cancelled'],
        pending_approval: [],
        approved: ['implementing', 'cancelled'],
        implementing: ['completed', 'cancelled'],
        rejected: ['draft'],
      };

      const [[current]] = await conn.query('SELECT id, code, title, type, priority, status, reason, description, impact_analysis, effective_date, disposition, requested_by, department_id, approved_by, approved_at, completed_at, created_at, updated_at, deleted_at FROM ecn_orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [req.params.id]);
      if (!current) {
        await conn.rollback();
        return ResponseHandler.error(res, 'ECN not found', 'NOT_FOUND', 404);
      }
      if (!canAccessDepartment(req, current.department_id)) {
        await conn.rollback();
        return ResponseHandler.forbidden(res, '无权变更该ECN');
      }

      const allowed = allowedTransitions[current.status] || [];
      if (!allowed.includes(status)) {
        await conn.rollback();
        return ResponseHandler.error(
          res,
          `Cannot change ECN status from [${current.status}] to [${status}]`,
          'VALIDATION_ERROR',
          400
        );
      }

      let finalStatus = status;
      if (status === 'pending_approval') {
        const [items] = await conn.query('SELECT id, ecn_id, change_type, material_id, material_code, material_name, bom_id, field_name, old_value, new_value, remark FROM ecn_order_items WHERE ecn_id = ?', [req.params.id]);
        const validationError = validateEcnPayload({ ...current, items }, { requireItems: true });
        if (validationError) {
          await conn.rollback();
          return ResponseHandler.error(res, validationError, 'VALIDATION_ERROR', 400);
        }

        const WorkflowService = require('../../services/business/WorkflowService');
        await conn.query(
          "UPDATE ecn_orders SET status = 'pending_approval' WHERE id = ?",
          [req.params.id]
        );
        const wfResult = await WorkflowService.tryStartWorkflow(
          'ecn', req.params.id, current.code, `ECN ${current.code} ${current.title} review`, userId, conn
        );
        if (wfResult.auto_approved) { finalStatus = 'approved'; }
      }

      let extra = '';
      const vals = [finalStatus];
      if (finalStatus === 'approved') {
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
      ResponseHandler.success(res, null, 'Status updated');
    } catch (e) {
      await conn.rollback();
      logger.error('ECN状态变更失败:', e);
      ResponseHandler.error(res, e.message);
    } finally {
      conn.release();
    }
  },
  async update(req, res) {
    const conn = await pool.getConnection();
    try {
      const d = req.body;
      const validationError = validateEcnPayload(d);
      if (validationError) return ResponseHandler.error(res, validationError, 'VALIDATION_ERROR', 400);
      const items = Array.isArray(d.items) ? d.items.map(normalizeEcnItem) : [];

      await conn.beginTransaction();

      const [[current]] = await conn.query('SELECT code, status, department_id FROM ecn_orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [req.params.id]);
      if (!current) {
        await conn.rollback();
        return ResponseHandler.error(res, 'ECN not found', 'NOT_FOUND', 404);
      }
      if (!canAccessDepartment(req, current.department_id)) {
        await conn.rollback();
        return ResponseHandler.forbidden(res, '无权修改该ECN');
      }
      if (current.status !== 'draft') {
        await conn.rollback();
        return ResponseHandler.error(res, 'Only draft ECN can be edited', 'VALIDATION_ERROR', 400);
      }

      await conn.query(
        `UPDATE ecn_orders SET title=?, type=?, priority=?, reason=?, description=?, impact_analysis=?, effective_date=?, disposition=?, updated_at=NOW()
         WHERE id=? AND deleted_at IS NULL`,
        [d.title, d.type || 'ecn', d.priority || 'medium', d.reason, d.description, d.impact_analysis, d.effective_date, d.disposition || 'use_existing', req.params.id]
      );
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
      await syncEcnDocumentLinks(conn, req.params.id, current.code, items, req.user?.id);
      await conn.commit();
      ResponseHandler.success(res, null, 'Updated');
    } catch (err) {
      await conn.rollback();
      ResponseHandler.error(res, err.message);
    } finally {
      conn.release();
    }
  },
  async delete(req, res) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[current]] = await conn.query('SELECT status, department_id FROM ecn_orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [req.params.id]);
      if (!current) {
        await conn.rollback();
        return ResponseHandler.error(res, 'ECN not found', 'NOT_FOUND', 404);
      }
      if (!canAccessDepartment(req, current.department_id)) {
        await conn.rollback();
        return ResponseHandler.forbidden(res, '无权删除该ECN');
      }
      if (!['draft', 'rejected', 'cancelled'].includes(current.status)) {
        await conn.rollback();
        return ResponseHandler.error(
          res,
          `Current status [${current.status}] cannot be deleted`,
          'VALIDATION_ERROR',
          400
        );
      }
      await conn.query("DELETE FROM document_links WHERE source_type = 'ecn' AND source_id = ?", [req.params.id]);
      await softDelete(conn, 'ecn_orders', 'id', req.params.id);
      await conn.commit();
      ResponseHandler.success(res, null, 'Deleted');
    } catch (e) {
      await conn.rollback();
      logger.error('删除ECN失败:', e);
      ResponseHandler.error(res, e.message);
    } finally {
      conn.release();
    }
  },
};

/** 应用ECN变更明细到BOM/物料。必须在调用方事务内执行，失败即抛错回滚状态。 */
async function applyEcnChanges(ecnId, userId, conn) {
  const [[order]] = await conn.query('SELECT code, title, reason FROM ecn_orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [ecnId]);
  if (!order) throw new Error('ECN不存在');

  const [rawItems] = await conn.query('SELECT id, ecn_id, change_type, material_id, material_code, material_name, bom_id, field_name, old_value, new_value, remark FROM ecn_order_items WHERE ecn_id = ?', [ecnId]);
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
      'SELECT id, code, name, unit_id, specs, safety_stock, min_stock, max_stock, price FROM materials WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [item.material_id]
    );
    if (!material) throw new Error(`第${row}行物料不存在或已删除`);

    if (ECN_BOM_CHANGE_TYPES.has(item.change_type)) {
      const [[bom]] = await conn.query('SELECT id, version FROM bom_masters WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [item.bom_id]);
      if (!bom) throw new Error(`第${row}行BOM不存在或已删除`);
      changedBomIds.add(item.bom_id);
    }

    if (item.change_type === 'bom_add') {
      const [[existing]] = await conn.query(
        'SELECT id FROM bom_details WHERE bom_id = ? AND material_id = ? LIMIT 1 FOR UPDATE',
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
        'SELECT id FROM bom_details WHERE bom_id = ? AND material_id = ? LIMIT 1 FOR UPDATE',
        [item.bom_id, item.material_id]
      );
      if (!detail) throw new Error(`第${row}行BOM中不存在该物料，不能移除`);
      await conn.query('DELETE FROM bom_details WHERE id = ?', [detail.id]);
      logger.info(`ECN#${ecnId}: BOM ${item.bom_id} 移除物料 ${item.material_code || material.code}`);
    }

    if (item.change_type === 'bom_modify') {
      const [[detail]] = await conn.query(
        `SELECT id, quantity, remark, unit_id, level, parent_id
         FROM bom_details WHERE bom_id = ? AND material_id = ? LIMIT 1 FOR UPDATE`,
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
        `UPDATE materials SET ${fieldName} = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
        [item.new_value, item.material_id]
      );
      logger.info(`ECN#${ecnId}: 物料 ${item.material_code || material.code} ${fieldName}: ${item.old_value} -> ${item.new_value}`);
    }
  }

  for (const bomId of changedBomIds) {
    const [[bom]] = await conn.query('SELECT version FROM bom_masters WHERE id = ? FOR UPDATE', [bomId]);
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
      const keywordValue = scalarQueryValue(req.query?.keyword);
      const categoryValue = scalarQueryValue(req.query?.category);
      const businessTypeValue = scalarQueryValue(req.query?.business_type);
      const businessIdValue = scalarQueryValue(req.query?.business_id);
      const pageValue = scalarQueryValue(req.query?.page) ?? 1;
      const pageSizeValue = scalarQueryValue(req.query?.pageSize) ?? 20;
      if ([req.query?.keyword, req.query?.category, req.query?.business_type, req.query?.business_id,
        req.query?.page, req.query?.pageSize].some(hasMultipleQueryValues)) {
        return ResponseHandler.validationError(res, '查询参数不得重复提供');
      }
      if (keywordValue !== undefined && keywordValue !== null && typeof keywordValue !== 'string') {
        return ResponseHandler.validationError(res, 'keyword 参数无效');
      }
      if (categoryValue !== undefined && categoryValue !== null && typeof categoryValue !== 'string') {
        return ResponseHandler.validationError(res, 'category 参数无效');
      }
      if (businessTypeValue !== undefined && businessTypeValue !== null && typeof businessTypeValue !== 'string') {
        return ResponseHandler.validationError(res, 'business_type 参数无效');
      }
      const keyword = typeof keywordValue === 'string' ? keywordValue.trim().slice(0, 200) : '';
      const category = typeof categoryValue === 'string' ? categoryValue.trim().slice(0, 50) : '';
      const business_type = typeof businessTypeValue === 'string'
        ? businessTypeValue.trim().toLowerCase()
        : '';
      const hasBusinessId = businessIdValue !== undefined && businessIdValue !== null && businessIdValue !== '';
      const business_id = normalizePositiveQueryId(businessIdValue);
      if (hasBusinessId && !business_id) {
        return ResponseHandler.validationError(res, 'business_id 必须是正整数');
      }
      if (Boolean(business_type) !== Boolean(hasBusinessId)) {
        return ResponseHandler.validationError(res, 'business_type 和 business_id 必须成对提供');
      }
      if (business_type && !DocumentLinkService.getViewPermissionsForType(business_type).length) {
        return ResponseHandler.validationError(res, 'business_type 不受支持');
      }
      const pagination = parsePagination(pageValue, pageSizeValue, { defaultPageSize: 20, maxPageSize: 100 });
      let where = 'WHERE d.deleted_at IS NULL';
      const vals = [];
      const documentScope = buildDepartmentScopeClause(req, 'd');
      if (documentScope.sql) {
        where += ` AND (d.is_public = 1 OR (${documentScope.sql.replace(/^\s*AND\s*/, '')}))`;
        vals.push(...documentScope.params);
      }
      if (keyword) { where += ' AND (d.name LIKE ? OR d.code LIKE ?)'; vals.push(`%${keyword}%`, `%${keyword}%`); }
      if (category) { where += ' AND d.category = ?'; vals.push(category); }
      if (business_type) { where += ' AND d.business_type = ?'; vals.push(business_type); }
      if (business_id) { where += ' AND d.business_id = ?'; vals.push(business_id); }
      const [[countRow]] = await pool.query(
        `SELECT COUNT(*) AS total FROM documents d ${where}`,
        vals
      );
      const rawTotal = Number(countRow?.total || 0);
      if (pagination.offset >= DOCUMENT_CANDIDATE_SCAN_LIMIT) {
        return ResponseHandler.error(
          res,
          '页码超出文档授权安全扫描范围，请增加关键字、分类或业务对象筛选条件',
          'DOCUMENT_QUERY_TOO_BROAD',
          400
        );
      }

      const visibleRows = [];
      const authorizedTarget = pagination.offset + pagination.limit + 1;
      const candidateBatchSize = Math.min(100, Math.max(50, pagination.limit * 2));
      let candidateOffset = 0;
      let scannedCandidates = 0;
      while (
        candidateOffset < rawTotal &&
        scannedCandidates < DOCUMENT_CANDIDATE_SCAN_LIMIT &&
        visibleRows.length < authorizedTarget
      ) {
        const candidateLimit = Math.min(
          candidateBatchSize,
          DOCUMENT_CANDIDATE_SCAN_LIMIT - scannedCandidates,
          rawTotal - candidateOffset
        );
        const candidateSql = appendPaginationSQL(
          `SELECT d.id, d.code, d.name, d.category, d.file_url, d.file_name, d.file_size, d.file_type,
                  d.version, d.description, d.business_type, d.business_id, d.tags, d.is_public,
                  d.download_count, d.created_by, d.department_id, d.created_at, d.updated_at,
                  u.real_name AS created_by_name
           FROM documents d LEFT JOIN users u ON u.id = d.created_by
           ${where} ORDER BY d.created_at DESC, d.id DESC`,
          candidateLimit,
          candidateOffset
        );
        const [rows] = await pool.query(candidateSql, vals);
        if (!rows.length) break;
        candidateOffset += rows.length;
        scannedCandidates += rows.length;

        for (const row of rows) {
          if (!row.file_url || row.file_url === 'manual') {
            if (row.business_id) {
              if (!FileAccessService.canViewBusinessType(row.business_type, req.userPermissions)) {
                continue;
              }
              if (
                !row.is_public &&
                !(await FileAccessService.assertBusinessObjectAccess(
                  req,
                  row.business_type,
                  row.business_id,
                  'read'
                ))
              ) {
                continue;
              }
            }
            visibleRows.push({ ...row, file_url: null });
            continue;
          }
          const decision = await FileAccessService.authorize({
            userId: req.user?.id,
            fileUrl: row.file_url,
            req,
            userPermissions: req.userPermissions,
          });
          if (decision.allowed) visibleRows.push(row);
        }
      }

      const hasUnscannedCandidates = candidateOffset < rawTotal;
      if (hasUnscannedCandidates && visibleRows.length < authorizedTarget) {
        return ResponseHandler.error(
          res,
          '文档候选集过大，无法在安全扫描上限内完成授权分页，请增加关键字、分类或业务对象筛选条件',
          'DOCUMENT_QUERY_TOO_BROAD',
          400
        );
      }

      const list = visibleRows.slice(pagination.offset, pagination.offset + pagination.limit);
      const hasMore = visibleRows.length > pagination.offset + pagination.limit;
      const totalExact = !hasUnscannedCandidates;
      const authorizedTotal = totalExact ? visibleRows.length : rawTotal;
      ResponseHandler.paginated(
        res,
        list,
        authorizedTotal,
        pagination.page,
        pagination.pageSize,
        '查询成功',
        {
          authorizationFiltered: true,
          scannedCandidates,
          candidateTotal: rawTotal,
          scanLimited: scannedCandidates >= DOCUMENT_CANDIDATE_SCAN_LIMIT,
          hasMore,
          // When scanning stopped after finding one authorized row beyond the
          // requested page, `total` remains a coarse upper bound. Consumers
          // must use hasMore until the candidate set has been fully scanned.
          totalExact,
        }
      );
    } catch (e) { logger.error('获取文档列表失败:', e); ResponseHandler.error(res, e.message); }
  },
  async create(req, res) {
    try {
      const d = req.body && typeof req.body === 'object' ? req.body : {};
      if (!d.name) {
        return ResponseHandler.validationError(res, '文档名称不能为空');
      }
      const userId = req.user?.id;
      const departmentId = req.authzScope?.departmentId ?? null;
      const isPublic = FileAccessService.normalizePublicFlag(d.is_public, req.userPermissions);
      if (!isPublic && !canAccessDepartment(req, departmentId)) return ResponseHandler.forbidden(res, '无权创建该部门文档');
      const binding = FileAccessService.validateBusinessBinding(
        d.business_type,
        d.business_id
      );
      if (!binding.valid) {
        return ResponseHandler.validationError(
          res,
          '业务类型和业务 ID 必须成对提供，且业务类型必须受支持'
        );
      }
      if (binding.bound) {
        if (!FileAccessService.canViewBusinessType(binding.businessType, req.userPermissions)) {
          return ResponseHandler.forbidden(res, '无权使用该业务类型的文档绑定功能');
        }
        const inScope = await FileAccessService.assertBusinessObjectAccess(
          req,
          binding.businessType,
          binding.businessId,
          'write'
        );
        if (!inScope) return ResponseHandler.forbidden(res, '无权关联该业务对象');
      }
      const normalizedFileUrl = d.file_url && d.file_url !== 'manual'
        ? FileAccessService.normalizeUploadUrl(d.file_url)
        : null;
      if (d.file_url && d.file_url !== 'manual' && !normalizedFileUrl) {
        return ResponseHandler.error(res, '文件地址必须是受控上传文件', 'VALIDATION_ERROR', 400);
      }
      const storedFileUrl = normalizedFileUrl || 'manual';
      const code = d.code || await CodeGeneratorService.nextCode('document');
      const [r] = await pool.query(
        `INSERT INTO documents (code, name, category, file_url, file_name, file_size, file_type, version, description, business_type, business_id, tags, is_public, created_by, department_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [code, d.name, d.category || 'other', storedFileUrl, d.file_name || '', d.file_size || 0, d.file_type, d.version || '1.0', d.description,
         binding.businessType, binding.businessId, d.tags ? JSON.stringify(d.tags) : null, isPublic, userId, departmentId]
      );
      if (normalizedFileUrl) {
        try {
          await FileAccessService.claimExistingUpload({
            req,
            userPermissions: req.userPermissions,
            fileUrl: normalizedFileUrl,
            businessType: binding.businessType,
            businessId: binding.businessId,
            source: 'documents',
            uploadedBy: userId,
            isPublic,
            metadata: {
              documentId: r.insertId,
              fileName: d.file_name,
              fileType: d.file_type,
              fileSize: d.file_size || 0,
            },
          });
        } catch (error) {
          await pool.query('DELETE FROM documents WHERE id = ?', [r.insertId]);
          throw error;
        }
      }
      ResponseHandler.success(res, { id: r.insertId }, '上传成功');
    } catch (e) { logger.error('创建文档失败:', e); ResponseHandler.error(res, e.message); }
  },
  async update(req, res) {
    try {
      const d = req.body && typeof req.body === 'object' ? req.body : {};
      const [[existing]] = await pool.query('SELECT is_public, department_id, file_url, business_type, business_id FROM documents WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
      if (!existing) return ResponseHandler.notFound(res, '文档不存在');
      if (!canAccessDepartment(req, existing.department_id)) return ResponseHandler.forbidden(res, '无权修改该文档');
      if (
        existing.business_id &&
        (!FileAccessService.canViewBusinessType(existing.business_type, req.userPermissions) ||
          !(await FileAccessService.assertBusinessObjectAccess(
            req,
            existing.business_type,
            existing.business_id,
            'write'
          )))
      ) {
        return ResponseHandler.forbidden(res, '无权修改该业务对象的文档');
      }
      const isPublic = FileAccessService.canSetPublic(req.userPermissions)
        ? FileAccessService.normalizePublicFlag(d.is_public, req.userPermissions)
        : Number(existing.is_public) === 1 ? 1 : 0;
      const [result] = await pool.query(
        'UPDATE documents SET name=?, category=?, version=?, description=?, tags=?, is_public=? WHERE id=? AND deleted_at IS NULL',
        [d.name, d.category, d.version, d.description, d.tags ? JSON.stringify(d.tags) : null, isPublic, req.params.id]
      );
      if (result.affectedRows === 0) return ResponseHandler.notFound(res, '文档不存在');
      if (existing.file_url && existing.file_url !== 'manual') {
        await FileAccessService.setPublicFlag(existing.file_url, isPublic);
      }
      ResponseHandler.success(res, null, '更新成功');
    } catch (e) { logger.error('更新文档失败:', e); ResponseHandler.error(res, e.message); }
  },
  async delete(req, res) {
    try {
      const [[doc]] = await pool.query('SELECT file_url, department_id, business_type, business_id FROM documents WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
      if (!doc) return ResponseHandler.notFound(res, '文档不存在');
      if (!canAccessDepartment(req, doc.department_id)) return ResponseHandler.forbidden(res, '无权删除该文档');
      if (
        doc.business_id &&
        (!FileAccessService.canViewBusinessType(doc.business_type, req.userPermissions) ||
          !(await FileAccessService.assertBusinessObjectAccess(
            req,
            doc.business_type,
            doc.business_id,
            'write'
          )))
      ) {
        return ResponseHandler.forbidden(res, '无权删除该业务对象的文档');
      }
      const affected = await softDelete(pool, 'documents', 'id', req.params.id);
      if (!affected) return ResponseHandler.notFound(res, '文档不存在');
      if (doc?.file_url && doc.file_url !== 'manual') {
        await FileAccessService.safeMarkDeleted(doc.file_url);
      }
      ResponseHandler.success(res, null, '已删除');
    }
    catch (e) { logger.error('删除文档失败:', e); ResponseHandler.error(res, e.message); }
  },
  async download(req, res) {
    try {
      const [[doc]] = await pool.query('SELECT file_url, file_name, is_public, department_id, business_type, business_id FROM documents WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
      if (!doc) return ResponseHandler.notFound(res, '文档不存在');
      if (
        doc.business_id &&
        !FileAccessService.canViewBusinessType(doc.business_type, req.userPermissions)
      ) {
        return ResponseHandler.forbidden(res, '无权下载该业务类型的文档');
      }
      if (!doc.is_public && !canAccessDepartment(req, doc.department_id)) return ResponseHandler.forbidden(res, '无权下载该文档');
      if (doc.file_url && doc.file_url !== 'manual') {
        const decision = await FileAccessService.authorize({
          userId: req.user?.id,
          fileUrl: doc.file_url,
          req,
          userPermissions: req.userPermissions,
        });
        if (!decision.allowed) return ResponseHandler.forbidden(res, '无权下载该文件');
      }
      await pool.query('UPDATE documents SET download_count = download_count + 1 WHERE id = ?', [req.params.id]);
      ResponseHandler.success(res, {
        ...doc,
        file_url: doc.file_url && doc.file_url !== 'manual' ? doc.file_url : null,
      });
    } catch (e) { logger.error('下载文档失败:', e); ResponseHandler.error(res, e.message); }
  },
};

// ==================== 业务告警 ====================
const alerts = {
  async getList(req, res) {
    try {
      const [rows] = await pool.query('SELECT id, code, name, category, condition_type, condition_params, severity, notify_roles, notify_users, is_active, check_interval_minutes, last_checked_at, created_at, updated_at FROM business_alerts ORDER BY category, name');
      ResponseHandler.success(res, rows);
    } catch (e) { logger.error('获取业务告警失败:', e); ResponseHandler.error(res, e.message); }
  },
  async update(req, res) {
    try {
      const d = _toSnake(req.body || {});
      const [result] = await pool.query(
        'UPDATE business_alerts SET name=?, condition_params=?, severity=?, notify_roles=?, notify_users=?, is_active=?, check_interval_minutes=? WHERE id=?',
        [d.name, d.condition_params ? JSON.stringify(d.condition_params) : null, d.severity, d.notify_roles ? JSON.stringify(d.notify_roles) : null,
         d.notify_users ? JSON.stringify(d.notify_users) : null, d.is_active ?? 1, d.check_interval_minutes || 60, req.params.id]
      );
      if (result.affectedRows === 0) return ResponseHandler.notFound(res, '业务告警不存在');
      ResponseHandler.success(res, null, '更新成功');
    } catch (e) { logger.error('更新业务告警失败:', e); ResponseHandler.error(res, e.message); }
  },
};

module.exports = { codingRules, docLinks, exchangeRates, performance, ecn, documents, alerts };
