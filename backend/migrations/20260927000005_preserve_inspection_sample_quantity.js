'use strict';

exports.up = async function up(knex) {
  if (
    (await knex.schema.hasTable('quality_inspections')) &&
    !(await knex.schema.hasColumn('quality_inspections', 'sample_quantity'))
  ) {
    await knex.schema.alterTable('quality_inspections', (table) => {
      table
        .decimal('sample_quantity', 18, 4)
        .nullable()
        .comment('检验时保存的抽样数量；历史未记录时为空，不代表整批数量');
    });
  }

  // Do not backfill inspection evidence from today's standards or batch quantity.
  if (!(await knex.schema.hasTable('print_templates'))) return;
  const rows = await knex('print_templates')
    .select('id', 'content')
    .where({ module: 'quality' })
    .whereNull('deleted_at');
  for (const row of rows) {
    const content = (row.content || '')
      .replace(
        /\{\{\s*default\s+sample_quantity\s+quantity\s*\}\}/g,
        '{{default sample_quantity "未记录"}}'
      )
      .replace(
        /\{\{\s*default\s+sampling_plan\s+"GB\/T 2828\.1 一般检验水平 II"\s*\}\}/g,
        '{{default sampling_plan "待配置"}}'
      );
    if (content !== row.content) {
      await knex('print_templates').where({ id: row.id }).update({
        content,
        updated_at: knex.fn.now(),
      });
    }
  }
};

// Preserve recorded sampling evidence and corrected report semantics on rollback.
exports.down = async function down() {};
exports.config = { transaction: false };
