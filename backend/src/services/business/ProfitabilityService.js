/**
 * 盈利分析服务
 * @description 提供产品/客户盈利分析功能
 */

const db = require('../../config/db');
const { logger } = require('../../utils/logger');

class ProfitabilityService {
  /**
   * 获取产品盈利分析
   * @param {Object} params - 查询参数
   * @returns {Promise<Array>} 产品盈利列表
   */
  async getProductProfitability(params = {}) {
    const { startDate, endDate, limit = 20 } = params;

    let dateCondition;
    const queryParams = [];

    if (startDate && endDate) {
      dateCondition = 'AND so.created_at BETWEEN ? AND ?';
      queryParams.push(startDate, `${endDate} 23:59:59`);
    }

    const query = `
      SELECT 
        m.id as product_id,
        m.code as product_code,
        m.name as product_name,
        COALESCE(SUM(soi.quantity), 0) as total_quantity,
        COALESCE(SUM(soi.amount), 0) as total_revenue,
        COALESCE(psc.unit_cost, 0) as unit_cost,
        COALESCE(SUM(soi.quantity) * psc.unit_cost, 0) as total_cost,
        COALESCE(SUM(soi.amount) - SUM(soi.quantity) * COALESCE(psc.unit_cost, 0), 0) as gross_profit,
        CASE 
          WHEN SUM(soi.amount) > 0 
          THEN ROUND((SUM(soi.amount) - SUM(soi.quantity) * COALESCE(psc.unit_cost, 0)) / SUM(soi.amount) * 100, 2)
          ELSE 0 
        END as gross_margin
      FROM materials m
      LEFT JOIN sales_order_items soi ON m.id = soi.material_id
      LEFT JOIN sales_orders so ON soi.order_id = so.id AND so.status != 'cancelled'
      LEFT JOIN (
        SELECT product_id, SUM(standard_price) as unit_cost 
        FROM standard_costs 
        WHERE is_active = 1 
        GROUP BY product_id
      ) psc ON m.id = psc.product_id
      ${dateCondition}
      GROUP BY m.id, m.code, m.name, psc.unit_cost
      HAVING total_quantity > 0
      ORDER BY gross_profit DESC
      LIMIT ${parseInt(limit)}
    `;

    try {
      const result = await db.query(query, queryParams);
      return result.rows || [];
    } catch (error) {
      logger.error('获取产品盈利分析失败:', error);
      throw error;
    }
  }

  /**
   * 获取客户盈利贡献分析
   * @param {Object} params - 查询参数
   * @returns {Promise<Array>} 客户盈利列表
   */
  async getCustomerProfitability(params = {}) {
    const { startDate, endDate, limit = 20 } = params;

    let dateCondition;
    const queryParams = [];

    if (startDate && endDate) {
      dateCondition = 'AND so.created_at BETWEEN ? AND ?';
      queryParams.push(startDate, `${endDate} 23:59:59`);
    }

    const query = `
      SELECT 
        c.id as customer_id,
        c.code as customer_code,
        c.name as customer_name,
        COUNT(DISTINCT so.id) as order_count,
        COALESCE(SUM(so.total_amount), 0) as total_revenue,
        COALESCE(SUM(
          (SELECT SUM(soi2.quantity * COALESCE(psc2.unit_cost, 0))
           FROM sales_order_items soi2
           LEFT JOIN (SELECT product_id, SUM(standard_price) as unit_cost FROM standard_costs WHERE is_active = 1 GROUP BY product_id) psc2 ON soi2.material_id = psc2.product_id
           WHERE soi2.order_id = so.id)
        ), 0) as total_cost,
        COALESCE(SUM(so.total_amount) - SUM(
          (SELECT SUM(soi2.quantity * COALESCE(psc2.unit_cost, 0))
           FROM sales_order_items soi2
           LEFT JOIN (SELECT product_id, SUM(standard_price) as unit_cost FROM standard_costs WHERE is_active = 1 GROUP BY product_id) psc2 ON soi2.material_id = psc2.product_id
           WHERE soi2.order_id = so.id)
        ), 0) as gross_profit,
        CASE 
          WHEN SUM(so.total_amount) > 0 
          THEN ROUND((SUM(so.total_amount) - SUM(
            (SELECT SUM(soi2.quantity * COALESCE(psc2.unit_cost, 0))
             FROM sales_order_items soi2
             LEFT JOIN (SELECT product_id, SUM(standard_price) as unit_cost FROM standard_costs WHERE is_active = 1 GROUP BY product_id) psc2 ON soi2.material_id = psc2.product_id
             WHERE soi2.order_id = so.id)
          )) / SUM(so.total_amount) * 100, 2)
          ELSE 0 
        END as gross_margin
      FROM customers c
      LEFT JOIN sales_orders so ON c.id = so.customer_id AND so.status != 'cancelled'
      WHERE 1=1 ${dateCondition}
      GROUP BY c.id, c.code, c.name
      HAVING total_revenue > 0
      ORDER BY gross_profit DESC
      LIMIT ${parseInt(limit)}
    `;

    try {
      const result = await db.query(query, queryParams);
      return result.rows || [];
    } catch (error) {
      logger.error('获取客户盈利贡献分析失败:', error);
      throw error;
    }
  }

