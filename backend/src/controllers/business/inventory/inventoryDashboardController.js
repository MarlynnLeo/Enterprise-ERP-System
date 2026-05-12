const db = require('../../../config/db');
const { logger } = require('../../../utils/logger');
const { ResponseHandler } = require('../../../utils/responseHandler');

const getDashboardSummary = async (req, res) => {
  try {
    // 1. 获取基础统计数据(总库存和价值)
    const stockQuery = `
      SELECT
        COUNT(DISTINCT current_stock.material_id) as totalItems,
        COALESCE(SUM(current_stock.quantity * COALESCE(m.price, 0)), 0) as totalValue
      FROM (
        SELECT il.material_id, SUM(il.quantity) as quantity
        FROM inventory_ledger il
        JOIN materials mat ON il.material_id = mat.id
        WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
        GROUP BY il.material_id
        HAVING SUM(il.quantity) > 0
      ) current_stock
      LEFT JOIN materials m ON current_stock.material_id = m.id
    `;
    const [stockRes] = await db.pool.execute(stockQuery);
    const totalItems = stockRes[0]?.totalItems || 0;
    const totalValue = stockRes[0]?.totalValue || 0;

    // 2. 本月出入库单据数和物料数
    const thisMonthQuery = `
      SELECT
        SUM(CASE WHEN transaction_type LIKE '%in%' THEN 1 ELSE 0 END) as inbound_count,
        SUM(CASE WHEN transaction_type LIKE '%out%' THEN 1 ELSE 0 END) as outbound_count,
        SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END) as inbound_items_qty,
        SUM(CASE WHEN quantity < 0 THEN ABS(quantity) ELSE 0 END) as outbound_items_qty
      FROM inventory_ledger
      WHERE DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')
    `;
    const [monthRes] = await db.pool.execute(thisMonthQuery);
    const monthStats = monthRes[0] || {};

    // 3. 物料分类分布
    const categoryQuery = `
      SELECT
        COALESCE(c.name, '未分类') as category_name,
        COUNT(m.id) as item_count
      FROM materials m
      LEFT JOIN categories c ON m.category_id = c.id
      GROUP BY category_name
      ORDER BY item_count DESC
    `;
    const [categoryRes] = await db.pool.execute(categoryQuery);

    // 4. 最近12个月的出入库趋势
    const trendQuery = `
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') as month,
        SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END) as inbound_qty,
        SUM(CASE WHEN quantity < 0 THEN ABS(quantity) ELSE 0 END) as outbound_qty
      FROM inventory_ledger
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY month
      ORDER BY month ASC
    `;
    const [trendRes] = await db.pool.execute(trendQuery);

    // 5. 预警清单 (分页拉一些足够展示)
    const alertQuery = `
      SELECT
        m.id,
        m.code,
        m.name,
        m.specs as specification,
        u.name as unit,
        COALESCE(m.min_stock, 0) as safetyStock,
        COALESCE(m.max_stock, 0) as maxStock,
        COALESCE(s.quantity, 0) as quantity,
        COALESCE(l.name, '未分配库位') as location
      FROM materials m
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN locations l ON m.location_id = l.id
      LEFT JOIN (
        SELECT il.material_id, SUM(il.quantity) as quantity
        FROM inventory_ledger il
        JOIN materials mat ON il.material_id = mat.id
        WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
        GROUP BY il.material_id
      ) s ON m.id = s.material_id
      WHERE (COALESCE(s.quantity, 0) <= COALESCE(m.min_stock, 0) AND COALESCE(m.min_stock, 0) > 0)
         OR (COALESCE(s.quantity, 0) >= COALESCE(m.max_stock, 0) AND COALESCE(m.max_stock, 0) > 0)
         OR (COALESCE(s.quantity, 0) <= 0)
      LIMIT 200
    `;
    const [alertRes] = await db.pool.execute(alertQuery);

    // 数据编排结构化
    const alertsList = alertRes.map(item => {
      let type = 'normal';
      let status = '正常';
      const qty = parseFloat(item.quantity);
      const safe = parseFloat(item.safetyStock);
      const max = parseFloat(item.maxStock);

      if (qty <= 0) {
        type = 'critical'; status = '零库存';
      } else if (safe > 0 && qty < safe) {
        type = 'low'; status = '低库存';
      } else if (max > 0 && qty > max) {
        type = 'overstock'; status = '超额库存';
      }

      return {
        ...item,
        type,
        status,
        quantity: qty
      };
    });

    const summaryData = {
      statistics: {
        totalStock: totalItems,
        totalValue: parseFloat(totalValue),
        inbound: { count: monthStats.inbound_count || 0, items: monthStats.inbound_items_qty || 0 },
        outbound: { count: monthStats.outbound_count || 0, items: monthStats.outbound_items_qty || 0 },
        alerts: {
          low: alertsList.filter(a => a.type === 'low' || a.type === 'critical').length,
          overstock: alertsList.filter(a => a.type === 'overstock').length
        }
      },
      categoryDistribution: {
        labels: categoryRes.map(c => c.category_name),
        values: categoryRes.map(c => Number(c.item_count))
      },
      monthlyTrend: trendRes.map(t => ({
        ...t,
        inbound_qty: Number(t.inbound_qty),
        outbound_qty: Number(t.outbound_qty)
      })),
      alertItems: alertsList
    };

    ResponseHandler.success(res, summaryData);
  } catch (error) {
    logger.error('获取库存看板汇总数据失败:', error);
    ResponseHandler.error(res, '获取库存看板汇总数据失败', 'SERVER_ERROR', 500, error);
  }
};

module.exports = {
  getDashboardSummary
};
