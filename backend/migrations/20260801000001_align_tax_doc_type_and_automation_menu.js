/**
 * 1) 税票 related_document_type：历史中文 → 英文 SSOT
 * 2) 财务自动化菜单/通知链接：独立页 → /finance/settings?tab=automation
 */

const TAX_TYPE_MAP = [
  { from: '销售出库单', to: 'sales_outbound' },
  { from: '销售退货单', to: 'sales_return' },
  { from: '采购入库单', to: 'purchase_receipt' },
  { from: '采购收货单', to: 'purchase_receipt' },
  { from: '采购退货单', to: 'purchase_return' },
];

const AUTOMATION_PATH_OLD = '/finance/automation';
const AUTOMATION_PATH_NEW = '/finance/settings?tab=automation';
const AUTOMATION_COMPONENT = 'finance/settings/FinanceSettings';

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    // —— 税票类型归一 ——
    for (const { from, to } of TAX_TYPE_MAP) {
      await trx('tax_invoices').where('related_document_type', from).update({
        related_document_type: to,
        updated_at: trx.fn.now(),
      });
    }

    // —— 菜单：独立自动化页 → 设置 Tab ——
    await trx('menus')
      .where('path', AUTOMATION_PATH_OLD)
      .orWhere({ permission: 'finance:automation:view', component: 'finance/automation/FinanceAutomation' })
      .update({
        path: AUTOMATION_PATH_NEW,
        component: AUTOMATION_COMPONENT,
        updated_at: trx.fn.now(),
      });

    // —— 通知规则链接 ——
    if (await trx.schema.hasTable('notification_rules')) {
      await trx('notification_rules')
        .whereIn('event_type', ['FINANCE_AUTOMATION_COMPLETED', 'FINANCE_AUTOMATION_FAILED'])
        .where('link_template', AUTOMATION_PATH_OLD)
        .update({
          link_template: AUTOMATION_PATH_NEW,
          updated_at: trx.fn.now(),
        });
    }
  });
};

exports.down = async function down(knex) {
  await knex.transaction(async (trx) => {
    // 仅回滚菜单/通知；税票类型不回滚中文（避免再次分叉）
    await trx('menus')
      .where('path', AUTOMATION_PATH_NEW)
      .andWhere('permission', 'finance:automation:view')
      .update({
        path: AUTOMATION_PATH_OLD,
        component: 'finance/automation/FinanceAutomation',
        updated_at: trx.fn.now(),
      });

    if (await trx.schema.hasTable('notification_rules')) {
      await trx('notification_rules')
        .whereIn('event_type', ['FINANCE_AUTOMATION_COMPLETED', 'FINANCE_AUTOMATION_FAILED'])
        .where('link_template', AUTOMATION_PATH_NEW)
        .update({
          link_template: AUTOMATION_PATH_OLD,
          updated_at: trx.fn.now(),
        });
    }
  });
};
