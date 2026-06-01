exports.up = async function up(knex) {
  const hasMenus = await knex.schema.hasTable('menus');
  if (!hasMenus) return;

  await knex('menus')
    .where('component', 'like', 'dataOverview/%')
    .update({
      component: knex.raw("REPLACE(component, 'dataOverview/', 'dataoverview/')"),
    });
};

exports.down = async function down(knex) {
  const hasMenus = await knex.schema.hasTable('menus');
  if (!hasMenus) return;

  await knex('menus')
    .where('component', 'like', 'dataoverview/%')
    .update({
      component: knex.raw("REPLACE(component, 'dataoverview/', 'dataOverview/')"),
    });
};
