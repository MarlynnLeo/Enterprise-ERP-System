const PRODUCTION_MENUS = [
  {
    name: '物料齐套检查',
    path: '/production/material-readiness',
    component: 'production/MaterialReadiness',
    icon: 'Warning',
    permission: 'production:material-check',
    sort_order: 55,
  },
  {
    name: '工位管理',
    path: '/production/work-stations',
    component: 'production/WorkStations',
    icon: 'Operation',
    permission: 'production:stations',
    sort_order: 101,
  },
  {
    name: '工序路线',
    path: '/production/process-routes',
    component: 'production/ProcessRoutes',
    icon: 'Connection',
    permission: 'production:routes',
    sort_order: 102,
  },
  {
    name: '装配看板',
    path: '/production/assembly-board',
    component: 'production/AssemblyBoard',
    icon: 'Monitor',
    permission: 'production:assembly',
    sort_order: 103,
  },
];

const MENU_BUTTONS = [
  ['production:anomaly', [
    ['production:anomaly:view', '查看异常上报', 1],
    ['production:anomaly:create', '创建异常上报', 2],
    ['production:anomaly:update', '编辑异常上报', 3],
    ['production:anomaly:delete', '删除异常上报', 4],
  ]],
  ['production:material-check', [
    ['production:material-check:view', '查看物料齐套', 1],
  ]],
  ['production:stations', [
    ['production:stations:view', '查看工位', 1],
    ['production:stations:create', '创建工位', 2],
    ['production:stations:update', '编辑工位', 3],
    ['production:stations:delete', '删除工位', 4],
  ]],
  ['production:routes', [
    ['production:routes:view', '查看工序路线', 1],
    ['production:routes:create', '创建工序路线', 2],
    ['production:routes:update', '编辑工序路线', 3],
    ['production:routes:delete', '删除工序路线', 4],
  ]],
  ['production:assembly', [
    ['production:assembly:view', '查看装配看板', 1],
    ['production:assembly:execute', '执行装配工序', 2],
  ]],
  ['hr:skills', [
    ['hr:skills:view', '查看员工技能', 1],
    ['hr:skills:create', '创建员工技能', 2],
    ['hr:skills:update', '编辑员工技能', 3],
    ['hr:skills:delete', '删除员工技能', 4],
  ]],
];

async function firstMenu(trx, where) {
  return trx('menus').where(where).orderBy('id').first();
}

async function adminRoleIds(trx) {
  const rows = await trx('roles').select('id').where('code', 'admin').orWhere('id', 1);
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

async function upsertProductionMenu(trx, spec) {
  const parent = (await firstMenu(trx, { permission: 'production' })) || (await firstMenu(trx, { path: '/production' }));
  const inheritedRoleIds = [
    ...(await roleIdsWithMenu(trx, parent?.id)),
    ...(await adminRoleIds(trx)),
  ];

  const payload = {
    parent_id: parent?.id || 0,
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

  let menu = await firstMenu(trx, { path: spec.path });
  if (!menu) {
    menu = await firstMenu(trx, { permission: spec.permission });
  }

  if (menu) {
    await trx('menus').where({ id: menu.id }).update(payload);
    await grantMenuToRoles(trx, menu.id, inheritedRoleIds);
    return menu.id;
  }

  const [id] = await trx('menus').insert({
    ...payload,
    created_at: trx.fn.now(),
  });
  await grantMenuToRoles(trx, id, inheritedRoleIds);
  return id;
}

async function ensureButton(trx, parentMenu, permission, name, sortOrder) {
  const inheritedRoleIds = [
    ...(await roleIdsWithMenu(trx, parentMenu?.id)),
    ...(await adminRoleIds(trx)),
  ];

  const payload = {
    parent_id: parentMenu?.id || 0,
    name,
    path: '',
    component: '',
    icon: '',
    permission,
    type: 2,
    visible: 0,
    status: 1,
    sort_order: sortOrder,
    updated_at: trx.fn.now(),
  };

  let menu = parentMenu
    ? await trx('menus').where({ parent_id: parentMenu.id, permission }).orderBy('id').first()
    : null;
  if (!menu) {
    menu = await firstMenu(trx, { permission });
  }

  if (menu) {
    await trx('menus').where({ id: menu.id }).update(payload);
    await grantMenuToRoles(trx, menu.id, inheritedRoleIds);
    return menu.id;
  }

  const [id] = await trx('menus').insert({
    ...payload,
    created_at: trx.fn.now(),
  });
  await grantMenuToRoles(trx, id, inheritedRoleIds);
  return id;
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    for (const spec of PRODUCTION_MENUS) {
      await upsertProductionMenu(trx, spec);
    }

    for (const [parentPermission, buttons] of MENU_BUTTONS) {
      const parentMenu = await firstMenu(trx, { permission: parentPermission });
      for (const [permission, name, sortOrder] of buttons) {
        await ensureButton(trx, parentMenu, permission, name, sortOrder);
      }
    }
  });
};

exports.down = async function down(knex) {
  await knex.transaction(async (trx) => {
    const menuPaths = PRODUCTION_MENUS.map((menu) => menu.path);
    const buttonPermissions = MENU_BUTTONS.flatMap(([, buttons]) => buttons.map(([permission]) => permission));
    const rows = await trx('menus')
      .select('id')
      .whereIn('path', menuPaths)
      .orWhereIn('permission', buttonPermissions);
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return;
    await trx('role_menus').whereIn('menu_id', ids).delete();
    await trx('menus').whereIn('id', ids).delete();
  });
};
