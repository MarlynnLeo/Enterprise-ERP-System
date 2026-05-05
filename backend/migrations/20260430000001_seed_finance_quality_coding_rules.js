/**
 * 补充财务和质量模块运行时单号规则。
 * 这些规则用于替换 Date.now() 拼接的业务编号，保证并发下可追溯、可配置。
 */

exports.up = async function(knex) {
  await knex.raw(`
    INSERT IGNORE INTO coding_rules
      (business_type, name, prefix, date_format, \`separator\`, sequence_length, reset_cycle, description)
    VALUES
      ('ap_payment_batch', '应付批量付款批次', 'BPAY', 'YYYYMMDD', '-', 4, 'daily', '应付批量付款批次号'),
      ('ap_payment',       '应付付款单',       'PAY',  'YYYYMMDD', '-', 4, 'daily', '应付付款单号'),
      ('ar_receipt_batch', '应收批量收款批次', 'BRC',  'YYYYMMDD', '-', 4, 'daily', '应收批量收款批次号'),
      ('ar_receipt',       '应收收款单',       'RC',   'YYYYMMDD', '-', 4, 'daily', '应收收款单号'),
      ('quality_calibration', '量具校准单',    'CAL',  'YYYYMMDD', '-', 4, 'daily', '量具校准编号'),
      ('spc_plan',         'SPC控制计划',      'SPC',  'YYYYMMDD', '-', 4, 'daily', 'SPC控制计划编号'),
      ('cost_version',     '成本版本',         'CV',   'YYYYMM',   '-', 4, 'monthly', '标准成本版本号'),
      ('asset_depreciation','固定资产折旧凭证', 'DEP',  'YYYYMMDD', '-', 4, 'daily', '固定资产折旧凭证号'),
      ('asset_disposal',   '固定资产处置单',    'AD',   'YYYYMMDD', '-', 4, 'daily', '固定资产处置单号'),
      ('cash_transaction', '现金交易流水',      'CASH', 'YYYYMMDD', '-', 5, 'daily', '现金交易流水号')
  `);
};

exports.down = async function(knex) {
  const types = [
    'ap_payment_batch',
    'ap_payment',
    'ar_receipt_batch',
    'ar_receipt',
    'quality_calibration',
    'spc_plan',
    'cost_version',
    'asset_depreciation',
    'asset_disposal',
    'cash_transaction',
  ];
  await knex.raw(`DELETE FROM coding_rules WHERE business_type IN (${types.map(() => '?').join(',')})`, types);
};
