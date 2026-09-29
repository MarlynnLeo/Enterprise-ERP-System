'use strict';

// Shared by the bounded backfill and its no-database regression tests.
function resolveArrivalQuantity(item, inspections) {
  if (item.arrived_quantity != null) return Number(item.arrived_quantity);
  const arrived = inspections
    .filter(
      (inspection) =>
        inspection.inspection_type === 'incoming' &&
        inspection.source_type === 'outsourced_receipt' &&
        inspection.deleted_at == null &&
        Number(inspection.quantity) > 0 &&
        Number(inspection.reference_id) === Number(item.receipt_id) &&
        String(inspection.reference_no) === String(item.receipt_no) &&
        Number(inspection.material_id || inspection.product_id) === Number(item.product_id)
    )
    .reduce((sum, inspection) => sum + Number(inspection.quantity), 0);
  const actual = Number(item.actual_quantity || 0);
  return arrived + 0.000001 >= actual && arrived <= Number(item.expected_quantity) + 0.000001
    ? Number(arrived.toFixed(6))
    : actual;
}

exports.up = async function up(knex) {
  const table = 'outsourced_processing_receipt_items';
  if (!(await knex.schema.hasColumn(table, 'arrived_quantity'))) {
    await knex.schema.alterTable(table, (t) => {
      t.decimal('arrived_quantity', 18, 6)
        .nullable()
        .comment('原始到货数量，独立于合格入库实收数量');
    });
  }
  // Match both source ID and source number, material and explicit source type.
  // Bound memory and query size even on installations with long receipt histories.
  let cursor = 0;
  for (;;) {
    const items = await knex({ ri: table })
      .join({ r: 'outsourced_processing_receipts' }, 'r.id', 'ri.receipt_id')
      .select(
        'ri.id',
        'ri.receipt_id',
        'r.receipt_no',
        'ri.product_id',
        'ri.actual_quantity',
        'ri.expected_quantity',
        'ri.arrived_quantity'
      )
      .whereNull('ri.arrived_quantity')
      .where('ri.id', '>', cursor)
      .orderBy('ri.id')
      .limit(500);
    if (!items.length) break;
    const inspections = await knex('quality_inspections')
      .select(
        'reference_id',
        'reference_no',
        'material_id',
        'product_id',
        'quantity',
        'source_type',
        'inspection_type',
        'deleted_at'
      )
      .whereIn('reference_id', [...new Set(items.map((item) => item.receipt_id))])
      .where({ source_type: 'outsourced_receipt', inspection_type: 'incoming' })
      .whereNull('deleted_at');
    for (const item of items) {
      await knex(table)
        .where({ id: item.id })
        .whereNull('arrived_quantity')
        .update({ arrived_quantity: resolveArrivalQuantity(item, inspections) });
    }
    cursor = items[items.length - 1].id;
  }
};

// Arrival facts must not be discarded by a rollback after the application has used them.
exports.down = async function down() {};
exports.resolveArrivalQuantity = resolveArrivalQuantity;
