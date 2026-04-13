/**
 * supplierQualityController.js
 * @description 供应商质量计分卡控制器
 * @date 2026-03-03
 * 
 * 职责范围：供应商质量得分 CRUD、月度自动计算、等级评定、排名查询
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const db = require('../../../config/db');

/**
 * 根据总分自动判定等级
 */
function calculateGrade(totalScore) {
    if (totalScore >= 90) return 'A';
    if (totalScore >= 75) return 'B';
    if (totalScore >= 60) return 'C';
    return 'D';
}

const supplierQualityController = {
    /**
     * 获取供应商质量得分列表
     */
    async getScores(req, res) {
        try {
            const { page = 1, pageSize = 20, supplier_id, period, grade } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(pageSize);

            let whereClause = 'WHERE 1=1';
            const params = [];

            if (supplier_id) {
                whereClause += ' AND sqs.supplier_id = ?';
                params.push(supplier_id);
            }
            if (period) {
                whereClause += ' AND sqs.period = ?';
                params.push(period);
            }
            if (grade) {
                whereClause += ' AND sqs.grade = ?';
                params.push(grade);
            }

            const countResult = await db.query(
                `SELECT COUNT(*) as total FROM supplier_quality_scores sqs ${whereClause}`, params
            );
            const total = (countResult.rows && countResult.rows[0]?.total) || 0;

            const actualPageSize = parseInt(pageSize);
            const result = await db.query(
                `
        SELECT sqs.*, s.name as supplier_name, s.code as supplier_code
        FROM supplier_quality_scores sqs
        LEFT JOIN suppliers s ON sqs.supplier_id = s.id
        ${whereClause}
        ORDER BY sqs.period DESC, sqs.total_score DESC
        LIMIT ${actualPageSize} OFFSET ${offset}
      `,
                params
            );

            ResponseHandler.success(res, {
                list: result.rows || [],
                total: parseInt(total),
                page: parseInt(page),
                pageSize: actualPageSize,
            }, '获取供应商质量得分列表成功');
        } catch (error) {
            logger.error('获取供应商质量得分失败:', error);
            ResponseHandler.error(res, '获取供应商质量得分失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 获取单个供应商的历史得分 (趋势)
     */
    async getSupplierTrend(req, res) {
        try {
            const { supplierId } = req.params;
            const { months = 12 } = req.query;
            
            // 安全转换为整数以避免 SQL 注入，但传给 mysql2 驱动时转为字符串格式
            const limitStr = parseInt(months, 10).toString();

            const result = await db.query(
                `
        SELECT sqs.*, s.name as supplier_name
        FROM supplier_quality_scores sqs
        LEFT JOIN suppliers s ON sqs.supplier_id = s.id
        WHERE sqs.supplier_id = ?
        ORDER BY sqs.period DESC
        LIMIT ${actualPageSize}
      `,
                [supplierId]
            );

            ResponseHandler.success(res, result.rows || [], '获取供应商趋势成功');
        } catch (error) {
            logger.error('获取供应商趋势失败:', error);
            ResponseHandler.error(res, '获取供应商趋势失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 获取某月排名
     */
    async getRanking(req, res) {
        try {
            const { period } = req.query;

            if (!period) {
                return ResponseHandler.error(res, '统计周期不能为空', 'BAD_REQUEST', 400);
            }

            const result = await db.query(
                `
        SELECT sqs.*, s.name as supplier_name, s.code as supplier_code,
          RANK() OVER (ORDER BY sqs.total_score DESC) as ranking
        FROM supplier_quality_scores sqs
        LEFT JOIN suppliers s ON sqs.supplier_id = s.id
        WHERE sqs.period = ?
        ORDER BY sqs.total_score DESC
      `,
                [period]
            );

            ResponseHandler.success(res, result.rows || [], '获取供应商排名成功');
        } catch (error) {
            logger.error('获取供应商排名失败:', error);
            ResponseHandler.error(res, '获取供应商排名失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 按月自动计算供应商质量得分
     * 权重: 质量60% + 交付25% + 响应15%
     *
     * 数据来源:
     *   - 供应商列表: purchase_orders (同月有采购的供应商)
     *   - 质量维度: quality_inspections (incoming, 通过 supplier_id 关联；若无则从采购订单统计)
     *   - 交付维度: purchase_orders (status + delivery dates)
     *   - 响应维度: eight_d_reports (同月)
     */
    async calculateMonthlyScores(req, res) {
        try {
            const { period } = req.body; // YYYY-MM

            if (!period || !/^\d{4}-\d{2}$/.test(period)) {
                return ResponseHandler.error(res, '请提供有效的统计周期 (YYYY-MM)', 'BAD_REQUEST', 400);
            }

            const startDate = `${period}-01`;
            const endDate = `${period}-31`;

            // 从采购订单中获取本月有采购的供应商
            const suppliers = await db.query(
                `
        SELECT DISTINCT po.supplier_id
        FROM purchase_orders po
        WHERE po.supplier_id IS NOT NULL
          AND po.order_date BETWEEN ? AND ?
      `,
                [startDate, endDate]
            );

            const supplierIds = (suppliers.rows || []).map(r => r.supplier_id).filter(Boolean);

            if (supplierIds.length === 0) {
                return ResponseHandler.success(res, { updated: 0 }, '本月暂无采购数据');
            }

            // ✅ 性能优化: 批量查询所有供应商数据，消除 N+1
            // 1. 批量来料质量统计
            const qiBatch = await db.query(
                `
        SELECT
          COALESCE(qi.supplier_id, po.supplier_id) as supplier_id,
          COUNT(*) as total_lots,
          SUM(CASE WHEN qi.status IN ('passed','pass','completed') THEN 1 ELSE 0 END) as accepted_lots,
          COALESCE(SUM(qi.quantity), 0) as total_qty,
          COALESCE(SUM(qi.unqualified_quantity), 0) as defect_qty
        FROM quality_inspections qi
        LEFT JOIN purchase_orders po ON qi.reference_no = po.order_no
        WHERE qi.inspection_type = 'incoming'
          AND COALESCE(qi.supplier_id, po.supplier_id) IN (${supplierIds.map(() => '?').join(',')})
          AND qi.created_at BETWEEN ? AND ?
        GROUP BY COALESCE(qi.supplier_id, po.supplier_id)
      `,
                [...supplierIds, startDate, endDate]
            );
            const qiMap = {};
            (qiBatch.rows || []).forEach(r => { qiMap[r.supplier_id] = r; });

            // 2. 批量交付统计
            const deliveryBatch = await db.query(
                `
        SELECT
          supplier_id,
          COUNT(*) as total_deliveries,
          SUM(CASE WHEN status IN ('completed','received','approved') THEN 1 ELSE 0 END) as on_time_deliveries
        FROM purchase_orders
        WHERE supplier_id IN (${supplierIds.map(() => '?').join(',')})
          AND order_date BETWEEN ? AND ?
        GROUP BY supplier_id
      `,
                [...supplierIds, startDate, endDate]
            );
            const deliveryMap = {};
            (deliveryBatch.rows || []).forEach(r => { deliveryMap[r.supplier_id] = r; });

            // 3. 批量 8D 响应统计
            const eightDBatch = await db.query(
                `
        SELECT
          supplier_id,
          COUNT(*) as total_8d,
          SUM(CASE WHEN status = 'closed' AND DATEDIFF(updated_at, created_at) <= 30 THEN 1 ELSE 0 END) as closed_on_time,
          AVG(CASE WHEN status = 'closed' THEN DATEDIFF(updated_at, created_at) ELSE NULL END) as avg_days
        FROM eight_d_reports
        WHERE supplier_id IN (${supplierIds.map(() => '?').join(',')})
          AND created_at BETWEEN ? AND ?
        GROUP BY supplier_id
      `,
                [...supplierIds, startDate, endDate]
            );
            const eightDMap = {};
            (eightDBatch.rows || []).forEach(r => { eightDMap[r.supplier_id] = r; });

            let updated = 0;

            // 4. 在内存中计算每个供应商的评分
            for (const sid of supplierIds) {
                // 质量数据
                const qi = qiMap[sid];
                let totalLots = 0, acceptedLots = 0, totalQty = 0, defectQty = 0;
                if (qi && parseInt(qi.total_lots) > 0) {
                    totalLots = parseInt(qi.total_lots);
                    acceptedLots = parseInt(qi.accepted_lots) || 0;
                    totalQty = parseFloat(qi.total_qty) || 0;
                    defectQty = parseFloat(qi.defect_qty) || 0;
                } else {
                    // 回退：从交付数据中估算
                    const d = deliveryMap[sid];
                    if (d) {
                        totalLots = parseInt(d.total_deliveries) || 0;
                        acceptedLots = parseInt(d.on_time_deliveries) || 0;
                    }
                }

                const ppm = totalQty > 0 ? (defectQty / totalQty) * 1000000 : 0;
                const lotAcceptRate = totalLots > 0 ? (acceptedLots / totalLots) * 100 : 100;

                // 交付数据
                const d = deliveryMap[sid] || {};
                const totalDeliveries = parseInt(d.total_deliveries) || 0;
                const onTimeDeliveries = parseInt(d.on_time_deliveries) || 0;
                const deliveryRate = totalDeliveries > 0 ? (onTimeDeliveries / totalDeliveries) * 100 : 100;

                // 8D 数据
                const e = eightDMap[sid] || {};
                const total8d = parseInt(e.total_8d) || 0;
                const closed8dOnTime = parseInt(e.closed_on_time) || 0;
                const avg8dDays = parseFloat(e.avg_days) || 0;

                // 评分
                const qualityScore = Math.min(lotAcceptRate, 100);
                const deliveryScore = Math.min(deliveryRate, 100);
                const responseScore = total8d > 0 ? Math.min((closed8dOnTime / total8d) * 100, 100) : 100;
                const totalScore = qualityScore * 0.6 + deliveryScore * 0.25 + responseScore * 0.15;
                const grade = calculateGrade(totalScore);

                // 写入或更新计分卡
                await db.query(
                    `
          INSERT INTO supplier_quality_scores
            (supplier_id, period, total_lots, accepted_lots, rejected_lots, total_qty, defect_qty,
             ppm, lot_accept_rate, total_deliveries, on_time_deliveries, delivery_rate,
             total_8d_reports, closed_8d_on_time, avg_8d_days,
             quality_score, delivery_score, response_score, total_score, grade)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            total_lots = VALUES(total_lots), accepted_lots = VALUES(accepted_lots),
            rejected_lots = VALUES(rejected_lots), total_qty = VALUES(total_qty),
            defect_qty = VALUES(defect_qty), ppm = VALUES(ppm),
            lot_accept_rate = VALUES(lot_accept_rate),
            total_deliveries = VALUES(total_deliveries), on_time_deliveries = VALUES(on_time_deliveries),
            delivery_rate = VALUES(delivery_rate),
            total_8d_reports = VALUES(total_8d_reports), closed_8d_on_time = VALUES(closed_8d_on_time),
            avg_8d_days = VALUES(avg_8d_days),
            quality_score = VALUES(quality_score), delivery_score = VALUES(delivery_score),
            response_score = VALUES(response_score), total_score = VALUES(total_score),
            grade = VALUES(grade), updated_at = NOW()
        `,
                    [
                        sid, period,
                        totalLots, acceptedLots, totalLots - acceptedLots, totalQty, defectQty,
                        parseFloat(ppm.toFixed(2)), parseFloat(lotAcceptRate.toFixed(2)),
                        totalDeliveries, onTimeDeliveries, parseFloat(deliveryRate.toFixed(2)),
                        total8d, closed8dOnTime, parseFloat(avg8dDays.toFixed(1)),
                        parseFloat(qualityScore.toFixed(2)), parseFloat(deliveryScore.toFixed(2)),
                        parseFloat(responseScore.toFixed(2)), parseFloat(totalScore.toFixed(2)), grade,
                    ]
                );

                updated++;
            }

            ResponseHandler.success(res, { updated, period }, `已计算 ${updated} 个供应商的质量得分`);
        } catch (error) {
            logger.error('计算供应商月度得分失败:', error);
            ResponseHandler.error(res, '计算供应商月度得分失败', 'SERVER_ERROR', 500, error);
        }
    },
};

module.exports = supplierQualityController;
