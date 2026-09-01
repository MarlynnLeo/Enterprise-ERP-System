/** Backfill detection methods on existing inspection detail rows from templates. */

exports.up = async function up(knex) {
  const requiredTables = ['quality_inspections', 'quality_inspection_items', 'template_item_mappings', 'inspection_items'];
  for (const table of requiredTables) {
    if (!(await knex.schema.hasTable(table))) return;
  }

  await knex.raw(`
    UPDATE quality_inspection_items qii
    JOIN quality_inspections qi ON qi.id = qii.inspection_id
    JOIN template_item_mappings tim ON tim.template_id = qi.template_id
    JOIN inspection_items ii
      ON ii.id = tim.item_id
     AND ii.item_name = qii.item_name
     AND ii.standard = qii.standard
    SET qii.method = ii.method
    WHERE (qii.method IS NULL OR TRIM(qii.method) = '')
      AND ii.method IS NOT NULL
      AND TRIM(ii.method) <> ''
  `);
};

exports.down = async function down() {};
