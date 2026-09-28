'use strict';

/**
 * 20260927000011_update_qrzk_signature_to_font.js
 * @description 将 QRZK-17-01 打印模板（螺钉和弹簧）中检验员、审核、技术（让步时）、批准的普通文本改为手写签名字体展示
 */

const QRZK_TYPES = [
  'screw_inspection',
  'screw_inspection_preview',
  'spring_inspection',
  'spring_inspection_preview',
];

const SIGNATURE_STYLE = `<style id="incoming-inspection-signature-font">
  @font-face {
    font-family: 'SPPLMFONT';
    src: url('/fonts/SPPLMFONT.ttf') format('truetype');
    font-weight: normal;
    font-style: normal;
  }
  .signatures {
    display: grid !important;
    grid-template-columns: repeat(4, 1fr) !important;
    gap: 10px !important;
    margin: 18px 2% 0 !important;
    font-size: 10pt !important;
  }
  .signatures .signature {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    white-space: nowrap !important;
    font-size: 10pt !important;
    line-height: 1.2 !important;
    min-height: 28px !important;
  }
  .signatures .signature .signature-label {
    font-family: "SimSun", "Microsoft YaHei", Arial, sans-serif !important;
    font-size: 10pt !important;
    color: #111 !important;
    font-weight: 400 !important;
    white-space: nowrap !important;
  }
  .signatures .signature span.signature-handwritten {
    font-family: 'SPPLMFONT', sans-serif !important;
    font-size: 24pt !important;
    line-height: 1 !important;
    color: #111 !important;
    display: inline-block !important;
    vertical-align: middle !important;
    text-transform: uppercase !important;
    margin-left: 2px !important;
  }
  .signatures .signature span.signature-empty-line {
    display: inline-block !important;
    min-width: 42px !important;
    border-bottom: 1px solid #111 !important;
    height: 12px !important;
    vertical-align: middle !important;
    margin-left: 4px !important;
  }
</style>`;

const NEW_SIGNATURES_BLOCK = `<div class="signatures">
      <div class="signature"><span class="signature-label">检验员：</span>{{#if inspector_signature}}<span class="signature-handwritten">{{inspector_signature}}</span>{{else}}{{#if inspector_name}}<span class="signature-handwritten">{{inspector_name}}</span>{{else}}<span class="signature-empty-line"></span>{{/if}}{{/if}}</div>
      <div class="signature"><span class="signature-label">审核：</span>{{#if reviewer_signature}}<span class="signature-handwritten">{{reviewer_signature}}</span>{{else}}{{#if reviewer_name}}<span class="signature-handwritten">{{reviewer_name}}</span>{{else}}<span class="signature-empty-line"></span>{{/if}}{{/if}}</div>
      <div class="signature"><span class="signature-label">技术（让步时）：</span>{{#if technical_signature}}<span class="signature-handwritten">{{technical_signature}}</span>{{else}}{{#if technical_name}}<span class="signature-handwritten">{{technical_name}}</span>{{else}}<span class="signature-empty-line"></span>{{/if}}{{/if}}</div>
      <div class="signature"><span class="signature-label">批准：</span>{{#if approver_signature}}<span class="signature-handwritten">{{approver_signature}}</span>{{else}}{{#if approver_name}}<span class="signature-handwritten">{{approver_name}}</span>{{else}}<span class="signature-empty-line"></span>{{/if}}{{/if}}</div>
    </div>`;

function transformTemplateContent(content) {
  let next = String(content || '');

  // 1. 注入签名字体与排版样式
  if (!next.includes('incoming-inspection-signature-font')) {
    if (next.includes('</head>')) {
      next = next.replace('</head>', `${SIGNATURE_STYLE}\n</head>`);
    } else {
      next = `${SIGNATURE_STYLE}\n${next}`;
    }
  }

  // 2. 替换旧普通文字签名栏为矢量手写签名栏
  next = next.replace(/<div class="signatures">[\s\S]*?<\/div>\s*<\/div>/, NEW_SIGNATURES_BLOCK);

  return next;
}

exports.transformTemplateContent = transformTemplateContent;

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('print_templates'))) return;

  // 查询确认影响范围
  const rows = await knex('print_templates')
    .select('id', 'name', 'template_type', 'content')
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
