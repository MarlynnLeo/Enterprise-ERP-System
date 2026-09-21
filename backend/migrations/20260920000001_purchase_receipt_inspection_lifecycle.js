'use strict';

// This migration owns the historical conversion. Keep its rules frozen rather
// than importing runtime constants, which can change after a deployment.
const RECEIPT_STATUSES = ['draft', 'inspected', 'completed', 'cancelled'];
const PREVIOUS_STATUSES = [...RECEIPT_STATUSES, 'confirmed'];
const EPSILON = 0.0001;

function hasCompletedInspection(row) {
  if (row.inspection_quantity == null || row.inspection_qualified == null || row.inspection_unqualified == null) return false;
  const quantity = Number(row.inspection_quantity);
  const qualified = Number(row.inspection_qualified);
  const unqualified = Number(row.inspection_unqualified);
  if (!Number.isFinite(quantity + qualified + unqualified) || quantity <= 0 || qualified < 0 || unqualified < 0 ||
      Math.abs(qualified + unqualified - quantity) > EPSILON) return false;
  return row.inspection_status === 'completed' ||
    (row.inspection_status === 'passed' && qualified > 0 && unqualified === 0) ||
    (row.inspection_status === 'partial' && qualified > 0 && unqualified > 0) ||
    (row.inspection_status === 'failed' && qualified === 0 && unqualified > 0);
}

// A concession receipt contains approved rejected stock, so its quantity must
// be proved by the disposition chain rather than compared with passed stock.
async function provenConcessionReceiptIds(knex) {
  const [rows] = await knex.raw(`
    SELECT r.id, r.status, r.order_id, r.supplier_id, r.inspection_id,
           ri.id AS item_id, ri.order_item_id, ri.material_id, ri.batch_number,
           ri.quantity, ri.received_quantity, ri.qualified_quantity,
           poi.order_id AS source_order_id, poi.material_id AS source_material_id,
           ncp.id AS ncp_id, ncp.inspection_id AS ncp_inspection_id,
           ncp.material_id AS ncp_material_id, ncp.supplier_id AS ncp_supplier_id,
           ncp.batch_no AS ncp_batch_no, ncp.quantity AS ncp_quantity,
           ncp.status AS ncp_status, ncp.disposition, ncp.concession_status,
           ncp.deleted_at AS ncp_deleted_at,
           qi.deleted_at AS inspection_deleted_at, qi.inspection_type, qi.source_type,
           qi.reference_id, qi.supplier_id AS inspection_supplier_id,
           qi.purchase_order_item_id, qi.material_id AS inspection_material_id, qi.batch_no,
           qi.status AS inspection_status, qi.quantity AS inspection_quantity,
           qi.qualified_quantity AS inspection_qualified, qi.unqualified_quantity AS inspection_unqualified
      FROM purchase_receipts r
      JOIN document_links dl ON dl.target_id = r.id AND dl.target_type = 'purchase_receipt'
        AND dl.source_type = 'nonconforming_product' AND dl.link_type = 'generate'
      LEFT JOIN nonconforming_products ncp ON ncp.id = dl.source_id
      LEFT JOIN purchase_receipt_items ri ON ri.receipt_id = r.id
      LEFT JOIN purchase_order_items poi ON poi.id = ri.order_item_id
      LEFT JOIN quality_inspections qi ON qi.id = r.inspection_id
     WHERE r.deleted_at IS NULL AND r.status <> 'cancelled'
  `);
  const receipts = new Map();
  const totalsByNcp = new Map();
  const totalsByInspection = new Map();
  const counted = new Set();
  for (const row of rows) {
    const group = receipts.get(row.id) || [];
    group.push(row);
    receipts.set(row.id, group);
    const key = `${row.ncp_id}:${row.item_id}`;
    if (counted.has(key) || row.disposition !== 'use_as_is') continue;
    counted.add(key);
    const amount = row.qualified_quantity == null ? NaN : Number(row.qualified_quantity);
    const reserved = Number.isFinite(amount) && amount >= 0 ? amount : Infinity;
    totalsByNcp.set(row.ncp_id, (totalsByNcp.get(row.ncp_id) || 0) + reserved);
    totalsByInspection.set(row.ncp_inspection_id, (totalsByInspection.get(row.ncp_inspection_id) || 0) + reserved);
  }
  const ids = [];
  for (const group of receipts.values()) {
    if (group.length !== 1) continue; // A unique disposition and source line are required.
    const row = group[0];
    const quantity = Number(row.qualified_quantity);
    if (!['draft', 'confirmed'].includes(row.status) || !row.item_id || !row.ncp_id ||
        row.ncp_deleted_at != null || row.inspection_deleted_at != null ||
        row.disposition !== 'use_as_is' || row.concession_status !== 'approved' || row.ncp_status === 'cancelled' ||
        row.inspection_type !== 'incoming' || !['', 'purchase_order'].includes(row.source_type || '') ||
        !hasCompletedInspection(row) ||
        Number(row.ncp_inspection_id) !== Number(row.inspection_id) ||
        Number(row.reference_id) !== Number(row.order_id) || Number(row.source_order_id) !== Number(row.order_id) ||
        Number(row.inspection_supplier_id) !== Number(row.supplier_id) || Number(row.ncp_supplier_id) !== Number(row.supplier_id) ||
        Number(row.material_id) !== Number(row.inspection_material_id) || Number(row.material_id) !== Number(row.ncp_material_id) ||
        Number(row.material_id) !== Number(row.source_material_id) || Number(row.order_item_id) !== Number(row.purchase_order_item_id) ||
        !row.batch_no || !String(row.batch_no).trim() || row.batch_number !== row.batch_no ||
        (row.ncp_batch_no && row.ncp_batch_no !== row.batch_no) ||
        !Number.isFinite(quantity) || quantity <= 0 || row.quantity == null || row.received_quantity == null ||
        Math.abs(Number(row.quantity) - quantity) > EPSILON || Math.abs(Number(row.received_quantity) - quantity) > EPSILON ||
        !(Number(row.ncp_quantity) > 0) || Number(row.ncp_quantity) > Number(row.inspection_unqualified) + EPSILON ||
        totalsByNcp.get(row.ncp_id) > Number(row.ncp_quantity) + EPSILON ||
        totalsByInspection.get(row.inspection_id) > Number(row.inspection_unqualified) + EPSILON) continue;
    ids.push(row.id);
  }
  return ids;
}

