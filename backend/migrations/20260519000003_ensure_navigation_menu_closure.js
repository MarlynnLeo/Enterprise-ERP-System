const NAVIGATION_MENUS = [
  {
    parentPermission: 'production',
    name: '生产数据看板',
    path: '/production/data-view',
    component: 'production/ProductionDataView',
    icon: 'icon-data-board',
    permission: 'production:data-view',
    sort_order: 85,
  },
  {
    parentPermission: 'purchase',
    name: 'Purchase History',
    path: '/purchase/history',
    component: 'purchase/PurchaseHistory',
    icon: 'icon-files',
    permission: 'purchase:history',
    sort_order: 70,
  },
  {
    parentPermission: 'quality',
    name: '8D Report',
    path: '/quality/8d-reports',
    component: 'quality/EightDReport',
    icon: 'icon-document-checked',
    permission: 'quality:8d',
    sort_order: 65,
  },
];

const QUALITY_8D_BUTTONS = [
  { name: 'View 8D Report', permission: 'quality:8d:view', sort_order: 1 },
  { name: 'Create 8D Report', permission: 'quality:8d:create', sort_order: 2 },
  { name: 'Update 8D Report', permission: 'quality:8d:update', sort_order: 3 },
  { name: 'Delete 8D Report', permission: 'quality:8d:delete', sort_order: 4 },
];

async function findParentMenu(trx, permission) {
  return trx('menus')
    .where({ permission })
    .orWhere({ path: `/${permission}` })
    .orderBy('id')
    .first();
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

async function upsertMenu(trx, spec) {
  const parent = await findParentMenu(trx, spec.parentPermission);
  const parentRoleIds = await roleIdsWithMenu(trx, parent?.id);
  const payload = {
    parent_id: parent?.id || null,
    name: spec.name,
    path: spec.path,
    component: spec.component,
    icon: spec.icon,
    permission: spec.permission,
    type: 1,
    visible: 1,
    status: 1,
    sort_order: spec.sort_order,
    updated_at: trx.fn.now(),
  };

  const existing = await trx('menus').where({ path: spec.path }).first();
  if (existing) {
    await trx('menus').where({ id: existing.id }).update(payload);
    await grantMenuToRoles(trx, existing.id, parentRoleIds);
    return existing.id;
  }

  const [id] = await trx('menus').insert({
    ...payload,
    created_at: trx.fn.now(),
  });
  await grantMenuToRoles(trx, id, parentRoleIds);
  return id;
}

async function ensureQuality8dButtons(trx, reportMenuId) {
  const reportRoleIds = await roleIdsWithMenu(trx, reportMenuId);

  for (const button of QUALITY_8D_BUTTONS) {
    const payload = {
      parent_id: reportMenuId,
      name: button.name,
      path: '',
      component: '',
      icon: '',
      permission: button.permission,
      type: 2,
      visible: 0,
      status: 1,
      sort_order: button.sort_order,
      updated_at: trx.fn.now(),
    };

    const existing = await trx('menus').where({ permission: button.permission }).first();
    if (existing) {
      await trx('menus').where({ id: existing.id }).update(payload);
      if (button.permission === 'quality:8d:view') {
        await grantMenuToRoles(trx, existing.id, reportRoleIds);
      }
      continue;
    }

    const [id] = await trx('menus').insert({
      ...payload,
      created_at: trx.fn.now(),
    });

    if (button.permission === 'quality:8d:view') {
      await grantMenuToRoles(trx, id, reportRoleIds);
    }
  }
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    let quality8dMenuId = null;

    for (const spec of NAVIGATION_MENUS) {
      const menuId = await upsertMenu(trx, spec);
      if (spec.path === '/quality/8d-reports') {
        quality8dMenuId = menuId;
      }
    }

    if (quality8dMenuId) {
      await ensureQuality8dButtons(trx, quality8dMenuId);
    }
  });
};

exports.down = async function down(knex) {
  await knex.transaction(async (trx) => {
    const paths = NAVIGATION_MENUS.map((menu) => menu.path);
    const permissions = QUALITY_8D_BUTTONS.map((button) => button.permission);

    const menus = await trx('menus')
      .select('id')
      .whereIn('path', paths)
      .orWhereIn('permission', permissions);

    const menuIds = menus.map((menu) => menu.id);
    if (menuIds.length === 0) return;

    await trx('role_menus').whereIn('menu_id', menuIds).delete();
    await trx('menus').whereIn('id', menuIds).delete();
  });
};
