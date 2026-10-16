'use strict';

const Precision = require('../../utils/precision');
const { taskSourceSql } = require('./ProductionReturnReversalGuard');
const parse = (value) => {
  try {
    const result = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
};

class ProductionIssueAllocationService {
  static taskSourceSql(alias, placeholders) {
    return taskSourceSql(alias, placeholders);
  }

  /** Divide actual ledger movements by the persisted per-material task issue allocation.
   * Missing historical allocation is deliberately not guessed from task membership.
   */
  static share(items, taskId, supplement = false) {
    let total = 0;
    let selected = 0;
    for (const item of items) {
      for (const source of parse(item.source_tasks)) {
        const quantity = Number(
          supplement
            ? (source.shortage_quantity ?? source.shortageQuantity ?? 0)
            : (source.actual_quantity ?? source.actualQuantity ?? source.quantity)
        );
        if (!Number.isFinite(quantity) || quantity < 0) return 0;
        total += quantity;
        if (
          Number(source.task_id || source.taskId || source.id || source.production_task_id) ===
          Number(taskId)
        )
          selected += quantity;
      }
    }
    return total > 0 ? selected / total : 0;
  }

  static async allocate(connection, movements, taskId) {
    const shared = movements.filter(
      (row) =>
        ['batch_production_tasks', 'production_plan'].includes(row.reference_type) &&
        !row.production_task_id
    );
    const ids = [...new Set(shared.map((row) => row.outbound_id))];
    const [items] = ids.length
      ? await connection.execute(
          `SELECT outbound_id, material_id, source_tasks FROM inventory_outbound_items WHERE outbound_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`,
          ids
        )
      : [[]];
    const buckets = new Map();
    for (const row of movements) {
      const ratio = shared.includes(row)
        ? this.share(
            items.filter(
              (item) =>
                Number(item.outbound_id) === Number(row.outbound_id) &&
                Number(item.material_id) === Number(row.material_id)
            ),
            taskId,
            row.issue_kind === 'outbound_supplement'
          )
        : 1;
      if (ratio <= 0) continue;
      // Round down at stock precision: combined task caps may never exceed actual issue.
      const quantity = Math.floor(Number(row.issued_quantity) * ratio * 1e6 + 1e-8) / 1e6;
      const key = JSON.stringify([row.material_id, row.location_id, row.batch_number]);
      const bucket = buckets.get(key) || { ...row, issued_quantity: 0, issued_value: 0 };
      bucket.issued_quantity = Precision.add(bucket.issued_quantity, quantity);
      bucket.issued_value += quantity * Number(row.unit_cost || 0);
      buckets.set(key, bucket);
    }
    return [...buckets.values()].map((row) => ({
      ...row,
      unit_cost: row.issued_quantity ? row.issued_value / row.issued_quantity : 0,
    }));
  }
}
module.exports = ProductionIssueAllocationService;
