/**
 * 迁移：补充缺失的编码规则
 * 包含：MRP运算、外委加工、装箱单、销售换货、库存盘点调整、不合格品、人事等
 * @date 2026-04-21
 */

exports.up = async function(knex) {
  await knex.raw(`
    INSERT IGNORE INTO coding_rules (business_type, name, prefix, date_format, \`separator\`, sequence_length, reset_cycle, description) VALUES
    ('mrp_run',                    'MRP运算',       'MRP',  'YYYYMMDD', '-', 4, 'daily',   'MRP物料需求计划运算编号'),
    ('outsourced_processing',      '外委加工单',    'WW',   'YYMMDD',   '',  3, 'daily',   '外委加工订单'),
    ('outsourced_receipt',         '外委收货单',    'WWRK', 'YYMMDD',   '',  3, 'daily',   '外委加工入库收货'),
    ('packing_list',               '装箱单',        'PL',   'YYMMDD',   '',  3, 'daily',   '销售装箱单'),
    ('sales_exchange',             '销售换货单',    'SE',   'YYYYMMDD', '-', 4, 'daily',   '销售换货/退换'),
    ('inventory_adjustment',       '库存调整单',    'TZ',   'YYYYMMDD', '',  3, 'daily',   '库存盘点调整'),
    ('inventory_transaction',      '库存交易',      'TR',   'YYMMDD',   '',  3, 'daily',   '库存交易流水'),
    ('manual_transaction',         '手工事务',      'MT',   'YYMMDD',   '',  3, 'daily',   '手工库存出入'),
    ('nonconforming_product',      '不合格品',      'NCP',  'YYMM',     '',  4, 'monthly', '不合格品处理单'),
    ('rework_task',                '返工任务',      'RW',   'YYYYMMDD', '-', 4, 'daily',   '质量返工任务单'),
    ('ap_invoice',                 '应付发票',      'AP',   'YYYYMMDD', '',  4, 'daily',   '应付账款发票'),
    ('ar_invoice',                 '应收发票',      'AR',   'YYYYMMDD', '',  4, 'daily',   '应收账款发票'),
    ('receipt_voucher',            '收款单',        'RC',   'YYYYMMDD', '',  4, 'daily',   '收款凭据'),
    ('asset',                      '固定资产',      'FA',   '',         '',  6, 'none',    '固定资产编码'),
    ('inspection_template',        '检验模板',      'IT',   'YYMMDD',   '',  3, 'daily',   '质检模板编号'),
    ('work_order',                 '工单',          'WO',   'YYYYMMDD', '-', 4, 'daily',   '生产工单'),
    ('bom',                        'BOM版本',       'BOM',  'YYMM',     '-', 3, 'monthly', 'BOM物料清单')
  `);

  console.log('[Migration] 已补充 17 条编码规则');
};

exports.down = async function(knex) {
  const types = [
    'mrp_run','outsourced_processing','outsourced_receipt','packing_list',
    'sales_exchange','inventory_adjustment','inventory_transaction','manual_transaction',
    'nonconforming_product','rework_task','ap_invoice','ar_invoice','receipt_voucher',
    'asset','inspection_template','work_order','bom'
  ];
  await knex.raw(`DELETE FROM coding_rules WHERE business_type IN (${types.map(() => '?').join(',')})`, types);
};
