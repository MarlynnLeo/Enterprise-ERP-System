async function hasTable(knex, tableName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS count
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?`,
    [tableName]
  );
  return Number(rows[0].count) > 0;
}

async function hasColumn(knex, tableName, columnName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS count
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?`,
    [tableName, columnName]
  );
  return Number(rows[0].count) > 0;
}

async function resolveWipAccountCode(knex) {
  const defaultCode = process.env.ACCOUNT_WORK_IN_PROCESS || process.env.ACCOUNT_WIP || '1409';

  if (!(await hasTable(knex, 'system_settings'))) {
    return defaultCode;
  }

  const rows = await knex('system_settings')
    .select('value')
    .where({ key: 'accounting.account_codes' })
    .limit(1);

  if (!rows.length || !rows[0].value) {
    return defaultCode;
  }

  try {
    const parsed = JSON.parse(String(rows[0].value));
    return parsed.WORK_IN_PROCESS || parsed.WIP || defaultCode;
  } catch {
    return defaultCode;
  }
}

exports.up = async function up(knex) {
  if (!(await hasTable(knex, 'gl_accounts'))) {
    return;
  }

  const accountCode = await resolveWipAccountCode(knex);
  const existing = await knex('gl_accounts').where({ account_code: accountCode }).first('id');
  if (existing) {
    return;
  }

  const row = {
    account_code: accountCode,
    account_name: '\u671f\u672b\u5728\u5236\u54c1',
    account_type: '\u8d44\u4ea7',
    is_debit: 1,
    is_active: 1,
  };

  if (await hasColumn(knex, 'gl_accounts', 'type')) {
    row.type = 'asset';
  }
  if (await hasColumn(knex, 'gl_accounts', 'currency_code')) {
    row.currency_code = 'CNY';
  }
  if (await hasColumn(knex, 'gl_accounts', 'description')) {
    row.description = 'Default account for month-end work in process balance';
  }

  await knex('gl_accounts').insert(row);
};

exports.down = async function down(knex) {
  if (!(await hasTable(knex, 'gl_accounts'))) {
    return;
  }

  const accountCode = await resolveWipAccountCode(knex);
  const account = await knex('gl_accounts')
    .where({ account_code: accountCode, account_name: '\u671f\u672b\u5728\u5236\u54c1' })
    .first('id');

  if (!account) {
    return;
  }

  if (await hasTable(knex, 'gl_entry_items')) {
    const used = await knex('gl_entry_items').where({ account_id: account.id }).first('id');
    if (used) {
      return;
    }
  }

  await knex('gl_accounts').where({ id: account.id }).del();
};
