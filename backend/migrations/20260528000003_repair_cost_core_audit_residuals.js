exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    await trx.raw(`
      UPDATE purchase_receipt_items pri
      JOIN purchase_order_items poi ON poi.id = pri.order_item_id
      JOIN purchase_receipts pr ON pr.id = pri.receipt_id
         SET pri.price = poi.price,
             pri.tax_rate = COALESCE(NULLIF(pri.tax_rate, 0), poi.tax_rate, 0),
             pri.amount_excluding_tax = ROUND(COALESCE(pri.quantity, 0) * COALESCE(poi.price, 0), 2),
             pri.tax_amount = ROUND(
               COALESCE(pri.quantity, 0)
               * COALESCE(poi.price, 0)
               * CASE
                   WHEN COALESCE(NULLIF(pri.tax_rate, 0), poi.tax_rate, 0) > 1
                   THEN COALESCE(NULLIF(pri.tax_rate, 0), poi.tax_rate, 0) / 100
                   ELSE COALESCE(NULLIF(pri.tax_rate, 0), poi.tax_rate, 0)
                 END,
               2
             ),
             pri.total_amount = ROUND(
               COALESCE(pri.quantity, 0) * COALESCE(poi.price, 0)
               + COALESCE(pri.quantity, 0)
                 * COALESCE(poi.price, 0)
                 * CASE
                     WHEN COALESCE(NULLIF(pri.tax_rate, 0), poi.tax_rate, 0) > 1
                     THEN COALESCE(NULLIF(pri.tax_rate, 0), poi.tax_rate, 0) / 100
                     ELSE COALESCE(NULLIF(pri.tax_rate, 0), poi.tax_rate, 0)
                   END,
               2
             ),
             pri.updated_at = CURRENT_TIMESTAMP
       WHERE pr.status IN ('confirmed', 'completed')
         AND pr.deleted_at IS NULL
         AND ABS(COALESCE(pri.price, 0) - COALESCE(poi.price, 0)) > 0.05
    `);

    await trx.raw(`
      UPDATE purchase_receipts pr
      JOIN (
        SELECT receipt_id,
               ROUND(COALESCE(SUM(total_amount), 0), 2) AS item_total,
               ROUND(COALESCE(SUM(tax_amount), 0), 2) AS item_tax
          FROM purchase_receipt_items
         GROUP BY receipt_id
      ) totals ON totals.receipt_id = pr.id
         SET pr.total_amount = totals.item_total,
             pr.total_tax_amount = totals.item_tax,
             pr.updated_at = CURRENT_TIMESTAMP
       WHERE pr.deleted_at IS NULL
         AND (
           ABS(COALESCE(pr.total_amount, 0) - totals.item_total) > 0.05
           OR ABS(COALESCE(pr.total_tax_amount, 0) - totals.item_tax) > 0.05
         )
    `);

    await trx.raw(`
      UPDATE inventory_ledger il
      JOIN purchase_receipt_items pri
        ON pri.receipt_id = il.receipt_id
       AND pri.material_id = il.material_id
         SET il.unit_cost = pri.price,
             il.total_value = ROUND(ABS(COALESCE(il.quantity, 0)) * COALESCE(pri.price, 0), 2),
             il.updated_at = CURRENT_TIMESTAMP
       WHERE il.receipt_id IS NOT NULL
         AND (
           ABS(COALESCE(il.unit_cost, 0) - COALESCE(pri.price, 0)) > 0.05
           OR ABS(COALESCE(il.total_value, 0) - ROUND(ABS(COALESCE(il.quantity, 0)) * COALESCE(pri.price, 0), 2)) > 0.05
         )
    `);

    await trx.raw(`
      UPDATE standard_costs
         SET is_active = 0,
             updated_at = CURRENT_TIMESTAMP
       WHERE is_active = 1
         AND status <> 'active'
    `);

    await trx.raw(`
      UPDATE standard_costs
         SET status = 'archived',
             updated_at = CURRENT_TIMESTAMP
       WHERE status = 'active'
         AND COALESCE(is_active, 0) <> 1
    `);

    await trx.raw(`
      UPDATE standard_costs
         SET is_active = 0,
             status = 'archived',
             expiry_date = COALESCE(expiry_date, DATE_SUB(CURDATE(), INTERVAL 1 DAY)),
             updated_at = CURRENT_TIMESTAMP
       WHERE is_active = 1
         AND status = 'active'
         AND COALESCE(standard_price, 0) <= 0
    `);
  });
};

exports.down = async function down() {
  // Historical cost repairs intentionally do not roll back because they restore
  // derived monetary consistency from purchase orders and deactivate invalid costs.
};
