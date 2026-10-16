'use strict';

// Restore the supplied KACON purchase order form. Keep the HTML versioned with
// the migration so future template edits cannot change an already-applied file.
const templateContent = `
<style id="kacon-purchase-order-layout" data-print-preserve-fonts="true">
  @page { size: A4 portrait; margin: 7mm 8mm 10mm 11mm; }
  .kacon-order, .kacon-order * { box-sizing: border-box; }
  .kacon-order {
    width: 100%; max-width: 191mm; margin: 0 auto;
    color: #171717; background: #fff;
    font-family: "Times New Roman", "SimSun", "Songti SC", serif;
    font-size: 10.2pt; font-weight: 400; line-height: 1.2;
    break-after: page; page-break-after: always;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .kacon-order:last-child { break-after: auto; page-break-after: auto; }
  .kacon-order p, .kacon-order h1, .kacon-order h2 { margin: 0; font-weight: 400; }
  .kacon-header { display: grid; grid-template-columns: 54mm 74mm 1fr; height: 25mm; margin-left: 10mm; }
  .kacon-title { padding-top: .5mm; font-family: "SimSun", "Songti SC", serif; font-size: 47pt; line-height: 1.15; letter-spacing: 1.5pt; white-space: nowrap; }
  .kacon-group { height: 6mm; padding-left: .6mm; border-bottom: 1mm solid #222; font-size: 10.5pt; line-height: 5mm; }
  .kacon-company-band { display: grid; grid-template-columns: 17mm 1fr; align-items: center; height: 13mm; border-bottom: 1mm solid #222; }
  .kacon-ownership { text-align: center; font-size: 10.7pt; line-height: 4.8mm; letter-spacing: 1.2mm; }
  .kacon-company-name { font-size: 12.5pt; font-weight: 700; line-height: 6.1mm; letter-spacing: 1.7pt; white-space: nowrap; }
  .kacon-company-en { font-family: Arial, sans-serif; font-size: 8.9pt; line-height: 4mm; white-space: nowrap; }
  .kacon-company-phone { padding-top: 1.1mm; padding-left: 2mm; font-size: 9.7pt; white-space: nowrap; }
  .kacon-company-phone span { font-family: Arial, sans-serif; font-size: 9.2pt; }
  .kacon-brand { padding: 2.1mm 0 0 9mm; white-space: nowrap; }
  .kacon-brand-caption { font-family: Arial, sans-serif; font-size: 11pt; line-height: 5mm; }
  .kacon-logo { margin-top: 1mm; font-family: Arial, sans-serif; font-size: 24pt; line-height: 9mm; }
  .kacon-company-fax { margin: 3mm 0 0 -5mm; font-size: 9.7pt; }
  .kacon-company-fax span { font-family: Arial, sans-serif; font-size: 9.2pt; }
  .kacon-meta { margin: 7mm 5mm 1.6mm 6.5mm; font-size: 10.5pt; }
  .kacon-meta-row { display: grid; grid-template-columns: 63.5% 36.5%; min-height: 6.65mm; border-bottom: .25mm solid #222; align-items: center; }
  .kacon-meta-field { display: flex; align-items: baseline; min-width: 0; padding: .6mm 0; }
  .kacon-meta-label { flex: 0 0 24mm; white-space: nowrap; }
  .kacon-meta-right .kacon-meta-label { flex-basis: 18mm; }
  .kacon-meta-value { overflow-wrap: anywhere; }
  .kacon-supplier-code { display: inline-block; margin-right: 5mm; }
  .kacon-meta-page { margin-left: 2mm; font-size: 8pt; white-space: nowrap; }
  .kacon-order table { border-collapse: collapse; border-spacing: 0; background: #fff; }
  .kacon-items { width: 100%; table-layout: fixed; border: .4mm solid #222; }
  .kacon-items th, .kacon-items td { border: .25mm solid #222; padding: .5mm .65mm; color: #171717; background: #fff; font-size: 9.6pt; font-weight: 400; line-height: 1.1; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
  .kacon-items thead th { height: 6.5mm; padding-left: 0; padding-right: 0; white-space: nowrap; }
  .kacon-item-headings { display: grid; grid-template-columns: 40.79% 59.21%; }
  .kacon-items tbody td { height: 6mm; }
  .kacon-items .kacon-specification { font-size: 8pt; text-align: left; }
  .kacon-items .kacon-item-remark { font-size: 9pt; text-align: left; white-space: pre-wrap; }
  .kacon-items .kacon-material-code { text-align: left; }
  .kacon-items .kacon-number { font-size: 9.2pt; white-space: normal; }
  .kacon-items tfoot td { height: 7.1mm; font-size: 10pt; text-align: left; }
  .kacon-items .kacon-subtotal-label { white-space: nowrap; }
  .kacon-total-values { display: grid; grid-template-columns: 21mm 41mm 44mm 1fr; align-items: center; gap: 0; }
  .kacon-total-group { display: flex; align-items: baseline; gap: 2mm; white-space: nowrap; }
  .kacon-amount-upper { padding-left: .6mm; overflow-wrap: anywhere; }
  .kacon-items .kacon-continuation { text-align: right; font-size: 9pt; }
  .kacon-terms { margin: .7mm 1.5mm 0 4mm; font-size: 10.2pt; line-height: 1.18; }
  .kacon-terms h2 { font-size: inherit; line-height: inherit; }
  .kacon-terms .kacon-term-detail { margin-left: 5mm; }
  .kacon-terms .kacon-rejection-term { margin-left: 8mm; }
  .kacon-packing { display: grid; grid-template-columns: 69mm 1fr; gap: 2.5mm; align-items: start; margin: 1mm 8mm 0 10mm; break-inside: avoid; }
  .kacon-packing-table { width: 69mm; table-layout: fixed; border: .3mm solid #222; }
  .kacon-packing-table td, .kacon-packing-table th { height: 9.7mm; border: .25mm solid #222; padding: .6mm 1mm; background: #fff; font-size: 10.5pt; font-weight: 400; text-align: center; }
  .kacon-packing-table .kacon-packing-title { padding: 1mm; font-size: 14pt; line-height: 1.15; }
  .kacon-packing-title span { display: block; }
  .kacon-technical { font-size: 10.5pt; line-height: 1.3; }
  .kacon-technical-text { margin-top: 1mm; white-space: pre-wrap; overflow-wrap: anywhere; }
  .kacon-confirmations { display: grid; grid-template-columns: 74mm 1fr; gap: 8mm; margin: 4.5mm 6mm 0 10mm; break-inside: avoid; }
  .kacon-confirmations h2 { font-size: 10.3pt; line-height: 5mm; }
  .kacon-signature-fields { padding-left: 9mm; margin-top: 1mm; }
  .kacon-signature-row { display: flex; align-items: flex-end; height: 8mm; font-size: 10pt; }
  .kacon-signature-label { flex: 0 0 6.5mm; padding-bottom: 1mm; white-space: nowrap; }
  .kacon-signature-line { display: inline-block; width: 26.5mm; height: 6mm; border-bottom: .5mm solid #222; }
  .kacon-stamp { margin-left: 4mm; padding-bottom: 1mm; }
  .kacon-slogan { margin: 2mm 0 0 20mm; text-align: left; font-size: 20pt; line-height: 1.3; white-space: nowrap; }
  @media screen { .kacon-order + .kacon-order { margin-top: 12mm; } }
  @media print {
    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
    .kacon-order { max-width: none; }
    .kacon-items tr { break-inside: avoid; page-break-inside: avoid; }
  }
</style>
{{#each print_pages}}
<section class="kacon-order" data-print-autofit="false" aria-label="订购单" data-page="{{page_number}}">
  <header class="kacon-header">
    <h1 class="kacon-title">订购单</h1>
    <div class="kacon-company">
      <div class="kacon-group">韩国自动制御集团</div>
      <div class="kacon-company-band">
        <div class="kacon-ownership">韩国<br>独资</div>
        <div>
          <div class="kacon-company-name">浙江开控电气有限公司</div>
          <div class="kacon-company-en">ZHEJIANG KACON ELECTRIC CO.,LTD</div>
        </div>
      </div>
      <div class="kacon-company-phone">电话：　<span>0577-61719000　61719003　61719007</span></div>
    </div>
    <div class="kacon-brand">
      <div class="kacon-brand-caption">Industrial controls</div>
      <div class="kacon-logo">KACON</div>
      <div class="kacon-company-fax">传真：　<span>0577-61719009</span></div>
    </div>
  </header>
  <div class="kacon-meta">
    <div class="kacon-meta-row">
      <div class="kacon-meta-field"><span class="kacon-meta-label">承制厂商：</span><span class="kacon-meta-value"><span class="kacon-supplier-code">{{supplier_code}}</span>{{supplier_name}}</span></div>
      <div class="kacon-meta-field kacon-meta-right"><span class="kacon-meta-label">订购单号：</span><span class="kacon-meta-value">{{order_no}}{{#unless eq page_count 1}}<span class="kacon-meta-page">（{{page_number}}/{{page_count}}）</span>{{/unless}}</span></div>
    </div>
    <div class="kacon-meta-row">
      <div class="kacon-meta-field"><span class="kacon-meta-label">联 系 人：</span><span class="kacon-meta-value">{{contact_person}}</span></div>
      <div class="kacon-meta-field kacon-meta-right"><span class="kacon-meta-label">日　　期：</span><span class="kacon-meta-value">{{order_date}}</span></div>
    </div>
    <div class="kacon-meta-row">
      <div class="kacon-meta-field"><span class="kacon-meta-label">传　　真：</span><span class="kacon-meta-value">{{supplier_fax}}</span></div>
      <div class="kacon-meta-field kacon-meta-right"><span class="kacon-meta-label">发 件 人：</span><span class="kacon-meta-value">{{sender_name}}</span></div>
    </div>
  </div>
  <table class="kacon-items">
    <colgroup>
      <col style="width:4%"><col style="width:12.4%"><col style="width:18%"><col style="width:12.4%"><col style="width:12.9%"><col style="width:5.2%"><col style="width:10.2%"><col style="width:7.9%"><col style="width:7.9%"><col style="width:9.1%">
    </colgroup>
    <thead><tr><th>序号</th><th colspan="2"><div class="kacon-item-headings"><span>品　名</span><span>材料/规格</span></div></th><th>备注描述</th><th>物料编码</th><th>单位</th><th>数量</th><th>单价</th><th>金额</th><th>交货日期</th></tr></thead>
    <tbody>
      {{#each items}}
      <tr><td>{{index}}</td><td>{{material_name}}</td><td class="kacon-specification">{{specification}}</td><td class="kacon-item-remark">{{remark}}</td><td class="kacon-material-code">{{material_code}}</td><td>{{unit_name}}</td><td class="kacon-number">{{quantity}}</td><td class="kacon-number">{{tax_inclusive_unit_price}}</td><td class="kacon-number">{{tax_inclusive_amount}}</td><td>{{delivery_date}}</td></tr>
      {{/each}}
    </tbody>
    <tfoot><tr>
      {{#if is_last_page}}
      <td colspan="2" class="kacon-subtotal-label">不含税合计：￥</td>
      <td colspan="8"><div class="kacon-total-values"><span>{{subtotal}}</span><span class="kacon-total-group">税额合计：￥ <span>{{tax_amount}}</span></span><span class="kacon-total-group">价税合计：￥ <span>{{total_amount}}</span></span><span class="kacon-amount-upper">{{amount_upper}}</span></div></td>
      {{else}}
      <td colspan="10" class="kacon-continuation">第 {{page_number}} / {{page_count}} 页　明细续下页，订单合计见末页</td>
      {{/if}}
    </tr></tfoot>
  </table>
  <section class="kacon-terms" aria-label="交易条款">
    <h2>一、交易条款</h2>
    <p>1.交期：承制商必须遵循本订购之交期（以承制商签字确认回传后的订购单为准），延迟交付对我公司造成实际利益的损失，我公司有权拒收货物，解除合同，并要承制商赔偿我公司由此所造成的损失。</p>
    <p>2.品质</p>
    <p class="kacon-term-detail">2.1 材料：承制商应按本订购之要求选用材料</p>
    <p class="kacon-term-detail">2.2检验方法：承制商要确保我公司产品质量，由专人按图纸要求验收入库。</p>
    <p class="kacon-term-detail">2.3 承制商必须按照我公司提供的技术资料和样品进行生产，不得随意改变。并且无我公司许可承制商不得把技术资料和样品提供给第三方阅览、租借等。由此造成的损失由承制商承担。</p>
    <p class="kacon-term-detail">2.4产品制作时，制作场地的变更、模具的变更及修理或重新制作模具时请必须事先以文书形式获得我公司许可。</p>
    <p class="kacon-term-detail">2.5 包装：严格按照我公司提出的要求进行包装。</p>
    <p>3.不良品处理</p>
    <p class="kacon-rejection-term">3.1 检验后发现品质不良或承制损坏时，承制商接获通知后一周内应将该退货部分取回，并尽快补回，逾期本公司概不负责。</p>
    <p>4.付款方式：我公司对产品验收入库后一个月凭发票付款。（发票上要注明订购单号、品名和图纸编号等与本订购单相符合的要素。）</p>
    <p>5.其他：税额如有尾差，最终以发票为准</p>
  </section>
  <div class="kacon-packing">
    <table class="kacon-packing-table" aria-label="包装标签">
      <colgroup><col style="width:10.5mm"><col style="width:18mm"><col></colgroup>
      <tbody>
        <tr><td rowspan="3" class="kacon-packing-title"><span>包</span><span>装</span><span>标</span><span>签</span></td><th>品名型号</th><td></td></tr>
        <tr><th>数　　量</th><td></td></tr>
        <tr><th>所属产品</th><td></td></tr>
      </tbody>
    </table>
    <div class="kacon-technical">技术成果要求：<div class="kacon-technical-text">{{technical_requirements}}</div></div>
  </div>
  <div class="kacon-confirmations">
    <section>
      <h2>二、委托方确认</h2>
      <div class="kacon-signature-fields">
        <div class="kacon-signature-row"><span class="kacon-signature-label">签字：</span><span class="kacon-signature-line"></span><span class="kacon-stamp">盖章：</span></div>
        <div class="kacon-signature-row"><span class="kacon-signature-label">日期：</span><span class="kacon-signature-line"></span></div>
      </div>
    </section>
    <section>
      <h2>三、承制商同意上述交易条款确认回传：</h2>
      <div class="kacon-signature-fields">
        <div class="kacon-signature-row"><span class="kacon-signature-label">签字：</span><span class="kacon-signature-line"></span><span class="kacon-stamp">盖章：</span></div>
        <div class="kacon-signature-row"><span class="kacon-signature-label">日期：</span><span class="kacon-signature-line"></span></div>
      </div>
    </section>
  </div>
  <footer class="kacon-slogan">您與KACON家族只鑄造充滿靈魂的製品！</footer>
</section>
{{/each}}
`;

exports.templateContent = templateContent;

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('print_templates'))) return;

  // Only replace the active default used by PurchaseOrders. Alternative and
  // disabled templates retain their content and status.
  await knex('print_templates')
    .where({
      module: 'purchase',
      template_type: 'purchase_order',
      is_default: 1,
      status: 1,
    })
    .whereNull('deleted_at')
    .update({
      content: templateContent,
      paper_size: 'A4',
      orientation: 'portrait',
      margin_top: 7,
      margin_right: 8,
      margin_bottom: 10,
      margin_left: 11,
      updated_at: knex.fn.now(),
    });
};

// Template contents remain editable in the print center. A rollback must not
// overwrite subsequent user edits with a generic historical template.
exports.down = async function down() {};