  /**
   * 获取盈利趋势
   * @param {Object} params - 查询参数
   * @returns {Promise<Array>} 盈利趋势数据
   */
  async getProfitTrend(params = {}) {
    const { startDate, endDate, groupBy = 'month' } = params;

    let dateFormat;
    switch (groupBy) {
      case 'day':
        dateFormat = '%Y-%m-%d';
        break;
      case 'week':
        dateFormat = '%Y-%u';
        break;
      case 'month':
      default:
        dateFormat = '%Y-%m';
        break;
    }

    let dateCondition;
    const queryParams = [];

    if (startDate && endDate) {
      dateCondition = 'AND so.created_at BETWEEN ? AND ?';
      queryParams.push(startDate, `${endDate} 23:59:59`);
    } else {
      // 默认最近12个月
      dateCondition = 'AND so.created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)';
    }

    const query = `
      SELECT 
        DATE_FORMAT(so.created_at, '${dateFormat}') as period,
        COALESCE(SUM(so.total_amount), 0) as total_revenue,
        COALESCE(SUM(
          (SELECT SUM(soi2.quantity * COALESCE(psc2.unit_cost, 0))
           FROM sales_order_items soi2
           LEFT JOIN (SELECT product_id, SUM(standard_price) as unit_cost FROM standard_costs WHERE is_active = 1 GROUP BY product_id) psc2 ON soi2.material_id = psc2.product_id
           WHERE soi2.order_id = so.id)
        ), 0) as total_cost,
        COALESCE(SUM(so.total_amount) - SUM(
          (SELECT SUM(soi2.quantity * COALESCE(psc2.unit_cost, 0))
           FROM sales_order_items soi2
           LEFT JOIN (SELECT product_id, SUM(standard_price) as unit_cost FROM standard_costs WHERE is_active = 1 GROUP BY product_id) psc2 ON soi2.material_id = psc2.product_id
           WHERE soi2.order_id = so.id)
        ), 0) as gross_profit
      FROM sales_orders so
      WHERE so.status != 'cancelled' ${dateCondition}
      GROUP BY period
      ORDER BY period ASC
    `;

    try {
      const result = await db.query(query, queryParams);
      return result.rows || [];
    } catch (error) {
      logger.error('获取盈利趋势失败:', error);
      throw error;
    }
  }

  /**
   * 获取盈利汇总统计
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 汇总数据
   */
  async getProfitSummary(params = {}) {
    const { startDate, endDate } = params;

    let dateCondition;
    const queryParams = [];

    if (startDate && endDate) {
      dateCondition = 'AND so.created_at BETWEEN ? AND ?';
      queryParams.push(startDate, `${endDate} 23:59:59`);
    }

    const query = `
      SELECT 
        COUNT(DISTINCT so.id) as order_count,
        COUNT(DISTINCT so.customer_id) as customer_count,
        COALESCE(SUM(so.total_amount), 0) as total_revenue,
        COALESCE(SUM(
          (SELECT SUM(soi2.quantity * COALESCE(psc2.unit_cost, 0))
           FROM sales_order_items soi2
           LEFT JOIN (SELECT product_id, SUM(standard_price) as unit_cost FROM standard_costs WHERE is_active = 1 GROUP BY product_id) psc2 ON soi2.material_id = psc2.product_id
           WHERE soi2.order_id = so.id)
        ), 0) as total_cost
      FROM sales_orders so
      WHERE so.status != 'cancelled' ${dateCondition}
    `;

    try {
      const result = await db.query(query, queryParams);
      const row = result.rows?.[0] || {};

      const revenue = parseFloat(row.total_revenue) || 0;
      const cost = parseFloat(row.total_cost) || 0;
      const profit = revenue - cost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      return {
        orderCount: row.order_count || 0,
        customerCount: row.customer_count || 0,
        totalRevenue: revenue,
        totalCost: cost,
        grossProfit: profit,
        grossMargin: Math.round(margin * 100) / 100,
      };
    } catch (error) {
      logger.error('获取盈利汇总统计失败:', error);
      throw error;
    }
  }
}

module.exports = new ProfitabilityService();
