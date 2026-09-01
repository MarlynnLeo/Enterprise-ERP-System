'use strict';

const db = require('../config/db');

/**
 * Immutable inventory valuation adjustments.
 *
 * The inventory ledger is the quantity and original-cost audit trail. Once a
 * finance posting is locked it must never be rewritten. Recalculation and
 * actual-cost corrections are therefore recorded as append-only adjustments.
 */
class InventoryValuationAdjustmentService {
  static async record(connection, input = {}) {
    if (!connection) throw new Error('库存估值调整必须在数据库事务中调用');
    const ledgerId = Number(input.ledgerId);
    const newUnitCost = Number(input.newUnitCost);
    if (!Number.isInteger(ledgerId) || ledgerId <= 0) {
      throw new Error('库存估值调整缺少有效台账ID');
    }
    if (!Number.isFinite(newUnitCost) || newUnitCost < 0) {
      throw new Error('库存估值调整缺少有效新成本');
    }

    const ledgerQueryResult = await connection.execute(
      `SELECT il.id, il.posting_document_id, il.quantity, il.unit_cost,
              (
                SELECT iva.new_unit_cost
                  FROM inventory_valuation_adjustments iva
                 WHERE iva.ledger_id = il.id
                 ORDER BY iva.id DESC
                 LIMIT 1
              ) AS effective_unit_cost
         FROM inventory_ledger
         AS il
        WHERE il.id = ?
        FOR UPDATE`,
      [ledgerId]
    );
    const ledger = Array.isArray(ledgerQueryResult?.[0])
      ? ledgerQueryResult[0][0]
      : input.ledgerSnapshot;
    if (!ledger) throw new Error(`库存台账不存在: ${ledgerId}`);

    const oldUnitCost = Number(ledger.effective_unit_cost ?? ledger.unit_cost ?? 0);
    const quantity = Number(ledger.quantity || 0);
    const valueDelta = Number(
      (Math.sign(quantity || 1) * Math.abs(quantity) * (newUnitCost - oldUnitCost)).toFixed(6)
    );
    if (Math.abs(valueDelta) <= 0.000001 && Math.abs(newUnitCost - oldUnitCost) <= 0.000001) {
      return { skipped: true, ledgerId, oldUnitCost, newUnitCost, valueDelta: 0 };
    }

    const [result] = await connection.execute(
      `INSERT INTO inventory_valuation_adjustments (
         ledger_id, posting_document_id, adjustment_type,
         old_unit_cost, new_unit_cost, value_delta,
         reason, actor_id, actor_label, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        ledgerId,
        input.postingDocumentId ?? ledger.posting_document_id ?? null,
        input.adjustmentType || 'cost_recalculation',
        oldUnitCost,
        newUnitCost,
        valueDelta,
        String(input.reason || '库存估值调整'),
        input.actorId ?? null,
        input.actorLabel || 'system',
      ]
    );
    return {
      adjustmentId: result.insertId,
      ledgerId,
      oldUnitCost,
      newUnitCost,
      valueDelta,
    };
  }

  static async getEffectiveUnitCost(connection = db.pool, ledgerId) {
    const [[row]] = await connection.execute(
      `SELECT il.unit_cost,
              COALESCE((
                SELECT iva.new_unit_cost
                  FROM inventory_valuation_adjustments iva
                 WHERE iva.ledger_id = il.id
                 ORDER BY iva.id DESC
                 LIMIT 1
              ), il.unit_cost) AS effective_unit_cost
         FROM inventory_ledger il
        WHERE il.id = ?`,
      [ledgerId]
    );
    return row ? Number(row.effective_unit_cost || row.unit_cost || 0) : null;
  }
}

module.exports = InventoryValuationAdjustmentService;
