const ACTION_ROUTE_PATHS = [
  '/finance/gl/entries/receipt',
  '/finance/gl/entries/payment',
  '/finance/gl/entries/transfer',
  '/finance/gl/entries/general',
  '/finance/gl/entries/create',
  '/finance/budget/edit',
  '/finance/budget/edit/:id',
  '/finance/budget/detail/:id',
];

exports.up = async function up(knex) {
  await knex('menus')
    .whereIn('path', ACTION_ROUTE_PATHS)
    .update({
      visible: 0,
      updated_at: knex.fn.now(),
    });
};

exports.down = async function down() {
  // Data cleanup only. Keep existing visibility choices on rollback.
};
