/**
 * gaugeController.js
 * @description 量具台账与校准管理控制器
 * @date 2026-03-03
 *
 * 职责范围：量具 CRUD、校准记录 CRUD、到期提醒查询
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const db = require('../../../config/db');
const CodeGeneratorService = require('../../../services/business/CodeGeneratorService');

const gaugeController = {
    // ==================== 量具台账 ====================

    /**
     * 获取量具列表
     */
    async getGauges(req, res) {
        try {
            const { page = 1, pageSize = 20, keyword, status, overdue } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(pageSize);

            let whereClause = 'WHERE 1=1';
            const params = [];

            if (keyword) {
                whereClause += ' AND (g.gauge_no LIKE ? OR g.gauge_name LIKE ? OR g.model LIKE ?)';
                params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
            }

            if (status) {
                whereClause += ' AND g.status = ?';
                params.push(status);
            }

            // 筛选校准到期/逾期量具
            if (overdue === 'true') {
                whereClause += ' AND g.next_calibration_date <= CURDATE() AND g.status != "scrapped"';
            }

            const countResult = await db.query(
                `SELECT COUNT(*) as total FROM gauges g ${whereClause}`,
                params
            );
            const total = (countResult.rows && countResult.rows[0]?.total) || 0;

            const actualPageSize = parseInt(pageSize);
            const result = await db.query(
                `
        SELECT g.*,
          DATEDIFF(g.next_calibration_date, CURDATE()) as days_until_due
        FROM gauges g
        ${whereClause}
        ORDER BY g.next_calibration_date ASC, g.created_at DESC
        LIMIT ${actualPageSize} OFFSET ${offset}
      `,
                params
            );

            ResponseHandler.success(res, {
                list: result.rows || [],
                total: parseInt(total),
                page: parseInt(page),
                pageSize: actualPageSize,
            }, '获取量具列表成功');
        } catch (error) {
            logger.error('获取量具列表失败:', error);
            ResponseHandler.error(res, '获取量具列表失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 获取量具详情
     */
    async getGaugeById(req, res) {
        try {
            const { id } = req.params;

            const result = await db.query('SELECT * FROM gauges WHERE id = ?', [id]);
            if (!result.rows || result.rows.length === 0) {
                return ResponseHandler.error(res, '量具不存在', 'NOT_FOUND', 404);
            }

            // 同时查询最近5条校准记录
            const calibrations = await db.query(
                `SELECT * FROM gauge_calibration_records WHERE gauge_id = ? ORDER BY calibration_date DESC LIMIT 5`,
                [id]
            );

            const gauge = result.rows[0];
            gauge.recent_calibrations = calibrations.rows || [];

            ResponseHandler.success(res, gauge, '获取量具详情成功');
        } catch (error) {
            logger.error('获取量具详情失败:', error);
            ResponseHandler.error(res, '获取量具详情失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 创建量具
     */
    async createGauge(req, res) {
        try {
            const data = req.body;

            if (!data.gauge_no || !data.gauge_name) {
                return ResponseHandler.error(res, '量具编号和名称不能为空', 'BAD_REQUEST', 400);
            }

            // 检查编号唯一性
            const existing = await db.query('SELECT id FROM gauges WHERE gauge_no = ?', [data.gauge_no]);
            if (existing.rows && existing.rows.length > 0) {
                return ResponseHandler.error(res, '量具编号已存在', 'DUPLICATE', 400);
            }

            // 计算下次校准日期
            if (data.last_calibration_date && data.calibration_cycle_days) {
                const lastCal = new Date(data.last_calibration_date);
                lastCal.setDate(lastCal.getDate() + parseInt(data.calibration_cycle_days));
                data.next_calibration_date = lastCal.toISOString().split('T')[0];
            }

            const result = await db.query('INSERT INTO gauges SET ?', [data]);

            ResponseHandler.success(res, { id: result.insertId }, '量具创建成功', 201);
        } catch (error) {
            logger.error('创建量具失败:', error);
            ResponseHandler.error(res, '创建量具失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 更新量具
     */
    async updateGauge(req, res) {
        try {
            const { id } = req.params;
            const data = req.body;

            const existing = await db.query('SELECT id FROM gauges WHERE id = ?', [id]);
            if (!existing.rows || existing.rows.length === 0) {
                return ResponseHandler.error(res, '量具不存在', 'NOT_FOUND', 404);
            }

            // 重新计算下次校准日期
            if (data.last_calibration_date && data.calibration_cycle_days) {
                const lastCal = new Date(data.last_calibration_date);
                lastCal.setDate(lastCal.getDate() + parseInt(data.calibration_cycle_days));
                data.next_calibration_date = lastCal.toISOString().split('T')[0];
            }

            delete data.id; // 防止覆盖主键
            await db.query('UPDATE gauges SET ? WHERE id = ?', [data, id]);

            ResponseHandler.success(res, { id }, '量具更新成功');
        } catch (error) {
            logger.error('更新量具失败:', error);
            ResponseHandler.error(res, '更新量具失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 删除量具
     */
    async deleteGauge(req, res) {
        try {
            const { id } = req.params;

            const existing = await db.query('SELECT id FROM gauges WHERE id = ?', [id]);
            if (!existing.rows || existing.rows.length === 0) {
                return ResponseHandler.error(res, '量具不存在', 'NOT_FOUND', 404);
            }

            await db.query('DELETE FROM gauges WHERE id = ?', [id]);

            ResponseHandler.success(res, { id }, '量具删除成功');
        } catch (error) {
            logger.error('删除量具失败:', error);
            ResponseHandler.error(res, '删除量具失败', 'SERVER_ERROR', 500, error);
        }
    },

    // ==================== 校准记录 ====================

    /**
     * 获取校准记录列表
     */
    async getCalibrationRecords(req, res) {
        try {
            const { page = 1, pageSize = 20, gauge_id, result: calResult, startDate, endDate } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(pageSize);

            let whereClause = 'WHERE 1=1';
            const params = [];

            if (gauge_id) {
                whereClause += ' AND cr.gauge_id = ?';
                params.push(gauge_id);
            }

            if (calResult) {
                whereClause += ' AND cr.result = ?';
                params.push(calResult);
            }

            if (startDate) {
                whereClause += ' AND cr.calibration_date >= ?';
                params.push(startDate);
            }

            if (endDate) {
                whereClause += ' AND cr.calibration_date <= ?';
                params.push(endDate);
            }

            const countResult = await db.query(
                `SELECT COUNT(*) as total FROM gauge_calibration_records cr ${whereClause}`,
                params
            );
            const total = (countResult.rows && countResult.rows[0]?.total) || 0;

            const actualPageSize = parseInt(pageSize);
            const listResult = await db.query(
                `
        SELECT cr.*, g.gauge_no, g.gauge_name, g.model
        FROM gauge_calibration_records cr
        LEFT JOIN gauges g ON cr.gauge_id = g.id
        ${whereClause}
        ORDER BY cr.calibration_date DESC
        LIMIT ${actualPageSize} OFFSET ${offset}
      `,
                params
            );

            ResponseHandler.success(res, {
                list: listResult.rows || [],
                total: parseInt(total),
                page: parseInt(page),
                pageSize: actualPageSize,
            }, '获取校准记录成功');
        } catch (error) {
            logger.error('获取校准记录失败:', error);
            ResponseHandler.error(res, '获取校准记录失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 创建校准记录
     */
    async createCalibrationRecord(req, res) {
        try {
            const data = req.body;

            if (!data.gauge_id || !data.calibration_date) {
                return ResponseHandler.error(res, '量具ID和校准日期不能为空', 'BAD_REQUEST', 400);
            }

            // 验证量具存在
            const gauge = await db.query('SELECT * FROM gauges WHERE id = ?', [data.gauge_id]);
            if (!gauge.rows || gauge.rows.length === 0) {
                return ResponseHandler.error(res, '量具不存在', 'NOT_FOUND', 404);
            }

            // 自动生成校准编号
            if (!data.calibration_no) {
                data.calibration_no = await CodeGeneratorService.nextCode('quality_calibration');
            }

            // 计算下次到期日期
            const gaugeData = gauge.rows[0];
            if (!data.next_due_date && gaugeData.calibration_cycle_days) {
                const calDate = new Date(data.calibration_date);
                calDate.setDate(calDate.getDate() + gaugeData.calibration_cycle_days);
                data.next_due_date = calDate.toISOString().split('T')[0];
            }

            const result = await db.query('INSERT INTO gauge_calibration_records SET ?', [data]);

            // 同步更新量具的校准日期信息
            await db.query(
                `UPDATE gauges SET
          last_calibration_date = ?,
          next_calibration_date = ?,
          status = CASE WHEN ? = 'unqualified' THEN 'repaired' ELSE 'in_use' END
        WHERE id = ?`,
                [data.calibration_date, data.next_due_date, data.result, data.gauge_id]
            );

            ResponseHandler.success(res, { id: result.insertId }, '校准记录创建成功', 201);
        } catch (error) {
            logger.error('创建校准记录失败:', error);
            ResponseHandler.error(res, '创建校准记录失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 获取即将到期的量具（用于首页预警）
     */
    async getDueGauges(req, res) {
        try {
            const { days = 30 } = req.query;

            const result = await db.query(
                `
        SELECT g.*,
          DATEDIFF(g.next_calibration_date, CURDATE()) as days_until_due
        FROM gauges g
        WHERE g.status NOT IN ('scrapped')
          AND g.next_calibration_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
        ORDER BY g.next_calibration_date ASC
      `,
                [parseInt(days)]
            );

            ResponseHandler.success(res, result.rows || [], '获取到期量具成功');
        } catch (error) {
            logger.error('获取到期量具失败:', error);
            ResponseHandler.error(res, '获取到期量具失败', 'SERVER_ERROR', 500, error);
        }
    },
};

module.exports = gaugeController;
