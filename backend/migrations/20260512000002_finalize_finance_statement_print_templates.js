/**
 * Finalize finance statement print templates.
 * Keeps cash/bank statement templates data-driven through items instead of raw HTML rows.
 */

const commonStyle = `
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "SimSun", "Microsoft YaHei", Arial, sans-serif; color: #111; font-size: 12px; line-height: 1.45; }
  .doc { width: 100%; }
  .brand { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
  .company { font-size: 16px; font-weight: 700; }
  .company-sub { margin-top: 3px; color: #333; font-size: 11px; }
  .title { text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 5px; margin: 8px 0 14px; }
  .doc-no { text-align: right; font-size: 11px; line-height: 1.6; }
  .meta, .items, .summary { width: 100%; border-collapse: collapse; }
  .meta { margin-bottom: 12px; }
  .meta td, .summary td { border: 1px solid #333; padding: 6px 8px; height: 28px; }
  .items { table-layout: fixed; }
  .items th, .items td { border: 1px solid #333; padding: 6px 5px; text-align: center; word-break: break-word; }
  .items th { background: #f3f4f6; font-weight: 700; }
  .text-left { text-align: left !important; }
  .text-right { text-align: right !important; }
  .summary { margin-top: 10px; }
  .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 30px; }
  .signature { border-top: 1px solid #111; padding-top: 6px; text-align: center; }
  .footer-note { margin-top: 12px; color: #555; font-size: 10px; }
  @media print { body { margin: 0; } }
`;

function page(title, body, docNo = '{{document_no}}') {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} - ${docNo}</title>
  <style>${commonStyle}</style>
</head>
<body>
  <div class="doc">
    <div class="brand">
      <div>
        <div class="company">{{company_name}}</div>
        <div class="company-sub">地址：{{company_address}}　电话：{{company_phone}}　传真：{{company_fax}}</div>
      </div>
      <div class="doc-no">单号：${docNo}<br>打印：{{print_time}}</div>
    </div>
    <div class="title">${title}</div>
    ${body}
    <div class="footer-note">本单据由 ERP 打印中心模板生成，请以已审批业务数据为准。</div>
  </div>
</body>
</html>`;
}

function signatures(labels) {
  return `<div class="signatures">${labels.map((label) => `<div class="signature">${label}</div>`).join('')}</div>`;
}

const bankStatementTemplate = page('银行存款日记账', `
  <table class="meta">
    <tr><td>账户：{{accountName}}</td><td>账号：{{accountNumber}}</td><td>打印日期：{{printDate}}</td></tr>
  </table>
  <table class="items">
    <thead>
      <tr>
        <th style="width:44px">序号</th><th style="width:82px">日期</th><th>往来单位</th><th style="width:100px">凭证号</th>
        <th>摘要</th><th style="width:86px">收入</th><th style="width:86px">支出</th><th style="width:92px">余额</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{index}}</td><td>{{transaction_date}}</td><td>{{counterparty}}</td><td>{{reference_number}}</td>
        <td class="text-left">{{description}}</td><td class="text-right">{{income_amount}}</td>
        <td class="text-right">{{expense_amount}}</td><td class="text-right">{{balance}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <table class="summary">
    <tr><td class="text-right">收入合计：{{totalIncome}}　支出合计：{{totalExpense}}　期末余额：{{finalBalance}}</td></tr>
  </table>
  ${signatures(['出纳', '会计', '财务主管', '日期'])}
`, '{{accountNumber}}');

const cashStatementTemplate = page('现金日记账', `
  <table class="meta">
    <tr><td>打印日期：{{printDate}}</td><td colspan="2">单位：{{company_name}}</td></tr>
  </table>
  <table class="items">
    <thead>
      <tr>
        <th style="width:44px">序号</th><th style="width:82px">日期</th><th style="width:100px">凭证号</th><th>对方单位</th>
        <th>摘要</th><th style="width:86px">收入</th><th style="width:86px">支出</th><th style="width:92px">余额</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{index}}</td><td>{{transaction_date}}</td><td>{{reference_number}}</td><td>{{counterparty}}</td>
        <td class="text-left">{{description}}</td><td class="text-right">{{income_amount}}</td>
        <td class="text-right">{{expense_amount}}</td><td class="text-right">{{balance}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <table class="summary">
    <tr><td class="text-right">收入合计：{{totalIncome}}　支出合计：{{totalExpense}}　期末余额：{{finalBalance}}</td></tr>
  </table>
  ${signatures(['出纳', '会计', '财务主管', '日期'])}
`, '{{printDate}}');

async function updateTemplate(knex, templateType, content) {
  await knex('print_templates')
    .where({ module: 'finance', template_type: templateType, is_default: 1 })
    .whereNull('deleted_at')
    .update({
      content,
      paper_size: 'A4',
      orientation: 'portrait',
      margin_top: 10,
      margin_right: 10,
      margin_bottom: 10,
      margin_left: 10,
      status: 1,
      updated_at: knex.fn.now(),
    });
}

exports.up = async function up(knex) {
  await updateTemplate(knex, 'bank_statement', bankStatementTemplate);
  await updateTemplate(knex, 'cash_statement', cashStatementTemplate);
};

exports.down = async function down() {};
