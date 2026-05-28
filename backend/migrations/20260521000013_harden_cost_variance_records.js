async function hasIndex(knex, tableName, indexName) {
  const [rows] = await knex.raw(
    `SELECT 1
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?
      LIMIT 1`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

exports.up = async function up(knex) {
  await knex.raw(`
    DELETE old_cv
      FROM cost_variance_records old_cv
      JOIN cost_variance_records keep_cv
        ON keep_cv.task_id = old_cv.task_id
       AND keep_cv.id > old_cv.id
     WHERE old_cv.task_id IS NOT NULL
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
           END,
           cv.recorded_at = COALESCE(cv.recorded_at, NOW())
  `);

  if (!(await hasIndex(knex, 'cost_variance_records', 'uk_cost_variance_task'))) {
    await knex.raw(
      'ALTER TABLE `cost_variance_records` ADD UNIQUE INDEX `uk_cost_variance_task` (`task_id`)'
    );
  }
};

exports.down = async function down(knex) {
  if (await hasIndex(knex, 'cost_variance_records', 'uk_cost_variance_task')) {
    await knex.raw('ALTER TABLE `cost_variance_records` DROP INDEX `uk_cost_variance_task`');
  }
};
