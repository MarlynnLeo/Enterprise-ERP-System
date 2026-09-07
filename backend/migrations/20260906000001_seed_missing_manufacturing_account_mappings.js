'use strict';

// The manufacturing chart uses enterprise account codes, while older runtime
// fallbacks use a different chart. Only complete mappings for recognizable seeded
// accounts; never reinterpret a customer account that happens to share a code.
const MAPPINGS = [
  ['ADVANCE_RECEIPTS', '2131', '预收账款', 'liability', 0, ['ACCOUNT_ADVANCE_RECEIPTS']],
  ['EMPLOYEE_PAYABLE', '2201', '应付职工薪酬', 'liability', 0, ['ACCOUNT_EMPLOYEE_PAYABLE']],
  ['PRODUCTION_COST', '5001', '生产成本', 'expense', 1, ['ACCOUNT_PRODUCTION_COST']],
  ['MANUFACTURING_EXPENSE', '5101', '制造费用', 'expense', 1, ['ACCOUNT_MANUFACTURING']],
  ['WORK_IN_PROCESS', '1409', '期末在制品', 'asset', 1, ['ACCOUNT_WORK_IN_PROCESS', 'ACCOUNT_WIP']],
  ['WIP', '1409', '期末在制品', 'asset', 1, ['ACCOUNT_WIP', 'ACCOUNT_WORK_IN_PROCESS']],
  ['SALES_REVENUE', '6001', '主营业务收入', 'revenue', 0, ['ACCOUNT_SALES_REVENUE']],
  ['OTHER_REVENUE', '6051', '其他业务收入', 'revenue', 0, ['ACCOUNT_OTHER_REVENUE']],
  ['NON_OPERATING_INCOME', '5401', '营业外收入', 'revenue', 0, ['ACCOUNT_NON_OPERATING_INCOME']],
  ['SALES_COST', '6401', '主营业务成本', 'expense', 1, ['ACCOUNT_SALES_COST']],
  ['COST_OF_GOODS_SOLD', '6401', '主营业务成本', 'expense', 1, ['ACCOUNT_COGS']],
  ['OTHER_COST', '6402', '其他业务成本', 'expense', 1, ['ACCOUNT_OTHER_COST']],
  ['SALES_EXPENSE', '6601', '销售费用', 'expense', 1, ['ACCOUNT_SALES_EXPENSE']],
  ['ADMIN_EXPENSE', '6201', '管理费用', 'expense', 1, ['ACCOUNT_ADMIN_EXPENSE']],
  ['FINANCE_EXPENSE', '6603', '财务费用', 'expense', 1, ['ACCOUNT_FINANCE_EXPENSE']],
  ['DEPRECIATION_EXPENSE', '6602', '折旧费用', 'expense', 1, ['ACCOUNT_DEPRECIATION_EXP']],
  ['NON_OPERATING_EXPENSE', '6501', '营业外支出', 'expense', 1, ['ACCOUNT_NON_OPERATING_EXPENSE']],
];

const SETTING_KEY = 'accounting.account_codes';

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('system_settings')) || !(await knex.schema.hasTable('gl_accounts'))) {
    return;
  }

  const row = await knex('system_settings').where({ key: SETTING_KEY }).first('value');
  let codes = {};
  if (row && row.value != null && row.value !== '') {
    try {
      codes = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    } catch {
      throw new Error('Cannot complete accounting.account_codes: existing setting contains invalid JSON');
    }
    if (!codes || typeof codes !== 'object' || Array.isArray(codes)) {
      throw new Error('Cannot complete accounting.account_codes: existing setting must be an object');
    }
  }

  const accounts = await knex('gl_accounts').select(
    'account_code', 'account_name', 'type', 'is_debit', 'is_active'
  );
  const byCode = new Map(accounts.map((account) => [String(account.account_code), account]));
  const next = { ...codes };
  for (const [key, code, name, type, isDebit, envKeys] of MAPPINGS) {
    // Database settings override environment settings. Do not introduce a database
    // value that would unexpectedly override an explicitly configured environment.
    if (Object.prototype.hasOwnProperty.call(codes, key) || envKeys.some((envKey) => process.env[envKey])) {
      continue;
    }
    const account = byCode.get(code);
    if (account && account.account_name === name && account.type === type
        && Number(account.is_debit) === isDebit && Number(account.is_active) === 1) {
      next[key] = code;
    }
  }

  if (Object.keys(next).length === Object.keys(codes).length) return;
  if (row) {
    await knex('system_settings').where({ key: SETTING_KEY }).update({ value: JSON.stringify(next) });
  } else {
    await knex('system_settings').insert({ key: SETTING_KEY, value: JSON.stringify(next) });
  }
};

exports.down = async function down() {
  // Account mappings may already be used by posted entries. Never remove them.
};
