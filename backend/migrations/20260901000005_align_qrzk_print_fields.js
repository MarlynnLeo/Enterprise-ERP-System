/** Align QRZK print/preview templates with the paper record form. */

const QRZK_TYPES = [
  'spring_inspection',
  'screw_inspection',
  'spring_inspection_preview',
  'screw_inspection_preview',
];

function alignContent(content) {
  let next = String(content || '');
  next = next.replace(/>检验项目</g, '>项目<');
  next = next.replace(/>检验标准</g, '>检验要求\/标准<');

  if (!next.includes('>检测方法<')) {
    next = next.replace(
      /(<th>检验要求\/标准<\/th>)(\s*)(<th style="width:38px">1#<\/th>)/,
      '$1$2<th>检测方法</th>$2$3'
    );
    next = next.replace(
      /(<td class="text-left">\{\{standard\}\}<\/td>)(\s*)(<td>\{\{default measure_1)/,
      '$1$2<td class="text-left">{{method}}</td>$2$3'
    );
  }

  return next;
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('print_templates'))) return;

  const rows = await knex('print_templates')
    .select('id', 'content')
    .whereIn('template_type', QRZK_TYPES)
    .whereNull('deleted_at');

  for (const row of rows) {
    const content = alignContent(row.content);
    if (content !== row.content) {
      await knex('print_templates').where({ id: row.id }).update({
        content,
        updated_at: knex.fn.now(),
      });
    }
  }
};

exports.down = async function down() {};
