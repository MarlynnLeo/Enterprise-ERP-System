'use strict';

const TEMPLATE_TYPES = [
  'incoming_inspection',
  'spring_inspection',
  'screw_inspection',
  'spring_inspection_preview',
  'screw_inspection_preview',
];
const STYLE_ID = 'incoming-inspection-meta-font-size';
const TABLE_ATTRIBUTES = ' data-incoming-inspection-meta="10pt" data-print-autofit="false"';
const STYLE = `<style id="${STYLE_ID}">
  .meta th, .meta td {
    font-size: 10pt !important;
    line-height: 1.3;
    white-space: normal !important;
    overflow-wrap: anywhere;
    word-break: normal;
    height: auto !important;
  }
  .meta th *, .meta td * { font-size: inherit !important; }
</style>`;

async function updateTemplates(knex, transform) {
  if (!(await knex.schema.hasTable('print_templates'))) return;
  const rows = await knex('print_templates')
    .select('id', 'content')
    .where({ module: 'quality' })
    .whereIn('template_type', TEMPLATE_TYPES)
    .whereNull('deleted_at');

  for (const row of rows) {
    const content = transform(row.content || '');
    if (content !== row.content) {
      await knex('print_templates').where({ id: row.id }).update({
        content,
        updated_at: knex.fn.now(),
      });
    }
  }
}

exports.up = async function up(knex) {
  await updateTemplates(knex, (content) => {
    if (content.includes(`id="${STYLE_ID}"`)) return content;
    const marked = content.replace(
      /<table\b[^>]*\bclass="[^"]*\bmeta\b[^"]*"[^>]*>/gi,
      (table) => table.replace(/>$/, `${TABLE_ATTRIBUTES}>`)
    );
    if (marked === content) return content;
    return /<\/style>/i.test(marked)
      ? marked.replace(/<\/style>/i, `</style>\n${STYLE}`)
      : `${marked}\n${STYLE}`;
  });
};

exports.down = async function down(knex) {
  await updateTemplates(knex, (content) => content
    .replace(`\n${STYLE}`, '')
    .replaceAll(TABLE_ATTRIBUTES, ''));
};
