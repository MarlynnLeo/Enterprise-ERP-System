const { logger } = require('../../utils/logger');
const NonconformingProductService = require('../business/NonconformingProductService');
const PurchaseOrderStatusService = require('../business/PurchaseOrderStatusService');
const PurchaseReceiptService = require('./PurchaseReceiptService');
const {
  isOutsourcedIncomingInspection,
  resolveInspectionSourceType,
} = require('../../utils/quality/inspectionSource');

const {
  isTerminalInspectionStatus,
  normalizeTerminalInspectionQuantities,
} = require('../../utils/quality/inspectionQuantities');

class InspectionClosureService {
  static isTerminalStatus(status) {
    return isTerminalInspectionStatus(status);
  }

  static normalizeTerminalQuantities(inspection, updateData = {}) {
    return normalizeTerminalInspectionQuantities(inspection, updateData);
  }

  static async closeIfTerminal(originalInspection, updateData, connection) {
    const inspection = {
      ...originalInspection,
      ...updateData,
      id: updateData.id || originalInspection.id,
    };

    if (!this.isTerminalStatus(inspection.status)) {
      return {};
    }

    // A status transition may infer an all-pass/all-fail disposition. Replaying
    // an already closed inspection must use its stored quantities as evidence.
    const quantityInput = this.isTerminalStatus(originalInspection.status)
      ? {
          qualified_quantity: inspection.qualified_quantity,
          unqualified_quantity: inspection.unqualified_quantity,
        }
      : updateData;
    const { inspectionQuantity, qualifiedQuantity, unqualifiedQuantity } =
      this.normalizeTerminalQuantities(inspection, quantityInput);
    const result = {
      qualified_quantity: qualifiedQuantity,
      unqualified_quantity: unqualifiedQuantity,
    };

    inspection.qualified_quantity = qualifiedQuantity;
    inspection.unqualified_quantity = unqualifiedQuantity;
    inspection.quantity = inspectionQuantity;

    // 新记录直接读取 source_type；对旧记录按委外入库单号/ID识别并回填，
    // 防止历史 NULL 来源再次误走采购订单闭环。
    inspection.source_type = await resolveInspectionSourceType(connection, inspection, {
      persist: true,
    });

    if (inspection.id) {
      await connection.query(
        `UPDATE quality_inspections
         SET qualified_quantity = ?,
             unqualified_quantity = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [qualifiedQuantity, unqualifiedQuantity, inspection.id]
      );
    }

    // 委外入库到货生成的 incoming 检验只负责放行委外入库单，
    // 不得回写采购订单或自动创建采购入库单。
    const isOutsourcedIncoming = isOutsourcedIncomingInspection(inspection);

    if (inspection.inspection_type === 'incoming' && !isOutsourcedIncoming) {
      await PurchaseOrderStatusService.handleInspectionComplete(
        {
          inspection_id: inspection.id,
          purchase_order_item_id: inspection.purchase_order_item_id,
          reference_type: 'purchase_order',
          reference_id: inspection.reference_id,
          material_id: inspection.material_id || inspection.product_id,
          quantity: inspectionQuantity,
          qualified_quantity: qualifiedQuantity,
          unqualified_quantity: unqualifiedQuantity,
        },
        connection
      );
    }

    if (unqualifiedQuantity > 0) {
      await NonconformingProductService.autoCreateFromInspection(inspection, connection);
      logger.info(`Auto-created or verified NCP for inspection ${inspection.inspection_no}`);
    }

    if (inspection.inspection_type === 'incoming' && !isOutsourcedIncoming) {
      const receiptResult = await PurchaseReceiptService.autoCreateFromInspection(
        inspection,
        originalInspection,
        connection
      );

      if (!receiptResult) return result;
      result.receipt_auto_created = !receiptResult.existed;
      result.receipt_id = receiptResult.receiptId;
      result.receipt_no = receiptResult.receiptNo;
      result.receipt_existed = Boolean(receiptResult.existed);
      logger.info(
        `Auto-created or verified purchase receipt ${receiptResult.receiptNo} for inspection ${inspection.inspection_no}`
      );
    }

    return result;
  }
}

module.exports = InspectionClosureService;
