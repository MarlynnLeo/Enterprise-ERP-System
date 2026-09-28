'use strict';

const TEMPLATE_TYPES = [
  'incoming_inspection',
  'spring_inspection',
  'screw_inspection',
  'spring_inspection_preview',
  'screw_inspection_preview',
];
const STYLE_IDS = [
  'incoming-inspection-item-font-size',
  'incoming-inspection-meta-font-size',
  'incoming-inspection-meta-label-width',
  'incoming-inspection-footer-font-size',
  'incoming-inspection-disposition-font-size',
  'incoming-inspection-signature-font',
  'incoming-inspection-white-bg',
  'incoming-inspection-layout',
];
const STYLE = `<style id="incoming-inspection-layout">
  @font-face {
    font-family: 'SPPLMFONT';
    src: url('/fonts/SPPLMFONT.ttf') format('truetype');
    font-weight: normal;
    font-style: normal;
  }
  .items tbody td, .meta th, .meta td, .disposition th, .disposition td {
    font-size: 10pt !important;
    line-height: 1.3;
    white-space: normal !important;
    overflow-wrap: anywhere;
    word-break: normal;
    height: auto !important;
  }
  .items tbody td { line-height: 1.2; }
  .items tbody td *, .meta th *, .meta td *, .disposition th *, .disposition td * {
    font-size: inherit !important;
  }
  .disposition .section-title { font-weight: 400; }
  table th, table td, .section-title { background: #fff !important; }
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
  .signature-label, .signature-name {
    font-family: 'SimSun', 'Microsoft YaHei', Arial, sans-serif !important;
    font-size: 10pt !important;
    color: #111 !important;
    font-weight: 400 !important;
  }
  .signatures .signature .signature-handwritten {
    font-family: 'SPPLMFONT', sans-serif !important;
    font-size: 24pt !important;
    line-height: 1 !important;
    color: #111 !important;
    display: inline-block !important;
    vertical-align: middle !important;
    text-transform: uppercase !important;
    margin-left: 2px !important;
  }
  .signature-empty-line {
    display: inline-block !important;
    min-width: 42px !important;
    border-bottom: 1px solid #111 !important;
    height: 12px !important;
    vertical-align: middle !important;
    margin-left: 4px !important;
  }
</style>`;
const QRZK_META_STYLE = `
  table.meta col:nth-child(odd) { width: calc(50pt + 12px) !important; }
  table.meta col:nth-child(even), table.meta th, table.meta td { width: auto !important; }
  table.meta th {
    white-space: nowrap !important;
    overflow-wrap: normal !important;
    word-break: normal !important;
    padding-left: 5px;
    padding-right: 5px;
  }
`;

function transformContent(content, templateType) {
  const source = String(content || '');
  const styles = new RegExp(
    `<style\\b[^>]*\\bid=["'](?:${STYLE_IDS.join('|')})["'][^>]*>[\\s\\S]*?<\\/style>\\s*`,
    'gi'
  );
  // Only replace styles introduced by the preceding migrations. User templates
  // without these markers retain their own layout and colors.
  if (!styles.test(source)) return source;
  styles.lastIndex = 0;
  let next = source
    .replace(styles, '')
    .replace(
      /class="signature-handwritten">(\{\{(?:inspector|reviewer|technical|approver)_name\}\})/g,
      'class="signature-name">$1'
    );
  const style =
    templateType === 'incoming_inspection'
      ? STYLE
      : STYLE.replace('</style>', `${QRZK_META_STYLE}</style>`);
  return /<\/head>/i.test(next)
    ? next.replace(/<\/head>/i, `${style}\n</head>`)
    : `${next}${style}\n`;
}

exports.transformContent = transformContent;
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('print_templates'))) return;
  const rows = await knex('print_templates')
    .select('id', 'template_type', 'content')
    .where({ module: 'quality' })
    .whereIn('template_type', TEMPLATE_TYPES)
    .whereNull('deleted_at');
  for (const row of rows) {
    const content = transformContent(row.content, row.template_type);
    if (content !== row.content) {
      await knex('print_templates')
        .where({ id: row.id })
        .update({ content, updated_at: knex.fn.now() });
    }
  }
};

// The old CSS cascade and name-as-signature rendering must not be restored.
exports.down = async function down() {};
