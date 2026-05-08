/**
 * Seed expense subaccounts used by expense categories.
 */

exports.up = async function up(knex) {
  const hasAccounts = await knex.schema.hasTable('gl_accounts');
  if (!hasAccounts) return;

  const [parents] = await knex('gl_accounts')
    .select('id')
    .where('account_code', '6602')
    .limit(1);
  const parentId = parents?.id || null;

  const subaccounts = [
    { account_code: '660201', account_name: '办公费' },
    { account_code: '660203', account_name: '差旅费' },
  ];
  const hasLevel = await knex.schema.hasColumn('gl_accounts', 'level');

  for (const account of subaccounts) {
    const existing = await knex('gl_accounts')
      .where('account_code', account.account_code)
      .first('id');
    if (existing) continue;

    const row = {
      account_code: account.account_code,
      account_name: account.account_name,
      account_type: '费用',
      parent_id: parentId,
      is_debit: 1,
      is_active: 1,
    };
    if (hasLevel) {
      row.level = parentId ? 2 : 1;
    }

    await knex('gl_accounts').insert(row);
  }
};

exports.down = async function down(knex) {
  const hasAccounts = await knex.schema.hasTable('gl_accounts');
  if (!hasAccounts) return;

  await knex('gl_accounts')
    .whereIn('account_code', ['660201', '660203'])
    .whereNotExists(function noEntries() {
      this.select(knex.raw('1'))
        .from('gl_entry_items')
        .whereRaw('gl_entry_items.account_id = gl_accounts.id')
        .limit(1);
    })
    .del();
};
