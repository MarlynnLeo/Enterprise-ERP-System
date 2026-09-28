'use strict';

const QRZK_TYPES = [
  'screw_inspection',
  'screw_inspection_preview',
  'spring_inspection',
  'spring_inspection_preview',
];

const NEW_JUDGMENT_CELL = `<td class="judgment-cell">
            {{#if result_is_passed}}合格{{else}}{{#if result_is_failed}}不合格{{else}}{{default result "-"}}{{/if}}{{/if}}
          </td>`;

function transformTemplateContent(content) {
  let next = String(content || '');

  // 判定/结果列：只显示单个结果（合格/不合格/其他结果），不再显示选项框如 √合格 □不合格
  next = next.replace(/<td class="judgment-cell">[\s\S]*?<\/td>/g, NEW_JUDGMENT_CELL);

  return next;
}

exports.transformTemplateContent = transformTemplateContent;

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('print_templates'))) return;

  const rows = await knex('print_templates')
    .select('id', 'content')
    .whereIn('template_type', QRZK_TYPES)
    .whereNull('deleted_at');

  for (const row of rows) {
    const updated = transformTemplateContent(row.content);
    if (updated !== row.content) {
      await knex('print_templates').where({ id: row.id }).update({
        content: updated,
        updated_at: knex.fn.now(),
      });
    }
  }
};

exports.down = async function down() {};
exports.config = { transaction: false };
