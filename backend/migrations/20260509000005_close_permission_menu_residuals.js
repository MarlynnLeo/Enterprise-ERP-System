async function firstMenu(trx, where) {
  return trx('menus').where(where).orderBy('id').first();
}

async function roleIdsWithMenu(trx, menuId) {
  if (!menuId) return [];
  const rows = await trx('role_menus').distinct('role_id').where('menu_id', menuId);
  return rows.map((row) => row.role_id);
}

async function grantMenuToRoles(trx, menuId, roleIds) {
  if (!menuId || roleIds.length === 0) return;

  for (const roleId of [...new Set(roleIds.filter(Boolean))]) {
    const existing = await trx('role_menus').where({ role_id: roleId, menu_id: menuId }).first();
    if (!existing) {
      await trx('role_menus').insert({ role_id: roleId, menu_id: menuId, created_at: trx.fn.now() });
    }
  }
}

async function grantEquivalentPermissions(trx, oldPermissions, newPermissions) {
  const oldMenus = [];
  for (const permission of oldPermissions) {
    const menu = await firstMenu(trx, { permission });
    if (menu) oldMenus.push(menu);
  }

  const roleIds = [];
  for (const menu of oldMenus) {
    roleIds.push(...(await roleIdsWithMenu(trx, menu.id)));
  }

  for (const permission of newPermissions) {
    const menu = await firstMenu(trx, { permission });
    await grantMenuToRoles(trx, menu?.id, roleIds);
  }
}

async function movePermissionUnder(trx, permission, parent, extra = {}) {
  if (!parent) return;
  await trx('menus')
    .where({ permission })
    .update({
      parent_id: parent.id,
      path: extra.path ?? '',
      type: extra.type ?? 2,
      updated_at: trx.fn.now(),
    });
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const permissionsPage = await firstMenu(trx, { permission: 'system:permissions' });
    const codingRulesPage = await firstMenu(trx, { path: '/system/coding-rules' });
    const financeSettingsPage = await firstMenu(trx, { path: '/finance/settings' });
    const firstFinanceReportPage = await firstMenu(trx, { path: '/finance/reports/balance-sheet' });

    await grantEquivalentPermissions(
      trx,
      ['production:outsourced', 'production:outsourced:view'],
      ['purchase:processing', 'purchase:processing:view', 'purchase:processing-receipts', 'purchase:processing-receipts:view']
    );
    await grantEquivalentPermissions(
      trx,
      ['production:outsourced:create'],
      ['purchase:processing:create', 'purchase:processing-receipts:create']
    );
    await grantEquivalentPermissions(
      trx,
      ['production:outsourced:update'],
      ['purchase:processing:update', 'purchase:processing-receipts:edit']
    );
    await grantEquivalentPermissions(
      trx,
      ['production:outsourced:delete'],
      ['purchase:processing:delete', 'purchase:processing-receipts:delete']
    );

    await trx('menus')
      .whereIn('permission', [
        'production:outsourced',
        'production:outsourced:view',
        'production:outsourced:create',
        'production:outsourced:update',
        'production:outsourced:delete',
        'finance:approval',
        'finance:approval:view',
        'finance:approval:create',
        'finance:approval:update',
      ])
      .update({ status: 0, updated_at: trx.fn.now() });

    await movePermissionUnder(trx, 'finance:reports:view', firstFinanceReportPage);
    await movePermissionUnder(trx, 'finance:settings:update', financeSettingsPage);
    await movePermissionUnder(trx, 'system:initialize', permissionsPage);
    await movePermissionUnder(trx, 'system:logs', permissionsPage);
    await movePermissionUnder(trx, 'system:monitor', permissionsPage);

    await movePermissionUnder(trx, 'system:settings:update', codingRulesPage || permissionsPage);
    await movePermissionUnder(trx, 'system:backup:create', permissionsPage);
    await movePermissionUnder(trx, 'system:backup:download', permissionsPage);
    await movePermissionUnder(trx, 'system:backup:view', permissionsPage);
  });
};

exports.down = async function down() {
  // Data repair is intentionally not rolled back.
};
