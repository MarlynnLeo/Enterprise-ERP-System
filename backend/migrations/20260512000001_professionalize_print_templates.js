/**
 * 专业化打印模板
 * 目标：打印中心所有模板都有正式版内容；缺失则新增，存在则升级默认模板。
 */

const CATALOG = [
  ['sales', 'sales_order', '销售订单', 'SO'],
  ['sales', 'sales_outbound', '销售出库单', 'SOUT'],
  ['sales', 'sales_return', '销售退货单', 'SRT'],
  ['purchase', 'purchase_order', '采购订单', 'PO'],
  ['purchase', 'purchase_requisition', '采购申请单', 'PR'],
  ['inventory', 'inbound', '入库单', 'IN'],
  ['inventory', 'outbound', '出库单', 'OUT'],
  ['inventory', 'production_outbound', '生产出库单', 'POUT'],
  ['inventory', 'inventory_stock', '库存明细表', 'STOCK'],
  ['inventory', 'transfer', '库存调拨单', 'TRF'],
  ['production', 'production_task', '生产任务单', 'TASK'],
  ['quality', 'quality_inspection', '质检单', 'QI'],
  ['quality', 'incoming_inspection', '来料检验单', 'IQC'],
  ['quality', 'process_inspection', '过程检验单', 'PQC'],
  ['quality', 'first_article_inspection', '首件检验单', 'FAI'],
  ['quality', 'final_inspection', '成品检验单', 'FQC'],
  ['finance', 'invoice', '销售发票', 'INV'],
  ['finance', 'ap_invoice', '采购发票', 'APINV'],
  ['finance', 'bank_statement', '银行存款日记账', 'BANK'],
  ['finance', 'cash_statement', '现金日记账', 'CASH'],
  ['finance', 'ar_receipt', '收款凭证', 'REC'],
  ['finance', 'ap_payment', '付款凭证', 'PAY'],
];

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
  .meta { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  .meta td { border: 1px solid #333; padding: 6px 8px; height: 28px; }
  .items { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .items th, .items td { border: 1px solid #333; padding: 6px 5px; text-align: center; word-break: break-word; }
  .items th { background: #f3f4f6; font-weight: 700; }
  .text-left { text-align: left !important; }
  .text-right { text-align: right !important; }
  .summary { width: 100%; border-collapse: collapse; margin-top: 10px; }
  .summary td { border: 1px solid #333; padding: 6px 8px; }
  .remark { border: 1px solid #333; border-top: 0; min-height: 34px; padding: 7px 8px; }
  .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 30px; }
  .signature { border-top: 1px solid #111; padding-top: 6px; text-align: center; }
  .footer-note { margin-top: 12px; color: #555; font-size: 10px; }
  @media print { body { margin: 0; } }
`;

function page(title, body, docNo = '{{document_no}}', company = '{{company_name}}') {
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
        <div class="company">${company}</div>
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

function standardItems(columns, row) {
  return `<table class="items">
    <thead><tr>${columns.map((col) => `<th style="${col.style || ''}">${col.label}</th>`).join('')}</tr></thead>
    <tbody>
      {{#each items}}
      <tr>${row}</tr>
      {{/each}}
    </tbody>
  </table>`;
}

function signatures(labels = ['制单', '审核', '仓管', '签收']) {
  return `<div class="signatures">${labels.map((label) => `<div class="signature">${label}</div>`).join('')}</div>`;
}

const templates = {
  'sales:sales_order': page('销售订单', `
    <table class="meta">
      <tr><td>订单编号：{{order_no}}</td><td>订单日期：{{order_date}}</td><td>交货日期：{{delivery_date}}</td></tr>
      <tr><td>客户名称：{{customer_name}}</td><td>联系电话：{{contact_phone}}</td><td>业务员：{{operator}}</td></tr>
      <tr><td colspan="3">收货地址：{{delivery_address}}</td></tr>
    </table>
    ${standardItems([
      { label: '序号', style: 'width:44px' }, { label: '产品编码' }, { label: '产品名称' }, { label: '规格型号' },
      { label: '数量', style: 'width:72px' }, { label: '单位', style: 'width:56px' }, { label: '单价', style: 'width:82px' }, { label: '金额', style: 'width:92px' }
    ], '<td>{{index}}</td><td>{{product_code}}</td><td class="text-left">{{product_name}}</td><td>{{specification}}</td><td class="text-right">{{quantity}}</td><td>{{unit_name}}</td><td class="text-right">{{unit_price}}</td><td class="text-right">{{amount}}</td>')}
    <table class="summary"><tr><td class="text-right">合计金额：{{total_amount}}</td></tr></table>
    <div class="remark">备注：{{remark}}</div>
    ${signatures(['制单', '销售审核', '客户确认', '日期'])}
  `, '{{order_no}}'),

  'sales:sales_outbound': page('销售出库单', `
    <table class="meta">
      <tr><td>出库单号：{{outbound_no}}</td><td>销售订单：{{order_no}}</td><td>出库日期：{{delivery_date}}</td></tr>
      <tr><td>客户名称：{{customer_name}}</td><td>联系人/电话：{{contact}} {{phone}}</td><td>仓库：{{location_name}}</td></tr>
      <tr><td colspan="3">收货地址：{{address}}</td></tr>
    </table>
    ${standardItems([
      { label: '序号', style: 'width:44px' }, { label: '产品编码' }, { label: '产品名称' }, { label: '规格型号' },
      { label: '数量', style: 'width:80px' }, { label: '单位', style: 'width:56px' }, { label: '批次/备注' }
    ], '<td>{{index}}</td><td>{{product_code}}</td><td class="text-left">{{product_name}}</td><td>{{specification}}</td><td class="text-right">{{quantity}}</td><td>{{unit_name}}</td><td>{{batch_no}}{{remark}}</td>')}
    <div class="remark">备注：{{remarks}}{{remark}}</div>
    ${signatures(['制单', '仓管', '配送/承运', '客户签收'])}
  `, '{{outbound_no}}'),

  'sales:sales_return': page('销售退货单', `
    <table class="meta">
      <tr><td>退货单号：{{return_no}}</td><td>退货日期：{{return_date}}</td><td>关联订单：{{order_no}}</td></tr>
      <tr><td>客户名称：{{customer_name}}</td><td>经办人：{{operator}}</td><td>状态：{{status}}</td></tr>
      <tr><td colspan="3">退货原因：{{reason}}</td></tr>
    </table>
    ${standardItems([
      { label: '序号', style: 'width:44px' }, { label: '物料编码' }, { label: '物料名称' }, { label: '规格型号' },
      { label: '退货数量', style: 'width:86px' }, { label: '单位', style: 'width:56px' }, { label: '备注' }
    ], '<td>{{index}}</td><td>{{material_code}}</td><td class="text-left">{{material_name}}</td><td>{{specification}}</td><td class="text-right">{{quantity}}</td><td>{{unit_name}}</td><td>{{remark}}</td>')}
    ${signatures(['制单', '销售确认', '质检确认', '仓库接收'])}
  `, '{{return_no}}'),

  'purchase:purchase_requisition': page('采购申请单', `
    <table class="meta">
      <tr><td>申请单号：{{requisition_number}}</td><td>申请日期：{{request_date}}</td><td>申请人：{{requester}}</td></tr>
      <tr><td>状态：{{status}}</td><td colspan="2">备注：{{remarks}}</td></tr>
    </table>
    ${standardItems([
      { label: '序号', style: 'width:44px' }, { label: '物料编码' }, { label: '物料名称' }, { label: '规格型号' },
      { label: '申请数量', style: 'width:86px' }, { label: '单位', style: 'width:56px' }, { label: '需求说明' }
    ], '<td>{{index}}</td><td>{{material_code}}</td><td class="text-left">{{material_name}}</td><td>{{specification}}</td><td class="text-right">{{quantity}}</td><td>{{unit_name}}</td><td>{{remark}}</td>')}
    ${signatures(['申请人', '部门审核', '采购确认', '批准'])}
  `, '{{requisition_number}}'),

  'inventory:inbound': page('入库单', `
    <table class="meta">
      <tr><td>入库单号：{{inbound_no}}</td><td>入库日期：{{inbound_date}}</td><td>入库类型：{{inbound_type}}</td></tr>
      <tr><td>供应商：{{supplier_name}}</td><td>仓库：{{location_name}}</td><td>经办人：{{operator}}</td></tr>
    </table>
    ${standardItems([
      { label: '序号', style: 'width:44px' }, { label: '物料编码' }, { label: '物料名称' }, { label: '规格型号' },
      { label: '入库数量', style: 'width:86px' }, { label: '单位', style: 'width:56px' }, { label: '备注' }
    ], '<td>{{index}}</td><td>{{material_code}}</td><td class="text-left">{{material_name}}</td><td>{{specification}}</td><td class="text-right">{{quantity}}</td><td>{{unit_name}}</td><td>{{remark}}</td>')}
    <div class="remark">备注：{{remark}}</div>
    ${signatures(['制单', '质检', '仓管', '审核'])}
  `, '{{inbound_no}}'),

  'inventory:outbound': page('出库单', `
    <table class="meta">
      <tr><td>出库单号：{{outbound_no}}</td><td>出库日期：{{outbound_date}}</td><td>出库类型：{{outbound_type}}</td></tr>
      <tr><td>领料部门：{{department}}</td><td>仓库：{{location_name}}</td><td>经办人：{{operator}}</td></tr>
    </table>
    ${standardItems([
      { label: '序号', style: 'width:44px' }, { label: '物料编码' }, { label: '物料名称' }, { label: '规格型号' },
      { label: '出库数量', style: 'width:86px' }, { label: '单位', style: 'width:56px' }, { label: '备注' }
    ], '<td>{{index}}</td><td>{{material_code}}</td><td class="text-left">{{material_name}}</td><td>{{specification}}</td><td class="text-right">{{quantity}}</td><td>{{unit_name}}</td><td>{{remark}}</td>')}
    <div class="remark">备注：{{remark}}</div>
    ${signatures(['制单', '领料', '仓管', '审核'])}
  `, '{{outbound_no}}'),

  'inventory:production_outbound': page('生产出库单', `
    <table class="meta">
      <tr><td>出库单号：{{outbound_no}}</td><td>生产计划：{{production_plan_code}}</td><td>出库日期：{{outbound_date}}</td></tr>
      <tr><td>单据类型：{{outbound_type_text}}</td><td>状态：{{status}}</td><td>经办人：{{operator}}</td></tr>
    </table>
    ${standardItems([
      { label: '序号', style: 'width:44px' }, { label: '物料编码' }, { label: '物料名称' }, { label: '规格型号' },
      { label: '单位', style: 'width:52px' }, { label: '计划出库', style: 'width:82px' }, { label: '实际出库', style: 'width:82px' },
      { label: '缺料', style: 'width:72px' }, { label: '出库仓库' }
    ], '<td>{{index}}</td><td>{{material_code}}</td><td class="text-left">{{material_name}}</td><td>{{specification}}</td><td>{{unit_name}}</td><td class="text-right">{{planned_quantity}}</td><td class="text-right">{{actual_quantity}}</td><td class="text-right">{{shortage_quantity}}</td><td>{{location_name}}</td>')}
    <div class="remark">备注：{{remark}}</div>
    ${signatures(['制单', '领料', '仓管', '审核'])}
  `, '{{outbound_no}}'),

  'inventory:transfer': page('库存调拨单', `
    <table class="meta">
      <tr><td>调拨单号：{{transfer_no}}</td><td>调拨日期：{{transfer_date}}</td><td>状态：{{status}}</td></tr>
      <tr><td>调出仓库：{{from_location_name}}</td><td>调入仓库：{{to_location_name}}</td><td>经办人：{{operator}}</td></tr>
    </table>
    ${standardItems([
      { label: '序号', style: 'width:44px' }, { label: '物料编码' }, { label: '物料名称' }, { label: '规格型号' },
      { label: '调拨数量', style: 'width:86px' }, { label: '单位', style: 'width:56px' }, { label: '备注' }
    ], '<td>{{index}}</td><td>{{material_code}}</td><td class="text-left">{{material_name}}</td><td>{{specification}}</td><td class="text-right">{{quantity}}</td><td>{{unit_name}}</td><td>{{remark}}</td>')}
    <div class="remark">备注：{{remark}}</div>
    ${signatures(['制单', '调出仓', '调入仓', '审核'])}
  `, '{{transfer_no}}'),

  'inventory:inventory_stock': page('库存明细表', `
    <table class="meta">
      <tr><td>统计日期：{{stock_date}}</td><td>仓库：{{location_name}}</td><td>打印人：{{operator}}</td></tr>
      <tr><td colspan="3">筛选条件：{{filter_summary}}</td></tr>
    </table>
    ${standardItems([
      { label: '序号', style: 'width:44px' }, { label: '物料编码' }, { label: '物料名称' }, { label: '规格型号' },
      { label: '库存数量', style: 'width:86px' }, { label: '可用数量', style: 'width:86px' }, { label: '单位', style: 'width:56px' }, { label: '仓库' }
    ], '<td>{{index}}</td><td>{{material_code}}</td><td class="text-left">{{material_name}}</td><td>{{specification}}</td><td class="text-right">{{quantity}}</td><td class="text-right">{{available_quantity}}</td><td>{{unit_name}}</td><td>{{location_name}}</td>')}
    ${signatures(['打印', '仓管', '复核', '日期'])}
  `, '{{stock_no}}'),

  'finance:invoice': page('销售发票', `
    <table class="meta">
      <tr><td>发票号：{{invoice_number}}</td><td>开票日期：{{invoice_date}}</td><td>客户：{{customer_name}}</td></tr>
      <tr><td>订单号：{{order_no}}</td><td>税率：{{tax_rate}}</td><td>状态：{{status}}</td></tr>
    </table>
    ${standardItems([
      { label: '序号', style: 'width:44px' }, { label: '项目编码' }, { label: '项目名称' }, { label: '规格' },
      { label: '数量', style: 'width:72px' }, { label: '单价', style: 'width:82px' }, { label: '税额', style: 'width:82px' }, { label: '金额', style: 'width:92px' }
    ], '<td>{{index}}</td><td>{{item_code}}</td><td class="text-left">{{item_name}}</td><td>{{specification}}</td><td class="text-right">{{quantity}}</td><td class="text-right">{{unit_price}}</td><td class="text-right">{{tax_amount}}</td><td class="text-right">{{amount}}</td>')}
    <table class="summary"><tr><td>不含税金额：{{subtotal}}</td><td>税额：{{tax_amount}}</td><td>价税合计：{{total_amount}}</td></tr></table>
    ${signatures(['开票', '复核', '财务主管', '日期'])}
  `, '{{invoice_number}}'),

  'finance:ap_invoice': page('采购发票', `
    <table class="meta">
      <tr><td>发票号：{{invoice_number}}</td><td>发票日期：{{invoice_date}}</td><td>供应商：{{supplier_name}}</td></tr>
      <tr><td>采购订单：{{order_no}}</td><td>税率：{{tax_rate}}</td><td>状态：{{status}}</td></tr>
    </table>
    ${standardItems([
      { label: '序号', style: 'width:44px' }, { label: '物料编码' }, { label: '物料名称' }, { label: '规格' },
      { label: '数量', style: 'width:72px' }, { label: '单价', style: 'width:82px' }, { label: '税额', style: 'width:82px' }, { label: '金额', style: 'width:92px' }
    ], '<td>{{index}}</td><td>{{material_code}}</td><td class="text-left">{{material_name}}</td><td>{{specification}}</td><td class="text-right">{{quantity}}</td><td class="text-right">{{unit_price}}</td><td class="text-right">{{tax_amount}}</td><td class="text-right">{{amount}}</td>')}
    <table class="summary"><tr><td>不含税金额：{{subtotal}}</td><td>税额：{{tax_amount}}</td><td>价税合计：{{total_amount}}</td></tr></table>
    ${signatures(['登记', '复核', '财务主管', '日期'])}
  `, '{{invoice_number}}'),

  'finance:ar_receipt': page('收款凭证', `
    <table class="meta">
      <tr><td>凭证号：{{receipt_number}}</td><td>收款日期：{{receipt_date}}</td><td>客户：{{customer_name}}</td></tr>
      <tr><td>收款方式：{{payment_method}}</td><td>账户：{{bank_account_name}}</td><td>账号：{{bank_account_number}}</td></tr>
      <tr><td>金额：{{amount}}</td><td colspan="2">大写：{{amount_upper}}</td></tr>
      <tr><td>关联发票：{{invoice_number}}</td><td colspan="2">备注：{{notes}}</td></tr>
    </table>
    ${signatures(['出纳', '会计', '财务主管', '收款确认'])}
  `, '{{receipt_number}}'),

  'finance:ap_payment': page('付款凭证', `
    <table class="meta">
      <tr><td>凭证号：{{payment_number}}</td><td>付款日期：{{payment_date}}</td><td>供应商：{{supplier_name}}</td></tr>
      <tr><td>付款方式：{{payment_method}}</td><td>账户：{{bank_account_name}}</td><td>账号：{{bank_account_number}}</td></tr>
      <tr><td>金额：{{amount}}</td><td colspan="2">大写：{{amount_upper}}</td></tr>
      <tr><td>关联发票：{{invoice_number}}</td><td colspan="2">备注：{{notes}}</td></tr>
    </table>
    ${signatures(['申请', '会计', '财务主管', '出纳付款'])}
  `, '{{payment_number}}'),

  'finance:bank_statement': page('银行存款日记账', `
    <table class="meta">
      <tr><td>账户：{{accountName}}</td><td>账号：{{accountNumber}}</td><td>打印日期：{{printDate}}</td></tr>
    </table>
    <table class="items">
      <thead><tr><th>日期</th><th>往来单位</th><th>凭证号</th><th>摘要</th><th>收入</th><th>支出</th><th>余额</th></tr></thead>
      <tbody>{{tableRows}}</tbody>
    </table>
    ${signatures(['出纳', '会计', '财务主管', '日期'])}
  `, '{{accountNumber}}', '{{companyName}}'),

  'finance:cash_statement': page('现金日记账', `
    <table class="meta">
      <tr><td>打印日期：{{printDate}}</td><td colspan="2">单位：{{companyName}}</td></tr>
    </table>
    <table class="items">
      <thead><tr><th>日期</th><th>凭证号</th><th>对方单位</th><th>摘要</th><th>收入</th><th>支出</th><th>余额</th></tr></thead>
      <tbody>{{tableRows}}</tbody>
    </table>
    ${signatures(['出纳', '会计', '财务主管', '日期'])}
  `, '{{printDate}}', '{{companyName}}'),
};

function fallbackTemplate(title, docPrefix) {
  return page(title, `
    <table class="meta">
      <tr><td>单据编号：{{document_no}}</td><td>日期：{{date}}</td><td>状态：{{status}}</td></tr>
      <tr><td colspan="3">备注：{{remark}}{{remarks}}{{notes}}</td></tr>
    </table>
    ${standardItems([
      { label: '序号', style: 'width:44px' }, { label: '编码' }, { label: '名称' }, { label: '规格' },
      { label: '数量', style: 'width:82px' }, { label: '单位', style: 'width:56px' }, { label: '结果/备注' }
    ], '<td>{{index}}</td><td>{{material_code}}{{product_code}}{{item_code}}</td><td class="text-left">{{material_name}}{{product_name}}{{item_name}}</td><td>{{specification}}</td><td class="text-right">{{quantity}}</td><td>{{unit_name}}</td><td>{{result}}{{remark}}</td>')}
    ${signatures(['制单', '审核', '确认', '日期'])}
  `, `{{${docPrefix}_no}}`);
}

async function upsertDefaultTemplate(knex, module, templateType, name, content) {
  const rows = await knex('print_templates')
    .select('id')
    .where({ module, template_type: templateType })
    .whereNull('deleted_at')
    .orderBy('is_default', 'desc')
    .orderBy('id', 'asc');

  if (rows.length === 0) {
    await knex('print_templates').insert({
      name: `${name}默认模板`,
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
    });
    return;
  }

  const keepId = rows[0].id;
  await knex('print_templates')
    .where({ module, template_type: templateType })
    .whereNull('deleted_at')
    .update({ is_default: 0 });

  await knex('print_templates').where({ id: keepId }).update({
    name: `${name}默认模板`,
    content,
    paper_size: 'A4',
    orientation: 'portrait',
    margin_top: 12,
    margin_right: 12,
    margin_bottom: 12,
    margin_left: 12,
    is_default: 1,
    status: 1,
  });
}

exports.up = async function up(knex) {
  for (const [module, templateType, name, prefix] of CATALOG) {
    const content = templates[`${module}:${templateType}`] || fallbackTemplate(name, prefix.toLowerCase());
    await upsertDefaultTemplate(knex, module, templateType, name, content);
  }
};

exports.down = async function down() {
  // 模板内容升级不回滚，避免覆盖用户在打印中心维护的新模板。
};
