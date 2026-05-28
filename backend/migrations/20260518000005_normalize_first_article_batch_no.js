async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

exports.up = async function up(knex) {
  if (
    !(await hasTable(knex, 'quality_inspections')) ||
    !(await hasTable(knex, 'production_tasks'))
  ) {
    return;
  }

  await knex.transaction(async (trx) => {
    await trx.raw(`
      UPDATE quality_inspections qi
      JOIN production_tasks pt ON pt.id = qi.task_id
      SET qi.batch_no = CONCAT('B-', REPLACE(pt.code, '-', ''))
      WHERE qi.inspection_type = 'first_article'
        AND pt.code IS NOT NULL
        AND pt.code <> ''
        AND qi.batch_no REGEXP '^B-?PT[0-9]{12}(-[0-9]{6}-[0-9]+)?$'
        AND qi.batch_no <> CONCAT('B-', REPLACE(pt.code, '-', ''))
    `);
  });
};

exports.down = async function down() {
  // Batch-number normalization is intentionally retained.
};
