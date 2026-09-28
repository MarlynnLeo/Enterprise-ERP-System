'use strict';

/**
 * 20260927000015_remove_inspection_basis_row_from_qrzk_templates.js
 * @description 删除 QRZK-17-01 零件检验记录单模板中的“检验依据：按检验标准/图纸”整行单元格
 */

const QRZK_TYPES = [
  'screw_inspection',
  'screw_inspection_preview',
  'spring_inspection',
  'spring_inspection_preview',
];

const TARGET_ROW = '\n        <tr><td colspan="6" class="full">检验依据：{{default inspection_basis "按检验标准/图纸"}}</td></tr>';
const REGEX_FALLBACK = /\s*<tr>\s*<td[^>]*class="full"[^>]*>检验依据：[\s\S]*?<\/td>\s*<\/tr>/g;

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('print_templates'))) return;

  const rows = await knex('print_templates')
    .select('id', 'content')
    .whereIn('template_type', QRZK_TYPES)
    .whereNull('deleted_at');

  for (const row of rows) {
    if (!row.content || !row.content.includes('检验依据')) continue;
    let next = row.content;
    if (next.includes(TARGET_ROW)) {
      next = next.replace(TARGET_ROW, '');
    } else {
      next = next.replace(REGEX_FALLBACK, '');
    }

    if (next !== row.content) {
      await knex('print_templates')
        .where('id', row.id)
        .update({
          content: next,
          updated_at: knex.fn.now(),
        });
    }
  }
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('print_templates'))) return;

  const rows = await knex('print_templates')
    .select('id', 'content')
    .whereIn('template_type', QRZK_TYPES)
    .whereNull('deleted_at');

  const SAMPLING_PLAN_ROW = '<tr><td colspan="6" class="full">抽样方案：';
  const RESTORE_SNIPPET = '<tr><td colspan="6" class="full">检验依据：{{default inspection_basis "按检验标准/图纸"}}</td></tr>\n        <tr><td colspan="6" class="full">抽样方案：';

  for (const row of rows) {
    if (!row.content || row.content.includes('检验依据')) continue;
    if (row.content.includes(SAMPLING_PLAN_ROW)) {
      const next = row.content.replace(SAMPLING_PLAN_ROW, RESTORE_SNIPPET);
      await knex('print_templates')
        .where('id', row.id)
        .update({
          content: next,
          updated_at: knex.fn.now(),
        });
    }
  }
};
