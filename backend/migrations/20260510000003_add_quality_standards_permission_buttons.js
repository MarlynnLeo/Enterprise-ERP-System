async function firstMenu(trx, where) {
  return trx('menus').where(where).orderBy('id').first();
}

async function roleIdsWithMenu(trx, menuId) {
  if (!menuId) return [];
  const rows = await trx('role_menus').distinct('role_id').where('menu_id', menuId);
  return rows.map((row) => row.role_id);
}

async function adminRoleIds(trx) {
  const rows = await trx('roles')
    .select('id')
    .where('code', 'admin')
    .orWhere('id', 1)
    .orWhere('name', 'like', '%管理员%');
  return rows.map((row) => row.id);
}

async function grantMenuToRoles(trx, menuId, roleIds) {
  if (!menuId || roleIds.length === 0) return;
  for (const roleId of [...new Set(roleIds.filter(Boolean))]) {
    const exists = await trx('role_menus').where({ role_id: roleId, menu_id: menuId }).first();
    if (!exists) {
      await trx('role_menus').insert({ role_id: roleId, menu_id: menuId, created_at: trx.fn.now() });
    }
  }
}

async function ensureButton(trx, parent, permission, name, sortOrder) {
  if (!parent?.id) return;

  let menu = await trx('menus').where({ parent_id: parent.id, permission }).orderBy('id').first();
  if (!menu) {
    menu = await firstMenu(trx, { permission });
  }

  const payload = {
    parent_id: parent.id,
    name,
    path: '',
    component: '',
    icon: '',
    permission,
    type: 2,
    visible: 1,
    status: 1,
    sort_order: sortOrder,
    updated_at: trx.fn.now(),
  };

  if (menu) {
    await trx('menus').where('id', menu.id).update(payload);
    await grantMenuToRoles(trx, menu.id, await roleIdsWithMenu(trx, parent.id));
    return;
  }

  const [id] = await trx('menus').insert({ ...payload, created_at: trx.fn.now() });
  await grantMenuToRoles(trx, id, [
    ...(await roleIdsWithMenu(trx, parent.id)),
    ...(await adminRoleIds(trx)),
  ]);
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const templates = await firstMenu(trx, { permission: 'quality:templates' });
    await ensureButton(trx, templates, 'quality:standards:view', '查看质量标准', 20);
    await ensureButton(trx, templates, 'quality:standards:create', '创建质量标准', 21);
    await ensureButton(trx, templates, 'quality:standards:update', '编辑质量标准', 22);
    await ensureButton(trx, templates, 'quality:standards:delete', '删除质量标准', 23);
  });
};

exports.down = async function down() {
  // Data repair is intentionally not rolled back.
};
