async function indexExists(knex, tableName, indexName) {
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

async function normalizeActiveGeneralTemplates(knex) {
  const rows = await knex('inspection_templates as it')
    .select('it.id', 'it.inspection_type', 'it.template_name', 'it.is_default', 'it.priority')
    .count({ item_count: 'tim.id' })
    .leftJoin('template_item_mappings as tim', 'tim.template_id', 'it.id')
    .where('it.status', 'active')
    .where('it.is_general', 1)
    .groupBy('it.id', 'it.inspection_type', 'it.template_name', 'it.is_default', 'it.priority')
    .orderBy([
      { column: 'it.inspection_type', order: 'asc' },
      { column: 'it.is_default', order: 'desc' },
      { column: 'it.priority', order: 'asc' },
      { column: 'it.id', order: 'desc' },
    ]);

  const rowsByType = new Map();
  rows.forEach((row) => {
    const templates = rowsByType.get(row.inspection_type) || [];
    templates.push(row);
    rowsByType.set(row.inspection_type, templates);
  });

  for (const [inspectionType, templates] of rowsByType.entries()) {
    const keeper = templates.find((template) => Number(template.item_count) > 0);

    await knex('inspection_templates')
      .where({ inspection_type: inspectionType, status: 'active', is_general: 1 })
      .update({
        status: 'inactive',
        is_default: 0,
        updated_at: knex.fn.now(),
      });

    if (keeper) {
      await knex('inspection_templates')
        .where({ id: keeper.id })
        .update({
          status: 'active',
          is_default: 1,
          priority: keeper.priority && Number(keeper.priority) > 0 ? keeper.priority : 10,
          updated_at: knex.fn.now(),
        });
    }
  }
}

async function renameNoisyIncomingSpecificTemplates(knex) {
  await knex.raw(`
    UPDATE inspection_templates it
    JOIN materials m ON m.id = it.material_type
    SET it.template_name = CONCAT('IQC-', m.code, '-', m.name, '-A'),
        it.updated_at = NOW()
    WHERE it.inspection_type = 'incoming'
      AND it.is_general = 0
      AND it.status IN ('active', 'inactive', 'draft')
      AND (
        it.template_name IN ('测试', 'test')
        OR it.template_name = m.code
      )
  `);
}

async function clearMismatchedRuleTemplates(knex) {
  if (await knex.schema.hasTable('first_article_rules')) {
    await knex.raw(`
      UPDATE first_article_rules far
      JOIN inspection_templates it ON it.id = far.template_id
      SET far.template_id = NULL,
          far.updated_at = NOW()
      WHERE far.template_id IS NOT NULL
        AND it.inspection_type <> 'first_article'
    `);
  }

  if (await knex.schema.hasTable('process_inspection_rules')) {
    await knex.raw(`
      UPDATE process_inspection_rules pir
      JOIN inspection_templates it ON it.id = pir.template_id
      SET pir.template_id = NULL,
          pir.updated_at = NOW()
      WHERE pir.template_id IS NOT NULL
        AND it.inspection_type <> 'process'
    `);
  }
}

exports.up = async function up(knex) {
  const hasTemplates = await knex.schema.hasTable('inspection_templates');
  if (!hasTemplates) return;

  await renameNoisyIncomingSpecificTemplates(knex);
  await normalizeActiveGeneralTemplates(knex);
  await clearMismatchedRuleTemplates(knex);

  const hasActiveGeneralKey = await knex.schema.hasColumn(
    'inspection_templates',
    'active_general_template_key'
  );
  if (!hasActiveGeneralKey) {
    await knex.raw(`
      ALTER TABLE inspection_templates
      ADD COLUMN active_general_template_key VARCHAR(32)
      GENERATED ALWAYS AS (
        CASE
          WHEN status = 'active' AND is_general = 1 THEN inspection_type
          ELSE NULL
        END
      ) STORED
    `);
  }

  if (!(await indexExists(knex, 'inspection_templates', 'uk_inspection_templates_active_general'))) {
    await knex.raw(
      'CREATE UNIQUE INDEX uk_inspection_templates_active_general ON inspection_templates (active_general_template_key)'
    );
  }
};

exports.down = async function down(knex) {
  if (await indexExists(knex, 'inspection_templates', 'uk_inspection_templates_active_general')) {
    await knex.raw('DROP INDEX uk_inspection_templates_active_general ON inspection_templates');
  }

  if (await knex.schema.hasColumn('inspection_templates', 'active_general_template_key')) {
    await knex.raw('ALTER TABLE inspection_templates DROP COLUMN active_general_template_key');
  }
};
