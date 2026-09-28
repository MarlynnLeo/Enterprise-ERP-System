'use strict';

/**
 * 20260927000013_set_inspection_print_template_white_bg.js
 * @description 将来料/进货检验打印模板（含 QRZK-17-01 弹簧、螺钉螺母等）的标题单元格背景色由灰色改为纯白色底
 */

const TARGET_TYPES = [
  'incoming_inspection',
  'screw_inspection',
  'screw_inspection_preview',
  'spring_inspection',
  'spring_inspection_preview',
];

const WHITE_BG_STYLE = `<style id="incoming-inspection-white-bg">
  table th,
  table td,
  .meta th,
  .meta td,
  .items th,
  .items td,
  .disposition th,
  .disposition td,
  .section-title {
    background-color: #ffffff !important;
    background: #ffffff !important;
  }
</style>`;

function transformContent(content) {
  let next = String(content || '');

  // 1. 替换原模板中出现的 #f3f4f6、#f5f7fa 等灰色背景定义为 #ffffff
  next = next.replace(/background\s*:\s*#f3f4f6/gi, 'background: #ffffff');
  next = next.replace(/background-color\s*:\s*#f3f4f6/gi, 'background-color: #ffffff');
  next = next.replace(/background\s*:\s*#f5f7fa/gi, 'background: #ffffff');
  next = next.replace(/background-color\s*:\s*#f5f7fa/gi, 'background-color: #ffffff');

  // 2. 注入强制纯白背景样式（如果尚未注入）
  if (!next.includes('incoming-inspection-white-bg')) {
    if (next.includes('</head>')) {
      next = next.replace('</head>', `${WHITE_BG_STYLE}\n</head>`);
    } else {
      next = `${WHITE_BG_STYLE}\n${next}`;
    }
  }

  return next;
}

exports.transformContent = transformContent;

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('print_templates'))) return;

  // 1. 先查询确认影响范围
  const rows = await knex('print_templates')
    .select('id', 'name', 'template_type', 'content')
    .whereIn('template_type', TARGET_TYPES)
    .whereNull('deleted_at');

  console.log(`[Migration] 确认影响的来料检验打印模板数量: ${rows.length}`);

  // 2. 带 WHERE 条件逐条更新
  for (const row of rows) {
    const nextContent = transformContent(row.content);
    if (nextContent !== row.content) {
      await knex('print_templates')
        .where('id', row.id)
        .update({
          content: nextContent,
          updated_at: new Date(),
        });
      console.log(`[Migration] 已将模板 ID ${row.id} (${row.name}) 标题单元格改为纯白底`);
    }
  }
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('print_templates'))) return;

  const rows = await knex('print_templates')
    .select('id', 'content')
    .whereIn('template_type', TARGET_TYPES)
    .whereNull('deleted_at');

  for (const row of rows) {
    if (row.content && row.content.includes('incoming-inspection-white-bg')) {
      const rolledBack = row.content.replace(WHITE_BG_STYLE + '\n', '');
      await knex('print_templates').where('id', row.id).update({
        content: rolledBack,
        updated_at: new Date(),
      });
    }
  }
};
