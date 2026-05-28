/**
 * Align finance menu parent permissions with route/view permission checks.
 */

exports.up = async function up(knex) {
  await knex('menus')
    .where('path', '/finance/settings/exchange-rates')
    .update({
      permission: 'finance:exchange-rates:view',
      updated_at: knex.fn.now(),
    });

  await knex('menus')
    .where('path', '/finance/reports/standard-cash-flow')
    .update({
      permission: 'finance:reports:standard-cash-flow:view',
      updated_at: knex.fn.now(),
    });
};

exports.down = async function down(knex) {
  await knex('menus')
    .where('path', '/finance/settings/exchange-rates')
    .update({
      permission: 'finance:exchange-rates',
      updated_at: knex.fn.now(),
    });

  await knex('menus')
    .where('path', '/finance/reports/standard-cash-flow')
    .update({
      permission: 'finance:reports:standard-cash-flow',
      updated_at: knex.fn.now(),
    });
};
