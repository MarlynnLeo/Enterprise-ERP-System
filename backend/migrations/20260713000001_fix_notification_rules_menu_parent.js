/**
 * 纠偏：通知规则菜单误挂在设备管理(parent_id=12)下，挪回系统管理
 */
exports.up = async function (knex) {
  const systemMenu =
    (await knex('menus').where({ path: '/system' }).first()) ||
    (await knex('menus').where({ name: '系统管理' }).orWhere({ permission: 'system' }).first());

  if (!systemMenu?.id) {
    console.warn('[fix_notification_rules_menu_parent] 未找到系统管理菜单，跳过');
    return;
  }

  await knex('menus')
    .where((qb) => {
      qb.where({ permission: 'system:notification-rules' }).orWhere({
        path: '/system/notification-rules',
      });
    })
    .update({
      parent_id: systemMenu.id,
      icon: 'icon-bell',
      updated_at: knex.fn.now(),
    });
};

exports.down = async function () {
  // 不回滚到错误的 parent_id
};
