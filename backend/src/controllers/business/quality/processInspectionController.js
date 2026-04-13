/**
 * processInspectionController.js
 * @description 过程检验规则与打卡控制器 — 从 qualityController.js 拆分
 * @date 2026-03-03
 * 
 * 职责范围：过程检验规则 CRUD、巡检打卡 CRUD
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const db = require('../../../config/db');
const { getCurrentUserName } = require('../../../utils/userHelper');

const processInspectionController = {
    // ==================== 过程检验规则配置 ====================

    /**
     * 获取过程检验规则列表
     */
    async getProcessInspectionRules(req, res) {
        try {
            const rulesResult = await db.query(`
        SELECT
          pir.*,
          pp.process_name as process_name,
          m.code as product_code,
          m.name as product_name,
          it.template_name as template_name
        FROM process_inspection_rules pir
        LEFT JOIN production_processes pp ON pir.process_id = pp.id
        LEFT JOIN materials m ON pir.product_id = m.id
        LEFT JOIN inspection_templates it ON pir.template_id = it.id
        ORDER BY pir.created_at DESC
      `);

            ResponseHandler.success(res, rulesResult.rows || [], '获取过程检验规则成功');
        } catch (error) {
            logger.error('获取过程检验规则失败:', error);
            ResponseHandler.error(res, '获取过程检验规则失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 创建过程检验规则
     */
    async createProcessInspectionRule(req, res) {
        try {
            const {
                process_id, product_id, inspection_interval, sample_rate,
                punch_interval, template_id, is_enabled, note,
            } = req.body;

            if (!process_id) {
                return ResponseHandler.error(res, '工序ID不能为空', 'BAD_REQUEST', 400);
            }

            const result = await db.query(
                `
        INSERT INTO process_inspection_rules
        (process_id, product_id, inspection_interval, sample_rate, punch_interval, template_id, is_enabled, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
                [
                    process_id,
                    product_id || null,
                    inspection_interval || 30,
                    sample_rate || 10,
                    punch_interval || 10,
                    template_id || null,
                    is_enabled !== false,
                    note || '',
                ]
            );

            ResponseHandler.success(res, { id: result.insertId }, '过程检验规则创建成功', 201);
        } catch (error) {
            logger.error('创建过程检验规则失败:', error);
            ResponseHandler.error(res, '创建过程检验规则失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 更新过程检验规则
     */
    async updateProcessInspectionRule(req, res) {
        try {
            const { id } = req.params;
            const {
                process_id, product_id, inspection_interval, sample_rate,
                punch_interval, template_id, is_enabled, note,
            } = req.body;

            await db.query(
                `
        UPDATE process_inspection_rules
        SET process_id = ?, product_id = ?, inspection_interval = ?, sample_rate = ?, punch_interval = ?,
            template_id = ?, is_enabled = ?, note = ?, updated_at = NOW()
        WHERE id = ?
      `,
                [
                    process_id,
                    product_id || null,
                    inspection_interval || 30,
                    sample_rate || 10,
                    punch_interval || 10,
                    template_id || null,
                    is_enabled !== false,
                    note || '',
                    id,
                ]
            );

            ResponseHandler.success(res, { id }, '过程检验规则更新成功');
        } catch (error) {
            logger.error('更新过程检验规则失败:', error);
            ResponseHandler.error(res, '更新过程检验规则失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 删除过程检验规则
     */
    async deleteProcessInspectionRule(req, res) {
        try {
            const { id } = req.params;

            await db.query('DELETE FROM process_inspection_rules WHERE id = ?', [id]);

            ResponseHandler.success(res, { id }, '过程检验规则删除成功');
        } catch (error) {
            logger.error('删除过程检验规则失败:', error);
            ResponseHandler.error(res, '删除过程检验规则失败', 'SERVER_ERROR', 500, error);
        }
    },

    // ==================== 过程检验打卡 ====================

    /**
     * 对指定检验单打卡（检验员巡检打卡）
     */
    async punchProcessInspection(req, res) {
        try {
            const { id } = req.params;
            const { inspector_id, inspector_name, remark } = req.body;
            const userId = req.user?.id || 1;
            const userName = await getCurrentUserName(req);
            const actualInspectorId = inspector_id || userId;

            const inspectionResult = await db.query(
                'SELECT id, inspection_no, status, process_id, product_id FROM quality_inspections WHERE id = ?',
                [id]
            );
            const inspection = inspectionResult?.rows || inspectionResult;

            if (!inspection || inspection.length === 0) {
                return ResponseHandler.error(res, '检验单不存在', 'NOT_FOUND', 404);
            }

            const inspectionData = inspection[0];

            // 从规则配置中获取打卡间隔（默认10分钟）
            let punchInterval = 10;
            try {
                const ruleResult = await db.query(
                    `
          SELECT punch_interval FROM process_inspection_rules 
          WHERE is_enabled = 1 
            AND (process_id = ? OR process_id IS NULL)
            AND (product_id = ? OR product_id IS NULL)
          ORDER BY 
            CASE WHEN process_id IS NOT NULL AND product_id IS NOT NULL THEN 1
                 WHEN process_id IS NOT NULL THEN 2
                 ELSE 3 END
          LIMIT 1
        `,
                    [inspectionData.process_id, inspectionData.product_id]
                );
                const rules = ruleResult?.rows || ruleResult;
                if (rules && rules.length > 0 && rules[0].punch_interval) {
                    punchInterval = rules[0].punch_interval;
                }
            } catch (ruleError) {
                logger.warn('获取打卡间隔规则失败，使用默认值', ruleError);
            }

            // 检查是否在打卡间隔内已经打卡
            const recentPunchResult = await db.query(
                `
        SELECT id, punch_time FROM process_inspection_punch_records
        WHERE inspection_id = ? 
          AND inspector_id = ?
          AND punch_time > DATE_SUB(NOW(), INTERVAL ? MINUTE)
        ORDER BY punch_time DESC
        LIMIT 1
      `,
                [id, actualInspectorId, punchInterval]
            );
            const recentPunch = recentPunchResult?.rows || recentPunchResult;

            if (recentPunch && recentPunch.length > 0) {
                const lastPunchTime = new Date(recentPunch[0].punch_time);
                const timeDiff = Math.ceil(
                    (punchInterval * 60 * 1000 - (Date.now() - lastPunchTime.getTime())) / 1000 / 60
                );
                return ResponseHandler.error(
                    res,
                    `距离上次打卡不足${punchInterval}分钟，请${timeDiff}分钟后再试`,
                    'TOO_FREQUENT',
                    429
                );
            }

            const insertResult = await db.query(
                `
        INSERT INTO process_inspection_punch_records
        (inspection_id, inspector_id, inspector_name, punch_time, punch_type, remark)
        VALUES (?, ?, ?, NOW(), 'patrol', ?)
      `,
                [id, actualInspectorId, inspector_name || userName, remark || '巡检打卡']
            );

            const countResult = await db.query(
                `
        SELECT COUNT(*) as count FROM process_inspection_punch_records
        WHERE inspection_id = ? AND DATE(punch_time) = CURDATE()
      `,
                [id]
            );
            const countRows = countResult?.rows || countResult;

            ResponseHandler.success(
                res,
                {
                    id,
                    punch_id: insertResult?.insertId || insertResult?.rows?.insertId,
                    punch_time: new Date(),
                    today_count: countRows[0]?.count || 1,
                },
                '巡检打卡成功'
            );
        } catch (error) {
            logger.error('过程检验打卡失败:', error);
            ResponseHandler.error(res, '打卡失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 获取今日打卡记录
     */
    async getProcessInspectionPunchToday(req, res) {
        try {
            const userId = req.user?.id || 1;

            const result = await db.query(
                `
        SELECT 
          pipr.*,
          qi.inspection_no, qi.product_name, qi.process_name, qi.status
        FROM process_inspection_punch_records pipr
        LEFT JOIN quality_inspections qi ON pipr.inspection_id = qi.id
        WHERE DATE(pipr.punch_time) = CURDATE()
          AND pipr.inspector_id = ?
        ORDER BY pipr.punch_time DESC
      `,
                [userId]
            );

            ResponseHandler.success(res, result.rows || [], '获取今日打卡记录成功');
        } catch (error) {
            logger.error('获取今日打卡记录失败:', error);
            ResponseHandler.error(res, '获取今日打卡记录失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 获取打卡记录列表
     */
    async getProcessInspectionPunchList(req, res) {
        try {
            const { page = 1, pageSize = 20, startDate, endDate, inspector_id } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(pageSize);

            let whereClause = 'WHERE 1=1';
            const params = [];

            if (startDate) {
                whereClause += ' AND DATE(pipr.punch_time) >= ?';
                params.push(startDate);
            }
            if (endDate) {
                whereClause += ' AND DATE(pipr.punch_time) <= ?';
                params.push(endDate);
            }
            if (inspector_id) {
                whereClause += ' AND pipr.inspector_id = ?';
                params.push(inspector_id);
            }
            if (req.query.inspection_id) {
                whereClause += ' AND pipr.inspection_id = ?';
                params.push(req.query.inspection_id);
            }

            const countResult = await db.query(
                `SELECT COUNT(*) as total FROM process_inspection_punch_records pipr ${whereClause}`,
                params
            );

            const countRows = countResult.rows || countResult;
            const total = countRows[0]?.total || 0;

            const actualPageSize = parseInt(pageSize);
            const result = await db.query(
                `
        SELECT 
          pipr.*,
          qi.inspection_no, qi.product_name, qi.process_name, qi.status
        FROM process_inspection_punch_records pipr
        LEFT JOIN quality_inspections qi ON pipr.inspection_id = qi.id
        ${whereClause}
        ORDER BY pipr.punch_time DESC
        LIMIT ${actualPageSize} OFFSET ${offset}
      `,
                params
            );

            ResponseHandler.success(
                res,
                {
                    list: result.rows || result || [],
                    total: total,
                    page: parseInt(page),
                    pageSize: parseInt(pageSize),
                },
                '获取打卡记录成功'
            );
        } catch (error) {
            logger.error('获取打卡记录列表失败:', error);
            ResponseHandler.error(res, '获取打卡记录列表失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 创建独立打卡记录（无关联检验单）
     */
    async createProcessInspectionPunch(req, res) {
        try {
            const { production_line_id, production_line_name, process_id, process_name, remark } = req.body;
            const userId = req.user?.id || 1;
            const userName = await getCurrentUserName(req);

            const result = await db.query(
                `
        INSERT INTO process_inspection_punch_records
        (inspector_id, inspector_name, production_line_id, production_line_name, 
         process_id, process_name, punch_time, punch_type, remark)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), 'visit', ?)
      `,
                [
                    userId, userName,
                    production_line_id, production_line_name,
                    process_id || null, process_name || '',
                    remark || '',
                ]
            );

            ResponseHandler.success(res, { id: result.insertId }, '打卡成功', 201);
        } catch (error) {
            logger.error('创建打卡记录失败:', error);
            ResponseHandler.error(res, '打卡失败', 'SERVER_ERROR', 500, error);
        }
    },
};

module.exports = processInspectionController;
