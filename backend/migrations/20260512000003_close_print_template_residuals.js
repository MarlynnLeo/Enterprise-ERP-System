/**
 * Close residual print template gaps.
 *
 * Adds centralized default templates for business pages that previously built
 * printable HTML inside the page component.
 */

const commonStyle = `
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "SimSun", "Microsoft YaHei", Arial, sans-serif; color: #111; font-size: 12px; line-height: 1.45; }
  .doc { width: 100%; }
  .brand { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
  .company { font-size: 16px; font-weight: 700; }
  .company-sub { margin-top: 3px; color: #333; font-size: 11px; }
  .doc-no { text-align: right; font-size: 11px; line-height: 1.6; }
  .title { text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 4px; margin: 8px 0 14px; }
  .meta, .items, .summary { width: 100%; border-collapse: collapse; }
  .meta { margin-bottom: 12px; }
  .meta td, .summary td { border: 1px solid #333; padding: 6px 8px; height: 28px; }
  .items { table-layout: fixed; }
  .items th, .items td { border: 1px solid #333; padding: 6px 5px; text-align: center; word-break: break-word; }
  .items th { background: #f3f4f6; font-weight: 700; }
  .section-title { font-weight: 700; margin: 12px 0 6px; }
  .block { border: 1px solid #333; padding: 8px; min-height: 42px; margin-bottom: 8px; white-space: pre-wrap; }
  .text-left { text-align: left !important; }
  .text-right { text-align: right !important; }
  .summary { margin-top: 10px; }
  .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 30px; }
  .signature { border-top: 1px solid #111; padding-top: 6px; text-align: center; }
  .seal { height: 92px; width: 92px; border: 2px dashed #999; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 8px auto; color: #555; }
  .footer-note { margin-top: 12px; color: #555; font-size: 10px; }
  @media print { body { margin: 0; } }
`;

