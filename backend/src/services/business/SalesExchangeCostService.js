'use strict';

const Precision = require('../../utils/precision');

/** Recover the inventory cost actually issued by the selected original shipment(s). */
class SalesExchangeCostService {
  static async getReturnCosts(connection, { orderId, outboundId = null, materialIds = null }) {
    const selectedMaterials = materialIds == null ? null : [...new Set(materialIds.map(Number))];
    if (selectedMaterials && !selectedMaterials.length) return new Map();
    const [shipments] = await connection.query(
      `SELECT o.id AS outbound_id, o.outbound_no, i.id AS item_id, i.product_id, i.quantity,
              (SELECT SUM(all_items.quantity) FROM sales_outbound_items all_items
                WHERE all_items.outbound_id = o.id AND all_items.product_id = i.product_id) AS material_quantity
         FROM sales_outbound_items i JOIN sales_outbound o ON o.id = i.outbound_id
        WHERE o.deleted_at IS NULL AND o.status = 'completed'
          AND COALESCE(i.source_order_id, o.order_id) = ? AND (? IS NULL OR o.id = ?)
          ${selectedMaterials ? 'AND i.product_id IN (?)' : ''}
        ORDER BY o.id, i.id`,
      [orderId, outboundId, outboundId, ...(selectedMaterials ? [selectedMaterials] : [])]
    );
    if (!shipments.length) return new Map();
    const numbers = [...new Set(shipments.map((row) => row.outbound_no))];
    const [ledgers] = await connection.query(
      `SELECT l.reference_no, l.material_id, p.source_line_key,
              SUM(ABS(l.quantity)) AS quantity,
              SUM(COALESCE(ABS(l.total_value), ABS(l.quantity) * l.unit_cost)) AS total_value,
              SUM(CASE WHEN COALESCE(ABS(l.total_value), ABS(l.quantity) * l.unit_cost, 0) <= 0 THEN 1 ELSE 0 END) AS missing_cost
         FROM inventory_ledger l LEFT JOIN inventory_posting_lines p ON p.id = l.posting_line_id
        WHERE l.reference_type = 'sales_outbound' AND l.reference_no IN (?) AND l.quantity < 0
        GROUP BY l.reference_no, l.material_id, p.source_line_key`,
      [numbers]
    );
    const selectedQuantities = new Map();
    for (const shipment of shipments) {
      const key = `${shipment.outbound_no}:${shipment.product_id}`;
      selectedQuantities.set(key, (selectedQuantities.get(key) || 0) + Number(shipment.quantity));
    }
    const totals = new Map();
    for (const shipment of shipments) {
      const candidates = ledgers.filter(
        (row) =>
          row.reference_no === shipment.outbound_no &&
          Number(row.material_id) === Number(shipment.product_id)
      );
      const prefix = `sales_outbound:${shipment.outbound_id}:item:${shipment.item_id}:`;
      const exact = candidates.filter((row) =>
        String(row.source_line_key || '').startsWith(prefix)
      );
      // Legacy postings may lack line keys. Only average them when all of this
      // shipment's material belongs to the selected order; never mix another order's costs.
      const singleOrder =
        Math.abs(
          (selectedQuantities.get(`${shipment.outbound_no}:${shipment.product_id}`) || 0) -
            Number(shipment.material_quantity)
        ) < 0.000001;
      const legacy = candidates.every(
        (row) => !row.source_line_key || String(row.source_line_key).startsWith('legacy:')
      );
      const allocated = exact.length ? exact : singleOrder && legacy ? candidates : [];
      const issued = allocated.reduce(
        (sum, row) => ({
          quantity: sum.quantity + Number(row.quantity),
          total_value: sum.total_value + Number(row.total_value),
          missing_cost: sum.missing_cost + Number(row.missing_cost || 0),
        }),
        { quantity: 0, total_value: 0, missing_cost: 0 }
      );
      const quantity = Number(shipment.quantity);
      if (
        Number(issued.missing_cost) > 0 ||
        !(Number(issued.total_value) > 0) ||
        !(quantity > 0) ||
        Number(issued.quantity) + 0.000001 < quantity ||
        (exact.length && Math.abs(issued.quantity - quantity) > 0.000001) ||
        (!exact.length && Math.abs(issued.quantity - Number(shipment.material_quantity)) > 0.000001)
      ) {
        throw Object.assign(
          new Error(`原销售出库 ${shipment.outbound_no} 缺少完整已过账库存成本，不能办理换货退回`),
          { statusCode: 400, code: 'VALIDATION_ERROR' }
        );
      }
      const id = Number(shipment.product_id);
      const total = totals.get(id) || { quantity: 0, value: 0 };
      total.quantity = Precision.add(total.quantity, quantity);
      total.value = Precision.add(
        total.value,
        Precision.mul(quantity, Number(issued.total_value) / Number(issued.quantity))
      );
      totals.set(id, total);
    }
    return new Map(
      [...totals].map(([id, total]) => [id, Precision.round(total.value / total.quantity, 6)])
    );
  }
}

module.exports = SalesExchangeCostService;
