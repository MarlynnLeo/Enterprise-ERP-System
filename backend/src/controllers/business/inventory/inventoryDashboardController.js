const db = require('../../../config/db');
const { logger } = require('../../../utils/logger');
const { ResponseHandler } = require('../../../utils/responseHandler');

const getDashboardSummary = async (req, res) => {
  try {
    const stockLedgerFilter = { sql: '', params: [] };

    // 1. 获取基础统计数据(总库存种类和总金额)
    const stockQuery = `
      SELECT
        COUNT(DISTINCT current_stock.material_id) as totalItems,
        COALESCE(SUM(current_stock.quantity * COALESCE(m.cost_price, 0)), 0) as totalValue
      FROM (
        SELECT il.material_id, SUM(il.quantity) as quantity
        FROM inventory_ledger il
        JOIN materials mat ON il.material_id = mat.id
        WHERE (mat.location_id IS NULL OR il.location_id = mat.location_id)${stockLedgerFilter.sql}
        GROUP BY il.material_id
        HAVING SUM(il.quantity) > 0
      ) current_stock
      LEFT JOIN materials m ON current_stock.material_id = m.id
    `;
    const [stockRes] = await db.pool.execute(stockQuery, stockLedgerFilter.params);
    const totalItems = stockRes[0]?.totalItems || 0;
    const totalValue = stockRes[0]?.totalValue || 0;

    // 2. 本月入库与出库单据数、物料数量（基于真实入库单与出库单表）
    const [thisMonthInboundRes] = await db.pool.execute(`
      SELECT
        COUNT(DISTINCT ii.id) as inbound_count,
        COALESCE(SUM(iii.quantity), 0) as inbound_items_qty
      FROM inventory_inbound ii
      LEFT JOIN inventory_inbound_items iii ON ii.id = iii.inbound_id
      WHERE DATE_FORMAT(COALESCE(ii.inbound_date, ii.created_at), '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')
        AND (ii.status IS NULL OR ii.status != 'cancelled')
    `);

    const [thisMonthOutboundRes] = await db.pool.execute(`
      SELECT
        COUNT(DISTINCT io.id) as outbound_count,
        COALESCE(SUM(ioi.quantity), 0) as outbound_items_qty
      FROM inventory_outbound io
      LEFT JOIN inventory_outbound_items ioi ON io.id = ioi.outbound_id
      WHERE DATE_FORMAT(COALESCE(io.outbound_date, io.created_at), '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')
        AND (io.status IS NULL OR io.status != 'cancelled')
    `);

    const inboundCount = Number(thisMonthInboundRes[0]?.inbound_count) || 0;
    const inboundItemsQty = Number(thisMonthInboundRes[0]?.inbound_items_qty) || 0;
    const outboundCount = Number(thisMonthOutboundRes[0]?.outbound_count) || 0;
    const outboundItemsQty = Number(thisMonthOutboundRes[0]?.outbound_items_qty) || 0;

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

    // 4. 最近12个月的出入库趋势（聚合 inventory_inbound 与 inventory_outbound）
    const [inboundTrendRes] = await db.pool.execute(`
      SELECT
        DATE_FORMAT(COALESCE(ii.inbound_date, ii.created_at), '%Y-%m') as month,
        COALESCE(SUM(iii.quantity), 0) as inbound_qty
      FROM inventory_inbound ii
      LEFT JOIN inventory_inbound_items iii ON ii.id = iii.inbound_id
      WHERE COALESCE(ii.inbound_date, ii.created_at) >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        AND (ii.status IS NULL OR ii.status != 'cancelled')
      GROUP BY month
    `);

    const [outboundTrendRes] = await db.pool.execute(`
      SELECT
        DATE_FORMAT(COALESCE(io.outbound_date, io.created_at), '%Y-%m') as month,
        COALESCE(SUM(ioi.quantity), 0) as outbound_qty
      FROM inventory_outbound io
      LEFT JOIN inventory_outbound_items ioi ON io.id = ioi.outbound_id
      WHERE COALESCE(io.outbound_date, io.created_at) >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        AND (io.status IS NULL OR io.status != 'cancelled')
      GROUP BY month
    `);

    const trendMap = new Map();
    for (const row of inboundTrendRes) {
      if (row.month) {
        if (!trendMap.has(row.month)) trendMap.set(row.month, { month: row.month, inbound_qty: 0, outbound_qty: 0 });
        trendMap.get(row.month).inbound_qty = Number(row.inbound_qty) || 0;
      }
    }
    for (const row of outboundTrendRes) {
      if (row.month) {
        if (!trendMap.has(row.month)) trendMap.set(row.month, { month: row.month, inbound_qty: 0, outbound_qty: 0 });
        trendMap.get(row.month).outbound_qty = Number(row.outbound_qty) || 0;
      }
    }

    const monthlyTrend = Array.from(trendMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(item => ({
        month: item.month,
        inbound_qty: item.inbound_qty,
        outbound_qty: item.outbound_qty,
        inbound: item.inbound_qty,
        outbound: item.outbound_qty,
        inboundQty: item.inbound_qty,
        outboundQty: item.outbound_qty
      }));

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
        WHERE (mat.location_id IS NULL OR il.location_id = mat.location_id)${stockLedgerFilter.sql}
        GROUP BY il.material_id
      ) s ON m.id = s.material_id
      WHERE (COALESCE(s.quantity, 0) <= COALESCE(m.min_stock, 0) AND COALESCE(m.min_stock, 0) > 0)
         OR (COALESCE(s.quantity, 0) >= COALESCE(m.max_stock, 0) AND COALESCE(m.max_stock, 0) > 0)
         OR (COALESCE(s.quantity, 0) <= 0)
      LIMIT 200
    `;
    const [alertRes] = await db.pool.execute(alertQuery, stockLedgerFilter.params);

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
        inbound: { count: inboundCount, items: inboundItemsQty },
        outbound: { count: outboundCount, items: outboundItemsQty },
        alerts: {
          low: alertsList.filter(a => a.type === 'low' || a.type === 'critical').length,
          overstock: alertsList.filter(a => a.type === 'overstock').length
        }
      },
      categoryDistribution: {
        labels: categoryRes.map(c => c.category_name),
        values: categoryRes.map(c => Number(c.item_count))
      },
      monthlyTrend,
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
