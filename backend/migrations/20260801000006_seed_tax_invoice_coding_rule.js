/**
 * 税务发票正式编码规则（替代业务代码硬编码「待补录-」）
 * 真票号认证后仍可通过 tax 模块 updateInvoiceNumber 回写
 */

const RULE = {
  business_type: 'tax_invoice',
  name: '税务发票',
  prefix: 'TXI',
  date_format: 'YYYYMMDD',
  separator: '-',
  sequence_length: 4,
  reset_cycle: 'daily',
  initial_value: 1,
  step: 1,
  description: '税务发票系统编号（待认证/已认证均可；外部税控号另存 invoice_code）',
  is_active: 1,
};

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('coding_rules'))) return;
  const exists = await knex('coding_rules').where({ business_type: RULE.business_type }).first();
  if (exists) {
    await knex('coding_rules')
      .where({ business_type: RULE.business_type })
      .update({
        name: RULE.name,
        prefix: RULE.prefix,
        date_format: RULE.date_format,
        separator: RULE.separator,
        sequence_length: RULE.sequence_length,
        reset_cycle: RULE.reset_cycle,
        description: RULE.description,
        is_active: 1,
        updated_at: knex.fn.now(),
      });
    return;
  }
  await knex('coding_rules').insert({
    ...RULE,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('coding_rules'))) return;
  await knex('coding_rules').where({ business_type: 'tax_invoice' }).del();
};
