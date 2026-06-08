const businessConfig = require('../../config/businessConfig');
const { logger } = require('../../utils/logger');
const NonconformingProductService = require('../business/NonconformingProductService');
const PurchaseOrderStatusService = require('../business/PurchaseOrderStatusService');
const PurchaseReceiptService = require('./PurchaseReceiptService');

const STATUS = businessConfig.status.inspection;

const TERMINAL_STATUSES = new Set([
  STATUS.PASSED,
  STATUS.FAILED,
  STATUS.PARTIAL,
  STATUS.COMPLETED,
]);

const RECEIPT_STATUSES = new Set([
  STATUS.PASSED,
  STATUS.PARTIAL,
  STATUS.COMPLETED,
]);

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

const createValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
};

class InspectionClosureService {
  static isTerminalStatus(status) {
    return TERMINAL_STATUSES.has(status);
  }

  static normalizeTerminalQuantities(inspection, updateData = {}) {
    const status = inspection.status;
    const inspectionQuantity = toNumber(inspection.quantity);
    let qualifiedQuantity = toNumber(inspection.qualified_quantity);
    let unqualifiedQuantity = toNumber(inspection.unqualified_quantity);
    const hasExplicitQuantity =
      hasOwn(updateData, 'qualified_quantity') || hasOwn(updateData, 'unqualified_quantity');
    const hasStoredQuantity = qualifiedQuantity > 0 || unqualifiedQuantity > 0;

    if (inspectionQuantity <= 0) {
      throw createValidationError('检验数量必须大于0，不能关闭检验单');
    }

    if (!hasExplicitQuantity && !hasStoredQuantity) {
      if (status === STATUS.PASSED || status === STATUS.COMPLETED) {
        qualifiedQuantity = inspectionQuantity;
        unqualifiedQuantity = 0;
      } else if (status === STATUS.FAILED) {
        qualifiedQuantity = 0;
        unqualifiedQuantity = inspectionQuantity;
      }
    }

    if (qualifiedQuantity < 0 || unqualifiedQuantity < 0) {
      throw createValidationError('合格数量和不合格数量不能为负数');
    }

    const totalJudged = qualifiedQuantity + unqualifiedQuantity;
    if (Math.abs(totalJudged - inspectionQuantity) > 0.0001) {
      throw createValidationError(
        `检验数量不一致: 检验数量=${inspectionQuantity}, 合格=${qualifiedQuantity}, 不合格=${unqualifiedQuantity}`
      );
    }

    if (
      (status === STATUS.PASSED || status === STATUS.COMPLETED) &&
      unqualifiedQuantity > 0.0001
    ) {
      throw createValidationError('检验通过时不合格数量必须为0；如有不合格请使用部分合格或不合格状态');
    }

    if (status === STATUS.PARTIAL && (qualifiedQuantity <= 0 || unqualifiedQuantity <= 0)) {
      throw createValidationError('部分合格必须同时包含合格数量和不合格数量');
    }

    return {
      inspectionQuantity,
      qualifiedQuantity,
      unqualifiedQuantity,
    };
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

    const { inspectionQuantity, qualifiedQuantity, unqualifiedQuantity } =
      this.normalizeTerminalQuantities(inspection, updateData);
    const result = {};

    inspection.qualified_quantity = qualifiedQuantity;
    inspection.unqualified_quantity = unqualifiedQuantity;
    inspection.quantity = inspectionQuantity;

    if (inspection.id) {
      await connection.query(
        `UPDATE quality_inspections
         SET qualified_quantity = ?,
             unqualified_quantity = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [qualifiedQuantity, unqualifiedQuantity, inspection.id]
      );
    }

    if (inspection.inspection_type === 'incoming') {
      await PurchaseOrderStatusService.handleInspectionComplete(
        {
          inspection_id: inspection.id,
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

    if (
      inspection.inspection_type === 'incoming' &&
      RECEIPT_STATUSES.has(inspection.status) &&
      qualifiedQuantity > 0
    ) {
      const receiptResult = await PurchaseReceiptService.autoCreateFromInspection(
        inspection,
        originalInspection,
        connection
      );

      result.receipt_auto_created = true;
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
