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
const { generateBatchNo } = require('../../../services/business/TaskLifecycleService');

// 首检配置常量
const FIRST_ARTICLE_CONFIG = BUSINESS_RULES.FIRST_ARTICLE;

// 从统一配置获取状态常量
const STATUS = {
    FIRST_ARTICLE: businessConfig.status.firstArticle,
};

const firstArticleController = {
    /**
     * 获取首检列表
     */
    async getFirstArticleInspections(req, res) {
        try {
            const {
                page = 1, limit = 20, pageSize = 20,
                keyword, status, startDate, endDate,
            } = req.query;

            const actualLimit = parseInt(pageSize) || parseInt(limit) || 20;
            const offset = (parseInt(page) - 1) * actualLimit;

            let whereClause = "WHERE qi.inspection_type = 'first_article'";
            const params = [];

            if (keyword) {
                whereClause += ' AND (qi.inspection_no LIKE ? OR qi.batch_no LIKE ? OR qi.product_name LIKE ? OR qi.product_code LIKE ?)';
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
                `
        SELECT
          qi.*,
          pt.code as task_code,
          pt.quantity as production_quantity
        FROM quality_inspections qi
        LEFT JOIN production_tasks pt ON qi.task_id = pt.id
        ${whereClause}
        ORDER BY qi.created_at DESC
        LIMIT ${parseInt(limit, 10)} OFFSET ${offset}
      `,
                params
            );

            ResponseHandler.success(
                res,
                {
                    list: listResult.rows || [],
                    total: parseInt((countResult.rows && countResult.rows[0]?.total) || 0),
                    page: parseInt(page),
                    pageSize: actualLimit,
                },
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
                task_id, product_id, product_code, product_name,
                production_quantity, batch_no, planned_date,
                template_id, inspector_id, inspector_name, note,
            } = req.body;

            if (!task_id || !product_id || !production_quantity) {
                return ResponseHandler.error(res, '生产任务、产品和生产数量不能为空', 'BAD_REQUEST', 400);
            }

            const existingResult = await db.query(
                "SELECT id FROM quality_inspections WHERE task_id = ? AND inspection_type = 'first_article'",
                [task_id]
            );

            if (existingResult.rows && existingResult.rows.length > 0) {
                return ResponseHandler.error(res, '该生产任务已存在首检单', 'DUPLICATE', 400);
            }

            const rulesResult = await db.query('SELECT * FROM first_article_rules WHERE product_id = ?', [product_id]);

            const defaultRule = {
                first_article_qty: FIRST_ARTICLE_CONFIG.DEFAULT_QTY,
                full_inspection_threshold: FIRST_ARTICLE_CONFIG.DEFAULT_FULL_INSPECTION_THRESHOLD,
            };
            const rule = (rulesResult.rows && rulesResult.rows[0]) || defaultRule;

            const isFullInspection = production_quantity < rule.full_inspection_threshold;
            const firstArticleQty = isFullInspection ? production_quantity : rule.first_article_qty;

            const taskResult = await db.query('SELECT code FROM production_tasks WHERE id = ?', [task_id]);
            const taskCode = taskResult.rows?.[0]?.code;
            if (!taskCode) {
                return ResponseHandler.error(res, '生产任务不存在，无法生成首检批次号', 'BAD_REQUEST', 400);
            }

            const inspectionNo = await QualityInspection.generateInspectionNo(FIRST_ARTICLE_CONFIG.INSPECTION_NO_PREFIX);
            const effectiveBatchNo = batch_no || await generateBatchNo(taskCode);

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
                note: note || (isFullInspection
                    ? `全检（生产数量不足${FIRST_ARTICLE_CONFIG.DEFAULT_FULL_INSPECTION_THRESHOLD}只）`
                    : '抽检首检'),
            };

            const result = await db.query('INSERT INTO quality_inspections SET ?', [insertData]);

            ResponseHandler.success(
                res,
                {
                    id: result.insertId,
                    inspection_no: inspectionNo,
                    first_article_qty: firstArticleQty,
                    is_full_inspection: isFullInspection,
                },
                '首检单创建成功'
            );
        } catch (error) {
            logger.error('创建首检单失败:', error);
            ResponseHandler.error(res, '创建首检单失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 更新首检结果
     */
    async updateFirstArticleResult(req, res) {
        try {
            const { id } = req.params;
            const {
                first_article_result, qualified_quantity, unqualified_quantity,
                production_can_continue, inspector_id, inspector_name, note, items,
            } = req.body;

            if (!first_article_result) {
                return ResponseHandler.error(res, '首检结果不能为空', 'BAD_REQUEST', 400);
            }

            const existingResult = await db.query(
                "SELECT * FROM quality_inspections WHERE id = ? AND inspection_type = 'first_article'",
                [id]
            );

            if (!existingResult.rows || existingResult.rows.length === 0) {
                return ResponseHandler.error(res, '首检单不存在', 'NOT_FOUND', 404);
            }

            const canContinue =
                first_article_result === STATUS.FIRST_ARTICLE.PASSED ||
                (first_article_result === STATUS.FIRST_ARTICLE.CONDITIONAL && production_can_continue);

            await db.query(
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
        WHERE id = ?
      `,
                [
                    first_article_result,
                    qualified_quantity || 0,
                    unqualified_quantity || 0,
                    canContinue,
                    inspector_id,
                    inspector_name,
                    note,
                    first_article_result === STATUS.FIRST_ARTICLE.PASSED
                        ? STATUS.FIRST_ARTICLE.PASSED
                        : first_article_result === STATUS.FIRST_ARTICLE.FAILED
                            ? STATUS.FIRST_ARTICLE.FAILED
                            : STATUS.FIRST_ARTICLE.CONDITIONAL,
                    id,
                ]
            );

            // 如果有检验项目明细，更新或插入
            if (items && items.length > 0) {
                await db.query('DELETE FROM quality_inspection_items WHERE inspection_id = ?', [id]);

                for (const item of items) {
                    await db.query(
                        `
            INSERT INTO quality_inspection_items
            (inspection_id, item_name, standard, type, actual_value, result, remark)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
                        [
                            id, item.item_name,
                            item.standard_value || item.standard || '',
                            item.type || 'visual',
                            item.actual_value, item.result,
                            item.note || item.remark || '',
                        ]
                    );
                }
            }

            // 如果首检不通过，创建不合格品记录
            if (first_article_result === STATUS.FIRST_ARTICLE.FAILED && unqualified_quantity > 0) {
                try {
                    await db.query(
                        `
            INSERT INTO nonconforming_products
            (inspection_id, product_id, product_name, product_code, batch_no, quantity, type, status, created_at)
            SELECT
              id, product_id, product_name, product_code, batch_no, ?, 'first_article_reject', 'pending', NOW()
            FROM quality_inspections WHERE id = ?
          `,
                        [unqualified_quantity, id]
                    );
                } catch (ncError) {
                    logger.error('创建不合格品记录失败:', ncError);
                }
            }

            // 如果首检不通过，自动暂停关联的生产任务
            if (first_article_result === STATUS.FIRST_ARTICLE.FAILED) {
                try {
                    const inspectionData = existingResult.rows[0];
                    if (inspectionData.task_id) {
                        await db.query(
                            `
              UPDATE production_tasks 
              SET status = 'paused', 
                  pause_reason = '首检不合格，自动暂停生产',
                  pause_time = NOW()
              WHERE id = ? AND status NOT IN ('completed', 'cancelled')
            `,
                            [inspectionData.task_id]
                        );
                        logger.info(`首检不合格，已暂停生产任务 ID: ${inspectionData.task_id}`);
                    }
                } catch (pauseError) {
                    logger.error('暂停生产任务失败:', pauseError);
                }
            }

            // 如果首检通过或有条件放行，自动恢复暂停的生产任务
            if (
                first_article_result === STATUS.FIRST_ARTICLE.PASSED ||
                (first_article_result === STATUS.FIRST_ARTICLE.CONDITIONAL && production_can_continue)
            ) {
                try {
                    const inspectionData = existingResult.rows[0];
                    if (inspectionData.task_id) {
                        await db.query(
                            `
              UPDATE production_tasks 
              SET status = 'in_progress', 
                  pause_reason = NULL,
                  pause_time = NULL
              WHERE id = ? AND status = 'paused' AND pause_reason LIKE '%首检不合格%'
            `,
                            [inspectionData.task_id]
                        );
                        logger.info(`首检合格，已恢复生产任务 ID: ${inspectionData.task_id}`);
                    }
                } catch (resumeError) {
                    logger.error('恢复生产任务失败:', resumeError);
                }
            }

            ResponseHandler.success(
                res,
                { id, first_article_result, production_can_continue: canContinue },
                '首检结果更新成功'
            );
        } catch (error) {
            logger.error('更新首检结果失败:', error);
            ResponseHandler.error(res, '更新首检结果失败', 'SERVER_ERROR', 500, error);
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

            const rulesResult = await db.query(
                'SELECT * FROM first_article_rules WHERE product_id = ?',
                [productId]
            );

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
                product_id, first_article_qty, full_inspection_threshold,
                template_id, is_mandatory, inspection_items, note,
            } = req.body;

            if (!product_id) {
                return ResponseHandler.error(res, '产品ID不能为空', 'BAD_REQUEST', 400);
            }

            const existingResult = await db.query(
                'SELECT id FROM first_article_rules WHERE product_id = ?',
                [product_id]
            );

            if (existingResult.rows && existingResult.rows.length > 0) {
                return ResponseHandler.error(res, '该产品已存在首检规则', 'DUPLICATE', 400);
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
                first_article_qty, full_inspection_threshold,
                template_id, is_mandatory, inspection_items, note,
            } = req.body;

            const existingResult = await db.query('SELECT id FROM first_article_rules WHERE id = ?', [id]);
            if (!existingResult.rows || existingResult.rows.length === 0) {
                return ResponseHandler.error(res, '首检规则不存在', 'NOT_FOUND', 404);
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

            const existingResult = await db.query('SELECT id FROM first_article_rules WHERE id = ?', [id]);
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
