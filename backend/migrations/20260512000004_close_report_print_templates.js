/**
 * Close remaining report print templates.
 *
 * Centralizes purchase return and finance report printing in print_templates.
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
  .text-left { text-align: left !important; }
  .text-right { text-align: right !important; }
  .summary { margin-top: 10px; }
  .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 30px; }
  .signature { border-top: 1px solid #111; padding-top: 6px; text-align: center; }
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
      <div class="doc-no">单号/期间：${docNo}<br>打印：{{print_time}}</div>
    </div>
    <div class="title">${title}</div>
    ${body}
    <div class="footer-note">本单据由 ERP 打印中心模板生成，请以已审核业务数据为准。</div>
  </div>
</body>
</html>`;
}

function signatures(labels = ['制表', '复核', '审核', '日期']) {
  return `<div class="signatures">${labels.map((label) => `<div class="signature">${label}</div>`).join('')}</div>`;
}

const purchaseReturn = page('采 购 退 货 单', '{{return_no}}', `
  <table class="meta">
    <tr><td>退货单号：{{return_no}}</td><td>退货日期：{{return_date}}</td><td>状态：{{status}}</td></tr>
    <tr><td>关联收货单：{{receipt_no}}</td><td>供应商：{{supplier_name}}</td><td>出库仓库：{{warehouse_name}}</td></tr>
    <tr><td>经办人：{{operator}}</td><td colspan="2">退货原因：{{reason}}</td></tr>
  </table>
  <table class="items">
    <thead><tr><th style="width:44px">序号</th><th>物料编码</th><th>物料名称</th><th>规格</th><th style="width:72px">收货数量</th><th style="width:72px">退货数量</th><th style="width:52px">单位</th><th style="width:82px">单价</th><th style="width:92px">金额</th><th>退货原因</th></tr></thead>
    <tbody>{{#each items}}<tr><td>{{index}}</td><td>{{material_code}}</td><td class="text-left">{{material_name}}</td><td>{{specification}}</td><td class="text-right">{{received_quantity}}</td><td class="text-right">{{return_quantity}}</td><td>{{unit_name}}</td><td class="text-right">{{unit_price}}</td><td class="text-right">{{amount}}</td><td>{{return_reason}}</td></tr>{{/each}}</tbody>
  </table>
  <table class="summary"><tr><td class="text-right">退货金额合计：{{total_amount}}</td></tr></table>
  ${signatures(['采购', '仓库', '供应商确认', '审核'])}
`);

const incomeStatement = page('利 润 表', '{{report_period}}', `
  <table class="meta"><tr><td>报表期间：{{report_period}}</td><td>比较期间：{{compare_period}}</td><td>单位：{{unit_text}}</td></tr></table>
  <table class="items">
    <thead><tr><th style="width:44px">序号</th><th>项目</th><th style="width:70px">行次</th><th style="width:110px">本期金额</th><th style="width:110px">比较金额</th><th style="width:110px">变动</th><th style="width:90px">变动率</th></tr></thead>
    <tbody>{{#each items}}<tr><td>{{index}}</td><td class="text-left">{{name}}</td><td>{{row_num}}</td><td class="text-right">{{amount}}</td><td class="text-right">{{compare_amount}}</td><td class="text-right">{{change_amount}}</td><td class="text-right">{{change_rate}}</td></tr>{{/each}}</tbody>
  </table>
  ${signatures()}
`);

const balanceSheet = page('资 产 负 债 表', '{{report_date}}', `
  <table class="meta"><tr><td>报表日期：{{report_date}}</td><td>比较日期：{{compare_date}}</td><td>单位：{{unit_text}}</td></tr></table>
  <table class="items">
    <thead><tr><th style="width:44px">序号</th><th style="width:110px">类别</th><th>项目</th><th style="width:70px">行次</th><th style="width:110px">期末余额</th><th style="width:110px">期初余额</th><th style="width:110px">变动</th></tr></thead>
    <tbody>{{#each items}}<tr><td>{{index}}</td><td>{{side}}</td><td class="text-left">{{name}}</td><td>{{row_num}}</td><td class="text-right">{{amount}}</td><td class="text-right">{{compare_amount}}</td><td class="text-right">{{change_amount}}</td></tr>{{/each}}</tbody>
  </table>
  <table class="summary"><tr><td>资产合计：{{total_assets}}</td><td>负债和所有者权益合计：{{total_liabilities_equity}}</td></tr></table>
  ${signatures()}
`);

const cashFlowStatement = page('出 纳 月 报 表', '{{report_period}}', `
  <table class="meta"><tr><td>报表期间：{{report_period}}</td><td>账户数量：{{account_count}}</td><td>单位：{{unit_text}}</td></tr></table>
  <table class="items">
    <thead><tr><th style="width:44px">序号</th><th>项目</th><th style="width:110px">上月结存</th><th style="width:110px">本月共收</th><th style="width:110px">本月共付</th><th style="width:110px">本月结存</th></tr></thead>
    <tbody>{{#each items}}<tr><td>{{index}}</td><td class="text-left">{{name}}</td><td class="text-right">{{last_month_balance}}</td><td class="text-right">{{current_month_income}}</td><td class="text-right">{{current_month_expense}}</td><td class="text-right">{{current_month_balance}}</td></tr>{{/each}}</tbody>
  </table>
  <table class="summary"><tr><td>本月总收入：{{total_income}}</td><td>本月总支出：{{total_expense}}</td><td>本月净额：{{net_amount}}</td><td>期末余额：{{total_balance}}</td></tr></table>
  ${signatures(['主管', '会计', '复核', '出纳'])}
`);

const standardCashFlow = page('现 金 流 量 表', '{{report_period}}', `
  <table class="meta"><tr><td>报表期间：{{report_period}}</td><td>单位：{{unit_text}}</td><td>现金净增加额：{{net_cash_increase}}</td></tr></table>
  <table class="items">
    <thead><tr><th style="width:44px">序号</th><th style="width:70px">行次</th><th>项目</th><th style="width:120px">本期金额</th><th style="width:120px">上期金额</th></tr></thead>
    <tbody>{{#each items}}<tr><td>{{index}}</td><td>{{row_num}}</td><td class="text-left">{{name}}</td><td class="text-right">{{amount}}</td><td class="text-right">{{compare_amount}}</td></tr>{{/each}}</tbody>
  </table>
  <table class="summary"><tr><td>经营活动现金流：{{operating_cash_flow}}</td><td>投资活动现金流：{{investing_cash_flow}}</td><td>筹资活动现金流：{{financing_cash_flow}}</td><td>期末现金：{{ending_cash}}</td></tr></table>
  ${signatures()}
`);

const agingReport = (title) => page(title, '{{report_date}}', `
  <table class="meta"><tr><td>截止日期：{{report_date}}</td><td>对象：{{entity_label}}</td><td>总额：{{total_amount}}</td></tr></table>
  <table class="items">
    <thead><tr><th style="width:44px">序号</th><th>{{entity_label}}名称</th><th style="width:90px">类型</th><th style="width:100px">总金额</th><th style="width:100px">未逾期</th><th style="width:100px">30天内/1-30天</th><th style="width:100px">31-60天</th><th style="width:100px">61-90天</th><th style="width:100px">90天以上</th><th style="width:80px">逾期比例</th><th>联系人</th></tr></thead>
    <tbody>{{#each items}}<tr><td>{{index}}</td><td class="text-left">{{entity_name}}</td><td>{{entity_type}}</td><td class="text-right">{{total_amount}}</td><td class="text-right">{{current_amount}}</td><td class="text-right">{{within_30_days}}</td><td class="text-right">{{days_31_to_60}}</td><td class="text-right">{{days_61_to_90}}</td><td class="text-right">{{over_90_days}}</td><td>{{overdue_ratio}}</td><td>{{contact_person}} {{contact_phone}}</td></tr>{{/each}}</tbody>
  </table>
  <table class="summary"><tr><td>总额：{{total_amount}}</td><td>未逾期：{{current_amount}}</td><td>30天内/1-30天：{{within_30_days}}</td><td>31-60天：{{days_31_to_60}}</td><td>61-90天：{{days_61_to_90}}</td><td>90天以上：{{over_90_days}}</td></tr></table>
  ${signatures()}
`);

const templates = [
  ['purchase', 'purchase_return', '采购退货单默认模板', purchaseReturn],
  ['finance', 'income_statement', '利润表默认模板', incomeStatement],
  ['finance', 'balance_sheet', '资产负债表默认模板', balanceSheet],
  ['finance', 'cash_flow_statement', '出纳月报表默认模板', cashFlowStatement],
  ['finance', 'standard_cash_flow', '现金流量表默认模板', standardCashFlow],
  ['finance', 'ar_aging', '应收账龄分析表默认模板', agingReport('应 收 账 龄 分 析 表')],
  ['finance', 'ap_aging', '应 付 账 龄 分 析 表默认模板', agingReport('应 付 账 龄 分 析 表')],
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
