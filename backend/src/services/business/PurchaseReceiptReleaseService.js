'use strict';

const {
  purchaseQuantity,
  purchaseValidationError,
} = require('../../utils/purchase/purchaseValidation');
const {
  normalizeTerminalInspectionQuantities,
} = require('../../utils/quality/inspectionQuantities');
const PurchaseOrderQuantityService = require('./PurchaseOrderQuantityService');

const EPSILON = 0.0001;
const ORDER_STATUSES = new Set([
  'approved',
  'confirmed',
  'received',
  'partial_received',
  'inspecting',
  'inspected',
  'warehousing',
  'completed',
]);

/** Authorizes release of rejected stock without changing the inspection verdict. */
class PurchaseReceiptReleaseService {
  // Concession approval and receipt completion use the same order-first lock
  // as arrivals and replacement deliveries, so they cannot spend one allowance.
  static async lockConcessionOrder(connection, ncpId) {
    const [[source]] = await connection.query(
      `SELECT qi.reference_id, qi.inspection_type, qi.source_type
         FROM nonconforming_products ncp
         JOIN quality_inspections qi ON qi.id = ncp.inspection_id
        WHERE ncp.id = ? AND ncp.deleted_at IS NULL AND qi.deleted_at IS NULL`,
      [ncpId]
    );
    if (
      source?.inspection_type === 'incoming' &&
      ['', 'purchase_order'].includes(source.source_type || '') &&
      source.reference_id
    ) {
      await connection.query('SELECT id FROM purchase_orders WHERE id = ? FOR UPDATE', [
        source.reference_id,
      ]);
    }
  }

  static async readContext(connection, ncpId, receiptId = null) {
    await this.lockConcessionOrder(connection, ncpId);
    const [[ncp]] = await connection.query(
      `SELECT * FROM nonconforming_products WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [ncpId]
    );
    if (
      !ncp ||
      ncp.concession_status !== 'approved' ||
      ncp.disposition !== 'use_as_is' ||
      ncp.status === 'cancelled'
    ) {
      throw purchaseValidationError('让步收货必须关联已批准的特采处置单');
    }
    const [[inspection]] = await connection.query(
      `SELECT * FROM quality_inspections WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [ncp.inspection_id]
    );
    if (
      !inspection ||
      inspection.inspection_type !== 'incoming' ||
      !['', 'purchase_order'].includes(inspection.source_type || '') ||
      Number(inspection.material_id) !== Number(ncp.material_id) ||
      (ncp.batch_no && ncp.batch_no !== inspection.batch_no)
    ) {
      throw purchaseValidationError('特采处置单与原采购来料检验不匹配');
    }
    // Pass the stored fields explicitly: an old verdict with missing quantities
    // cannot invent a rejected-stock allowance.
    if (inspection.qualified_quantity == null || inspection.unqualified_quantity == null) {
      throw purchaseValidationError('特采来源检验缺少明确的合格与不合格数量');
    }
    const quantities = normalizeTerminalInspectionQuantities(inspection, inspection);
    const ncpQuantity = purchaseQuantity(ncp.quantity, '不合格品数量');
    if (ncpQuantity > quantities.unqualifiedQuantity + EPSILON) {
      throw purchaseValidationError('特采数量超过来源检验不合格数量');
    }
    const [[order]] = await connection.query(
      `SELECT po.*, s.name AS supplier_name FROM purchase_orders po
         LEFT JOIN suppliers s ON s.id = po.supplier_id AND s.deleted_at IS NULL
        WHERE po.id = ? AND po.deleted_at IS NULL FOR UPDATE`,
      [inspection.reference_id]
    );
    if (
      !order ||
      !ORDER_STATUSES.has(order.status) ||
      Number(ncp.supplier_id) !== Number(order.supplier_id) ||
      (inspection.supplier_id && Number(inspection.supplier_id) !== Number(order.supplier_id))
    ) {
      throw purchaseValidationError('特采来源采购订单或供应商无效');
    }
    const [items] = await connection.query(
      `SELECT * FROM purchase_order_items WHERE order_id = ? AND material_id = ?
        AND (? IS NULL OR id = ?) ORDER BY id FOR UPDATE`,
      [
        order.id,
        ncp.material_id,
        inspection.purchase_order_item_id || null,
        inspection.purchase_order_item_id || null,
      ]
    );
    if (items.length !== 1) {
      throw purchaseValidationError('特采检验必须明确关联唯一采购订单明细');
    }
    const orderItem = items[0];
    purchaseQuantity(orderItem.price, '特采采购单价');

    const [allocations] = await connection.query(
      `SELECT DISTINCT r.id AS receipt_id, ri.id AS item_id, ri.qualified_quantity,
              ri.material_id, ri.order_item_id, r.inspection_id, dl.source_id AS ncp_id,
              source.inspection_id AS source_inspection_id
         FROM document_links dl
         JOIN nonconforming_products source ON source.id = dl.source_id
         JOIN purchase_receipts r ON r.id = dl.target_id
         JOIN purchase_receipt_items ri ON ri.receipt_id = r.id
        WHERE dl.source_type = 'nonconforming_product' AND dl.target_type = 'purchase_receipt'
          AND dl.link_type = 'generate' AND source.disposition = 'use_as_is'
          AND r.deleted_at IS NULL AND r.status <> 'cancelled'
          AND (source.inspection_id = ? OR source.id = ?)
          AND (? IS NULL OR r.id <> ?) ORDER BY r.id, ri.id FOR UPDATE`,
      [inspection.id, ncp.id, receiptId, receiptId]
    );
    let ncpAllocated = 0;
    let inspectionAllocated = 0;
    const seenItems = new Set();
    for (const allocation of allocations) {
      if (
        seenItems.has(Number(allocation.item_id)) ||
        Number(allocation.inspection_id) !== Number(allocation.source_inspection_id) ||
        Number(allocation.material_id) !== Number(ncp.material_id) ||
        Number(allocation.order_item_id) !== Number(orderItem.id)
      ) {
        throw purchaseValidationError('已有特采收货的来源关系不唯一或不一致，请先核对');
      }
      seenItems.add(Number(allocation.item_id));
      const quantity = purchaseQuantity(allocation.qualified_quantity, '已分配特采数量', {
        allowZero: true,
      });
      inspectionAllocated += quantity;
      if (Number(allocation.ncp_id) === Number(ncp.id)) ncpAllocated += quantity;
    }
    const qualifiedQuantityLimit = Math.min(
      ncpQuantity - ncpAllocated,
      quantities.unqualifiedQuantity - inspectionAllocated
    );
    if (qualifiedQuantityLimit < -EPSILON) {
      throw purchaseValidationError('已有特采收货累计数量超过批准或检验不合格数量');
    }
    return {
      kind: 'concession',
      ncpId: ncp.id,
      materialId: ncp.material_id,
      orderItemId: orderItem.id,
      qualifiedQuantityLimit: Math.max(0, qualifiedQuantityLimit),
      ncpAllocatedQuantity: ncpAllocated,
      inspection,
      ncp,
      order,
      orderItem,
    };
  }

