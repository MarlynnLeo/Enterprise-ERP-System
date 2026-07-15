/**
 * Seed the minimum RMB manufacturing chart of accounts referenced by runtime services.
 * Existing customer-defined accounts are preserved; only missing codes are inserted.
 */

const ACCOUNTS = [
  ['1001', '库存现金', '资产', 'asset', 1],
  ['1002', '银行存款', '资产', 'asset', 1],
  ['1003', '其他货币资金', '资产', 'asset', 1],
  ['1122', '应收账款', '资产', 'asset', 1],
  ['1123', '预付账款', '资产', 'asset', 1],
  ['1401', '材料采购', '资产', 'asset', 1],
  ['1403', '原材料', '资产', 'asset', 1],
  ['1405', '库存商品', '资产', 'asset', 1],
  ['1406', '产成品', '资产', 'asset', 1],
  ['1408', '委托加工物资', '资产', 'asset', 1],
  ['1409', '期末在制品', '资产', 'asset', 1],
  ['1601', '固定资产', '资产', 'asset', 1],
  ['1602', '累计折旧', '资产', 'asset', 0],
  ['1603', '固定资产减值准备', '资产', 'asset', 0],
  ['1604', '在建工程', '资产', 'asset', 1],
  ['1606', '固定资产清理', '资产', 'asset', 1],
  ['1701', '无形资产', '资产', 'asset', 1],
  ['1702', '累计摊销', '资产', 'asset', 0],
  ['2001', '短期借款', '负债', 'liability', 0],
  ['2131', '预收账款', '负债', 'liability', 0],
  ['2201', '应付职工薪酬', '负债', 'liability', 0],
  ['2202', '应付账款', '负债', 'liability', 0],
  ['220201', '暂估应付（GR/IR）', '负债', 'liability', 0],
  ['2221', '应交税费', '负债', 'liability', 0],
  ['2501', '长期借款', '负债', 'liability', 0],
  ['3001', '实收资本', '权益', 'equity', 0],
  ['3002', '资本公积', '权益', 'equity', 0],
  ['3101', '盈余公积', '权益', 'equity', 0],
  ['3103', '本年利润', '权益', 'equity', 0],
  ['3104', '利润分配', '权益', 'equity', 0],
  ['5001', '生产成本', '成本', 'expense', 1],
  ['5101', '制造费用', '成本', 'expense', 1],
  ['5401', '营业外收入', '收入', 'revenue', 0],
  ['6001', '主营业务收入', '收入', 'revenue', 0],
  ['6051', '其他业务收入', '收入', 'revenue', 0],
  ['6201', '管理费用', '费用', 'expense', 1],
  ['6401', '主营业务成本', '费用', 'expense', 1],
  ['6402', '其他业务成本', '费用', 'expense', 1],
  ['6501', '营业外支出', '费用', 'expense', 1],
  ['6601', '销售费用', '费用', 'expense', 1],
  ['6602', '折旧费用', '费用', 'expense', 1],
  ['6603', '财务费用', '费用', 'expense', 1],
  ['6702', '资产减值损失', '费用', 'expense', 1],
];

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('gl_accounts'))) return;

  const existing = await knex('gl_accounts').select('account_code');
  const existingCodes = new Set(existing.map((row) => String(row.account_code)));
  const availableColumns = new Set(Object.keys(await knex('gl_accounts').columnInfo()));
  const missing = ACCOUNTS
    .filter(([accountCode]) => !existingCodes.has(accountCode))
    .map(([account_code, account_name, account_type, type, is_debit]) => {
      const desired = {
        account_code,
        account_name,
        account_type,
        type,
        is_debit,
        level: 1,
        is_active: 1,
        currency_code: 'CNY',
        description: 'Default RMB manufacturing chart of accounts',
      };
      return Object.fromEntries(
        Object.entries(desired).filter(([column]) => availableColumns.has(column))
      );
    });

  if (missing.length > 0) await knex('gl_accounts').insert(missing);
};

exports.down = async function down() {
  // Never remove accounts: they may already be referenced by posted entries.
};
