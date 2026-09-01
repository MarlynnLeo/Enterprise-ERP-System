/** Support six samples and qualitative check/cross measurement values. */

const QRZK_TYPES = [
  'spring_inspection',
  'screw_inspection',
  'spring_inspection_preview',
  'screw_inspection_preview',
];

function addSixthMeasurementColumn(content) {
  let next = String(content || '');
  if (!next.includes('>6#<')) {
    next = next.replace(
      /(<th style="width:38px">5#<\/th>)/,
      '$1\n          <th style="width:38px">6#</th>'
    );
  }
  if (!next.includes('measure_6')) {
    next = next.replace(
      /(<td>\{\{default measure_5 "\{无\}"\}\}<\/td>)/,
      '$1<td>{{default measure_6 "{无}"}}</td>'
    );
  }
  return next;
}

exports.up = async function up(knex) {
  if (
    await knex.schema.hasTable('quality_inspection_measurements') &&
    await knex.schema.hasColumn('quality_inspection_measurements', 'measured_value')
  ) {
    await knex.raw(`
      ALTER TABLE quality_inspection_measurements
      MODIFY measured_value VARCHAR(50) NULL COMMENT '实测值（支持尺寸数值及√/×判定）'
    `);
  }

  if (!(await knex.schema.hasTable('print_templates'))) return;
  const rows = await knex('print_templates')
    .select('id', 'content')
    .whereIn('template_type', QRZK_TYPES)
    .whereNull('deleted_at');

  for (const row of rows) {
    const content = addSixthMeasurementColumn(row.content);
    if (content !== row.content) {
      await knex('print_templates').where({ id: row.id }).update({
        content,
        updated_at: knex.fn.now(),
      });
    }
  }
};

exports.down = async function down() {};
