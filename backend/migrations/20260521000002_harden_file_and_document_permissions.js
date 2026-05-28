const PERMISSION_SPECS = [
  {
    permission: 'system:files:download',
    name: 'Download files',
    parentCandidates: ['system:files:upload', 'system:documents:view', 'system'],
    grantMode: 'all_roles_with_any_menu',
  },
  {
    permission: 'finance:exchange-rates',
    name: 'Exchange rates alias',
    parentCandidates: ['finance:exchange-rates:view', 'finance'],
    inheritFrom: 'finance:exchange-rates:view',
  },
  {
    permission: 'finance:reports:standard-cash-flow',
    name: 'Standard cash flow alias',
    parentCandidates: ['finance:reports:standard-cash-flow:view', 'finance:reports:view', 'finance'],
    inheritFrom: 'finance:reports:standard-cash-flow:view',
  },
];

async function firstMenu(trx, permission) {
  return trx('menus').where({ permission }).orderBy('id').first();
}

async function adminRoleIds(trx) {
  const rows = await trx('roles').select('id').where('code', 'admin').orWhere('id', 1);
  return rows.map((row) => row.id);
}

async function roleIdsWithAnyMenu(trx) {
  const rows = await trx('role_menus').distinct('role_id');
  return rows.map((row) => row.role_id);
}

async function roleIdsWithPermission(trx, permission) {
  const menu = await firstMenu(trx, permission);
  if (!menu?.id) return [];
  const rows = await trx('role_menus').distinct('role_id').where({ menu_id: menu.id });
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

async function findParentMenu(trx, parentCandidates) {
  for (const permission of parentCandidates) {
    const menu = await firstMenu(trx, permission);
    if (menu) return menu;
  }
  return null;
}

async function ensurePermissionMenu(trx, spec) {
  let menu = await firstMenu(trx, spec.permission);
  if (!menu) {
    const parent = await findParentMenu(trx, spec.parentCandidates);
    const [id] = await trx('menus').insert({
      parent_id: parent?.id || 0,
      name: spec.name,
      path: '',
      component: '',
      icon: '',
      permission: spec.permission,
      type: 2,
      visible: 0,
      status: 1,
      sort_order: 950,
      created_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });
    menu = { id };
  }

  const adminRoles = await adminRoleIds(trx);
  let roleIds = adminRoles;
  if (spec.grantMode === 'all_roles_with_any_menu') {
    roleIds = [...roleIds, ...(await roleIdsWithAnyMenu(trx))];
  } else if (spec.inheritFrom) {
    roleIds = [...roleIds, ...(await roleIdsWithPermission(trx, spec.inheritFrom))];
  }

  await grantMenuToRoles(trx, menu.id, roleIds);
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    for (const spec of PERMISSION_SPECS) {
      await ensurePermissionMenu(trx, spec);
    }
  });
};

exports.down = async function down() {
  // Data repair only. Keep permission menu closure on rollback.
};
