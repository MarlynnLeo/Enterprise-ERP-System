'use strict';

const QRZK_TYPES = [
  'screw_inspection',
  'screw_inspection_preview',
  'spring_inspection',
  'spring_inspection_preview',
];

const DISPOSITION_STYLE = `<style id="incoming-inspection-disposition-font-size">
  .disposition th, .disposition td {
    font-size: 10pt !important;
    line-height: 1.3;
    white-space: normal !important;
    overflow-wrap: anywhere;
    word-break: normal;
    height: auto !important;
  }
  .disposition th *, .disposition td * { font-size: inherit !important; }
  .disposition .section-title {
    font-size: 10pt !important;
    font-weight: 400;
  }
</style>`;

function transformTemplateContent(content) {
  let next = String(content || '');

  // 1. 抽样数量：移除 fallback "未记录"，展示传入的标准抽样数量
  next = next.replace(
    /\{\{\s*default\s+sample_quantity\s+"未记录"\s*\}\}/g,
    '{{default sample_quantity ""}}'
  );

  // 2. 不合格品情况与处置：字体大小设为 10pt（与检验项目表面处理一致）
  if (!next.includes('incoming-inspection-disposition-font-size')) {
    if (next.includes('</head>')) {
      next = next.replace('</head>', `${DISPOSITION_STYLE}\n</head>`);
    } else {
      next = `${DISPOSITION_STYLE}\n${next}`;
    }
  }

  // 3. disposition table 增加属性标记
  if (!next.includes('data-incoming-inspection-disposition="10pt"')) {
    next = next.replace(
      /<table class="disposition"/g,
      '<table class="disposition" data-incoming-inspection-disposition="10pt" data-print-autofit="false"'
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
