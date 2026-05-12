async function ensureGovernanceColumns(knex) {
  const hasTemplates = await knex.schema.hasTable('inspection_templates');
  if (!hasTemplates) return false;

  const hasIsDefault = await knex.schema.hasColumn('inspection_templates', 'is_default');
  const hasPriority = await knex.schema.hasColumn('inspection_templates', 'priority');

  if (!hasIsDefault || !hasPriority) {
    await knex.schema.alterTable('inspection_templates', (table) => {
      if (!hasIsDefault) {
        table.boolean('is_default').notNullable().defaultTo(false).after('is_general').comment('是否默认兜底模板');
      }
      if (!hasPriority) {
        table.integer('priority').notNullable().defaultTo(100).after('is_default').comment('模板匹配优先级，数值越小越优先');
      }
    });
  }

  return true;
}

async function normalizeTemplatePriorities(knex) {
  await knex('inspection_templates').whereNull('priority').update({ priority: 100 });
  await knex('inspection_templates')
    .where({ is_general: 0 })
    .where('priority', 100)
    .update({ priority: 50 });
}

async function selectDefaultGeneralTemplates(knex) {
  const rows = await knex('inspection_templates as it')
    .select('it.inspection_type', 'it.id')
    .leftJoin('template_item_mappings as tim', 'tim.template_id', 'it.id')
    .where('it.status', 'active')
    .where('it.is_general', 1)
    .groupBy('it.id', 'it.inspection_type')
    .havingRaw('COUNT(tim.id) > 0')
    .orderBy([
      { column: 'it.inspection_type', order: 'asc' },
      { column: 'it.is_default', order: 'desc' },
      { column: 'it.priority', order: 'asc' },
      { column: 'it.id', order: 'desc' },
    ]);

  const selectedByType = new Map();
  rows.forEach((row) => {
    if (!selectedByType.has(row.inspection_type)) {
      selectedByType.set(row.inspection_type, row.id);
    }
  });

  for (const [inspectionType, templateId] of selectedByType.entries()) {
    await knex('inspection_templates')
      .where({ inspection_type: inspectionType, is_general: 1 })
      .whereNot({ id: templateId })
      .update({ is_default: 0 });

    await knex('inspection_templates')
      .where({ id: templateId })
      .update({
        is_default: 1,
        priority: 10,
        updated_at: knex.fn.now(),
      });
  }
}

exports.up = async function up(knex) {
  const hasTemplates = await ensureGovernanceColumns(knex);
  if (!hasTemplates) return;

  await normalizeTemplatePriorities(knex);

  const hasMappings = await knex.schema.hasTable('template_item_mappings');
  if (hasMappings) {
    await selectDefaultGeneralTemplates(knex);
  }
};

exports.down = async function down() {
  await Promise.resolve();
};
