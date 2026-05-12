exports.up = async function(knex) {
  const hasTemplates = await knex.schema.hasTable('inspection_templates');
  if (!hasTemplates) return;

  const hasMaterialTypes = await knex.schema.hasColumn('inspection_templates', 'material_types');
  if (!hasMaterialTypes) {
    await knex.schema.alterTable('inspection_templates', (table) => {
      table.json('material_types').nullable().after('material_type').comment('适用物料ID列表');
    });
  }

  const hasIsGeneral = await knex.schema.hasColumn('inspection_templates', 'is_general');
  if (!hasIsGeneral) {
    await knex.schema.alterTable('inspection_templates', (table) => {
      table.boolean('is_general').notNullable().defaultTo(false).after('material_types').comment('是否通用模板');
    });
  }
};

exports.down = async function(knex) {
  // No-op: these columns may already exist in deployed databases, so rollback must not
  // drop user data that this migration only aligned with the code model.
  await Promise.resolve();
};
