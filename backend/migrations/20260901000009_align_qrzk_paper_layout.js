/** Align QRZK print/preview templates with the paper inspection record layout. */

const QRZK_TYPES = [
  'spring_inspection',
  'screw_inspection',
  'spring_inspection_preview',
  'screw_inspection_preview',
];

function paperFormTemplate(title) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "SimSun", "Microsoft YaHei", Arial, sans-serif; color: #111; font-size: 9px; line-height: 1.15; margin: 0; }
  .doc { width: 100%; max-width: 190mm; margin: 0 auto; }
  .brand-row { display: grid; grid-template-columns: 28% 44% 28%; align-items: end; min-height: 28px; }
  .logo { font-family: Arial, sans-serif; font-size: 28px; font-style: italic; font-weight: 900; letter-spacing: -1px; line-height: 1; }
  .company { text-align: center; font-size: 22px; font-weight: 700; line-height: 1.1; white-space: nowrap; }
  .title { text-align: center; font-size: 17px; font-weight: 700; margin: 5px 0 2px; }
  .form-code { font-size: 13px; margin: 0 0 3px 9%; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .meta th, .meta td { border: 1px solid #333; height: 25px; padding: 3px 5px; vertical-align: middle; }
  .meta th { width: 10%; font-weight: 400; text-align: center; }
  .meta td { width: 23.333%; text-align: center; }
  .meta .accent { color: #f00; }
  .meta .full { height: 22px; text-align: center; }
  .items { margin-top: 0; }
  .items th, .items td { border: 1px solid #333; padding: 3px 2px; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
  .items thead th { font-weight: 400; height: 23px; }
  .items thead tr:nth-child(2) th { height: 21px; }
  .items tbody td { height: 24px; }
  .items .project { width: 12%; }
  .items .standard { width: 27%; }
  .items .method { width: 12%; }
  .items .measurement { width: 5.6%; }
  .items .judgment { width: 15.4%; }
  .items .text-left { text-align: left; }
  .items .judgment-cell { white-space: nowrap; font-size: 8px; }
  .disposition { margin-top: 0; }
  .disposition th, .disposition td { border: 1px solid #333; padding: 4px 5px; height: 25px; vertical-align: middle; }
  .disposition th { font-weight: 400; text-align: center; }
  .disposition .section-title { height: 23px; font-size: 11px; }
  .disposition .center { text-align: center; }
  .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 28px 8% 0; font-size: 10px; }
  .signature { text-align: center; white-space: nowrap; }
  </style>
</head>
<body>
  <div class="doc">
    <div class="brand-row">
      <div class="logo">KACON</div>
      <div class="company">{{default company_name "浙江开控电气有限公司"}}</div>
      <div></div>
    </div>
    <div class="title">零件检验记录单</div>
    <div class="form-code">QR/ZK-17-01</div>

    <table class="meta">
      <colgroup>
        <col style="width:10%"><col style="width:23.333%">
        <col style="width:10%"><col style="width:23.333%">
        <col style="width:10%"><col style="width:23.334%">
      </colgroup>
      <tbody>
        <tr>
          <th>零件名称</th><td class="accent">{{material_name}}</td>
          <th>规格型号</th><td class="accent">{{default specs "-"}}</td>
          <th>物料编码</th><td class="accent">{{material_code}}</td>
        </tr>
        <tr>
          <th>供应商</th><td>{{supplier_name}}</td>
          <th>材质</th><td>{{default material "-"}}</td>
          <th>到货数量</th><td>{{default arrival_quantity quantity}}</td>
        </tr>
        <tr>
          <th>来料批次</th><td>{{batch_no}}</td>
          <th>抽样数量</th><td>{{default sample_quantity quantity}}</td>
          <th>检验日期</th><td>{{inspection_date}}</td>
        </tr>
        <tr><td colspan="6" class="full">检验依据：{{default inspection_basis "按检验标准/图纸"}}</td></tr>
        <tr><td colspan="6" class="full">抽样方案：{{default sampling_plan "GB/T 2828.1 一般检验水平 II"}}</td></tr>
      </tbody>
    </table>

    <table class="items">
      <colgroup>
        <col class="project"><col class="standard"><col class="method">
        <col class="measurement"><col class="measurement"><col class="measurement">
        <col class="measurement"><col class="measurement"><col class="measurement">
        <col class="judgment">
      </colgroup>
      <thead>
        <tr>
          <th rowspan="2">项目</th>
          <th rowspan="2">检验要求/标准</th>
          <th rowspan="2">检测方法</th>
          <th colspan="6">实测数</th>
          <th rowspan="2">判定</th>
        </tr>
        <tr>
          <th>1#</th><th>2#</th><th>3#</th><th>4#</th><th>5#</th><th>6#</th>
        </tr>
      </thead>
      <tbody>
        {{#each inspection_items}}
        <tr>
          <td>{{item_name}}</td>
          <td class="text-left">{{standard}}</td>
          <td>{{method}}</td>
          <td>{{default measure_1 "{无}"}}</td>
          <td>{{default measure_2 "{无}"}}</td>
          <td>{{default measure_3 "{无}"}}</td>
          <td>{{default measure_4 "{无}"}}</td>
          <td>{{default measure_5 "{无}"}}</td>
          <td>{{default measure_6 "{无}"}}</td>
          <td class="judgment-cell">
            {{#if result_is_passed}}√合格  □不合格{{else}}{{#if result_is_failed}}□合格  ×不合格{{else}}□合格  □不合格{{/if}}{{/if}}
          </td>
        </tr>
        {{/each}}
      </tbody>
    </table>

    <table class="disposition">
      <tbody>
        <tr><th colspan="6" class="section-title">不合格品情况与处置</th></tr>
        <tr>
          <th style="width:12%">不良数</th><td style="width:18%" class="center">{{default unqualified_quantity ""}}</td>
          <th style="width:12%">不良率</th><td style="width:12%" class="center">{{default unqualified_rate ""}}%</td>
          <th style="width:16%">主要不良</th><td>{{default major_defect ""}}</td>
        </tr>
        <tr><th>处置方式</th><td colspan="5">□接收  □拒收  □让步接收（需批准）  □挑选使用  □其他  {{default disposition ""}}</td></tr>
      </tbody>
    </table>

    <div class="signatures">
      <div class="signature">检验员：{{inspector_name}}</div>
      <div class="signature">审核：{{default reviewer_name ""}}</div>
      <div class="signature">技术（让步时）：{{default technical_name ""}}</div>
      <div class="signature">批准：{{default approver_name ""}}</div>
    </div>
  </div>
</body>
</html>`;
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('print_templates'))) return;

  const rows = await knex('print_templates')
    .select('id', 'template_type', 'content')
    .whereIn('template_type', QRZK_TYPES)
    .whereNull('deleted_at');

  for (const row of rows) {
    const isPreview = row.template_type.endsWith('_preview');
    const title = isPreview
      ? 'QRZK-17-01 零件检验记录单预览'
      : 'QRZK-17-01 零件检验记录单';
    const content = paperFormTemplate(title);
    if (content !== row.content) {
      await knex('print_templates').where({ id: row.id }).update({
        content,
        paper_size: 'A4',
        orientation: 'portrait',
        margin_top: 10,
        margin_right: 10,
        margin_bottom: 10,
        margin_left: 10,
        updated_at: knex.fn.now(),
      });
    }
  }
};

exports.down = async function down() {};