exports.up = async function up(knex) {
  // MySQL ALTER TABLE commits implicitly. Reject unknown data before changing
  // the enum so an unexpected status is never truncated to the empty value.
  const unknown = await knex('purchase_receipts')
    .distinct('status')
    .whereNotIn('status', PREVIOUS_STATUSES);
  if (unknown.length) {
    throw new Error('Unknown purchase_receipts.status values; reconcile before migrating');
  }
  // Earlier concession writers omitted the receipt's order-line key. Recover
  // only the explicit inspection source, never a first matching material row.
  await knex.raw(`
    UPDATE purchase_receipt_items ri
    JOIN purchase_receipts r ON r.id = ri.receipt_id
    JOIN quality_inspections qi ON qi.id = r.inspection_id
    JOIN purchase_order_items poi ON poi.id = qi.purchase_order_item_id
    SET ri.order_item_id = poi.id
    WHERE ri.order_item_id IS NULL AND r.status IN ('draft', 'confirmed')
      AND r.deleted_at IS NULL AND qi.deleted_at IS NULL
      AND qi.inspection_type = 'incoming'
      AND COALESCE(qi.source_type, 'purchase_order') IN ('', 'purchase_order')
      AND qi.reference_id = r.order_id AND qi.supplier_id = r.supplier_id
      AND poi.order_id = r.order_id AND poi.material_id = qi.material_id
      AND ri.material_id = qi.material_id AND qi.batch_no IS NOT NULL
      AND TRIM(qi.batch_no) <> '' AND BINARY ri.batch_number = BINARY qi.batch_no
  `);
  const concessionReceiptIds = await provenConcessionReceiptIds(knex);

  await knex.raw(
    "ALTER TABLE purchase_receipts MODIFY COLUMN status ENUM('draft','confirmed','completed','cancelled','inspected') NOT NULL DEFAULT 'draft'"
  );

  // An old confirmation does not prove that a quality inspection took place.
  // Only the explicitly linked, completed inspection can establish inspected.
  // In particular, a failed inspection is completed work but grants no stock.
  // Completed and cancelled receipts retain their recorded business facts.
  await knex.raw(`
    UPDATE purchase_receipts r
    LEFT JOIN quality_inspections qi ON qi.id = r.inspection_id
    LEFT JOIN (
      SELECT receipt_id, COUNT(*) AS line_count, MIN(order_item_id) AS order_item_id,
             MIN(material_id) AS material_id, MIN(batch_number) AS batch_number,
             MIN(quantity) AS quantity, MIN(received_quantity) AS received_quantity,
             MIN(qualified_quantity) AS qualified_quantity
        FROM purchase_receipt_items GROUP BY receipt_id
    ) ri ON ri.receipt_id = r.id
    LEFT JOIN purchase_order_items poi ON poi.id = ri.order_item_id
    SET r.status = CASE WHEN
      qi.deleted_at IS NULL
      AND qi.inspection_type = 'incoming'
      AND COALESCE(qi.source_type, 'purchase_order') IN ('', 'purchase_order')
      AND qi.reference_id = r.order_id
      AND qi.supplier_id = r.supplier_id
      AND ri.line_count = 1
      AND ri.order_item_id = qi.purchase_order_item_id
      AND poi.order_id = r.order_id
      AND poi.material_id = qi.material_id
      AND ri.material_id = qi.material_id
      AND qi.batch_no IS NOT NULL AND TRIM(qi.batch_no) <> ''
      AND BINARY ri.batch_number = BINARY qi.batch_no
      AND ABS(ri.quantity - qi.quantity) <= 0.0001
      AND ABS(ri.received_quantity - qi.quantity) <= 0.0001
      AND ABS(ri.qualified_quantity - qi.qualified_quantity) <= 0.0001
      AND qi.quantity > 0
      AND qi.qualified_quantity IS NOT NULL
      AND qi.unqualified_quantity IS NOT NULL
      AND qi.qualified_quantity >= 0
      AND qi.unqualified_quantity >= 0
      AND ABS(qi.qualified_quantity + qi.unqualified_quantity - qi.quantity) <= 0.0001
      AND (
        (qi.status = 'passed' AND qi.qualified_quantity > 0 AND qi.unqualified_quantity = 0)
        OR (qi.status = 'partial' AND qi.qualified_quantity > 0 AND qi.unqualified_quantity > 0)
        OR (qi.status = 'failed' AND qi.qualified_quantity = 0 AND qi.unqualified_quantity > 0)
        OR qi.status = 'completed'
      )
      AND NOT EXISTS (
        SELECT 1 FROM document_links dl WHERE dl.target_id = r.id
          AND dl.target_type = 'purchase_receipt' AND dl.source_type = 'nonconforming_product'
          AND dl.link_type = 'generate'
      )
      THEN 'inspected' ELSE 'draft' END
    WHERE r.status IN ('draft', 'confirmed')
  `);
  for (let offset = 0; offset < concessionReceiptIds.length; offset += 500) {
    await knex('purchase_receipts')
      .whereIn('id', concessionReceiptIds.slice(offset, offset + 500))
      .whereIn('status', ['draft', 'confirmed'])
      .update({ status: 'inspected' });
  }

  await knex.raw(
    "ALTER TABLE purchase_receipts MODIFY COLUMN status ENUM('draft','inspected','completed','cancelled') NOT NULL DEFAULT 'draft'"
  );

  // The dictionary supplies labels only; it must expose exactly the persisted
  // lifecycle, including on a clean database with no previous dictionary rows.
  const dictionary = [
    ['draft', '草稿', 'info'],
    ['inspected', '已检验', 'primary'],
    ['completed', '已完成', 'success'],
    ['cancelled', '已取消', 'warning'],
  ];
  for (const [index, [code, name, tagType]] of dictionary.entries()) {
    const values = {
      name,
      category: 'status',
      tag_type: tagType,
      sort_order: index + 1,
      is_system: 1,
      status: 1,
      updated_at: knex.fn.now(),
    };
    await knex('business_types')
      .insert({
        ...values,
        code,
        group_code: 'purchase_receipt_status',
        created_at: knex.fn.now(),
      })
      .onConflict(['group_code', 'code'])
      .merge(values);
  }
  await knex('business_types')
    .where('group_code', 'purchase_receipt_status')
    .where('code', 'confirmed')
    .del();
  await knex('business_types')
    .where('group_code', 'purchase_receipt_status')
    .whereNotIn('code', RECEIPT_STATUSES)
    .update({ status: 0 });
};

exports.down = async function down() {
  // The old confirmation cannot be reconstructed from an inspection fact.
  throw new Error('Purchase receipt inspection lifecycle migration is irreversible; use a forward migration or restore a matching database backup');
};
