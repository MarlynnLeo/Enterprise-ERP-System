/** Restore the exact detection-method text encoded in the QRZK paper forms. */

exports.up = async function up(knex) {
  const requiredTables = ['quality_inspections', 'quality_inspection_items', 'template_item_mappings', 'inspection_items'];
  for (const table of requiredTables) {
    if (!(await knex.schema.hasTable(table))) return;
  }

  // The imported QRZK standards keep the paper form's method in a trailing
  // full-width parenthetical, e.g. "符合图纸要求（材料质保书）".
  await knex.raw(`
    UPDATE inspection_items ii
    JOIN template_item_mappings tim ON tim.item_id = ii.id
    SET ii.method = SUBSTRING_INDEX(SUBSTRING_INDEX(ii.standard, '（', -1), '）', 1)
    WHERE tim.template_id IN (64, 65)
      AND ii.standard LIKE '%（%）'
  `);

  await knex.raw(`
    UPDATE quality_inspection_items qii
    JOIN quality_inspections qi ON qi.id = qii.inspection_id
    SET qii.method = SUBSTRING_INDEX(SUBSTRING_INDEX(qii.standard, '（', -1), '）', 1)
    WHERE qi.template_id IN (64, 65)
      AND qii.standard LIKE '%（%）'
  `);
};

exports.down = async function down() {};
