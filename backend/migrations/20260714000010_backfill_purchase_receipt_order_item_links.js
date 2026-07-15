/**
 * Backfill receipt-line to purchase-order-line links created after the earlier
 * repair migration and before the write path began persisting order_item_id.
 */

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const [ambiguousRows] = await trx.raw(`
      SELECT pri.id
      FROM purchase_receipt_items pri
      JOIN purchase_receipts pr ON pr.id = pri.receipt_id
      LEFT JOIN purchase_order_items poi
        ON poi.order_id = pr.order_id
       AND poi.material_id = pri.material_id
      WHERE pr.deleted_at IS NULL
        AND pr.order_id IS NOT NULL
        AND pri.order_item_id IS NULL
      GROUP BY pri.id
      HAVING COUNT(poi.id) <> 1
    `);

    if (ambiguousRows.length > 0) {
      throw new Error(
        `Cannot backfill ${ambiguousRows.length} purchase receipt item links without a unique order-line match`
      );
    }

    await trx.raw(`
      UPDATE purchase_receipt_items pri
      JOIN purchase_receipts pr ON pr.id = pri.receipt_id
      JOIN (
        SELECT order_id, material_id, MIN(id) AS order_item_id
        FROM purchase_order_items
        GROUP BY order_id, material_id
        HAVING COUNT(*) = 1
      ) matched
        ON matched.order_id = pr.order_id
       AND matched.material_id = pri.material_id
      SET pri.order_item_id = matched.order_item_id,
          pri.updated_at = CURRENT_TIMESTAMP
      WHERE pr.deleted_at IS NULL
        AND pr.order_id IS NOT NULL
        AND pri.order_item_id IS NULL
    `);
  });
};

exports.down = async function down() {
  // Preserve repaired document traceability.
};
