exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    await trx.raw(`
      INSERT INTO inventory_ledger (
        material_id, location_id, transaction_type, transaction_no, reference_no, reference_type,
        quantity, before_quantity, after_quantity, unit_id, batch_number, operator, remark,
        created_at, updated_at, transaction_date
      )
      SELECT neg.material_id,
             neg.location_id,
             'stock_repair',
             CONCAT('AUDIT-STOCK-', neg.material_id, '-', neg.location_id, '-', ROW_NUMBER() OVER (ORDER BY neg.material_id, neg.location_id, neg.batch_number)),
             CONCAT('AUDIT-STOCK-', neg.material_id, '-', neg.location_id),
             'inventory_repair',
             -neg.qty,
             0,
             -neg.qty,
             m.unit_id,
             NULLIF(neg.batch_number, ''),
             'system_audit',
             'Release audit negative batch balance repair',
             NOW(),
             NOW(),
             CURDATE()
        FROM (
          SELECT material_id, location_id, COALESCE(batch_number, '') AS batch_number, SUM(quantity) AS qty
            FROM inventory_ledger
           GROUP BY material_id, location_id, COALESCE(batch_number, '')
          HAVING qty < -0.0001
        ) neg
        JOIN materials m ON m.id = neg.material_id
    `);

    await trx.raw(`
      UPDATE production_plans p
      LEFT JOIN (
        SELECT plan_id, SUM(quantity) AS task_qty
          FROM production_tasks
         WHERE deleted_at IS NULL
           AND status <> 'cancelled'
           AND plan_id IS NOT NULL
         GROUP BY plan_id
      ) stats ON stats.plan_id = p.id
         SET p.pushed_quantity = COALESCE(stats.task_qty, 0),
             p.updated_at = NOW()
       WHERE p.deleted_at IS NULL
         AND ABS(COALESCE(p.pushed_quantity, 0) - COALESCE(stats.task_qty, 0)) > 0.0001
    `);
  });
};

exports.down = async function down() {
  // Data repair only. Do not restore residual negative stock or stale pushed quantities.
};
