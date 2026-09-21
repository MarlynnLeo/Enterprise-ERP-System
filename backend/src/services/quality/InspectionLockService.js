'use strict';

const { purchaseValidationError } = require('../../utils/purchase/purchaseValidation');
const { resolveInspectionSourceType } = require('../../utils/quality/inspectionSource');

class InspectionLockService {
  static async lockPurchaseOrder(connection, inspection) {
    const sourceType = await resolveInspectionSourceType(connection, inspection);
    if (inspection.inspection_type !== 'incoming' || sourceType !== 'purchase_order') return null;
    const [orders] = await connection.query(
      'SELECT id, order_no, supplier_id, status FROM purchase_orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [inspection.reference_id]
    );
    if (!orders[0]) throw purchaseValidationError('检验单关联的采购订单不存在');
    return orders[0];
  }

  static async getForUpdate(connection, id) {
    const [sources] = await connection.query(
      'SELECT id, inspection_type, source_type, reference_id, reference_no FROM quality_inspections WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!sources[0]) throw purchaseValidationError('检验单不存在', 404);

    // Every purchase mutation takes the order header before an inspection lock.
    // Locking one inspection first can deadlock the order-wide quantity scan.
    await this.lockPurchaseOrder(connection, sources[0]);
    const [inspections] = await connection.query(
      'SELECT * FROM quality_inspections WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );
    const inspection = inspections[0];
    if (!inspection) throw purchaseValidationError('检验单不存在', 404);
    if (
      String(inspection.reference_id ?? '') !== String(sources[0].reference_id ?? '') ||
      inspection.inspection_type !== sources[0].inspection_type ||
      (await resolveInspectionSourceType(connection, inspection)) !==
        (await resolveInspectionSourceType(connection, sources[0]))
    ) {
      throw purchaseValidationError('检验来源已发生变化，请刷新后重试', 409);
    }
    return inspection;
  }
}

module.exports = InspectionLockService;
