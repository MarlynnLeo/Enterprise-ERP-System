/**
 * PurchaseDashboardService.js
 * @description 采购数据概览服务 - 提供采购模块仪表盘所需的统计数据 * @date 2026-02-03
 * @version 1.0.0
 */

const db = require('../../config/db');
const { logger } = require('../../utils/logger');

class PurchaseDashboardService {
  constructor() {
    this.pool = db.pool;
  }

  /**
   * 将值转换为数字
   * @param {*} value - 输入值   * @returns {number} 转换后的数字
   */
  toNumber(value) {
    return parseInt(value) || 0;
  }

  /**
   * 获取采购申请统计
   * @returns {Promise<Object>} 采购申请统计数据
   */
  async getRequisitionStats() {
    const [rows] = await this.pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft,
        COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
      FROM purchase_requisitions
    `);

    return {
      total: this.toNumber(rows[0].total),
      pending: this.toNumber(rows[0].draft) + this.toNumber(rows[0].submitted),
      draft: this.toNumber(rows[0].draft),
      submitted: this.toNumber(rows[0].submitted),
      approved: this.toNumber(rows[0].approved),
      completed: this.toNumber(rows[0].completed),
    };
  }

  /**
   * 获取采购订单统计
   * @returns {Promise<Object>} 采购订单统计数据
   */
  async getOrderStats() {
    const [rows] = await this.pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
      FROM purchase_orders
    `);

    return {
      total: this.toNumber(rows[0].total),
      pending: this.toNumber(rows[0].draft) + this.toNumber(rows[0].pending),
      draft: this.toNumber(rows[0].draft),
      approved: this.toNumber(rows[0].approved),
      completed: this.toNumber(rows[0].completed),
    };
  }

  /**
   * 获取采购收货统计
   * @returns {Promise<Object>} 采购收货统计数据
   */
  async getReceiptStats() {
    const [rows] = await this.pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
      FROM purchase_receipts
    `);

    return {
      total: this.toNumber(rows[0].total),
      pending: this.toNumber(rows[0].draft) + this.toNumber(rows[0].confirmed),
      confirmed: this.toNumber(rows[0].confirmed),
      completed: this.toNumber(rows[0].completed),
    };
  }

  /**
   * 获取采购退货统计   * @returns {Promise<Object>} 采购退货统计数据   */
  async getReturnStats() {
    const [rows] = await this.pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
      FROM purchase_returns
    `);

    return {
      total: this.toNumber(rows[0].total),
      pending: this.toNumber(rows[0].draft) + this.toNumber(rows[0].confirmed),
      confirmed: this.toNumber(rows[0].confirmed),
      completed: this.toNumber(rows[0].completed),
    };
  }

  /**
   * 获取最近N个月的采购趋势数据   * @param {number} months - 月份数量，默认个月
   * @returns {Promise<Array>} 趋势数据数组
   */
  async getTrendData(months = 6) {
    const [rows] = await this.pool.query(
      `
      SELECT 
        month,
        SUM(requisition_count) as requisition_count,
        SUM(order_count) as order_count,
        SUM(order_amount) as order_amount
      FROM (
        SELECT 
          DATE_FORMAT(created_at, '%Y-%m') as month,
          1 as requisition_count,
          0 as order_count,
          0 as order_amount
        FROM purchase_requisitions
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
        
        UNION ALL
        
        SELECT 
          DATE_FORMAT(created_at, '%Y-%m') as month,
          0 as requisition_count,
          1 as order_count,
          COALESCE(total_amount, 0) as order_amount
        FROM purchase_orders
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      ) combined
      GROUP BY month
      ORDER BY month ASC
    `,
      [months, months]
    );

    return rows.map((row) => ({
      month: row.month,
      requisitionCount: this.toNumber(row.requisition_count),
      orderCount: this.toNumber(row.order_count),
      orderAmount: parseFloat(row.order_amount) || 0,
    }));
  }

  /**
   * 获取物料分类采购分布
   * @param {number} months - 统计月份数，默认6个月
   * @param {number} limit - 返回数量限制，默认个分类   * @returns {Promise<Array>} 分类分布数据
   */
  async getCategoryDistribution(months = 6, limit = 6) {
    const [rows] = await this.pool.query(
      `
      SELECT 
        COALESCE(c.name, '未分类') as category_name,
        COUNT(DISTINCT poi.order_id) as order_count,
        COALESCE(SUM(poi.quantity * poi.price), 0) as total_amount
      FROM purchase_order_items poi
      LEFT JOIN materials m ON poi.material_id = m.id
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN purchase_orders po ON poi.order_id = po.id
      WHERE po.created_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      GROUP BY c.id, c.name
      ORDER BY total_amount DESC
      LIMIT ?
    `,
      [months, limit]
    );

    return rows.map((row) => ({
      categoryName: row.category_name,
      orderCount: this.toNumber(row.order_count),
      totalAmount: parseFloat(row.total_amount) || 0,
    }));
  }

  /**
   * 获取待处理事项列表   * @param {number} limit - 返回数量限制，默认10条   * @returns {Promise<Array>} 待处理事项列表   */
  async getPendingItems(limit = 20) {
    const [rows] = await this.pool.query(
      `
      SELECT
        'requisition' as type,
        requisition_number as number,
        request_date as date,
        status,
        real_name as requester,
        null as supplier,
        null as amount
      FROM purchase_requisitions
      WHERE status IN ('submitted', 'draft')

      UNION ALL

      SELECT
        'order' as type,
        order_no as number,
        order_date as date,
        status,
        null as requester,
        supplier_name as supplier,
        total_amount as amount
      FROM purchase_orders
      WHERE status IN ('draft', 'pending')

      UNION ALL

      SELECT
        'receipt' as type,
        receipt_no as number,
        receipt_date as date,
        status,
        operator as requester,
        supplier_name as supplier,
        null as amount
      FROM purchase_receipts
      WHERE status IN ('draft', 'confirmed')

      UNION ALL

      SELECT
        'return' as type,
        return_no as number,
        return_date as date,
        status,
        operator as requester,
        supplier_name as supplier,
        null as amount
      FROM purchase_returns
      WHERE status IN ('draft', 'confirmed')

      ORDER BY date DESC
      LIMIT ?
    `,
      [limit]
    );

    return rows;
  }

  /**
   * 获取完整的仪表盘数据
   * @returns {Promise<Object>} 仪表盘完整数据   */
  async getDashboardData() {
    try {
      // 并行获取所有统计数据
      const [
        requisitionStats,
        orderStats,
        receiptStats,
        returnStats,
        trendData,
        categoryDistribution,
        pendingItems,
      ] = await Promise.all([
        this.getRequisitionStats(),
        this.getOrderStats(),
        this.getReceiptStats(),
        this.getReturnStats(),
        this.getTrendData(6),
        this.getCategoryDistribution(6, 6),
        this.getPendingItems(20),
      ]);

      return {
        statistics: {
          requisitions: requisitionStats,
          orders: orderStats,
          receipts: receiptStats,
          returns: returnStats,
        },
        trendData,
        categoryDistribution,
        pendingItems,
      };
    } catch (error) {
      logger.error('获取采购仪表盘数据失败', error);
      throw error;
    }
  }
}

// 导出单例
module.exports = new PurchaseDashboardService();

