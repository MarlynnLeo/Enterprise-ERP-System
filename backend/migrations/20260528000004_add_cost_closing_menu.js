exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const parent = await trx('menus')
      .where({ permission: 'finance:cost' })
      .orWhere({ path: '/finance/cost' })
      .orderBy('id')
      .first();

    if (!parent) return;

    const existing = await trx('menus')
      .where({ path: '/finance/cost/closing' })
      .first();

    const row = {
      parent_id: parent.id,
      name: '成本关账',
      path: '/finance/cost/closing',
      component: 'finance/cost/CostClosing',
      icon: 'CircleCheck',
      permission: 'finance:cost:view',
      type: 1,
      visible: 1,
      status: 1,
      sort_order: 3,
      updated_at: trx.fn.now(),
    };

    if (existing) {
      await trx('menus').where({ id: existing.id }).update(row);
      return;
    }

    await trx('menus').insert({
      ...row,
      created_at: trx.fn.now(),
    });

    await trx('menus')
      .where({ parent_id: parent.id })
      .whereIn('path', [
        '/finance/cost/actual',
        '/finance/cost/variance',
        '/finance/cost/settings',
        '/finance/cost/center',
        '/finance/cost/ledger',
        '/finance/cost/profitability',
        '/finance/cost/abc',
      ])
      .increment('sort_order', 1);
  });
};

exports.down = async function down(knex) {
  await knex('menus').where({ path: '/finance/cost/closing' }).del();
};