function page(title, docNo, body) {
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
        <div class="company-sub">地址：{{company_address}} 电话：{{company_phone}} 传真：{{company_fax}}</div>
      </div>
      <div class="doc-no">单号：${docNo}<br>打印：{{print_time}}</div>
    </div>
    <div class="title">${title}</div>
    ${body}
    <div class="footer-note">本单据由 ERP 打印中心模板生成，请以已审核业务数据为准。</div>
  </div>
</body>
</html>`;
}

function signatures(labels) {
  return `<div class="signatures">${labels.map((label) => `<div class="signature">${label}</div>`).join('')}</div>`;
}

const finalInspectionCertificate = page('成 品 合 格 证', '{{certificate_no}}', `
  <table class="meta">
    <tr><td>合格证号：{{certificate_no}}</td><td>检验单号：{{inspection_no}}</td><td>签发日期：{{issue_date}}</td></tr>
    <tr><td>产品编码：{{product_code}}</td><td>产品名称：{{product_name}}</td><td>批次号：{{batch_no}}</td></tr>
    <tr><td>生产日期：{{production_date}}</td><td>检验日期：{{inspection_date}}</td><td>检验员：{{inspector}}</td></tr>
    <tr><td>检验标准：{{standard_type_text}}</td><td colspan="2">标准编号：{{standard_no}}</td></tr>
  </table>
  <div class="section-title">质量声明</div>
  <div class="block">兹证明上述产品已经按规定完成成品检验，检验结果为 {{status}}。{{remark}}</div>
  <table class="summary">
    <tr><td class="text-right">合格数量：{{qualified_quantity}} {{unit_name}} 不合格数量：{{unqualified_quantity}} {{unit_name}}</td></tr>
  </table>
  <div class="seal">公司盖章</div>
  ${signatures(['检验员', '质量负责人', '出货确认', '日期'])}
`);

const eightDReport = page('8D 改 善 报 告', '{{report_no}}', `
  <table class="meta">
    <tr><td>报告编号：{{report_no}}</td><td>标题：{{title}}</td><td>关联NCP：{{ncp_no}}</td></tr>
    <tr><td>发生日期：{{occurrence_date}}</td><td>缺陷类型：{{defect_type}}</td><td>状态/阶段：{{status}} {{current_phase}}</td></tr>
    <tr><td>物料/产品：{{material_name}}</td><td>客户：{{customer_name}}</td><td>目标关闭：{{target_close_date}}</td></tr>
  </table>
  <table class="items">
    <thead><tr><th style="width:44px">序号</th><th style="width:92px">阶段</th><th style="width:90px">责任人</th><th>措施/内容</th><th style="width:80px">结果</th></tr></thead>
    <tbody>
      {{#each items}}
      <tr><td>{{index}}</td><td>{{phase}}</td><td>{{owner}}</td><td class="text-left">{{action}}</td><td>{{result}}</td></tr>
      {{/each}}
    </tbody>
  </table>
  <div class="section-title">D1 团队</div><div class="block">组长：{{team_leader}}\n成员：{{team_members}}</div>
  <div class="section-title">D2 问题描述</div><div class="block">{{problem_description}}\n影响数量：{{quantity_affected}}</div>
  <div class="section-title">D3 遏制措施</div><div class="block">{{containment_actions}}</div>
  <div class="section-title">D4 根因分析</div><div class="block">{{root_cause}}</div>
  <div class="section-title">D5-D7 永久改善与预防</div>
  <div class="block">纠正措施：{{corrective_actions}}\n验证方法：{{verification_method}}\n验证结果：{{verification_result}}\n预防措施：{{preventive_actions}}\n标准化：{{standardization}}</div>
  <div class="section-title">D8 总结</div><div class="block">{{summary}}\n经验教训：{{lessons_learned}}</div>
  ${signatures(['发起人', '责任人', '质量审核', '客户确认'])}
`);

const glVoucher = page('记 账 凭 证', '{{entry_number}}', `
  <table class="meta">
    <tr><td>凭证编号：{{entry_number}}</td><td>记账日期：{{entry_date}}</td><td>过账日期：{{posting_date}}</td></tr>
    <tr><td>单据类型：{{document_type}}</td><td>单据编号：{{document_number}}</td><td>会计期间：{{period_name}}</td></tr>
    <tr><td>状态：{{status}}</td><td>制单人：{{created_by}}</td><td>摘要：{{description}}</td></tr>
  </table>
  <table class="items">
    <thead><tr><th style="width:44px">序号</th><th style="width:92px">科目编码</th><th>科目名称</th><th>摘要</th><th style="width:96px">借方金额</th><th style="width:96px">贷方金额</th></tr></thead>
    <tbody>
      {{#each items}}
      <tr><td>{{index}}</td><td>{{account_code}}</td><td class="text-left">{{account_name}}</td><td class="text-left">{{description}}</td><td class="text-right">{{debit_amount}}</td><td class="text-right">{{credit_amount}}</td></tr>
      {{/each}}
    </tbody>
  </table>
  <table class="summary">
    <tr><td class="text-right">借方合计：{{total_debit}} 贷方合计：{{total_credit}}</td></tr>
  </table>
  ${signatures(['制单', '审核', '记账', '主管'])}
`);

const templates = [
  ['quality', 'final_inspection_certificate', '成品合格证默认模板', finalInspectionCertificate],
  ['quality', 'eight_d_report', '8D报告默认模板', eightDReport],
  ['finance', 'gl_voucher', '记账凭证默认模板', glVoucher],
];

async function upsertDefaultTemplate(knex, module, templateType, name, content) {
  const rows = await knex('print_templates')
    .select('id')
    .where({ module, template_type: templateType })
    .whereNull('deleted_at')
    .orderBy('is_default', 'desc')
    .orderBy('id', 'asc');

  if (rows.length === 0) {
    await knex('print_templates').insert({
      name,
      module,
      template_type: templateType,
      content,
      paper_size: 'A4',
      orientation: 'portrait',
      margin_top: 12,
      margin_right: 12,
      margin_bottom: 12,
      margin_left: 12,
      is_default: 1,
      status: 1,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    return;
  }

  const keepId = rows[0].id;
  await knex('print_templates')
    .where({ module, template_type: templateType })
    .whereNull('deleted_at')
    .update({ is_default: 0, updated_at: knex.fn.now() });

  await knex('print_templates').where({ id: keepId }).update({
    name,
    content,
    paper_size: 'A4',
    orientation: 'portrait',
    margin_top: 12,
    margin_right: 12,
    margin_bottom: 12,
    margin_left: 12,
    is_default: 1,
    status: 1,
    updated_at: knex.fn.now(),
  });
}

exports.up = async function up(knex) {
  for (const [module, templateType, name, content] of templates) {
    await upsertDefaultTemplate(knex, module, templateType, name, content);
  }
};

exports.down = async function down() {};
