/**
 * costVarianceController.js
 * @description 成本差异分析与预警控制器
 * @date 2026-06-11
 */

const db = require('../../../config/db');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const CostAccountingService = require('../../../services/business/CostAccountingService');
const { parsePagination } = require('../../../utils/safePagination');

module.exports = {
  // ==================== 成本差异 ====================

  /**
   * 获取成本差异列表
   */
  getCostVarianceList: async (req, res) => {
    try {
      const { orderNumber, productName, varianceType, page = 1, pageSize = 20 } = req.query;
      const pagination = parsePagination(page, pageSize, {
        defaultPageSize: 20,
        maxPageSize: 100,
      });

      let whereClause = '1=1';
      const params = [];

      if (orderNumber) {
        whereClause += ' AND pt.code LIKE ?';
        params.push(`%${orderNumber}%`);
      }
      if (productName) {
        whereClause += ' AND m.name LIKE ?';
        params.push(`%${productName}%`);
      }
      if (varianceType === 'favorable') {
        whereClause += ' AND cv.is_favorable = 1';
      } else if (varianceType === 'unfavorable') {
        whereClause += ' AND cv.is_favorable = 0';
      }

      // 先检查cost_variance_records表是否有数据
      let hasVarianceRecords = false;
      try {
        const [check] = await db.pool.execute('SELECT COUNT(*) as cnt FROM cost_variance_records');
        hasVarianceRecords = check[0].cnt > 0;
      } catch {
        hasVarianceRecords = false;
      }

      if (hasVarianceRecords) {
        // 从cost_variance_records表查询
        const [countResult] = await db.pool.execute(
          `
                    SELECT COUNT(*) as total
                    FROM cost_variance_records cv
                    JOIN production_tasks pt ON cv.task_id = pt.id
                    LEFT JOIN materials m ON cv.product_id = m.id
                    WHERE ${whereClause}
                `,
          params
        );

        const [list] = await db.pool.execute(
          `
                    SELECT
                        cv.id,
                        pt.code as order_number,
                        m.name as product_name,
                        cv.quantity,
                        cv.standard_total_cost as standard_cost,
                        cv.actual_total_cost as actual_cost,
                        cv.total_variance,
                        cv.material_variance,
                        cv.labor_variance,
                        cv.overhead_variance,
                        cv.variance_rate,
                        cv.is_favorable,
                        DATE_FORMAT(cv.created_at, '%Y-%m-%d') as completion_date
                    FROM cost_variance_records cv
                    JOIN production_tasks pt ON cv.task_id = pt.id
                    LEFT JOIN materials m ON cv.product_id = m.id
                    WHERE ${whereClause}
                    ORDER BY cv.created_at DESC
                    LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}
                `,
          params
        );

        return ResponseHandler.paginated(
          res,
          list,
          countResult[0].total,
          pagination.page,
          pagination.pageSize
        );
      }

      // 已经不再从 actual_costs 即时聚合这部分数据了，强依赖 cost_variance_records 的完整度
      ResponseHandler.paginated(res, [], 0, pagination.page, pagination.pageSize);
    } catch (error) {
      logger.error('获取成本差异列表失败:', error);
      ResponseHandler.error(res, '获取成本差异列表失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 获取成本差异详情
   */
  getCostVarianceDetail: async (req, res) => {
    try {
      const { taskId } = req.params;

      // 1. 严格 ID 匹配：只接受 cost_variance_records.id
      const [records] = await db.pool.execute(
        `
                SELECT
                    cv.*,
                    pt.code as order_number,
                    pt.product_id,
                    m.name as product_name,
                    DATE_FORMAT(cv.created_at, '%Y-%m-%d') as completion_date
                FROM cost_variance_records cv
                JOIN production_tasks pt ON cv.task_id = pt.id
                LEFT JOIN materials m ON cv.product_id = m.id
                WHERE cv.id = ?
            `,
        [taskId]
      );

      if (records.length === 0) {
        return ResponseHandler.error(res, '未找到成本差异记录', 'NOT_FOUND', 404);
      }

      const variance = records[0];
      const qty = variance.quantity || 1;

      // 2. 检查标准成本完整性，若缺失则调用服务层恢复
      if ((variance.standard_total_cost || 0) === 0 && variance.product_id) {
        const stdCost = await CostAccountingService.ensureStandardCost(variance.product_id, qty);
        if (stdCost.totalCost > 0) {
          variance.standard_material_cost = stdCost.materialCost;
          variance.standard_labor_cost = stdCost.laborCost;
          variance.standard_overhead_cost = stdCost.overheadCost;
          variance.standard_total_cost = stdCost.totalCost;
        }
      }

      // 3. 计算差异
      const materialVariance =
        (variance.standard_material_cost || 0) - (variance.actual_material_cost || 0);
      const laborVariance = (variance.standard_labor_cost || 0) - (variance.actual_labor_cost || 0);
      const overheadVariance =
        (variance.standard_overhead_cost || 0) - (variance.actual_overhead_cost || 0);
      const totalVariance = (variance.standard_total_cost || 0) - (variance.actual_total_cost || 0);

      const comparison = [
        {
          item: '材料成本',
          standard: variance.standard_material_cost || 0,
          actual: variance.actual_material_cost || 0,
          variance: materialVariance,
          variance_rate: variance.standard_material_cost
            ? Math.round((materialVariance / variance.standard_material_cost) * 10000) / 100
            : 0,
        },
        {
          item: '人工成本',
          standard: variance.standard_labor_cost || 0,
          actual: variance.actual_labor_cost || 0,
          variance: laborVariance,
          variance_rate: variance.standard_labor_cost
            ? Math.round((laborVariance / variance.standard_labor_cost) * 10000) / 100
            : 0,
        },
        {
          item: '制造费用',
          standard: variance.standard_overhead_cost || 0,
          actual: variance.actual_overhead_cost || 0,
          variance: overheadVariance,
          variance_rate: variance.standard_overhead_cost
            ? Math.round((overheadVariance / variance.standard_overhead_cost) * 10000) / 100
            : 0,
        },
        {
          item: '总成本',
          standard: variance.standard_total_cost || 0,
          actual: variance.actual_total_cost || 0,
          variance: totalVariance,
          variance_rate: variance.standard_total_cost
            ? Math.round((totalVariance / variance.standard_total_cost) * 10000) / 100
            : 0,
        },
      ];

      ResponseHandler.success(res, {
        order_number: variance.order_number,
        product_name: variance.product_name,
        quantity: variance.quantity,
        completion_date: variance.completion_date,
        comparison,
      });
    } catch (error) {
      logger.error('获取成本差异详情失败:', error);
      ResponseHandler.error(res, '获取成本差异详情失败', 'SERVER_ERROR', 500);
    }
  },

  // ==================== 成本预警 ====================

  /**
   * 获取成本预警列表
   * 返回差异超过阈值的成本记录
   */
  getCostAlerts: async (req, res) => {
    try {
      const { page = 1, pageSize = 20 } = req.query;
      const pagination = parsePagination(page, pageSize, {
        defaultPageSize: 20,
        maxPageSize: 100,
      });

      // 获取预警阈值配置
      const [settings] = await db.pool.execute(
        'SELECT id, variance_threshold, material_threshold, labor_threshold, overhead_threshold, is_active, updated_at, updated_by FROM cost_alert_settings WHERE is_active = 1 LIMIT 1'
      );
      const threshold = settings.length > 0 ? parseFloat(settings[0].variance_threshold) : 10; // 默认10%

      // 始终使用实时计算逻辑，确保显示最新数据
      // 注意：如果数据量过大，后续应考虑使用物化视图或定时任务更新 cost_variance_records

      // 兜底逻辑：实时计算
      const [rows] = await db.pool.query(`
                SELECT
                    ac.id,
                    pt.code as task_code,
                    m.name as product_name,
                    m.code as product_code,
                    COALESCE(psc.total_cost * pt.quantity, 0) as standard_total_cost,
                    ac.total_cost as actual_total_cost,
                    (COALESCE(psc.total_cost * pt.quantity, 0) - ac.total_cost) as total_variance,
                    ROUND((COALESCE(psc.total_cost * pt.quantity, 0) - ac.total_cost) / NULLIF(ac.total_cost, 0) * 100, 2) as variance_rate,
                    CASE WHEN (COALESCE(psc.total_cost * pt.quantity, 0) - ac.total_cost) >= 0 THEN 1 ELSE 0 END as is_favorable,
                    DATE_FORMAT(ac.calculated_at, '%Y-%m-%d %H:%i') as created_at
                FROM actual_costs ac
                JOIN production_tasks pt ON ac.production_order_id = pt.id
                LEFT JOIN materials m ON pt.product_id = m.id
                LEFT JOIN (
                    SELECT product_id as p_id, SUM(standard_price) as total_cost
                    FROM standard_costs
                    WHERE is_active = 1
                    GROUP BY product_id
                ) psc ON pt.product_id = psc.p_id
                HAVING ABS(variance_rate) > ${threshold}
                ORDER BY ABS(variance_rate) DESC
                LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}
            `);

      // 处理 alert_level
      const alertsList = rows.map((row) => ({
        ...row,
        alert_level: Math.abs(row.variance_rate) > threshold * 2 ? 'critical' : 'warning',
      }));

      // 获取总数 (需要嵌套查询因为 HAVING 不能直接用于 COUNT)
      const [countResult] = await db.pool.query(`
                SELECT COUNT(*) as total FROM (
                    SELECT
                        ROUND((COALESCE(psc.total_cost * pt.quantity, 0) - ac.total_cost) / NULLIF(ac.total_cost, 0) * 100, 2) as variance_rate
                    FROM actual_costs ac
                    JOIN production_tasks pt ON ac.production_order_id = pt.id
                    LEFT JOIN (
                        SELECT product_id as p_id, SUM(standard_price) as total_cost
                        FROM standard_costs
                        WHERE is_active = 1
                        GROUP BY product_id
                    ) psc ON pt.product_id = psc.p_id
                    HAVING ABS(variance_rate) > ${threshold}
                ) as t
            `);
      const totalCount = countResult[0].total;

      ResponseHandler.paginated(res, alertsList, totalCount, pagination.page, pagination.pageSize, undefined, {
        threshold,
      });
    } catch (error) {
      logger.error('获取成本预警失败:', error.stack || error.message || error);
      ResponseHandler.error(res, '获取成本预警失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 获取成本预警配置
   */
  getCostAlertSettings: async (req, res) => {
    try {
      // 表结构由 migrations/20260312000009_baseline_misc_tables.js 管理

      const [settings] = await db.pool.execute(
        'SELECT id, variance_threshold, material_threshold, labor_threshold, overhead_threshold, is_active, updated_at, updated_by FROM cost_alert_settings WHERE is_active = 1 LIMIT 1'
      );

      if (settings.length > 0) {
        ResponseHandler.success(res, settings[0]);
      } else {
        // 返回默认配置
        ResponseHandler.success(res, {
          variance_threshold: 10,
          material_threshold: 15,
          labor_threshold: 20,
          overhead_threshold: 25,
          is_active: 1,
        });
      }
    } catch (error) {
      logger.error('获取预警配置失败:', error);
      ResponseHandler.error(res, '获取预警配置失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 保存成本预警配置
   */
  saveCostAlertSettings: async (req, res) => {
    try {
      const { variance_threshold, material_threshold, labor_threshold, overhead_threshold } =
        req.body;

      // 表结构由 migrations/20260312000009_baseline_misc_tables.js 管理

      // 更新或插入配置
      const [existing] = await db.pool.execute(
        'SELECT id FROM cost_alert_settings WHERE is_active = 1'
      );

      if (existing.length > 0) {
        await db.pool.execute(
          `
                    UPDATE cost_alert_settings SET
                        variance_threshold = ?,
                        material_threshold = ?,
                        labor_threshold = ?,
                        overhead_threshold = ?,
                        updated_by = ?
                    WHERE id = ?
                `,
          [
            variance_threshold,
            material_threshold,
            labor_threshold,
            overhead_threshold,
            req.user?.username || 'system',
            existing[0].id,
          ]
        );
      } else {
        await db.pool.execute(
          `
                    INSERT INTO cost_alert_settings
                    (variance_threshold, material_threshold, labor_threshold, overhead_threshold, updated_by)
                    VALUES (?, ?, ?, ?, ?)
                `,
          [
            variance_threshold,
            material_threshold,
            labor_threshold,
            overhead_threshold,
            req.user?.username || 'system',
          ]
        );
      }

      ResponseHandler.success(res, { message: '预警配置保存成功' });
    } catch (error) {
      logger.error('保存预警配置失败:', error);
      ResponseHandler.error(res, '保存预警配置失败', 'SERVER_ERROR', 500);
    }
  },
};
