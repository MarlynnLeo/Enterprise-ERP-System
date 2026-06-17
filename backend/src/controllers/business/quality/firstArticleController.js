/**
 * firstArticleController.js
 * @description 首检管理控制器 — 从 qualityController.js 拆分
 * @date 2026-03-03
 *
 * 职责范围：首检列表、统计、创建首检单、更新首检结果、首检规则 CRUD
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const db = require('../../../config/db');
const { BUSINESS_RULES } = require('../../../constants/systemConstants');
const businessConfig = require('../../../config/businessConfig');
const QualityInspection = require('../../../models/qualityInspection');
const InspectionClosureService = require('../../../services/quality/InspectionClosureService');
const {
  generateBatchNo,
  normalizeTaskBatchNo,
} = require('../../../services/business/TaskLifecycleService');
const { parsePagination, appendPaginationSQL } = require('../../../utils/safePagination');

// 首检配置常量
const FIRST_ARTICLE_CONFIG = BUSINESS_RULES.FIRST_ARTICLE;

// 从统一配置获取状态常量
const STATUS = {
  FIRST_ARTICLE: businessConfig.status.firstArticle,
};

async function findActiveTemplateForType(templateId, inspectionType) {
  if (!templateId) return null;

  const result = await db.query(
    `SELECT it.id, it.template_name
     FROM inspection_templates it
     WHERE it.id = ?
       AND it.inspection_type = ?
       AND it.status = 'active'
       AND EXISTS (
         SELECT 1
         FROM template_item_mappings tim
         WHERE tim.template_id = it.id
       )
     LIMIT 1`,
    [templateId, inspectionType]
  );

  return result.rows?.[0] || null;
}

const firstArticleController = {
  /**
   * 获取首检列表
   */
  async getFirstArticleInspections(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        pageSize = 20,
        keyword,
        status,
        startDate,
        endDate,
      } = req.query;

      const pagination = parsePagination(page, pageSize || limit, {
        defaultPageSize: 20,
        maxPageSize: 100,
      });

      let whereClause = "WHERE qi.deleted_at IS NULL AND qi.inspection_type = 'first_article'";
      const params = [];

      if (keyword) {
        whereClause +=
          ' AND (qi.inspection_no LIKE ? OR qi.batch_no LIKE ? OR qi.product_name LIKE ? OR qi.product_code LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }

      if (status) {
        whereClause += ' AND qi.first_article_result = ?';
        params.push(status);
      }

      if (startDate) {
        whereClause += ' AND qi.planned_date >= ?';
        params.push(startDate);
      }

      if (endDate) {
        whereClause += ' AND qi.planned_date <= ?';
        params.push(endDate);
      }

      const countResult = await db.query(
        `SELECT COUNT(*) as total FROM quality_inspections qi ${whereClause}`,
        params
      );

      const listResult = await db.query(
        appendPaginationSQL(
          `
        SELECT
          qi.*,
          pt.code as task_code,
          pt.quantity as production_quantity
        FROM quality_inspections qi
        LEFT JOIN production_tasks pt ON qi.task_id = pt.id
        ${whereClause}
        ORDER BY qi.created_at DESC
      `,
          pagination.limit,
          pagination.offset
        ),
        params
      );

      ResponseHandler.paginated(
        res,
        listResult.rows || [],
        parseInt((countResult.rows && countResult.rows[0]?.total) || 0),
        pagination.page,
        pagination.pageSize,
        '获取首检列表成功'
      );
    } catch (error) {
      logger.error('获取首检列表失败:', error);
      ResponseHandler.error(res, '获取首检列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取首检统计
   */
  async getFirstArticleStats(req, res) {
    try {
      const statsResult = await db.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN first_article_result = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN first_article_result = 'passed' THEN 1 ELSE 0 END) as passed,
          SUM(CASE WHEN first_article_result = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN first_article_result = 'conditional' THEN 1 ELSE 0 END) as conditional
        FROM quality_inspections
        WHERE inspection_type = 'first_article'
          AND deleted_at IS NULL
      `);

      const rawStats = statsResult.rows && statsResult.rows[0];
      const stats = rawStats
        ? {
            total: parseInt(rawStats.total) || 0,
            pending: parseInt(rawStats.pending) || 0,
            passed: parseInt(rawStats.passed) || 0,
            failed: parseInt(rawStats.failed) || 0,
            conditional: parseInt(rawStats.conditional) || 0,
          }
        : { total: 0, pending: 0, passed: 0, failed: 0, conditional: 0 };
      ResponseHandler.success(res, stats, '获取首检统计成功');
    } catch (error) {
      logger.error('获取首检统计失败:', error);
      ResponseHandler.error(res, '获取首检统计失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建首检单
   */
  async createFirstArticleInspection(req, res) {
    try {
      const {
        task_id,
        product_id,
        product_code,
        product_name,
        production_quantity,
        batch_no,
        planned_date,
        template_id,
        first_article_qty,
        inspector_id,
        inspector_name,
        note,
      } = req.body;

      if (!task_id || !product_id || !production_quantity) {
        return ResponseHandler.error(
          res,
          '生产任务、产品和生产数量不能为空',
          'VALIDATION_ERROR',
          400
        );
      }

      const existingResult = await db.query(
        "SELECT id FROM quality_inspections WHERE task_id = ? AND inspection_type = 'first_article' AND deleted_at IS NULL",
        [task_id]
      );

      if (existingResult.rows && existingResult.rows.length > 0) {
        return ResponseHandler.error(res, '该生产任务已存在首检单', 'CONFLICT', 400);
      }

      const rulesResult = await db.query('SELECT id, product_id, first_article_qty, full_inspection_threshold, template_id, is_mandatory, inspection_items, note, created_at, updated_at FROM first_article_rules WHERE product_id = ?', [
        product_id,
      ]);

      const defaultRule = {
        first_article_qty: FIRST_ARTICLE_CONFIG.DEFAULT_QTY,
        full_inspection_threshold: FIRST_ARTICLE_CONFIG.DEFAULT_FULL_INSPECTION_THRESHOLD,
      };
      const rule = (rulesResult.rows && rulesResult.rows[0]) || defaultRule;

      const isFullInspection = production_quantity < rule.full_inspection_threshold;
      const requestedFirstArticleQty = Number(first_article_qty);
      const configuredFirstArticleQty = Number.isFinite(requestedFirstArticleQty) && requestedFirstArticleQty > 0
        ? Math.min(requestedFirstArticleQty, production_quantity)
        : rule.first_article_qty;
      const firstArticleQty = isFullInspection ? production_quantity : configuredFirstArticleQty;

      const taskResult = await db.query('SELECT code, status FROM production_tasks WHERE id = ? AND deleted_at IS NULL', [
        task_id,
      ]);
      const task = taskResult.rows?.[0];
      if (!task) {
        return ResponseHandler.error(
          res,
          '生产任务不存在，无法生成首检批次号',
          'VALIDATION_ERROR',
          400
        );
      }

      // 首检的业务前提：至少有一道工序已开始生产（in_progress / completed）。
      // 只检查任务级别的 status 是不够的，因为任务可能被手动推到 in_progress 但工序全都还是 pending。
      const processResult = await db.query(
        `SELECT COUNT(*) as started_count
         FROM production_processes
         WHERE task_id = ? AND status IN ('in_progress', 'completed')`,
        [task_id]
      );
      const startedProcessCount = parseInt(processResult.rows?.[0]?.started_count || 0);
      if (startedProcessCount === 0) {
        return ResponseHandler.error(
          res,
          '该生产任务尚无工序开始生产，无法创建首检单。请先在工序列表中开始至少一道工序。',
          'VALIDATION_ERROR',
          400
        );
      }

      const taskCode = task.code;

      const inspectionNo = await QualityInspection.generateInspectionNo(
        FIRST_ARTICLE_CONFIG.INSPECTION_NO_PREFIX
      );
      const effectiveBatchNo = batch_no
        ? normalizeTaskBatchNo(batch_no, taskCode)
        : await generateBatchNo(taskCode);

      const insertData = {
        inspection_no: inspectionNo,
        inspection_type: 'first_article',
        task_id,
        product_id,
        product_code: product_code || '',
        product_name: product_name || '',
        batch_no: effectiveBatchNo,
        quantity: firstArticleQty,
        unit: FIRST_ARTICLE_CONFIG.DEFAULT_UNIT,
        planned_date: planned_date || new Date(),
        status: 'pending',
        is_first_article: true,
        first_article_qty: firstArticleQty,
        is_full_inspection: isFullInspection,
        first_article_result: 'pending',
        production_can_continue: false,
        template_id: template_id || rule.template_id || null,
        inspector_id,
        inspector_name,
        note:
          note ||
          (isFullInspection
            ? `全检（生产数量不足${FIRST_ARTICLE_CONFIG.DEFAULT_FULL_INSPECTION_THRESHOLD}只）`
            : '抽检首检'),
      };

      const createdInspection = await QualityInspection.createInspection(insertData);

      ResponseHandler.success(
        res,
        {
          id: createdInspection.id,
          inspection_no: createdInspection.inspection_no || inspectionNo,
          first_article_qty: firstArticleQty,
          is_full_inspection: isFullInspection,
        },
        '首检单创建成功'
      );
    } catch (error) {
      logger.error('创建首检单失败:', error);
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR');
      const message = statusCode === 400 ? error.message : '创建首检单失败';
      ResponseHandler.error(res, message, errorCode, statusCode, error);
    }
  },

  /**
   * 更新首检结果
   */
  async updateFirstArticleResult(req, res) {
    let connection;
    try {
      const { id } = req.params;
      const {
        first_article_result,
        qualified_quantity,
        unqualified_quantity,
        production_can_continue,
        inspector_id,
        inspector_name,
        note,
        items,
      } = req.body;

      if (!first_article_result) {
        return ResponseHandler.error(res, '首检结果不能为空', 'VALIDATION_ERROR', 400);
      }

      const terminalResults = new Set([
        STATUS.FIRST_ARTICLE.PASSED,
        STATUS.FIRST_ARTICLE.FAILED,
        STATUS.FIRST_ARTICLE.CONDITIONAL,
      ]);
      if (!terminalResults.has(first_article_result)) {
        return ResponseHandler.error(res, '首检结果无效', 'VALIDATION_ERROR', 400);
      }

      const qualifiedQty = Number(qualified_quantity ?? 0);
      const unqualifiedQty = Number(unqualified_quantity ?? 0);
      if (!Number.isFinite(qualifiedQty) || !Number.isFinite(unqualifiedQty)) {
        return ResponseHandler.error(res, '首检合格/不合格数量必须是有效数字', 'VALIDATION_ERROR', 400);
      }

      connection = await db.pool.getConnection();
      await connection.beginTransaction();

      const [existingRows] = await connection.query(
        "SELECT id, inspection_no, inspection_type, reference_id, reference_no, material_id, supplier_id, product_id, product_name, product_code, process_id, process_name, batch_no, quantity, qualified_quantity, unqualified_quantity, unit, unit_id, status, planned_date, actual_date, inspector_id, inspector_name, punch_time, standard_type, standard_no, template_id, note, created_at, updated_at, traceability_id, traceability_batch, chain_id, chain_step_id, is_first_article, first_article_qty, is_full_inspection, first_article_result, production_can_continue, task_id, is_aql, aql_standard_id, aql_level, accept_limit, reject_limit, deleted_at FROM quality_inspections WHERE id = ? AND inspection_type = 'first_article' AND deleted_at IS NULL FOR UPDATE",
        [id]
      );

      if (!existingRows || existingRows.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '首检单不存在', 'NOT_FOUND', 404);
      }

      const inspection = existingRows[0];
      const itemsForValidation =
        Array.isArray(items) && items.length > 0
          ? items
          : await QualityInspection._getStoredInspectionItems(connection, id);
      const validationStatus =
        first_article_result === STATUS.FIRST_ARTICLE.CONDITIONAL
          ? 'partial'
          : first_article_result;
      QualityInspection._validateTerminalStatusAgainstItems(
        {
          ...inspection,
          status: validationStatus,
          qualified_quantity: qualifiedQty,
          unqualified_quantity: unqualifiedQty,
        },
        validationStatus,
        itemsForValidation
      );

      const canContinue =
        first_article_result === STATUS.FIRST_ARTICLE.PASSED ||
        (first_article_result === STATUS.FIRST_ARTICLE.CONDITIONAL && production_can_continue);

      await connection.query(
        `
        UPDATE quality_inspections
        SET
          first_article_result = ?,
          qualified_quantity = ?,
          unqualified_quantity = ?,
          production_can_continue = ?,
          inspector_id = COALESCE(?, inspector_id),
          inspector_name = COALESCE(?, inspector_name),
          actual_date = NOW(),
          note = COALESCE(?, note),
          status = ?
        WHERE id = ? AND deleted_at IS NULL
      `,
        [
          first_article_result,
          qualifiedQty,
          unqualifiedQty,
          canContinue,
          inspector_id,
          inspector_name,
          note,
          validationStatus,
          id,
        ]
      );

      // 如果有检验项目明细，更新或插入
      if (items && items.length > 0) {
        await connection.query('DELETE FROM quality_inspection_items WHERE inspection_id = ?', [id]);

        for (const item of items) {
          await connection.query(
            `
            INSERT INTO quality_inspection_items
            (inspection_id, item_name, standard, type, actual_value, result, remark)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
            [
              id,
              item.item_name,
              item.standard_value || item.standard || '',
              item.type || 'visual',
              item.actual_value,
              item.result,
              item.note || item.remark || '',
            ]
          );
        }
      }

      const closureResult = await InspectionClosureService.closeIfTerminal(
        {
          ...inspection,
          items: itemsForValidation,
        },
        {
          id,
          status: validationStatus,
          qualified_quantity: qualifiedQty,
          unqualified_quantity: unqualifiedQty,
        },
        connection
      );

      // 如果首检不通过，自动暂停关联的生产任务
      if (first_article_result === STATUS.FIRST_ARTICLE.FAILED) {
        if (inspection.task_id) {
          await connection.query(
            `
              UPDATE production_tasks
              SET status = 'paused',
                  pause_reason = '首检不合格，自动暂停生产',
                  pause_time = NOW()
              WHERE id = ? AND deleted_at IS NULL AND status NOT IN ('completed', 'cancelled')
            `,
            [inspection.task_id]
          );
          logger.info(`首检不合格，已暂停生产任务 ID: ${inspection.task_id}`);
        }
      }

      // 如果首检通过或有条件放行，自动恢复暂停的生产任务
      if (
        first_article_result === STATUS.FIRST_ARTICLE.PASSED ||
        (first_article_result === STATUS.FIRST_ARTICLE.CONDITIONAL && production_can_continue)
      ) {
        if (inspection.task_id) {
          await connection.query(
            `
              UPDATE production_tasks
              SET status = 'in_progress',
                  pause_reason = NULL,
                  pause_time = NULL
              WHERE id = ? AND deleted_at IS NULL AND status = 'paused' AND pause_reason LIKE '%首检不合格%'
            `,
            [inspection.task_id]
          );
          logger.info(`首检合格，已恢复生产任务 ID: ${inspection.task_id}`);
        }
      }

      await connection.commit();

      ResponseHandler.success(
        res,
        { id, first_article_result, production_can_continue: canContinue, ...closureResult },
        '首检结果更新成功'
      );
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      logger.error('更新首检结果失败:', error);
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR');
      const message = statusCode === 400 ? error.message : '更新首检结果失败';
      ResponseHandler.error(res, message, errorCode, statusCode, error);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },

  // ==================== 首检规则配置 ====================

  /**
   * 获取所有首检规则
   */
  async getFirstArticleRules(req, res) {
    try {
      const rulesResult = await db.query(`
        SELECT
          far.*,
          m.code as product_code,
          m.name as product_name,
          it.template_name as template_name
        FROM first_article_rules far
        LEFT JOIN materials m ON far.product_id = m.id
        LEFT JOIN inspection_templates it ON far.template_id = it.id
        ORDER BY far.created_at DESC
      `);

      ResponseHandler.success(res, rulesResult.rows || [], '获取首检规则成功');
    } catch (error) {
      logger.error('获取首检规则失败:', error);
      ResponseHandler.error(res, '获取首检规则失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 根据产品获取首检规则
   */
  async getFirstArticleRuleByProduct(req, res) {
    try {
      const { productId } = req.params;

      const rulesResult = await db.query('SELECT id, product_id, first_article_qty, full_inspection_threshold, template_id, is_mandatory, inspection_items, note, created_at, updated_at FROM first_article_rules WHERE product_id = ?', [
        productId,
      ]);

      if (!rulesResult.rows || rulesResult.rows.length === 0) {
        return ResponseHandler.success(
          res,
          {
            product_id: productId,
            first_article_qty: FIRST_ARTICLE_CONFIG.DEFAULT_QTY,
            full_inspection_threshold: FIRST_ARTICLE_CONFIG.DEFAULT_FULL_INSPECTION_THRESHOLD,
            is_mandatory: true,
            is_default: true,
          },
          '使用默认首检规则'
        );
      }

      ResponseHandler.success(res, rulesResult.rows[0], '获取首检规则成功');
    } catch (error) {
      logger.error('获取首检规则失败:', error);
      ResponseHandler.error(res, '获取首检规则失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建首检规则
   */
  async createFirstArticleRule(req, res) {
    try {
      const {
        product_id,
        first_article_qty,
        full_inspection_threshold,
        template_id,
        is_mandatory,
        inspection_items,
        note,
      } = req.body;

      if (!product_id) {
        return ResponseHandler.error(res, '产品ID不能为空', 'VALIDATION_ERROR', 400);
      }

      const existingResult = await db.query(
        'SELECT id FROM first_article_rules WHERE product_id = ?',
        [product_id]
      );

      if (existingResult.rows && existingResult.rows.length > 0) {
        return ResponseHandler.error(res, '该产品已存在首检规则', 'CONFLICT', 400);
      }

      if (template_id && !(await findActiveTemplateForType(template_id, 'first_article'))) {
        return ResponseHandler.error(
          res,
          '首检规则只能选择已启用且包含检验项的首件检验模板',
          'VALIDATION_ERROR',
          400
        );
      }

      const result = await db.query(
        `
        INSERT INTO first_article_rules
        (product_id, first_article_qty, full_inspection_threshold, template_id, is_mandatory, inspection_items, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        [
          product_id,
          first_article_qty || 5,
          full_inspection_threshold || 5,
          template_id || null,
          is_mandatory !== false,
          inspection_items ? JSON.stringify(inspection_items) : null,
          note || '',
        ]
      );

      ResponseHandler.success(res, { id: result.insertId }, '首检规则创建成功');
    } catch (error) {
      logger.error('创建首检规则失败:', error);
      ResponseHandler.error(res, '创建首检规则失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新首检规则
   */
  async updateFirstArticleRule(req, res) {
    try {
      const { id } = req.params;
      const {
        first_article_qty,
        full_inspection_threshold,
        template_id,
        is_mandatory,
        inspection_items,
        note,
      } = req.body;

      const existingResult = await db.query('SELECT id FROM first_article_rules WHERE id = ?', [
        id,
      ]);
      if (!existingResult.rows || existingResult.rows.length === 0) {
        return ResponseHandler.error(res, '首检规则不存在', 'NOT_FOUND', 404);
      }

      if (template_id && !(await findActiveTemplateForType(template_id, 'first_article'))) {
        return ResponseHandler.error(
          res,
          '首检规则只能选择已启用且包含检验项的首件检验模板',
          'VALIDATION_ERROR',
          400
        );
      }

      await db.query(
        `
        UPDATE first_article_rules
        SET first_article_qty = ?, full_inspection_threshold = ?, template_id = ?,
            is_mandatory = ?, inspection_items = ?, note = ?
        WHERE id = ?
      `,
        [
          first_article_qty || 5,
          full_inspection_threshold || 5,
          template_id || null,
          is_mandatory !== false,
          inspection_items ? JSON.stringify(inspection_items) : null,
          note || '',
          id,
        ]
      );

      ResponseHandler.success(res, { id }, '首检规则更新成功');
    } catch (error) {
      logger.error('更新首检规则失败:', error);
      ResponseHandler.error(res, '更新首检规则失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 删除首检规则
   */
  async deleteFirstArticleRule(req, res) {
    try {
      const { id } = req.params;

      const existingResult = await db.query('SELECT id FROM first_article_rules WHERE id = ?', [
        id,
      ]);
      if (!existingResult.rows || existingResult.rows.length === 0) {
        return ResponseHandler.error(res, '首检规则不存在', 'NOT_FOUND', 404);
      }

      await db.query('DELETE FROM first_article_rules WHERE id = ?', [id]);

      ResponseHandler.success(res, { id }, '首检规则删除成功');
    } catch (error) {
      logger.error('删除首检规则失败:', error);
      ResponseHandler.error(res, '删除首检规则失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = firstArticleController;
