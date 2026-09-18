'use strict';

const { purchaseValidationError, purchaseQuantity } = require('../../utils/purchase/purchaseValidation');
const PurchaseOrderQuantityService = require('./PurchaseOrderQuantityService');
const { normalizeTaxRate } = require('../../utils/money');

class PurchaseReceiptValidationService {
  static async validateItems(connection, { orderId, supplierId, inspectionId = null, receiptId = null, items }) {
    if (!Array.isArray(items) || items.length === 0) throw purchaseValidationError('采购收货单必须包含至少一条明细');
    const [orders] = await connection.query('SELECT id, status, supplier_id FROM purchase_orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [orderId]);
    const order = orders[0];
    if (!order) throw purchaseValidationError('采购订单不存在', 404);
    if (!['approved', 'confirmed', 'received', 'partial_received', 'inspecting', 'inspected', 'warehousing', 'completed'].includes(order.status)) {
      throw purchaseValidationError('采购订单尚未审批通过或已取消，不能收货');
    }
    if (Number(supplierId) !== Number(order.supplier_id)) throw purchaseValidationError('收货供应商与采购订单不一致');

    const allocation = await PurchaseOrderQuantityService.read(connection, orderId, { receiptId, inspectionId });
    const resolveLine = item => allocation.resolve(item.material_id, item.order_item_id).item;
    const used = new Map([...allocation.lines].map(([id, line]) => [id, line.reserved]));
    const addUsed = (lineId, quantity) => used.set(Number(lineId), (used.get(Number(lineId)) || 0) + Number(quantity || 0));

    let inspection;
    if (inspectionId) {
      const [inspections] = await connection.query('SELECT id, inspection_type, source_type, reference_id, material_id, purchase_order_item_id, quantity, qualified_quantity, status, batch_no FROM quality_inspections WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [inspectionId]);
      inspection = inspections[0];
      if (!inspection || inspection.inspection_type !== 'incoming' || inspection.source_type === 'outsourced_receipt' || Number(inspection.reference_id) !== Number(orderId)) throw purchaseValidationError('来料检验单与采购订单不匹配');
      if (!['passed', 'partial', 'completed'].includes(inspection.status)) throw purchaseValidationError('来料检验尚未放行，不能收货');
    }

    const normalized = [];
    let inspectionQualified = 0;
    let inspectionReceived = 0;
    for (const [index, item] of items.entries()) {
      if (!item || typeof item !== 'object') throw purchaseValidationError('收货明细无效');
      const source = { ...item, material_id: item.material_id ?? item.materialId, order_item_id: item.order_item_id ?? item.orderItemId };
      const line = resolveLine(source);
      const received = purchaseQuantity(item.received_quantity ?? item.receivedQuantity ?? item.quantity, `第${index + 1}行收货数量`);
      const qualified = purchaseQuantity(item.qualified_quantity ?? item.qualifiedQuantity ?? received, `第${index + 1}行合格数量`, { allowZero: true });
      if (qualified > received + 0.0001) throw purchaseValidationError('合格数量不能超过收货数量');
      const price = purchaseQuantity(item.price ?? item.unitPrice ?? line.price, `第${index + 1}行采购单价`);
      addUsed(line.id, qualified);
      if ((used.get(Number(line.id)) || 0) > Number(line.quantity) + 0.0001) throw purchaseValidationError(`收货数量超过采购订单剩余数量：物料${line.material_id}`);
      if (inspection) {
        if (Number(line.material_id) !== Number(inspection.material_id) || (inspection.purchase_order_item_id && Number(line.id) !== Number(inspection.purchase_order_item_id))) throw purchaseValidationError('收货明细不属于所选检验单');
        inspectionReceived += received;
        inspectionQualified += qualified;
        if (inspectionQualified > Number(inspection.qualified_quantity) + 0.0001) throw purchaseValidationError('累计合格入库数量超过检验合格数量');
        if (inspectionReceived > Number(inspection.quantity) + 0.0001) throw purchaseValidationError('收货数量超过检验数量');
      }
      normalized.push({ ...source, order_item_id: line.id, material_id: line.material_id, unit_id: item.unit_id ?? item.unitId ?? line.unit_id,
        quantity: received, received_quantity: received, qualified_quantity: qualified, price,
        tax_rate: normalizeTaxRate(item.tax_rate ?? item.taxRate ?? line.tax_rate, 0),
        batch_number: inspection?.batch_no || item.batch_number || item.batchNumber || null });
    }
    return normalized;
  }
}

module.exports = PurchaseReceiptValidationService;
