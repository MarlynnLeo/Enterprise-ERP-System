'use strict';

const {
  purchaseValidationError,
  purchaseQuantity,
} = require('../../utils/purchase/purchaseValidation');
const PurchaseOrderQuantityService = require('./PurchaseOrderQuantityService');
const { normalizeTaxRate } = require('../../utils/money');
const { INCOMING_INSPECTION_PENDING_STATUSES } = require('../../constants/qualityReceipt');
const {
  isTerminalInspectionStatus,
  normalizeTerminalInspectionQuantities,
} = require('../../utils/quality/inspectionQuantities');

class PurchaseReceiptValidationService {
  static async readInspection(connection, { inspectionId, orderId, allowPending = false }) {
    if (!inspectionId) return null;
    const [[inspection]] = await connection.query(
      `SELECT id, inspection_no, inspection_type, source_type, reference_id, material_id, supplier_id,
              purchase_order_item_id, quantity, qualified_quantity, unqualified_quantity, status, batch_no
         FROM quality_inspections WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [inspectionId]
    );
    if (
      !inspection ||
      inspection.inspection_type !== 'incoming' ||
      !['', 'purchase_order'].includes(inspection.source_type || '') ||
      Number(inspection.reference_id) !== Number(orderId)
    )
      throw purchaseValidationError('来料检验单与采购订单不匹配');
    if (isTerminalInspectionStatus(inspection.status)) {
      if (inspection.qualified_quantity == null || inspection.unqualified_quantity == null)
        throw purchaseValidationError('来料检验缺少明确的合格与不合格数量');
      const quantities = normalizeTerminalInspectionQuantities(inspection, inspection);
      inspection.qualified_quantity = quantities.qualifiedQuantity;
      inspection.unqualified_quantity = quantities.unqualifiedQuantity;
    } else if (!allowPending || !INCOMING_INSPECTION_PENDING_STATUSES.includes(inspection.status)) {
      throw purchaseValidationError('采购收货单必须先完成来料检验，才能入库');
    }
    return inspection;
  }

  static async validateItems(
    connection,
    {
      orderId,
      supplierId,
      inspectionId = null,
      receiptId = null,
      items,
      allowPendingInspection = false,
      releaseContext = null,
    }
  ) {
    if (!Array.isArray(items) || items.length === 0)
      throw purchaseValidationError('采购收货单必须包含至少一条明细');
    if (items.length !== 1)
      throw purchaseValidationError('每张收货单只能对应一条采购订单明细和一个到货批次，请分别建单');
    const [orders] = await connection.query(
      'SELECT id, status, supplier_id FROM purchase_orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [orderId]
    );
    const order = orders[0];
    if (!order) throw purchaseValidationError('采购订单不存在', 404);
    if (
      ![
        'approved',
        'confirmed',
        'received',
        'partial_received',
        'inspecting',
        'inspected',
        'warehousing',
        'completed',
      ].includes(order.status)
    ) {
      throw purchaseValidationError('采购订单尚未审批通过或已取消，不能收货');
    }
    if (Number(supplierId) !== Number(order.supplier_id))
      throw purchaseValidationError('收货供应商与采购订单不一致');

    const allocation = await PurchaseOrderQuantityService.read(connection, orderId, {
      receiptId,
      inspectionId: releaseContext ? null : inspectionId,
    });
    const resolveLine = (item) => allocation.resolve(item.material_id, item.order_item_id).item;
    const used = new Map([...allocation.lines].map(([id, line]) => [id, line.reserved]));
    const addUsed = (lineId, quantity) =>
      used.set(Number(lineId), (used.get(Number(lineId)) || 0) + Number(quantity || 0));

    const inspection = await this.readInspection(connection, {
      inspectionId,
      orderId,
      allowPending: allowPendingInspection,
    });
    const terminal = inspection && isTerminalInspectionStatus(inspection.status);
    if (inspection && Number(inspection.supplier_id) !== Number(order.supplier_id))
      throw purchaseValidationError('来料检验供应商与采购订单不一致');
    if (inspection && !String(inspection.batch_no || '').trim())
      throw purchaseValidationError('来料检验缺少可追溯批次，不能关联收货单');

    const normalized = [];
    let inspectionQualified = 0;
    let inspectionReceived = 0;
    for (const [index, item] of items.entries()) {
      if (!item || typeof item !== 'object') throw purchaseValidationError('收货明细无效');
      const source = {
        ...item,
        material_id: item.material_id ?? item.materialId,
        order_item_id: item.order_item_id ?? item.orderItemId,
      };
      const line = resolveLine(source);
      const received = purchaseQuantity(
        item.received_quantity ?? item.receivedQuantity ?? item.quantity,
        `第${index + 1}行收货数量`
      );
      const qualified = purchaseQuantity(
        item.qualified_quantity ??
          item.qualifiedQuantity ??
          (allowPendingInspection && !terminal ? 0 : received),
        `第${index + 1}行合格数量`,
        { allowZero: true }
      );
      if (allowPendingInspection && !terminal && qualified !== 0)
        throw purchaseValidationError('未完成检验的收货单合格数量必须为0');
      if (qualified > received + 0.0001) throw purchaseValidationError('合格数量不能超过收货数量');
      const price = purchaseQuantity(
        item.price ?? item.unitPrice ?? line.price,
        `第${index + 1}行采购单价`
      );
      addUsed(line.id, terminal ? qualified : received);
      if ((used.get(Number(line.id)) || 0) > Number(line.quantity) + 0.0001)
        throw purchaseValidationError(
          `收货数量超过采购订单剩余数量：物料${line.item?.material_code || '所选物料'}`
        );
      if (inspection) {
        if (
          Number(line.material_id) !== Number(inspection.material_id) ||
          (inspection.purchase_order_item_id &&
            Number(line.id) !== Number(inspection.purchase_order_item_id))
        )
          throw purchaseValidationError('收货明细不属于所选检验单');
        inspectionReceived += received;
        inspectionQualified += qualified;
        if (
          releaseContext &&
          (Number(line.id) !== Number(releaseContext.orderItemId) ||
            Number(line.material_id) !== Number(releaseContext.materialId))
        )
          throw purchaseValidationError('收货明细与批准特采来源不匹配');
        const releasedQuantity = releaseContext
          ? releaseContext.qualifiedQuantityLimit
          : inspection.qualified_quantity;
        if (terminal && inspectionQualified > Number(releasedQuantity) + 0.0001)
          throw purchaseValidationError(
            releaseContext ? '累计特采入库数量超过批准放行数量' : '累计合格入库数量超过检验合格数量'
          );
        if (inspectionReceived > Number(inspection.quantity) + 0.0001)
          throw purchaseValidationError('收货数量超过检验数量');
        if (!releaseContext && Math.abs(received - Number(inspection.quantity)) > 0.0001)
          throw purchaseValidationError('收货数量必须与关联检验数量一致');
        if (
          terminal &&
          !releaseContext &&
          Math.abs(qualified - Number(inspection.qualified_quantity)) > 0.0001
        )
          throw purchaseValidationError('收货合格数量必须与关联检验结果一致');
      }
      normalized.push({
        ...source,
        order_item_id: line.id,
        material_id: line.material_id,
        unit_id: item.unit_id ?? item.unitId ?? line.unit_id,
        quantity: received,
        received_quantity: received,
        qualified_quantity: qualified,
        price,
        tax_rate: normalizeTaxRate(item.tax_rate ?? item.taxRate ?? line.tax_rate, 0),
        batch_number: inspection?.batch_no || item.batch_number || item.batchNumber || null,
      });
    }
    return normalized;
  }
}

module.exports = PurchaseReceiptValidationService;
