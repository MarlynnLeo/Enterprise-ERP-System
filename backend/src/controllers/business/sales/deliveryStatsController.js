/**
 * 发货统计控制器
 * @description 处理销售订单产品发货状态统计相关的API请求
 * @author ERP系统开发团队
 * @date 2025-01-23
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const { getConnection } = require('../../../config/db');

/**
 * 获取发货统计数据
 * @description 查询销售订单中产品的发货状态，包括已发货和未发货的产品明细
 */
exports.getDeliveryStats = async (req, res) => {
  let connection;

  try {
    const {
      page = 1,
      pageSize = 20,
      search = '',
      status = '', // 发货状态筛选：all, shipped, unshipped, partial
      startDate = '',
      endDate = '',
      customerId = '',
      orderId = '',
    } = req.query;

    connection = await getConnection();

    // 构建查询条件
    let whereClause = '';
    const params = [];

    // 基础条件：只查询已确认的订单（包含生产中的订单）
    whereClause +=
      " AND so.status IN ('confirmed', 'processing', 'shipped', 'ready_to_ship', 'in_production', 'partial_shipped', 'completed')";

    // 搜索条件
    if (search) {
      whereClause += ` AND (
        so.order_no LIKE ? OR 
        c.name LIKE ? OR 
        m.code LIKE ? OR 
        m.name LIKE ? OR
        so.contract_code LIKE ?
      )`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    // 客户筛选
    if (customerId) {
      whereClause += ' AND so.customer_id = ?';
      params.push(customerId);
    }

    // 订单筛选
    if (orderId) {
      whereClause += ' AND so.id = ?';
      params.push(orderId);
    }

    // 日期范围筛选
    if (startDate && endDate) {
      whereClause += ' AND so.created_at BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    // 主查询：获取订单产品的发货统计
    const mainQuery = `
      SELECT 
        so.id as order_id,
        so.order_no,
        so.created_at as order_date,
        so.delivery_date,
        so.status as order_status,
        so.contract_code,
        c.id as customer_id,
        c.name as customer_name,
        soi.id as order_item_id,
        soi.material_id,
        m.code as material_code,
        m.name as material_name,
        m.specs as specification,
        m.unit_id,
        u.name as unit_name,
        soi.quantity as ordered_quantity,
        soi.unit_price,
        soi.amount,
        COALESCE(shipped_summary.shipped_quantity, 0) as shipped_quantity,
        (soi.quantity - COALESCE(shipped_summary.shipped_quantity, 0)) as unshipped_quantity,
        ROUND(COALESCE(inv.quantity, 0), 1) as stock_quantity,
        CASE 
          WHEN COALESCE(shipped_summary.shipped_quantity, 0) = 0 THEN 'unshipped'
          WHEN COALESCE(shipped_summary.shipped_quantity, 0) >= soi.quantity THEN 'shipped'
          ELSE 'partial'
        END as delivery_status,
        CASE 
          WHEN COALESCE(shipped_summary.shipped_quantity, 0) = 0 THEN 0
          ELSE ROUND((COALESCE(shipped_summary.shipped_quantity, 0) / soi.quantity) * 100, 2)
        END as delivery_progress,
        CASE 
          WHEN pending_outbound.outbound_count > 0 THEN 1
          ELSE 0
        END as has_pending_outbound
      FROM sales_orders so
      INNER JOIN customers c ON so.customer_id = c.id
      INNER JOIN sales_order_items soi ON so.id = soi.order_id
      INNER JOIN materials m ON soi.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN (
        SELECT 
          il.material_id,
          SUM(il.quantity) as quantity
        FROM inventory_ledger il
        JOIN materials mat ON il.material_id = mat.id
        WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
        GROUP BY il.material_id
      ) inv ON m.id = inv.material_id
      LEFT JOIN (
        SELECT 
          soi_inner.order_id,
          soi_inner.material_id,
          SUM(sobi.quantity) as shipped_quantity
        FROM sales_order_items soi_inner
        INNER JOIN sales_outbound sob ON soi_inner.order_id = sob.order_id
        INNER JOIN sales_outbound_items sobi ON sob.id = sobi.outbound_id 
          AND soi_inner.material_id = sobi.product_id
        WHERE sob.status IN ('completed', 'processing')
        GROUP BY soi_inner.order_id, soi_inner.material_id
      ) shipped_summary ON soi.order_id = shipped_summary.order_id 
        AND soi.material_id = shipped_summary.material_id
      LEFT JOIN (
        SELECT 
          sob.order_id,
          sobi.product_id,
          COUNT(*) as outbound_count
        FROM sales_outbound sob
        INNER JOIN sales_outbound_items sobi ON sob.id = sobi.outbound_id
        WHERE sob.status = 'draft'
        GROUP BY sob.order_id, sobi.product_id
      ) pending_outbound ON soi.order_id = pending_outbound.order_id 
        AND soi.material_id = pending_outbound.product_id
      WHERE 1=1 ${whereClause}
    `;

    // 根据发货状态筛选
    let statusFilter = '';
    if (status === 'shipped') {
      statusFilter = ' HAVING delivery_status = "shipped"';
    } else if (status === 'unshipped') {
      statusFilter = ' HAVING delivery_status = "unshipped"';
    } else if (status === 'partial') {
      statusFilter = ' HAVING delivery_status = "partial"';
    }

    // 计算总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM (
        ${mainQuery}
        ${statusFilter}
      ) as count_table
    `;

    const [countResult] = await connection.query(countQuery, params);
    const total = countResult[0].total;

    // 分页查询
    const offset = (page - 1) * pageSize;
    const dataQuery = `
      ${mainQuery}
      ${statusFilter}
      ORDER BY so.created_at DESC, so.order_no, m.code
      LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}
    `;

    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const [results] = await connection.query(dataQuery, params);

    // 统计各状态数量
    const statsQuery = `
      SELECT 
        delivery_status,
        COUNT(*) as count
      FROM (
        ${mainQuery.replace(whereClause, whereClause.replace(' AND so.status', ' AND so.status'))}
      ) as stats_table
      GROUP BY delivery_status
    `;

    const [statsResult] = await connection.query(statsQuery, params);

    const stats = {
      total: 0,
      shipped: 0,
      unshipped: 0,
      partial: 0,
    };

    statsResult.forEach((stat) => {
      stats[stat.delivery_status] = parseInt(stat.count);
      stats.total += parseInt(stat.count);
    });

    res.json({
      success: true,
      data: {
        items: results,
        total: total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        stats: stats,
      },
    });
  } catch (error) {
    logger.error('获取发货统计数据失败:', error);
    ResponseHandler.error(res, '获取发货统计数据失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * 获取订单发货明细
 * @description 获取特定订单的详细发货记录
 */
exports.getOrderDeliveryDetails = async (req, res) => {
  let connection;

  try {
    const { orderId } = req.params;

    connection = await getConnection();

    // 查询订单基本信息
    const [orderInfo] = await connection.query(
      `
      SELECT 
        so.id,
        so.order_no,
        so.created_at as order_date,
        so.delivery_date,
        so.status,
        so.contract_code,
        c.name as customer_name
      FROM sales_orders so
      INNER JOIN customers c ON so.customer_id = c.id
      WHERE so.id = ?
    `,
      [orderId]
    );

    if (orderInfo.length === 0) {
      return ResponseHandler.error(res, '订单不存在', 'NOT_FOUND', 404);
    }

    // 查询订单产品及发货明细
    const [details] = await connection.query(
      `
      SELECT 
        soi.id as order_item_id,
        soi.material_id,
        m.code as material_code,
        m.name as material_name,
        m.specs as specification,
        u.name as unit_name,
        soi.quantity as ordered_quantity,
        soi.unit_price,
        soi.amount,
        sob.id as outbound_id,
        sob.outbound_no,
        sob.delivery_date as shipped_date,
        sob.status as outbound_status,
        sobi.quantity as shipped_quantity
      FROM sales_order_items soi
      INNER JOIN materials m ON soi.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN sales_outbound sob ON soi.order_id = sob.order_id
      LEFT JOIN sales_outbound_items sobi ON sob.id = sobi.outbound_id 
        AND soi.material_id = sobi.product_id
      WHERE soi.order_id = ?
      ORDER BY m.code, sob.created_at
    `,
      [orderId]
    );

    res.json({
      success: true,
      data: {
        orderInfo: orderInfo[0],
        details: details,
      },
    });
  } catch (error) {
    logger.error('获取订单发货明细失败:', error);
    ResponseHandler.error(res, '获取订单发货明细失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * 获取发货统计概览
 * @description 获取发货统计的概览数据，用于仪表板显示
 */
exports.getDeliveryOverview = async (req, res) => {
  let connection;

  try {
    connection = await getConnection();

    // 获取总体统计
    const [overviewResult] = await connection.query(`
      SELECT 
        COUNT(DISTINCT so.id) as total_orders,
        COUNT(soi.id) as total_items,
        SUM(CASE WHEN COALESCE(shipped_summary.shipped_quantity, 0) >= soi.quantity THEN 1 ELSE 0 END) as fully_shipped_items,
        SUM(CASE WHEN COALESCE(shipped_summary.shipped_quantity, 0) = 0 THEN 1 ELSE 0 END) as unshipped_items,
        SUM(CASE WHEN COALESCE(shipped_summary.shipped_quantity, 0) > 0 AND COALESCE(shipped_summary.shipped_quantity, 0) < soi.quantity THEN 1 ELSE 0 END) as partial_shipped_items
      FROM sales_orders so
      INNER JOIN sales_order_items soi ON so.id = soi.order_id
      LEFT JOIN (
        SELECT 
          soi_inner.order_id,
          soi_inner.material_id,
          SUM(sobi.quantity) as shipped_quantity
        FROM sales_order_items soi_inner
        INNER JOIN sales_outbound sob ON soi_inner.order_id = sob.order_id
        INNER JOIN sales_outbound_items sobi ON sob.id = sobi.outbound_id 
          AND soi_inner.material_id = sobi.product_id
        WHERE sob.status IN ('completed', 'processing')
        GROUP BY soi_inner.order_id, soi_inner.material_id
      ) shipped_summary ON soi.order_id = shipped_summary.order_id 
        AND soi.material_id = shipped_summary.material_id
      WHERE so.status IN ('confirmed', 'processing', 'shipped', 'ready_to_ship', 'in_production', 'partial_shipped', 'completed')
    `);

    ResponseHandler.success(res, overviewResult[0], '操作成功');
  } catch (error) {
    logger.error('获取发货统计概览失败:', error);
    ResponseHandler.error(res, '获取发货统计概览失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
