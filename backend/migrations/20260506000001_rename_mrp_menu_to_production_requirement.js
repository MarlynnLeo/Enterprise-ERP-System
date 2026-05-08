/**
 * Shorten the production MRP menu label.
 */

exports.up = async function up(knex) {
  await knex('menus')
    .where('path', '/production/mrp')
    .update({
      name: '生产需求',
      updated_at: knex.fn.now(),
    });
};

exports.down = async function down(knex) {
  await knex('menus')
    .where('path', '/production/mrp')
    .update({
      name: '生产需求缺料 / 采购建议',
      updated_at: knex.fn.now(),
    });
};
