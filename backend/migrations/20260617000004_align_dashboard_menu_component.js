async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

exports.up = async function up(knex) {
  if (!(await hasTable(knex, 'menus'))) return;

  await knex('menus')
    .where({ path: '/' })
    .andWhere((builder) => {
      builder.where('component', 'Dashboard').orWhere('component', '/Dashboard');
    })
    .update({
      component: 'dashboard/Dashboard',
      updated_at: knex.fn.now(),
    });
};

exports.down = async function down() {
  // Menu component repair is intentionally not rolled back.
};
