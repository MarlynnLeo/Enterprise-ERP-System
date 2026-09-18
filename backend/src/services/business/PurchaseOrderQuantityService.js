'use strict';

const { purchaseValidationError } = require('../../utils/purchase/purchaseValidation');
const { INCOMING_INSPECTION_COUNTED_STATUSES, PURCHASE_RECEIPT_COUNTED_STATUSES } = require('../../constants/qualityReceipt');
const TERMINAL = new Set(INCOMING_INSPECTION_COUNTED_STATUSES);

class PurchaseOrderQuantityService {
  // The order header is the common lock for arrivals, receipts and their edits.
  // An inspection and its receipt describe one delivery and count only once.
  static async read(connection, orderId, { receiptId = null, inspectionId = null } = {}) {
    const [orderItems] = await connection.query('SELECT * FROM purchase_order_items WHERE order_id = ? ORDER BY id FOR UPDATE', [orderId]);
    const lines = new Map(orderItems.map(item => [Number(item.id), {
      item, received: 0, reserved: 0, inspected: 0, qualified: 0, unqualified: 0, returned: 0,
    }]));
    const resolve = (materialId, orderItemId) => {
      const candidates = orderItems.filter(item => Number(item.material_id) === Number(materialId));
      const line = orderItemId ? lines.get(Number(orderItemId)) : candidates.length === 1 ? lines.get(Number(candidates[0].id)) : null;
      if (!line || Number(line.item.material_id) !== Number(materialId)) {
        throw purchaseValidationError(candidates.length > 1 ? '同物料存在多条采购明细，请指定正确的订单明细ID' : '来源明细不属于当前采购订单');
      }
      return line;
    };
    const [inspections] = await connection.query(
      `SELECT id, material_id, purchase_order_item_id, status, quantity, qualified_quantity, unqualified_quantity
       FROM quality_inspections WHERE reference_id = ? AND inspection_type = 'incoming'
         AND COALESCE(source_type, 'purchase_order') IN ('', 'purchase_order')
         AND deleted_at IS NULL AND (? IS NULL OR id <> ?) ORDER BY id FOR UPDATE`,
      [orderId, inspectionId, inspectionId]
    );
    const inspectionIds = new Set(inspections.map(item => Number(item.id)));
    for (const inspection of inspections) {
      const line = resolve(inspection.material_id, inspection.purchase_order_item_id);
      const terminal = TERMINAL.has(inspection.status);
      const quantity = Number(terminal ? inspection.qualified_quantity ?? 0 : inspection.quantity);
      line.received += quantity;
      line.reserved += quantity;
      if (terminal) {
        line.inspected += Number(inspection.quantity);
        line.qualified += Number(inspection.qualified_quantity || 0);
        line.unqualified += Number(inspection.unqualified_quantity || 0);
      }
    }
    const [receipts] = await connection.query(
      `SELECT ri.order_item_id, ri.material_id, ri.received_quantity, ri.qualified_quantity, r.inspection_id, r.status
       FROM purchase_receipt_items ri JOIN purchase_receipts r ON r.id = ri.receipt_id
       WHERE r.order_id = ? AND r.deleted_at IS NULL AND r.status <> 'cancelled'
         AND (? IS NULL OR r.id <> ?) ORDER BY r.id, ri.id FOR UPDATE`, [orderId, receiptId, receiptId]
    );
    for (const receipt of receipts) {
      if (receipt.inspection_id && inspectionIds.has(Number(receipt.inspection_id))) continue;
      const line = resolve(receipt.material_id, receipt.order_item_id);
      const quantity = Number(receipt.qualified_quantity ?? receipt.received_quantity ?? 0);
      line.reserved += quantity;
      if (PURCHASE_RECEIPT_COUNTED_STATUSES.includes(receipt.status)) line.received += quantity;
    }
    const [returns] = await connection.query(
      `SELECT ri.order_item_id, ri.material_id, rti.return_quantity
       FROM purchase_return_items rti JOIN purchase_returns rt ON rt.id = rti.return_id
       JOIN purchase_receipt_items ri ON ri.id = rti.receipt_item_id
       JOIN purchase_receipts r ON r.id = ri.receipt_id
       WHERE r.order_id = ? AND r.deleted_at IS NULL AND rt.deleted_at IS NULL AND rt.status = 'completed'
       ORDER BY rt.id, rti.id FOR UPDATE`, [orderId]
    );
    for (const returned of returns) {
      const line = resolve(returned.material_id, returned.order_item_id);
      line.returned += Number(returned.return_quantity);
      line.received -= Number(returned.return_quantity);
      line.reserved -= Number(returned.return_quantity);
    }
    return { lines, resolve };
  }
}

module.exports = PurchaseOrderQuantityService;
