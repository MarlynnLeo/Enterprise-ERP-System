'use strict';

const { calculateLines } = require('../../utils/money');
const Precision = require('../../utils/precision');

// Outbound lines identify an order and material, so duplicate order lines must
// be aggregated before joining. An explicit zero tax rate is authoritative.
const ORDER_LINE_VALUATION_SQL = `
  SELECT oi.order_id, oi.material_id,
         SUM(oi.quantity * oi.unit_price) / NULLIF(SUM(oi.quantity), 0) AS unit_price,
         COALESCE(SUM(oi.quantity * oi.unit_price *
           CASE WHEN COALESCE(oi.tax_percent, so.tax_rate, 0) > 1
                THEN COALESCE(oi.tax_percent, so.tax_rate, 0) / 100
                ELSE COALESCE(oi.tax_percent, so.tax_rate, 0) END
         ) / NULLIF(SUM(oi.quantity * oi.unit_price), 0), 0) AS tax_percent
    FROM sales_order_items oi JOIN sales_orders so ON so.id=oi.order_id
   GROUP BY oi.order_id, oi.material_id`;

class SalesOutboundValuationService {
  static async getItems(connection, outboundIds) {
    if (!outboundIds.length) return [];
    const [items] = await connection.query(
      `SELECT i.id, i.outbound_id, i.product_id AS material_id, i.quantity,
              COALESCE(i.source_order_id, o.order_id) AS source_order_id,
              o.order_id AS header_order_id, m.name AS material_name,
              m.code AS material_code, m.specs,
              COALESCE(i.price, ordered.unit_price, m.price,0) AS unit_price,
              COALESCE(ordered.tax_percent,0) AS tax_percent
         FROM sales_outbound_items i JOIN sales_outbound o ON o.id=i.outbound_id
         LEFT JOIN materials m ON m.id=i.product_id
         LEFT JOIN (${ORDER_LINE_VALUATION_SQL}) ordered
           ON ordered.order_id=COALESCE(i.source_order_id,o.order_id) AND ordered.material_id=i.product_id
        WHERE i.outbound_id IN (?) ORDER BY i.id`,
      [outboundIds]
    );
    return calculateLines(items).items;
  }

  static async getShippedMaterialValues(connection, { orderId, outboundId = null }) {
    const [items] = await connection.query(
      `SELECT i.product_id, SUM(i.quantity) AS quantity,
              SUM(i.quantity * COALESCE(i.price,ordered.unit_price,0)) / NULLIF(SUM(i.quantity),0) AS unit_price,
              COALESCE(MAX(ordered.tax_percent),0) AS tax_percent
         FROM sales_outbound_items i JOIN sales_outbound o ON o.id=i.outbound_id
         LEFT JOIN (${ORDER_LINE_VALUATION_SQL}) ordered
           ON ordered.order_id=COALESCE(i.source_order_id,o.order_id) AND ordered.material_id=i.product_id
        WHERE o.deleted_at IS NULL AND o.status='completed'
          AND COALESCE(i.source_order_id,o.order_id)=? AND (? IS NULL OR o.id=?)
        GROUP BY i.product_id`, [orderId, outboundId, outboundId]
    );
    return new Map(items.map(item => [Number(item.product_id), {
      ...item, unit_price: Precision.round(Number(item.unit_price), 4),
    }]));
  }

  static summarize(items) {
    return calculateLines(items);
  }
}

module.exports = SalesOutboundValuationService;
module.exports.ORDER_LINE_VALUATION_SQL = ORDER_LINE_VALUATION_SQL;
