/**
 * salesStatsController.js
 * @description 销售统计控制器
 * @date 2025-08-27
 * @version 1.1.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const { SALES_STATUS_KEYS } = require('../../../constants/systemConstants');

// ✅ DRY修复：从 salesShared.js 统一导入，不再重复定义
const { STATUS, getConnection } = require('./salesShared');

// 添加新的控制器方法

exports.getSalesStatistics = async (req, res) => {
  const connection = await getConnection();
  try {
    // 获取当前月份的开始和结束日期
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const currentMonthStartStr = currentMonthStart.toISOString().slice(0, 10);
    const currentMonthEndStr = currentMonthEnd.toISOString().slice(0, 10);

    // 1. 获取销售订单总体统计
    const [orderStats] = await connection.query(`
      SELECT
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status IN ('${SALES_STATUS_KEYS.DRAFT}', '${SALES_STATUS_KEYS.PENDING}') THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = '${SALES_STATUS_KEYS.COMPLETED}' THEN 1 END) as completed_orders,
        SUM(total_amount) as total_sales_amount,
        AVG(total_amount) as avg_order_amount
      FROM sales_orders
    `);

    // 2. 获取当月销售统计
    const [monthlyStats] = await connection.query(
      `
      SELECT
        COUNT(*) as monthly_orders,
        SUM(total_amount) as monthly_sales,
        COUNT(CASE WHEN status = '${SALES_STATUS_KEYS.COMPLETED}' THEN 1 END) as monthly_completed
      FROM sales_orders
      WHERE DATE(created_at) BETWEEN ? AND ?
    `,
      [currentMonthStartStr, currentMonthEndStr]
    );

    // 3. 获取销售退货统计
    const [returnStats] = await connection.query(`
      SELECT
        COUNT(*) as returns_count,
        COUNT(CASE WHEN status = '${SALES_STATUS_KEYS.COMPLETED}' THEN 1 END) as completed_returns
      FROM sales_returns
    `);

    // 4. 获取应收账款统计
    const [receivableStats] = await connection.query(`
      SELECT
        SUM(CASE WHEN status = 'paid' THEN balance_amount ELSE 0 END) as collected_amount,
        SUM(CASE WHEN status != 'paid' THEN balance_amount ELSE 0 END) as pending_amount
      FROM ar_invoices
    `);

    // 5. 获取Top5客户销售排名
    const [topCustomers] = await connection.query(`
      SELECT
        c.name,
        SUM(so.total_amount) as sales
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      WHERE so.status IN ('completed', 'shipped', 'delivered')
      GROUP BY c.id, c.name
      HAVING sales > 0
      ORDER BY sales DESC
      LIMIT 5
    `);

    // 6. 获取Top5产品销售排名（通过订单明细）
    const [topProducts] = await connection.query(`
      SELECT
        m.name,
        SUM(soi.quantity * soi.unit_price) as sales
      FROM sales_order_items soi
      LEFT JOIN materials m ON soi.material_id = m.id
      LEFT JOIN sales_orders so ON soi.order_id = so.id
      WHERE so.status IN ('completed', 'shipped', 'delivered')
      GROUP BY m.id, m.name
      HAVING sales > 0
      ORDER BY sales DESC
      LIMIT 5
    `);

    // 格式化返回数据
    const stats = orderStats[0] || {};
    const monthly = monthlyStats[0] || {};
    const returns = returnStats[0] || {};
    const receivables = receivableStats[0] || {};

    logger.info('[销售统计] 统计数据获取完成:', {
      total_orders: stats.total_orders,
      monthly_orders: monthly.monthly_orders,
      returns_count: returns.returns_count,
    });

    res.json({
      // 订单统计
      total_sales: parseFloat(stats.total_sales_amount || 0),
      pending_orders: parseInt(stats.pending_orders || 0),
      completed_orders: parseInt(stats.completed_orders || 0),

      // 当月统计
      monthly_sales: parseFloat(monthly.monthly_sales || 0),
      monthly_orders: parseInt(monthly.monthly_orders || 0),
      monthly_completed: parseInt(monthly.monthly_completed || 0),

      // 退货统计
      returns_count: parseInt(returns.returns_count || 0),
      returns_amount: 0, // 退货表中没有金额字段，暂时设为0

      // 应收账款统计
      collected_amount: parseFloat(receivables.collected_amount || 0),
      pending_amount: parseFloat(receivables.pending_amount || 0),

      // Top排名
      top_customers: topCustomers.map((item) => ({
        name: item.name || '未知客户',
        sales: parseFloat(item.sales || 0),
      })),
      top_products: topProducts.map((item) => ({
        name: item.name || '未知产品',
        sales: parseFloat(item.sales || 0),
      })),
    });
  } catch (error) {
    logger.error('Error getting sales statistics:', error);
    ResponseHandler.error(res, 'Error getting sales statistics', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 获取销售趋势数据（最近12个月）

exports.getSalesTrend = async (req, res) => {
  const connection = await getConnection();
  try {
    // 获取最近12个月的数据
    const [trendData] = await connection.query(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as order_count,
        SUM(total_amount) as sales_amount
      FROM sales_orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        AND status IN ('completed', 'shipped', 'delivered')
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month ASC
    `);

    // 生成最近12个月的月份列表
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = date.toISOString().slice(0, 7); // YYYY-MM格式
      months.push(monthStr);
    }

    // 填充缺失月份的数据
    const trendResult = months.map((month) => {
      const found = trendData.find((item) => item.month === month);
      return {
        month: month,
        order_count: found ? parseInt(found.order_count) : 0,
        sales_amount: found ? parseFloat(found.sales_amount) : 0,
      };
    });

    res.json({
      trend_data: trendResult,
    });
  } catch (error) {
    logger.error('Error getting sales trend:', error);
    ResponseHandler.error(res, 'Error getting sales trend', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// Sales Outbound Controllers

