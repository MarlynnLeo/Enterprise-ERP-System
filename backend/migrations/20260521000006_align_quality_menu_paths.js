const QUALITY_MENU_PATHS = [
  {
    permission: 'quality:replacement',
    path: '/quality/replacement-orders',
    component: 'quality/ReplacementOrders',
  },
  {
    permission: 'quality:rework',
    path: '/quality/rework-tasks',
    component: 'quality/ReworkTasks',
  },
  {
    permission: 'quality:scrap',
    path: '/quality/scrap-records',
    component: 'quality/ScrapRecords',
  },
];

exports.up = async function up(knex) {
  for (const menu of QUALITY_MENU_PATHS) {
    await knex('menus')
      .where({ permission: menu.permission })
      .update({
        path: menu.path,
        component: menu.component,
        updated_at: knex.fn.now(),
      });
  }
};

exports.down = async function down(knex) {
  const legacyPaths = {
    'quality:replacement': '/quality/replacement',
    'quality:rework': '/quality/rework',
    'quality:scrap': '/quality/scrap',
  };

  for (const menu of QUALITY_MENU_PATHS) {
    await knex('menus')
      .where({ permission: menu.permission })
      .update({
        path: legacyPaths[menu.permission],
        component: menu.component,
        updated_at: knex.fn.now(),
      });
  }
};