  static async prepareConcession(connection, { ncpId, quantity }) {
    const release = await this.readContext(connection, ncpId);
    const requested = purchaseQuantity(quantity, '本次特采数量');
    if (requested > release.qualifiedQuantityLimit + EPSILON) {
      throw purchaseValidationError('累计特采收货数量超过批准数量或检验不合格数量');
    }
    const alreadyHandled = purchaseQuantity(release.ncp.handled_quantity ?? 0, '已处置数量', {
      allowZero: true,
    });
    if (
      Math.max(alreadyHandled, release.ncpAllocatedQuantity) + requested >
      Number(release.ncp.quantity) + EPSILON
    ) {
      throw purchaseValidationError('特采数量超过不合格品尚未处置数量');
    }
    const allocation = await PurchaseOrderQuantityService.read(connection, release.order.id);
    const line = allocation.resolve(release.materialId, release.orderItemId);
    if (line.reserved + requested > Number(line.item.quantity) + EPSILON) {
      throw purchaseValidationError('特采收货超过采购订单剩余数量，请核对已到货的补货批次');
    }
    return { ...release, quantity: requested };
  }

  static async resolveConcession(connection, { receiptId, inspectionId, orderId, supplierId }) {
    if (!receiptId) return null;
    const [links] = await connection.query(
      `SELECT dl.source_id FROM document_links dl
         JOIN nonconforming_products ncp ON ncp.id = dl.source_id
        WHERE dl.source_type = 'nonconforming_product' AND dl.target_type = 'purchase_receipt'
          AND dl.target_id = ? AND dl.link_type = 'generate' AND ncp.disposition = 'use_as_is'
        ORDER BY dl.source_id FOR UPDATE`,
      [receiptId]
    );
    if (links.length === 0) return null;
    if (links.length !== 1) throw purchaseValidationError('特采收货必须有唯一批准处置来源');
    const release = await this.readContext(connection, links[0].source_id, Number(receiptId));
    if (
      Number(release.inspection.id) !== Number(inspectionId) ||
      Number(release.order.id) !== Number(orderId) ||
      Number(release.order.supplier_id) !== Number(supplierId)
    ) {
      throw purchaseValidationError('特采收货与批准处置的检验、订单或供应商不匹配');
    }
    return release;
  }
}

module.exports = PurchaseReceiptReleaseService;
