'use strict';

const TEMPLATE_TYPES = [
  'incoming_inspection',
  'spring_inspection',
  'screw_inspection',
  'spring_inspection_preview',
  'screw_inspection_preview',
];

async function updateItemFontSize(knex, from, to) {
  if (!(await knex.schema.hasTable('print_templates'))) return;
  const rows = await knex('print_templates')
    .select('id', 'content')
    .where({ module: 'quality' })
    .whereIn('template_type', TEMPLATE_TYPES)
    .whereNull('deleted_at');

  for (const row of rows) {
    const content = (row.content || '')
      .replace(
        /<style id="incoming-inspection-item-font-size">[\s\S]*?<\/style>/g,
        (style) => style.replace(`font-size: ${from} !important`, `font-size: ${to} !important`)
      )
      .replaceAll(`data-incoming-inspection-items="${from}"`, `data-incoming-inspection-items="${to}"`);
    if (content !== row.content) {
      await knex('print_templates').where({ id: row.id }).update({
        content,
        updated_at: knex.fn.now(),
      });
    }
  }
}

exports.up = (knex) => updateItemFontSize(knex, '22pt', '10pt');
exports.down = (knex) => updateItemFontSize(knex, '10pt', '22pt');
