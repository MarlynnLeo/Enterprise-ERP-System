exports.up = async function up(knex) {
  await knex.raw(`
    DELETE ws
      FROM wip_snapshots ws
      LEFT JOIN gl_periods gp ON gp.id = ws.period_id
     WHERE gp.id IS NULL
        OR ws.snapshot_date < gp.start_date
        OR ws.snapshot_date > gp.end_date
  `);

  await knex.raw(`
    DELETE ws
      FROM wip_snapshots ws
      JOIN production_tasks pt ON pt.id = ws.task_id
     WHERE pt.status = 'cancelled'
  `);

  await knex.raw(`
    DELETE ws
      FROM wip_snapshots ws
      LEFT JOIN production_tasks pt ON pt.id = ws.task_id
     WHERE pt.id IS NULL
  `);

  await knex.raw(`
    UPDATE gl_entry_items gi
    JOIN gl_entries ge ON ge.id = gi.entry_id
    JOIN production_tasks pt ON pt.id = ge.transaction_id
       SET gi.cost_center_id = pt.cost_center_id
     WHERE ge.transaction_type IN (
       'PRODUCTION_MATERIAL',
       'PRODUCTION_LABOR',
       'PRODUCTION_OVERHEAD',
       'PRODUCTION_COMPLETE'
     )
       AND COALESCE(ge.is_reversed, 0) = 0
       AND gi.cost_center_id IS NULL
       AND pt.cost_center_id IS NOT NULL
  `);

  await knex.raw(`
    UPDATE cost_variance_records cv
    JOIN actual_costs ac ON ac.production_order_id = cv.task_id
       SET cv.actual_material_cost = ac.material_cost,
           cv.actual_labor_cost = ac.labor_cost,
           cv.actual_overhead_cost = ac.overhead_cost,
           cv.actual_total_cost = ac.total_cost,
           cv.material_variance = cv.standard_material_cost - ac.material_cost,
           cv.labor_variance = cv.standard_labor_cost - ac.labor_cost,
           cv.overhead_variance = cv.standard_overhead_cost - ac.overhead_cost,
           cv.total_variance = cv.standard_total_cost - ac.total_cost,
           cv.variance_rate = CASE
             WHEN cv.standard_total_cost > 0
             THEN ((cv.standard_total_cost - ac.total_cost) / cv.standard_total_cost) * 100
             ELSE 0
           END,
           cv.is_favorable = CASE
             WHEN (cv.standard_total_cost - ac.total_cost) >= 0 THEN 1
             ELSE 0
           END
  `);
};

exports.down = async function down() {
  // Generated-data repair only; no safe rollback.
};
