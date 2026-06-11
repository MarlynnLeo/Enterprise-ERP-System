/**
 * costReportController.js
 * @description 成本报表/统计/趋势/WIP/年度对比/导出/关账控制器
 * @date 2026-06-11
 */

const db = require('../../../config/db');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const CostAccountingService = require('../../../services/business/CostAccountingService');
const CostClosingService = require('../../../services/business/CostClosingService');
const { safeParseId } = require('../../../utils/safeParseId');

module.exports = {
  // ==================== 成本统计/报表 ====================

  /**
   * 获取期末在制品(WIP)报告
   */
  getWIPReport: async (req, res) => {
    try {
      const { period } = req.query;
      const result = await CostAccountingService.calculatePeriodWIP(period);
      ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('获取WIP报告失败:', error);
      ResponseHandler.error(res, '获取WIP报告失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 获取委外在途成本报告
   */
  getOutsourcedWIPReport: async (req, res) => {
    try {
      const { period } = req.query;
      const result = await CostAccountingService.calculateOutsourcedWIP(period);
      ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('获取委外在途成本报告失败:', error);
      ResponseHandler.error(res, '获取委外在途成本报告失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 获取成本统计数据
   * 返回本月材料成本、人工成本、制造费用汇总
   */
  getCostStatistics: async (req, res) => {
    try {
      const { period } = req.query;
      const { year, month, startDate, endDate } = CostAccountingService.parsePeriodRange(period);
      const stats = await CostAccountingService.getCostSummaryForPeriod(startDate, endDate);

      ResponseHandler.success(res, { period: `${year}-${month}`, ...stats });
    } catch (error) {
      logger.error('获取成本统计失败:', error);
      ResponseHandler.error(res, '获取成本统计失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 获取成本趋势数据
   * 返回近6个月成本变化趋势
   */
  getCostTrend: async (req, res) => {
    try {
      const { months = 6 } = req.query;
      const trend = await CostAccountingService.getCostTrendData(months);
      ResponseHandler.success(res, { trend });
    } catch (error) {
      logger.error('获取成本趋势失败:', error);
      ResponseHandler.error(res, '获取成本趋势失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 获取成本构成数据
   * 返回材料/人工/制造费用占比
   */
  getCostComposition: async (req, res) => {
    try {
      const { period } = req.query;
      const { year, month, startDate, endDate } = CostAccountingService.parsePeriodRange(period);
      const compositionFields = ['materialCost', 'laborCost', 'overheadCost'];
      const stats = await CostAccountingService.getCostSummaryForPeriod(startDate, endDate, compositionFields);

      ResponseHandler.success(res, {
        period: `${year}-${month}`,
        composition: [
          { name: '材料成本', value: stats.materialCost },
          { name: '人工成本', value: stats.laborCost },
          { name: '制造费用', value: stats.overheadCost },
        ],
      });
    } catch (error) {
      logger.error('获取成本构成失败:', error);
      ResponseHandler.error(res, '获取成本构成失败', 'SERVER_ERROR', 500);
    }
  },

  // ==================== 年度成本对比 ====================

  /**
   * 获取年度成本对比数据
   */
  getYearlyCostComparison: async (req, res) => {
    try {
      const currentYear = req.query.year || new Date().getFullYear();
      const lastYear = currentYear - 1;

      // 获取当年月度数据
      const [currentYearData] = await db.pool.execute(
        `
                SELECT
                    MONTH(ac.calculated_at) as month,
                    SUM(ac.material_cost) as material_cost,
                    SUM(ac.labor_cost) as labor_cost,
                    SUM(ac.overhead_cost) as overhead_cost,
                    SUM(ac.total_cost) as total_cost,
                    COUNT(*) as order_count
                FROM actual_costs ac
                WHERE YEAR(ac.calculated_at) = ?
                GROUP BY MONTH(ac.calculated_at)
                ORDER BY month
            `,
        [currentYear]
      );

      // 获取去年月度数据
      const [lastYearData] = await db.pool.execute(
        `
                SELECT
                    MONTH(ac.calculated_at) as month,
                    SUM(ac.material_cost) as material_cost,
                    SUM(ac.labor_cost) as labor_cost,
                    SUM(ac.overhead_cost) as overhead_cost,
                    SUM(ac.total_cost) as total_cost,
                    COUNT(*) as order_count
                FROM actual_costs ac
                WHERE YEAR(ac.calculated_at) = ?
                GROUP BY MONTH(ac.calculated_at)
                ORDER BY month
            `,
        [lastYear]
      );

      // 计算年度总计
      const sumYear = (data) =>
        data.reduce(
          (acc, item) => ({
            material_cost: acc.material_cost + parseFloat(item.material_cost || 0),
            labor_cost: acc.labor_cost + parseFloat(item.labor_cost || 0),
            overhead_cost: acc.overhead_cost + parseFloat(item.overhead_cost || 0),
            total_cost: acc.total_cost + parseFloat(item.total_cost || 0),
            order_count: acc.order_count + parseInt(item.order_count || 0),
          }),
          { material_cost: 0, labor_cost: 0, overhead_cost: 0, total_cost: 0, order_count: 0 }
        );

      const currentYearTotal = sumYear(currentYearData);
      const lastYearTotal = sumYear(lastYearData);

      // 计算增长率
      const calcGrowthRate = (current, last) => {
        if (!last || last === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - last) / Math.abs(last)) * 10000) / 100;
      };

      ResponseHandler.success(res, {
        currentYear: parseInt(currentYear),
        lastYear: parseInt(lastYear),
        currentYearMonthly: currentYearData,
        lastYearMonthly: lastYearData,
        currentYearTotal,
        lastYearTotal,
        growthRate: {
          material_cost: calcGrowthRate(
            currentYearTotal.material_cost,
            lastYearTotal.material_cost
          ),
          labor_cost: calcGrowthRate(currentYearTotal.labor_cost, lastYearTotal.labor_cost),
          overhead_cost: calcGrowthRate(
            currentYearTotal.overhead_cost,
            lastYearTotal.overhead_cost
          ),
          total_cost: calcGrowthRate(currentYearTotal.total_cost, lastYearTotal.total_cost),
        },
      });
    } catch (error) {
      logger.error('获取年度成本对比失败:', error);
      ResponseHandler.error(res, '获取年度成本对比失败', 'SERVER_ERROR', 500);
    }
  },

  // ==================== 成本关账 ====================

  /**
   * 获取成本关账状态
   */
  getClosingStatus: async (req, res) => {
    try {
      const periodId = req.query.periodId ? parseInt(req.query.periodId, 10) : null;
      const result = await CostClosingService.getClosingStatus(periodId);
      ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('获取成本关账状态失败:', error);
      ResponseHandler.error(
        res,
        error.message || '获取成本关账状态失败',
        error.statusCode === 404 ? 'NOT_FOUND' : 'SERVER_ERROR',
        error.statusCode || 500,
        error
      );
    }
  },

  executeClosingWorkbench: async (req, res) => {
    try {
      const periodId = safeParseId(req.params.periodId);
      if (!Number.isInteger(periodId) || periodId <= 0) {
        return ResponseHandler.error(res, '期间ID无效', 'VALIDATION_ERROR', 400);
      }

      const result = await CostClosingService.executeClosing(periodId);
      ResponseHandler.success(res, result, '成本关账闭环执行完成');
    } catch (error) {
      logger.error('执行成本关账闭环失败:', error);
      ResponseHandler.error(
        res,
        error.message || '执行成本关账闭环失败',
        error.statusCode && error.statusCode < 500 ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
        error.statusCode || 500,
        error
      );
    }
  },

  // ==================== 成本报表导出 ====================

  /**
   * 导出成本明细账
   */
  exportCostLedger: async (req, res) => {
    try {
      const { startDate, endDate, costCenterId, productId } = req.query;

      let whereClause = '1=1';
      const params = [];

      if (startDate) {
        whereClause += ' AND ac.calculated_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        whereClause += ' AND ac.calculated_at <= ?';
        params.push(endDate);
      }
      if (costCenterId) {
        whereClause += ' AND cc.id = ?';
        params.push(costCenterId);
      }
      if (productId) {
        whereClause += ' AND m.id = ?';
        params.push(productId);
      }

      const [data] = await db.pool.execute(
        `
                SELECT
                    DATE_FORMAT(ac.calculated_at, '%Y-%m-%d') as 日期,
                    pt.code as 任务编号,
                    m.code as 产品编码,
                    m.name as 产品名称,
                    COALESCE(cc.name, '-') as 成本中心,
                    pt.quantity as 数量,
                    ac.material_cost as 材料成本,
                    ac.labor_cost as 人工成本,
                    ac.overhead_cost as 制造费用,
                    ac.total_cost as 总成本,
                    ROUND(ac.total_cost / NULLIF(pt.quantity, 0), 2) as 单位成本
                FROM actual_costs ac
                JOIN production_tasks pt ON ac.production_order_id = pt.id
                LEFT JOIN materials m ON pt.product_id = m.id
                LEFT JOIN cost_centers cc ON pt.cost_center_id = cc.id
                WHERE ${whereClause}
                ORDER BY ac.calculated_at DESC
            `,
        params
      );

      // 设置响应头为CSV格式
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=cost_ledger.csv');

      // 添加BOM以支持Excel正确显示中文
      res.write('\uFEFF');

      // 写入表头
      if (data.length > 0) {
        res.write(Object.keys(data[0]).join(',') + '\n');
        // 写入数据
        for (const row of data) {
          res.write(
            Object.values(row)
              .map((v) => `"${v || ''}"`)
              .join(',') + '\n'
          );
        }
      }

      res.end();
    } catch (error) {
      logger.error('导出成本明细失败:', error);
      ResponseHandler.error(res, '导出成本明细失败', 'SERVER_ERROR', 500);
    }
  },

  /**
   * 导出成本差异分析
   */
  exportCostVariance: async (req, res) => {
    try {
      const { startDate, endDate, varianceType } = req.query;

      let whereClause = '1=1';
      const params = [];

      if (startDate) {
        whereClause += ' AND cv.created_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        whereClause += ' AND cv.created_at <= ?';
        params.push(endDate + ' 23:59:59');
      }
      if (varianceType === 'favorable') {
        whereClause += ' AND cv.is_favorable = 1';
      } else if (varianceType === 'unfavorable') {
        whereClause += ' AND cv.is_favorable = 0';
      }

      const [data] = await db.pool.execute(
        `
                SELECT
                    pt.code as 任务编号,
                    m.name as 产品名称,
                    cv.quantity as 数量,
                    cv.standard_total_cost as 标准成本,
                    cv.actual_total_cost as 实际成本,
                    cv.total_variance as 总差异,
                    cv.material_variance as 材料差异,
                    cv.labor_variance as 人工差异,
                    cv.overhead_variance as 费用差异,
                    CONCAT(cv.variance_rate, '%') as 差异率,
                    CASE WHEN cv.is_favorable = 1 THEN '有利' ELSE '不利' END as 差异性质,
                    DATE_FORMAT(cv.created_at, '%Y-%m-%d') as 日期
                FROM cost_variance_records cv
                JOIN production_tasks pt ON cv.task_id = pt.id
                LEFT JOIN materials m ON cv.product_id = m.id
                WHERE ${whereClause}
                ORDER BY cv.created_at DESC
            `,
        params
      );

      // 设置响应头为CSV格式
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=cost_variance.csv');

      // 添加BOM以支持Excel正确显示中文
      res.write('\uFEFF');

      // 写入表头和数据
      if (data.length > 0) {
        res.write(Object.keys(data[0]).join(',') + '\n');
        for (const row of data) {
          res.write(
            Object.values(row)
              .map((v) => `"${v || ''}"`)
              .join(',') + '\n'
          );
        }
      }

      res.end();
    } catch (error) {
      logger.error('导出成本差异失败:', error);
      ResponseHandler.error(res, '导出成本差异失败', 'SERVER_ERROR', 500);
    }
  },
};
