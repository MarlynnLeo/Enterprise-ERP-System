/**
 * Rename the old MRP menu to the automatic production shortage and purchase
 * suggestion page. The original seed migration may have already run in
 * deployed databases, so this migration updates existing rows in place.
 */

exports.up = async function up(knex) {
  await knex('menus')
    .where('path', '/production/mrp')
    .update({
      name: '生产需求',
      permission: 'production:plans',
      updated_at: knex.fn.now(),
    });
};

exports.down = async function down(knex) {
  await knex('menus')
    .where('path', '/production/mrp')
    .update({
      name: 'MRP需求计划',
      permission: 'production:plans',
      updated_at: knex.fn.now(),
    });
};
