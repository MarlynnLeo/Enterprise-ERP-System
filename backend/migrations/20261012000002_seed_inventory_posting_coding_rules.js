'use strict';

/**
 * 补齐存货过账与冲销编码规则（幂等检查插入）
 */
const RULES = [
  {
    business_type: 'inventory_posting',
    name: '存货过账单',
    prefix: 'PST',
    date_format: 'YYYYMMDD',
    separator: '-',
    sequence_length: 4,
    reset_cycle: 'daily',
    description: '存货过账凭证编号（借贷平衡核算）',
  },
  {
    business_type: 'inventory_posting_reversal',
    name: '存货冲销单',
    prefix: 'RPST',
    date_format: 'YYYYMMDD',
    separator: '-',
    sequence_length: 4,
    reset_cycle: 'daily',
    description: '存货冲销过账凭证编号',
  },
];

exports.up = async function up(knex) {
  for (const rule of RULES) {
    const existing = await knex('coding_rules').where({ business_type: rule.business_type }).first('id');
    if (!existing) {
      await knex('coding_rules').insert({
        ...rule,
        initial_value: 1,
        step: 1,
        is_active: 1,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
    }
  }
};

exports.down = async function down() {
  // 保留历史编码规则，不自动回滚数据
};
