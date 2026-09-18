'use strict';

exports.up = async function (knex) {
  if (!(await knex.schema.hasColumn('quality_inspections', 'purchase_order_item_id'))) {
    await knex.schema.alterTable('quality_inspections', table => {
      table.integer('purchase_order_item_id').nullable().index();
    });
  }
  // Recover only unambiguous links. Never guess the price/line of repeated materials.
  await knex.raw(`UPDATE quality_inspections qi
    JOIN (SELECT r.inspection_id, MIN(ri.order_item_id) AS order_item_id
      FROM purchase_receipts r JOIN purchase_receipt_items ri ON ri.receipt_id = r.id
      JOIN purchase_order_items poi ON poi.id = ri.order_item_id AND poi.order_id = r.order_id AND poi.material_id = ri.material_id
      WHERE r.inspection_id IS NOT NULL AND r.deleted_at IS NULL
      GROUP BY r.inspection_id HAVING COUNT(DISTINCT ri.order_item_id) = 1) source ON source.inspection_id = qi.id
    SET qi.purchase_order_item_id = source.order_item_id
    WHERE qi.purchase_order_item_id IS NULL AND qi.inspection_type = 'incoming'
      AND COALESCE(qi.source_type, 'purchase_order') IN ('', 'purchase_order')`);
  await knex.raw(`UPDATE quality_inspections qi
    JOIN (SELECT order_id, material_id, MIN(id) AS id FROM purchase_order_items
      GROUP BY order_id, material_id HAVING COUNT(*) = 1) poi
      ON poi.order_id = qi.reference_id AND poi.material_id = qi.material_id
    SET qi.purchase_order_item_id = poi.id
    WHERE qi.purchase_order_item_id IS NULL AND qi.inspection_type = 'incoming'
      AND COALESCE(qi.source_type, 'purchase_order') IN ('', 'purchase_order')`);
  if (!(await knex.schema.hasTable('outsourced_arrival_requests'))) {
    await knex.schema.createTable('outsourced_arrival_requests', table => {
      table.increments('id');
      table.integer('receipt_id').notNullable();
      table.string('idempotency_key', 191).notNullable();
      table.string('payload_hash', 64).notNullable();
      table.json('result_json').notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['receipt_id', 'idempotency_key'], 'uq_outsourced_arrival_request');
    });
  }
};

exports.down = async function () {
  throw new Error('Purchase source links and arrival replay records must be preserved; use a forward migration.');
};
