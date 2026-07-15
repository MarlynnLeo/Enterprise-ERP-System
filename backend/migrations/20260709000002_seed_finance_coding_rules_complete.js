/**
 * 补齐财务模块运行时所需编码规则（幂等 INSERT IGNORE）
 */

const FINANCE_CODING_RULES = [
  // 总账 / 收付
  {
    business_type: 'ar_invoice',
    name: '应收发票',
    prefix: 'AR',
    date_format: 'YYYYMMDD',
    separator: '-',
    sequence_length: 4,
    reset_cycle: 'daily',
    description: '应收账款发票编号',
  },
  {
    business_type: 'ap_invoice',
    name: '应付发票',
    prefix: 'AP',
    date_format: 'YYYYMMDD',
    separator: '-',
    sequence_length: 4,
    reset_cycle: 'daily',
    description: '应付账款发票编号',
  },
  {
    business_type: 'ar_receipt',
    name: '应收收款单',
    prefix: 'RC',
    date_format: 'YYYYMMDD',
    separator: '-',
    sequence_length: 4,
    reset_cycle: 'daily',
    description: '应收收款单号',
  },
  {
    business_type: 'ap_payment',
    name: '应付付款单',
    prefix: 'PAY',
    date_format: 'YYYYMMDD',
    separator: '-',
    sequence_length: 4,
    reset_cycle: 'daily',
    description: '应付付款单号',
  },
  {
    business_type: 'ar_receipt_batch',
    name: '应收批量收款批次',
    prefix: 'BRC',
    date_format: 'YYYYMMDD',
    separator: '-',
    sequence_length: 4,
    reset_cycle: 'daily',
    description: '应收批量收款批次号',
  },
  {
    business_type: 'ap_payment_batch',
    name: '应付批量付款批次',
    prefix: 'BPAY',
    date_format: 'YYYYMMDD',
    separator: '-',
    sequence_length: 4,
    reset_cycle: 'daily',
    description: '应付批量付款批次号',
  },
  // 预算 / 费用
  {
    business_type: 'budget',
    name: '预算编号',
    prefix: 'BG',
    date_format: 'YYYY',
    separator: '',
    sequence_length: 4,
    reset_cycle: 'yearly',
    description: '财务预算编号',
  },
  {
    business_type: 'expense',
    name: '费用单',
    prefix: 'EXP',
    date_format: 'YYYYMMDD',
    separator: '-',
    sequence_length: 4,
    reset_cycle: 'daily',
    description: '费用报销单号',
  },
  {
    business_type: 'expense_payment',
    name: '费用付款流水',
    prefix: 'TX',
    date_format: 'YYYYMMDD',
    separator: '-',
    sequence_length: 4,
    reset_cycle: 'daily',
    description: '费用付款银行流水号',
  },
  // 出纳 / 税务
  {
    business_type: 'cash_transaction',
    name: '现金交易流水',
    prefix: 'CASH',
    date_format: 'YYYYMMDD',
    separator: '-',
    sequence_length: 5,
    reset_cycle: 'daily',
    description: '现金交易流水号',
  },
  {
    business_type: 'bank_transaction',
    name: '银行交易流水',
    prefix: 'BT',
    date_format: 'YYYYMMDD',
    separator: '-',
    sequence_length: 5,
    reset_cycle: 'daily',
    description: '银行交易流水号',
  },
  {
    business_type: 'tax_payment',
    name: '税款缴纳流水',
    prefix: 'TAX',
    date_format: 'YYYYMMDD',
    separator: '-',
    sequence_length: 4,
    reset_cycle: 'daily',
    description: '税款缴纳银行流水号',
  },
  // 资产 / 成本
  {
    business_type: 'asset',
    name: '固定资产',
    prefix: 'FA',
    date_format: '',
    separator: '',
    sequence_length: 6,
    reset_cycle: 'none',
    description: '固定资产编码',
  },
  {
    business_type: 'asset_depreciation',
    name: '固定资产折旧凭证',
    prefix: 'DEP',
    date_format: 'YYYYMMDD',
    separator: '-',
    sequence_length: 4,
    reset_cycle: 'daily',
    description: '固定资产折旧凭证号',
  },
  {
    business_type: 'asset_disposal',
    name: '固定资产处置单',
    prefix: 'AD',
    date_format: 'YYYYMMDD',
    separator: '-',
    sequence_length: 4,
    reset_cycle: 'daily',
    description: '固定资产处置单号',
  },
  {
    business_type: 'asset_inventory',
    name: '固定资产盘点',
    prefix: 'AINV',
    date_format: 'YYYYMMDD',
    separator: '-',
    sequence_length: 4,
    reset_cycle: 'daily',
    description: '固定资产盘点单号',
  },
  {
    business_type: 'cost_version',
    name: '成本版本',
    prefix: 'CV',
    date_format: 'YYYYMM',
    separator: '-',
    sequence_length: 4,
    reset_cycle: 'monthly',
    description: '标准成本版本号',
  },
];

exports.up = async function up(knex) {
  for (const rule of FINANCE_CODING_RULES) {
    await knex.raw(
      `INSERT INTO coding_rules
        (business_type, name, prefix, date_format, \`separator\`, sequence_length, reset_cycle, initial_value, step, description, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, 1)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         prefix = VALUES(prefix),
         date_format = VALUES(date_format),
         \`separator\` = VALUES(\`separator\`),
         sequence_length = VALUES(sequence_length),
         reset_cycle = VALUES(reset_cycle),
         description = VALUES(description),
         is_active = 1`,
      [
        rule.business_type,
        rule.name,
        rule.prefix,
        rule.date_format,
        rule.separator,
        rule.sequence_length,
        rule.reset_cycle,
        rule.description,
      ]
    );
  }
};

exports.down = async function down(knex) {
  // 不删除历史规则，避免运行时单号中断；仅标记为文档说明
  return knex.raw('SELECT 1');
};
