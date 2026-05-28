const ACTION_GROUPS = [
  { parent: 'purchase:requisitions', actions: ['view', 'create', 'update', 'delete', 'approve', 'export'] },
  { parent: 'purchase:orders', actions: ['view', 'create', 'update', 'delete', 'approve', 'export', 'import'] },
  { parent: 'purchase:receipts', actions: ['view', 'create', 'update', 'delete', 'export'] },
  {
    parent: 'purchase:returns',
    actions: ['view', 'create', 'update', 'delete', 'approve', 'export'],
    legacyByAction: { delete: ['purchase:returns:update'] },
  },
  { parent: 'purchase:processing', actions: ['view', 'create', 'update', 'delete', 'export'] },
  {
    parent: 'purchase:processing-receipts',
    permissions: ['purchase:processing-receipts:view', 'purchase:processing-receipts:create', 'purchase:processing-receipts:edit', 'purchase:processing-receipts:delete', 'purchase:processing-receipts:export'],
  },
  { parent: 'sales:orders', actions: ['view', 'create', 'update', 'delete', 'export', 'import'] },
  { parent: 'sales:outbound', actions: ['view', 'create', 'update', 'delete', 'export'] },
  { parent: 'sales:returns', actions: ['view', 'create', 'update', 'delete', 'export'] },
  {
    parent: 'sales:exchanges',
    actions: ['view', 'create', 'update', 'delete'],
    legacyByAction: {
      view: ['sales:returns:view'],
      create: ['sales:returns:create'],
      update: ['sales:returns:update'],
      delete: ['sales:returns:delete'],
    },
  },
  { parent: 'sales:quotations', actions: ['view', 'create', 'update', 'delete', 'export'] },
  {
    parent: 'sales:packing-lists',
    permissions: ['sales:packing:view', 'sales:packing:create', 'sales:packing:update', 'sales:packing:delete'],
  },
  { parent: 'sales:delivery-stats', permissions: ['sales:reports:view'] },
  { parent: 'contract:view', permissions: ['contract:create', 'contract:edit', 'contract:delete'] },
];

function actionPermission(parent, action) {
  return `${parent}:${action}`;
}

function actionName(permission) {
  return permission.split(':').pop().replace(/-/g, ' ');
}

async function firstMenu(trx, where) {
  return trx('menus').where(where).orderBy('id').first();
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

async function roleIdsWithPermission(trx, permission) {
  const menu = await firstMenu(trx, { permission });
  return roleIdsWithMenu(trx, menu?.id);
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

async function ensureActionMenu(trx, parent, permission, sort) {
  const parentMenu = await firstMenu(trx, { permission: parent });
  const existing = await firstMenu(trx, { permission });
  const payload = {
    parent_id: parentMenu?.id || 0,
    name: actionName(permission),
    path: '',
    component: '',
    icon: '',
    permission,
    type: 2,
    visible: 0,
    status: 1,
    sort_order: sort,
    updated_at: trx.fn.now(),
  };

  if (existing) {
    await trx('menus').where({ id: existing.id }).update(payload);
    return { id: existing.id, parentMenuId: parentMenu?.id };
  }

  const [id] = await trx('menus').insert({
    ...payload,
    created_at: trx.fn.now(),
  });
  return { id, parentMenuId: parentMenu?.id };
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const adminRoles = await adminRoleIds(trx);

    for (const group of ACTION_GROUPS) {
      const permissions = group.permissions || group.actions.map((action) => actionPermission(group.parent, action));

      for (const [index, permission] of permissions.entries()) {
        const action = group.actions?.[index] || permission.split(':').pop();
        const menu = await ensureActionMenu(trx, group.parent, permission, index + 1);
        const parentRoleIds = await roleIdsWithMenu(trx, menu.parentMenuId);
        const legacyPermissions = group.legacyByAction?.[action] || [];
        const legacyRoleIds = [];

        for (const legacyPermission of legacyPermissions) {
          legacyRoleIds.push(...(await roleIdsWithPermission(trx, legacyPermission)));
        }

        await grantMenuToRoles(trx, menu.id, [...adminRoles, ...parentRoleIds, ...legacyRoleIds]);
      }
    }
  });
};

exports.down = async function down() {
  // Permission alignment is a data repair. Keep generated permissions on rollback.
};
