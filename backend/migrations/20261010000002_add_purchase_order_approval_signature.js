'use strict';

const STYLE_ID = 'kacon-purchase-approval-signature';
const SIGNATURE_STYLE = `<style id="${STYLE_ID}" data-print-preserve-fonts="true">
  .kacon-order .kacon-approval-signature-line { position: relative; }
  .kacon-order .kacon-approval-signature-line .signature-handwritten {
    position: absolute; left: 50%; bottom: .3mm; transform: translateX(-50%);
    font-family: 'SPPLMFONT', sans-serif !important; font-size: 24pt;
    font-weight: 400; line-height: 1; white-space: nowrap;
  }
  .kacon-order .kacon-approver-name, .kacon-order .kacon-approval-date {
    font-family: 'Times New Roman', 'SimSun', 'Songti SC', serif;
    font-size: 10pt; line-height: 5.5mm; text-align: center; white-space: nowrap;
  }
  .kacon-order .kacon-approver-name { display: block; }
</style>`;

const SIGNATURE_LINE = '<span class="kacon-signature-line"></span>';
const APPROVER_LINE = '<span class="kacon-signature-line kacon-approval-signature-line">{{#if approver_signature}}<span class="signature-handwritten" aria-label="{{approver_name}}">{{approver_signature}}</span>{{else}}{{#if approver_name}}<span class="kacon-approver-name">{{approver_name}}</span>{{/if}}{{/if}}</span>';
const APPROVAL_DATE_LINE = '<span class="kacon-signature-line kacon-approval-date">{{approval_date}}</span>';

function transformContent(content) {
  const source = String(content || '');
  if (!source.includes('id="kacon-purchase-order-layout"') || source.includes(`id="${STYLE_ID}"`)) {
    return source;
  }

  // Bind only the buyer confirmation. The supplier must sign its own section.
  const heading = source.indexOf('<h2>二、委托方确认</h2>');
  const end = source.indexOf('</section>', heading);
  if (heading < 0 || end < 0) return source;
  const confirmation = source.slice(heading, end);
  if (confirmation.split(SIGNATURE_LINE).length !== 3) return source;
  const updated = confirmation
    .replace(SIGNATURE_LINE, APPROVER_LINE)
    .replace(SIGNATURE_LINE, APPROVAL_DATE_LINE);
  return `${SIGNATURE_STYLE}\n${source.slice(0, heading)}${updated}${source.slice(end)}`;
}

exports.transformContent = transformContent;

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('print_templates'))) return;
  const templates = await knex('print_templates')
    .where({ module: 'purchase', template_type: 'purchase_order', is_default: 1, status: 1 })
    .whereNull('deleted_at')
    .select('id', 'content');
  for (const template of templates) {
    const content = transformContent(template.content);
    if (content !== template.content) {
      await knex('print_templates')
        .where({ id: template.id })
        .update({ content, updated_at: knex.fn.now() });
    }
  }
};

// Keep subsequent print-center edits intact if the migration is rolled back.
exports.down = async function down() {};
