'use strict';

const { calculateLines, sumMoney } = require('../../utils/money');
const Precision = require('../../utils/precision');
const { ORDER_LINE_VALUATION_SQL } = require('./SalesOutboundValuationService');

/** Use the actual shipment price; aggregate duplicate order lines before joining. */
class SalesReturnValuationService {
  static async getItems(connection, returnIds) {
    if (!returnIds.length) return [];
    const [items] = await connection.query(
      `SELECT sri.*, m.code AS material_code, m.name AS material_name,
              m.specs AS specification, u.name AS unit_name,
              COALESCE(shipped.unit_price, shipped_order.unit_price, ordered.unit_price, m.price, 0) AS unit_price,
              COALESCE(ordered.tax_percent,0) AS tax_percent
         FROM sales_return_items sri
         JOIN sales_returns sr ON sr.id = sri.return_id
         LEFT JOIN materials m ON m.id = sri.product_id
         LEFT JOIN units u ON u.id = m.unit_id
         LEFT JOIN (
           SELECT i.outbound_id, COALESCE(i.source_order_id, o.order_id) AS order_id,
                  i.product_id, SUM(i.quantity * i.price) / NULLIF(SUM(i.quantity), 0) AS unit_price
            FROM sales_outbound_items i JOIN sales_outbound o ON o.id = i.outbound_id
            WHERE o.deleted_at IS NULL AND o.status='completed'
            GROUP BY i.outbound_id, COALESCE(i.source_order_id, o.order_id), i.product_id
         ) shipped ON shipped.outbound_id = sr.outbound_id
                  AND shipped.order_id = sr.order_id AND shipped.product_id = sri.product_id
         LEFT JOIN (
           SELECT COALESCE(i.source_order_id,o.order_id) AS order_id,i.product_id,
                  SUM(i.quantity*i.price)/NULLIF(SUM(i.quantity),0) AS unit_price
             FROM sales_outbound_items i JOIN sales_outbound o ON o.id=i.outbound_id
            WHERE o.deleted_at IS NULL AND o.status='completed'
            GROUP BY COALESCE(i.source_order_id,o.order_id),i.product_id
         ) shipped_order ON shipped_order.order_id=sr.order_id AND shipped_order.product_id=sri.product_id
         LEFT JOIN (${ORDER_LINE_VALUATION_SQL}) ordered ON ordered.order_id = sr.order_id AND ordered.material_id = sri.product_id
        WHERE sri.return_id IN (?) ORDER BY sri.id`,
      [returnIds]
    );
    return calculateLines(items.map(item => {
      const unitPrice = Precision.round(Number(item.unit_price), 4);
      return { ...item, unit_price: unitPrice };
    })).items;
  }

  static total(items) {
    return sumMoney(items.map(item => item.total_amount ?? item.amount));
  }
}

module.exports = SalesReturnValuationService;
