'use strict';

const QRZK_TYPES = [
  'screw_inspection',
  'screw_inspection_preview',
  'spring_inspection',
  'spring_inspection_preview',
];

const OLD_BLOCK = `<tr><th colspan="6" class="section-title">不合格品情况与处置</th></tr>
        <tr>
          <th style="width:12%">不良数</th><td style="width:18%" class="center">{{default unqualified_quantity ""}}</td>
          <th style="width:12%">不良率</th><td style="width:12%" class="center">{{default unqualified_rate ""}}%</td>
          <th style="width:16%">主要不良</th><td>{{default major_defect ""}}</td>
        </tr>
        <tr><th>处置方式</th><td colspan="5">□接收　□拒收　□让步接收（需批准）　□挑选使用　□其他　{{default disposition ""}}</td></tr>`;

const NEW_BLOCK = `<tr><th colspan="4" class="section-title">不合格品情况与处置</th></tr>
        <tr>
          <th style="width:14%">不良数</th><td style="width:36%" class="center">{{default unqualified_quantity ""}}</td>
          <th style="width:14%">不良率</th><td style="width:36%" class="center">{{#if unqualified_rate}}{{unqualified_rate}}%{{else}}{{default unqualified_rate ""}}{{/if}}</td>
        </tr>
        <tr>
          <th>主要不良</th><td colspan="3">{{default major_defect ""}}</td>
        </tr>
        <tr><th>处置方式</th><td colspan="3">□接收　□拒收　□让步接收（需批准）　□挑选使用　□其他　{{default disposition ""}}</td></tr>`;

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('print_templates'))) return;

  const rows = await knex('print_templates')
    .select('id', 'content')
    .whereIn('template_type', QRZK_TYPES)
    .whereNull('deleted_at');

  for (const row of rows) {
    if (!row.content) continue;
    let next = row.content;
    if (next.includes(OLD_BLOCK)) {
      next = next.replace(OLD_BLOCK, NEW_BLOCK);
    } else {
      next = next.replace(
        /<tr>\s*<th[^>]*colspan="6"[^>]*class="section-title">不合格品情况与处置<\/th>\s*<\/tr>\s*<tr>\s*<th[^>]*>不良数<\/th>\s*<td[^>]*>{{default unqualified_quantity ""}}<\/td>\s*<th[^>]*>不良率<\/th>\s*<td[^>]*>[\s\S]*?<\/td>\s*<th[^>]*>主要不良<\/th>\s*<td[^>]*>{{default major_defect ""}}<\/td>\s*<\/tr>\s*<tr>\s*<th[^>]*>处置方式<\/th>\s*<td[^>]*colspan="5">([\s\S]*?)<\/td>\s*<\/tr>/,
        `<tr><th colspan="4" class="section-title">不合格品情况与处置</th></tr>
        <tr>
          <th style="width:14%">不良数</th><td style="width:36%" class="center">{{default unqualified_quantity ""}}</td>
          <th style="width:14%">不良率</th><td style="width:36%" class="center">{{#if unqualified_rate}}{{unqualified_rate}}%{{else}}{{default unqualified_rate ""}}{{/if}}</td>
        </tr>
        <tr>
          <th>主要不良</th><td colspan="3">{{default major_defect ""}}</td>
        </tr>
        <tr><th>处置方式</th><td colspan="3">$1</td></tr>`
      );
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

  for (const row of rows) {
    if (!row.content || !row.content.includes(NEW_BLOCK)) continue;
    await knex('print_templates')
      .where('id', row.id)
      .update({
        content: row.content.replace(NEW_BLOCK, OLD_BLOCK),
        updated_at: knex.fn.now(),
      });
  }
};
