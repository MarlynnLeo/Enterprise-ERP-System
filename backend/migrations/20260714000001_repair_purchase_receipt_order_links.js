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
        `Cannot backfill ${ambiguousRows.length} purchase receipt item links without a unique match`
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

    await trx.raw(`
      UPDATE purchase_order_items poi
      LEFT JOIN (
        SELECT pr.order_id, pri.material_id,
               SUM(COALESCE(NULLIF(pri.received_quantity, 0), pri.quantity, pri.qualified_quantity, 0))
                 AS received_quantity
        FROM purchase_receipt_items pri
        JOIN purchase_receipts pr ON pr.id = pri.receipt_id
        WHERE pr.deleted_at IS NULL
          AND pr.status IN ('confirmed', 'completed')
        GROUP BY pr.order_id, pri.material_id
      ) receipts
        ON receipts.order_id = poi.order_id
       AND receipts.material_id = poi.material_id
      LEFT JOIN (
        SELECT qi.reference_id AS order_id, qi.material_id,
               SUM(COALESCE(NULLIF(qi.quantity, 0), qi.qualified_quantity, 0))
                 AS inspected_quantity
        FROM quality_inspections qi
        WHERE qi.inspection_type = 'incoming'
          AND qi.deleted_at IS NULL
          AND qi.status NOT IN ('cancelled', 'rejected')
        GROUP BY qi.reference_id, qi.material_id
      ) inspections
        ON inspections.order_id = poi.order_id
       AND inspections.material_id = poi.material_id
      SET poi.received_quantity = GREATEST(
            COALESCE(receipts.received_quantity, 0),
            COALESCE(inspections.inspected_quantity, 0)
          ),
          poi.updated_at = CURRENT_TIMESTAMP
      WHERE ABS(
        COALESCE(poi.received_quantity, 0)
        - GREATEST(
            COALESCE(receipts.received_quantity, 0),
            COALESCE(inspections.inspected_quantity, 0)
          )
      ) > 0.000001
    `);
  });
};

exports.down = async function down() {
  // These links and quantities are derived from surviving source documents and
  // must not be erased after downstream workflows rely on them.
};
