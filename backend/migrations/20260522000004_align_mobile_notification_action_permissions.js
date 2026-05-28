async function firstMenu(trx, permission) {
  return trx('menus').where({ permission }).orderBy('id').first();
}

async function adminRoleIds(trx) {
  const rows = await trx('roles')
    .select('id')
    .where('code', 'admin')
    .orWhere('id', 1);
  return rows.map((row) => row.id);
}

async function roleIdsWithMenu(trx, menuId) {
  if (!menuId) return [];
  const rows = await trx('role_menus').distinct('role_id').where({ menu_id: menuId });
  return rows.map((row) => row.role_id);
}

async function grantMenuToRoles(trx, menuId, roleIds) {
  for (const roleId of [...new Set(roleIds.filter(Boolean))]) {
    const exists = await trx('role_menus').where({ role_id: roleId, menu_id: menuId }).first();
    if (!exists) {
      await trx('role_menus').insert({
        role_id: roleId,
        menu_id: menuId,
        created_at: trx.fn.now(),
      });
    }
  }
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const parent = await firstMenu(trx, 'system:notifications');
    const systemRoot = await firstMenu(trx, 'system');
    let deleteMenu = await firstMenu(trx, 'system:notifications:delete');

    const payload = {
      parent_id: parent?.id || systemRoot?.id || 0,
      name: '删除通知',
      path: '',
      component: '',
      icon: '',
      permission: 'system:notifications:delete',
      type: 2,
      visible: 0,
      status: 1,
      sort_order: 20,
      updated_at: trx.fn.now(),
    };

    if (deleteMenu) {
      await trx('menus').where({ id: deleteMenu.id }).update(payload);
    } else {
      const [id] = await trx('menus').insert({
        ...payload,
        created_at: trx.fn.now(),
      });
      deleteMenu = { id };
    }

    const roleIds = [
      ...(await adminRoleIds(trx)),
      ...(await roleIdsWithMenu(trx, parent?.id)),
    ];
    await grantMenuToRoles(trx, deleteMenu.id, roleIds);
  });
};

exports.down = async function down() {
  // Data repair only. Keep aligned notification permissions on rollback.
};
