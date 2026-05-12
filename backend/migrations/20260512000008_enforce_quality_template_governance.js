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

async function normalizeActiveDefaults(knex) {
  const rows = await knex('inspection_templates as it')
    .select('it.id', 'it.inspection_type', 'it.is_default', 'it.priority')
    .count({ item_count: 'tim.id' })
    .leftJoin('template_item_mappings as tim', 'tim.template_id', 'it.id')
    .where('it.status', 'active')
    .where('it.is_general', 1)
    .groupBy('it.id', 'it.inspection_type', 'it.is_default', 'it.priority')
    .orderBy([
      { column: 'it.inspection_type', order: 'asc' },
      { column: 'it.is_default', order: 'desc' },
      { column: 'it.priority', order: 'asc' },
      { column: 'it.id', order: 'desc' },
    ]);

  const rowsByType = new Map();
  rows.forEach((row) => {
    const list = rowsByType.get(row.inspection_type) || [];
    list.push(row);
    rowsByType.set(row.inspection_type, list);
  });

  for (const [inspectionType, templates] of rowsByType.entries()) {
    const candidate = templates.find((template) => Number(template.item_count) > 0);

    await knex('inspection_templates')
      .where({ inspection_type: inspectionType, status: 'active', is_general: 1 })
      .update({ is_default: 0 });

    if (candidate) {
      await knex('inspection_templates')
        .where({ id: candidate.id })
        .update({
          is_default: 1,
          priority: candidate.priority && Number(candidate.priority) > 0 ? candidate.priority : 10,
          updated_at: knex.fn.now(),
        });
    }
  }
}

exports.up = async function up(knex) {
  const hasTemplates = await knex.schema.hasTable('inspection_templates');
  if (!hasTemplates) return;

  await normalizeActiveDefaults(knex);

  const hasDefaultKey = await knex.schema.hasColumn('inspection_templates', 'default_general_template_key');
  if (!hasDefaultKey) {
    await knex.raw(`
      ALTER TABLE inspection_templates
      ADD COLUMN default_general_template_key VARCHAR(32)
      GENERATED ALWAYS AS (
        CASE
          WHEN status = 'active' AND is_general = 1 AND is_default = 1 THEN inspection_type
          ELSE NULL
        END
      ) STORED
    `);
  }

  if (!(await indexExists(knex, 'inspection_templates', 'uk_inspection_templates_active_default_general'))) {
    await knex.raw(
      'CREATE UNIQUE INDEX uk_inspection_templates_active_default_general ON inspection_templates (default_general_template_key)'
    );
  }

  if (!(await indexExists(knex, 'inspection_templates', 'idx_inspection_templates_match'))) {
    await knex.raw(
      'CREATE INDEX idx_inspection_templates_match ON inspection_templates (inspection_type, status, is_general, is_default, priority)'
    );
  }

  if (await knex.schema.hasTable('template_item_mappings')) {
    if (!(await indexExists(knex, 'template_item_mappings', 'idx_template_item_mappings_template'))) {
      await knex.raw('CREATE INDEX idx_template_item_mappings_template ON template_item_mappings (template_id)');
    }
  }
};

exports.down = async function down(knex) {
  if (await indexExists(knex, 'template_item_mappings', 'idx_template_item_mappings_template')) {
    await knex.raw('DROP INDEX idx_template_item_mappings_template ON template_item_mappings');
  }

  if (await indexExists(knex, 'inspection_templates', 'idx_inspection_templates_match')) {
    await knex.raw('DROP INDEX idx_inspection_templates_match ON inspection_templates');
  }

  if (await indexExists(knex, 'inspection_templates', 'uk_inspection_templates_active_default_general')) {
    await knex.raw('DROP INDEX uk_inspection_templates_active_default_general ON inspection_templates');
  }

  if (await knex.schema.hasColumn('inspection_templates', 'default_general_template_key')) {
    await knex.raw('ALTER TABLE inspection_templates DROP COLUMN default_general_template_key');
  }
};
