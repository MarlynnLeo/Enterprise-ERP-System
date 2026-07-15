const ENTRY_ACTIONS = [
  { permission: 'finance:entries:update', name: '编辑', roleCodes: ['admin', 'system_admin', 'finance_manager', 'accountant'] },
  { permission: 'finance:entries:approve', name: '审核', roleCodes: ['admin', 'system_admin', 'finance_manager'] },
  { permission: 'finance:entries:delete', name: '删除', roleCodes: ['admin', 'system_admin', 'finance_manager'] },
];

const CLOSING_ACTIONS = [
  { permission: 'finance:closing:execute', name: '执行结转', roleCodes: ['admin', 'system_admin', 'finance_manager'] },
];

async function firstMenuByPermission(trx, permission) {
  return trx('menus').where({ permission }).orderBy('id').first();
}

async function ensureActionMenu(trx, action, parentMenu) {
  const existing = await firstMenuByPermission(trx, action.permission);
  if (existing) {
    await trx('menus')
      .where({ id: existing.id })
      .update({
        parent_id: parentMenu.id,
        name: action.name,
        type: 2,
        visible: 1,
        status: 1,
        updated_at: trx.fn.now(),
      });
    return existing.id;
  }

  const [id] = await trx('menus').insert({
    parent_id: parentMenu.id,
    name: action.name,
    path: '',
    component: '',
    icon: '',
    permission: action.permission,
    type: 2,
    visible: 1,
    status: 1,
    sort_order: 900,
    created_at: trx.fn.now(),
    updated_at: trx.fn.now(),
  });
  return id;
}

async function roleIdsByCode(trx, roleCodes) {
  const rows = await trx('roles')
    .select('id')
    .whereIn('code', roleCodes)
    .andWhere('status', 1);
  return rows.map((row) => row.id);
}

async function grantMenuToRoles(trx, menuId, roleIds) {
  for (const roleId of [...new Set(roleIds)]) {
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

async function alignActions(trx, parentPermission, actions) {
  const parentMenu = await firstMenuByPermission(trx, parentPermission);
  if (!parentMenu) {
    return;
  }

  for (const action of actions) {
    const menuId = await ensureActionMenu(trx, action, parentMenu);
    const roleIds = await roleIdsByCode(trx, action.roleCodes);
    await grantMenuToRoles(trx, menuId, roleIds);
  }
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    await alignActions(trx, 'finance:entries:view', ENTRY_ACTIONS);
    await alignActions(trx, 'finance:closing:view', CLOSING_ACTIONS);
  });
};

exports.down = async function down() {
  // Permission alignment is a data repair and is intentionally not rolled back.
};
