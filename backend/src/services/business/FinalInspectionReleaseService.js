'use strict';

const BusinessError = require('../../utils/BusinessError');
const {
  normalizeTerminalInspectionQuantities,
} = require('../../utils/quality/inspectionQuantities');
const invalid = (message) => new BusinessError(message, null, 'VALIDATION_ERROR', 400);

class FinalInspectionReleaseService {
  static async validatePosting(connection, document, lines) {
    if (document.source_type !== 'inbound' || document.posting_kind !== 'movement') return;
    const [[inbound]] = await connection.execute(
      `SELECT * FROM inventory_inbound
        WHERE (id = ? OR (? IS NULL AND inbound_no = ?))
          AND deleted_at IS NULL AND COALESCE(is_deleted, 0) = 0 LIMIT 1 FOR UPDATE`,
      [document.source_id || null, document.source_id || null, document.source_no]
    );
    if (!inbound) throw invalid('库存过账关联入库单不存在');
    if (inbound.inbound_type !== 'production') return;
    if (inbound.status !== 'completed') throw invalid('生产入库单尚未完成或已撤销，不能财务过账');
    await this.validate(
      connection,
      inbound,
      lines.map((line) => ({
        material_id: line.material_id,
        batch_number: line.batch_number,
        quantity: line.signed_quantity,
      }))
    );
  }

  static async validate(connection, inbound, items) {
    if (inbound.inbound_type !== 'production') return;
    if (!inbound.inspection_id)
      throw invalid('生产入库必须关联成品终检放行依据，请从终检单生成入库单');
    const [[inspection]] = await connection.query(
      `SELECT id, inspection_type, status, quantity, qualified_quantity, unqualified_quantity,
              product_id, material_id, batch_no, task_id, reference_id, inspection_no FROM quality_inspections
        WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [inbound.inspection_id]
    );
    if (!inspection || inspection.inspection_type !== 'final') throw invalid('成品终检单不存在');
    if (
      ['production_task', 'production'].includes(inbound.reference_type) &&
      inbound.reference_id &&
      Number(inbound.reference_id) !== Number(inspection.task_id || inspection.reference_id)
    ) {
      throw invalid('生产入库关联任务与终检单不一致');
    }
    inbound.inspection_no = inspection.inspection_no;
    await require('./FinalInspectionReadinessService').validate(connection, inspection);
    const { qualifiedQuantity, unqualifiedQuantity } = normalizeTerminalInspectionQuantities(
      inspection,
      inspection
    );
    const [releases] = await connection.query(
      `SELECT quantity, handled_quantity FROM nonconforming_products
        WHERE inspection_id = ? AND deleted_at IS NULL
          AND disposition = 'use_as_is' AND concession_status = 'approved'
          AND status IN ('processing', 'completed', 'closed') FOR UPDATE`,
      [inspection.id]
    );
    const concession = releases.reduce(
      (sum, row) => sum + Math.min(Number(row.quantity), Number(row.handled_quantity || 0)),
      0
    );
    if (
      !Number.isFinite(concession) ||
      concession < 0 ||
      concession > unqualifiedQuantity + 0.0001
    ) {
      throw invalid('批准让步数量超过原检验不合格数量');
    }
    let requested = 0;
    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw invalid('入库数量必须大于0');
      if (
        Number(item.material_id) !== Number(inspection.product_id || inspection.material_id) ||
        String(item.batch_number || '').trim() !== String(inspection.batch_no || '').trim() ||
        !inspection.batch_no
      ) {
        throw invalid('生产入库产品、批次必须与成品终检一致');
      }
      requested += quantity;
    }
    const [allocations] = await connection.query(
      `SELECT ii.quantity FROM inventory_inbound ib
         JOIN inventory_inbound_items ii ON ii.inbound_id = ib.id
        WHERE (ib.inspection_id = ? OR ib.inspection_no = ?) AND ib.id <> ?
          AND COALESCE(ib.is_deleted, 0) = 0 AND ib.deleted_at IS NULL
          AND ib.status NOT IN ('cancelled', 'reversed') FOR UPDATE`,
      [inspection.id, inspection.inspection_no || null, inbound.id || 0]
    );
    const allocated = allocations.reduce((sum, row) => sum + Number(row.quantity), 0);
    if (
      !Number.isFinite(allocated) ||
      requested + allocated > qualifiedQuantity + concession + 0.0001
    ) {
      throw invalid(
        `累计入库数量不能超过本次终检合格及批准让步数量 ${qualifiedQuantity + concession}`
      );
    }
  }
}

module.exports = FinalInspectionReleaseService;
