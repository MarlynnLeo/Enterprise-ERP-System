'use strict';

const TEMPLATE_TYPES = [
  'spring_inspection',
  'screw_inspection',
  'spring_inspection_preview',
  'screw_inspection_preview',
];
const STYLE_ID = 'incoming-inspection-meta-label-width';
const STYLE = `<style id="${STYLE_ID}">
  /* Five 10pt Chinese characters, plus horizontal padding and borders. */
  table.meta col:nth-child(odd) { width: calc(50pt + 12px) !important; }
  table.meta col:nth-child(even) { width: auto !important; }
  table.meta th, table.meta td { width: auto !important; }
  table.meta th {
    white-space: nowrap !important;
    overflow-wrap: normal !important;
    word-break: normal !important;
    padding-left: 5px;
    padding-right: 5px;
  }
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
    return /<\/style>/i.test(content)
      ? content.replace(/<\/style>/i, `</style>\n${STYLE}`)
      : `${content}\n${STYLE}`;
  });
};

exports.down = async function down(knex) {
  await updateTemplates(knex, (content) => content.replace(`\n${STYLE}`, ''));
};
