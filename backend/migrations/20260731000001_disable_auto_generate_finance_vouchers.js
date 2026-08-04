/**
 * 关闭业务事件自动生成财务发票/凭证
 * 改为会计凭证页由用户手工选择销售订单/采购订单生成
 */

const CONFIGS = [
  {
    key: 'auto_generate_ar_invoice',
    value: 'false',
    description: '销售出库/销售订单是否自动生成应收发票与凭证（默认关闭，手工选择订单生成）',
  },
  {
    key: 'auto_generate_ap_invoice',
    value: 'false',
    description: '采购入库是否自动生成应付发票与凭证（默认关闭，手工选择订单生成）',
  },
  {
    key: 'auto_generate_sales_cost_entry',
    value: 'false',
    description: '销售出库是否自动生成销售成本凭证（默认关闭）',
  },
  {
    key: 'auto_generate_ar_credit_note',
    value: 'false',
    description: '销售退货是否自动生成红字应收（默认关闭）',
  },
  {
    key: 'auto_generate_ap_credit_note',
    value: 'false',
    description: '采购退货是否自动生成红字应付（默认关闭）',
  },
  {
    key: 'auto_generate_output_tax_invoice',
    value: 'false',
    description: '销售出库是否自动生成销项税务发票（默认关闭）',
  },
  {
    key: 'auto_generate_input_tax_invoice',
    value: 'false',
    description: '采购入库是否自动生成进项税务发票（默认关闭）',
  },
];

exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('system_config');
  if (!hasTable) return;

  for (const item of CONFIGS) {
    const existing = await knex('system_config').where({ config_key: item.key }).first();
    if (existing) {
      await knex('system_config')
        .where({ config_key: item.key })
        .update({
          config_value: item.value,
          config_type: 'boolean',
          description: item.description,
          module: 'finance',
          status: 1,
          updated_at: knex.fn.now(),
        });
    } else {
      await knex('system_config').insert({
        config_key: item.key,
        config_value: item.value,
        config_type: 'boolean',
        description: item.description,
        module: 'finance',
        is_system: 1,
        status: 1,
      });
    }
  }
};

exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('system_config');
  if (!hasTable) return;

  // 回滚为开启（与历史默认行为一致）
  await knex('system_config')
    .whereIn(
      'config_key',
      CONFIGS.map((c) => c.key)
    )
    .update({
      config_value: 'true',
      updated_at: knex.fn.now(),
    });
};
