/**
 * 打印中心闭环治理
 * - 修复同一 module/template_type 多个默认模板的问题
 * - 将生产出库单模板统一为真实出库明细，不再展示“智能替代”概念
 * - 为当前打印中心目录补齐缺失的默认模板占位，所有业务打印从 print_templates 取模板
 */

const PRINT_CATALOG = [
  ['sales', 'sales_order', '销售订单默认模板'],
  ['sales', 'sales_outbound', '销售出库单默认模板'],
  ['sales', 'sales_return', '销售退货单默认模板'],
  ['purchase', 'purchase_order', '采购订单默认模板'],
  ['purchase', 'purchase_requisition', '采购申请单默认模板'],
  ['inventory', 'inbound', '入库单默认模板'],
  ['inventory', 'outbound', '出库单默认模板'],
  ['inventory', 'production_outbound', '生产出库单默认模板'],
  ['inventory', 'inventory_stock', '库存明细默认模板'],
  ['inventory', 'transfer', '库存调拨单默认模板'],
  ['production', 'production_task', '生产任务单默认模板'],
  ['quality', 'quality_inspection', '质检单默认模板'],
  ['quality', 'incoming_inspection', '来料检验单默认模板'],
  ['quality', 'process_inspection', '过程检验单默认模板'],
  ['quality', 'first_article_inspection', '首件检验单默认模板'],
  ['quality', 'final_inspection', '成品检验单默认模板'],
  ['finance', 'invoice', '销售发票默认模板'],
  ['finance', 'ap_invoice', '采购发票默认模板'],
  ['finance', 'bank_statement', '银行存款日记账默认模板'],
  ['finance', 'cash_statement', '现金日记账默认模板'],
  ['finance', 'ar_receipt', '收款凭证默认模板'],
  ['finance', 'ap_payment', '付款凭证默认模板'],
];

const productionOutboundTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>生产出库单 - {{outbound_no}}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: "SimSun", "Microsoft YaHei", Arial, sans-serif; font-size: 12px; color: #111; }
    .title { text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 4px; margin-bottom: 14px; }
    .meta { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .meta td { border: none; padding: 4px 6px; }
    .items { width: 100%; border-collapse: collapse; margin-top: 8px; }
    .items th, .items td { border: 1px solid #222; padding: 6px 5px; text-align: center; }
    .items th { background: #f3f4f6; font-weight: 700; }
    .text-left { text-align: left; }
    .text-right { text-align: right; }
    .remark { margin-top: 10px; line-height: 1.6; }
    .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="title">生产出库单</div>
  <table class="meta">
    <tr>
      <td>出库单号：{{outbound_no}}</td>
      <td>生产计划：{{production_plan_code}}</td>
      <td>出库日期：{{outbound_date}}</td>
    </tr>
    <tr>
      <td>单据类型：{{outbound_type_text}}</td>
      <td>状态：{{status}}</td>
      <td>打印时间：{{print_time}}</td>
    </tr>
  </table>
  <table class="items">
    <thead>
      <tr>
        <th style="width: 42px;">序号</th>
        <th>物料编码</th>
        <th>物料名称</th>
        <th>规格型号</th>
        <th style="width: 64px;">单位</th>
        <th style="width: 86px;">计划出库</th>
        <th style="width: 86px;">实际出库</th>
        <th style="width: 86px;">缺料</th>
        <th>出库仓库</th>
      </tr>
    </thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{index}}</td>
        <td>{{material_code}}</td>
        <td class="text-left">{{material_name}}</td>
        <td>{{specification}}</td>
        <td>{{unit_name}}</td>
        <td class="text-right">{{planned_quantity}}</td>
        <td class="text-right">{{actual_quantity}}</td>
        <td class="text-right">{{shortage_quantity}}</td>
        <td>{{location_name}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <div class="remark">备注：{{remark}}</div>
  <div class="signatures">
    <div>制单人：{{operator}}</div>
    <div>领料人：__________</div>
    <div>仓管员：__________</div>
    <div>审核人：__________</div>
  </div>
</body>
</html>`;

function genericTemplate(title, numberField = 'document_no', dateField = 'date') {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} - {{${numberField}}}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: "SimSun", "Microsoft YaHei", Arial, sans-serif; font-size: 12px; color: #111; }
    .title { text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 3px; margin-bottom: 14px; }
    .meta { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .meta td { border: none; padding: 4px 6px; }
    table.items { width: 100%; border-collapse: collapse; }
    .items th, .items td { border: 1px solid #222; padding: 6px 5px; text-align: center; }
    .items th { background: #f3f4f6; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="title">${title}</div>
  <table class="meta">
    <tr><td>单据编号：{{${numberField}}}</td><td>日期：{{${dateField}}}</td><td>状态：{{status}}</td></tr>
    <tr><td colspan="3">备注：{{remark}}{{remarks}}{{notes}}</td></tr>
  </table>
  <table class="items">
    <thead><tr><th>序号</th><th>编码</th><th>名称</th><th>规格</th><th>数量</th><th>单位</th><th>备注</th></tr></thead>
    <tbody>
      {{#each items}}
      <tr>
        <td>{{index}}</td><td>{{material_code}}{{product_code}}</td><td>{{material_name}}{{product_name}}</td>
        <td>{{specification}}</td><td>{{quantity}}</td><td>{{unit_name}}</td><td>{{remark}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <div class="signatures"><div>制单：__________</div><div>审核：__________</div><div>日期：__________</div></div>
</body>
</html>`;
}

async function indexExists(knex, indexName) {
  const [rows] = await knex.raw(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'print_templates' AND INDEX_NAME = ? LIMIT 1`,
    [indexName]
  );
  return rows.length > 0;
}

exports.up = async function up(knex) {
  const duplicateGroups = await knex('print_templates')
    .whereNull('deleted_at')
    .where('is_default', 1)
    .select('module', 'template_type')
    .groupBy('module', 'template_type')
    .havingRaw('COUNT(*) > 1');

  for (const group of duplicateGroups) {
    const module = group.module;
    const templateType = group.template_type;
    const rows = await knex('print_templates')
      .select('id')
      .where({ module, template_type: templateType, is_default: 1 })
      .whereNull('deleted_at')
      .orderBy('id', 'asc');
    const keepId = rows[0]?.id;
    const duplicateIds = rows.map((row) => row.id).filter((id) => id !== keepId);
    if (duplicateIds.length > 0) {
      await knex('print_templates').whereIn('id', duplicateIds).update({ is_default: 0 });
    }
  }

  for (const [module, templateType, name] of PRINT_CATALOG) {
    const existing = await knex('print_templates')
      .where({ module, template_type: templateType })
      .whereNull('deleted_at')
      .orderBy('id', 'asc')
      .first();

    if (!existing) {
      await knex('print_templates').insert({
        name,
        module,
        template_type: templateType,
        content: templateType === 'production_outbound' ? productionOutboundTemplate : genericTemplate(name),
        paper_size: 'A4',
        orientation: 'portrait',
        margin_top: 10,
        margin_right: 10,
        margin_bottom: 10,
        margin_left: 10,
        is_default: 1,
        status: 1,
      });
    }
  }

  const productionTemplate = await knex('print_templates')
    .where({ module: 'inventory', template_type: 'production_outbound' })
    .whereNull('deleted_at')
    .orderBy('id', 'asc')
    .first();

  if (productionTemplate) {
    await knex('print_templates')
      .where({ module: 'inventory', template_type: 'production_outbound' })
      .whereNull('deleted_at')
      .update({ is_default: 0 });
    await knex('print_templates').where({ id: productionTemplate.id }).update({
      name: '生产出库单默认模板',
      content: productionOutboundTemplate,
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

  const hasDefaultKey = await knex.schema.hasColumn('print_templates', 'default_template_key');
  if (!hasDefaultKey) {
    try {
      await knex.raw(`
        ALTER TABLE print_templates
        ADD COLUMN default_template_key VARCHAR(128)
        GENERATED ALWAYS AS (
          CASE
            WHEN is_default = 1 AND deleted_at IS NULL THEN CONCAT(module, ':', template_type)
            ELSE NULL
          END
        ) STORED
      `);
    } catch (error) {
      console.warn('[print migration] skip generated default key:', error.message);
    }
  }

  if (await knex.schema.hasColumn('print_templates', 'default_template_key')) {
    const exists = await indexExists(knex, 'uk_print_templates_active_default');
    if (!exists) {
      try {
        await knex.raw('CREATE UNIQUE INDEX uk_print_templates_active_default ON print_templates (default_template_key)');
      } catch (error) {
        console.warn('[print migration] skip unique default index:', error.message);
      }
    }
  }
};

exports.down = async function down(knex) {
  if (await indexExists(knex, 'uk_print_templates_active_default')) {
    await knex.raw('DROP INDEX uk_print_templates_active_default ON print_templates');
  }

  if (await knex.schema.hasColumn('print_templates', 'default_template_key')) {
    await knex.raw('ALTER TABLE print_templates DROP COLUMN default_template_key');
  }
};
