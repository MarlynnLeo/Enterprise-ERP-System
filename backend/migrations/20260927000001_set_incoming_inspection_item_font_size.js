'use strict';

const TEMPLATE_TYPES = [
  'incoming_inspection',
  'spring_inspection',
  'screw_inspection',
  'spring_inspection_preview',
  'screw_inspection_preview',
];
const STYLE_ID = 'incoming-inspection-item-font-size';
const BODY_ATTRIBUTES = ' data-incoming-inspection-items="22pt" data-print-autofit="false"';
const STYLE = `<style id="${STYLE_ID}">
  .items tbody td {
    font-size: 22pt !important;
    line-height: 1.2;
    white-space: normal !important;
    overflow-wrap: anywhere;
    word-break: normal;
    height: auto;
  }
  .items tbody td * { font-size: inherit !important; }
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
    // Only annotate the item data body; headers and document information keep
    // their original typography and automatic fitting.
    const marked = content.replace(
      /<table\b[^>]*\bclass="[^"]*\bitems\b[^"]*"[^>]*>[\s\S]*?<\/table>/gi,
      (table) => table.replace(/<tbody>/gi, `<tbody${BODY_ATTRIBUTES}>`)
    );
    if (marked === content) return content;
    return marked.includes('</style>')
      ? marked.replace(/<\/style>/i, `</style>\n${STYLE}`)
      : `${marked}\n${STYLE}`;
  });
};

exports.down = async function down(knex) {
  await updateTemplates(knex, (content) => content
    .replace(`\n${STYLE}`, '')
    .replaceAll(BODY_ATTRIBUTES, ''));
};
