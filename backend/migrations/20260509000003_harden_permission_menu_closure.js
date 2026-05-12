async function firstMenu(trx, where) {
  return trx('menus').where(where).orderBy('id').first();
}

async function adminRoleIds(trx) {
  const rows = await trx('roles')
    .select('id')
    .where('code', 'admin')
    .orWhere('id', 1)
    .orWhere('name', 'like', '%管理员%');
  return rows.map((row) => row.id);
}

async function roleIdsWithMenu(trx, menuId) {
  if (!menuId) return [];
  const rows = await trx('role_menus').distinct('role_id').where('menu_id', menuId);
  return rows.map((row) => row.role_id);
}

async function grantMenu(trx, menuId, roleIds) {
  const uniqueRoleIds = [...new Set(roleIds.filter(Boolean))];
  for (const roleId of uniqueRoleIds) {
    const existing = await trx('role_menus').where({ role_id: roleId, menu_id: menuId }).first();
    if (!existing) {
      await trx('role_menus').insert({ role_id: roleId, menu_id: menuId, created_at: trx.fn.now() });
    }
  }
}

async function ensureMenu(trx, spec) {
  const parent = spec.parentPermission ? await firstMenu(trx, { permission: spec.parentPermission }) : null;
  let menu = spec.path ? await firstMenu(trx, { path: spec.path }) : null;
  if (!menu && spec.permission && (!spec.path || spec.type === 2)) {
    menu = await firstMenu(trx, { permission: spec.permission });
  }

  const payload = {
    parent_id: parent?.id || spec.parentId || 0,
    name: spec.name,
    path: spec.path ?? '',
    component: spec.component ?? '',
    icon: spec.icon ?? '',
    permission: spec.permission,
    type: spec.type,
    visible: spec.visible ?? 1,
    status: spec.status ?? 1,
    sort_order: spec.sort ?? 999,
    updated_at: trx.fn.now(),
  };

  if (menu) {
    await trx('menus').where('id', menu.id).update(payload);
    return { id: menu.id, parentId: payload.parent_id };
  }

  const [id] = await trx('menus').insert({
    ...payload,
    created_at: trx.fn.now(),
  });
  return { id, parentId: payload.parent_id };
}

async function ensureButton(trx, parentPermission, permission, name, sort = 999) {
  const parent = await firstMenu(trx, { permission: parentPermission });
  const menu = await ensureMenu(trx, {
    parentPermission,
    name,
    path: '',
    permission,
    type: 2,
    sort,
  });
  const inheritedRoleIds = await roleIdsWithMenu(trx, parent?.id);
  await grantMenu(trx, menu.id, [...inheritedRoleIds, ...(await adminRoleIds(trx))]);
  return menu.id;
}

async function renamePermission(trx, oldPermission, newPermission) {
  const menu = await firstMenu(trx, { permission: oldPermission });
  if (menu) {
    await trx('menus').where('id', menu.id).update({
      permission: newPermission,
      updated_at: trx.fn.now(),
    });
  }
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    await renamePermission(trx, 'basedata:process-templates', 'basedata:processtemplates');
    await renamePermission(trx, 'basedata:product-categories', 'basedata:productcategories');
    await renamePermission(trx, 'production:report', 'production:reports');
    await renamePermission(trx, 'production:equipment-monitoring', 'production:equipment');

    await renamePermission(trx, 'contract:view:create', 'contract:create');
    await renamePermission(trx, 'contract:view:edit', 'contract:edit');
    await renamePermission(trx, 'contract:view:delete', 'contract:delete');

    await renamePermission(trx, 'quality:replacement-orders:view', 'quality:replacement:view');
    await renamePermission(trx, 'quality:rework-tasks:view', 'quality:rework:view');
    await renamePermission(trx, 'quality:scrap-records:view', 'quality:scrap:view');

    await ensureButton(trx, 'basedata:boms', 'basedata:boms:import', '导入BOM', 20);
    await ensureButton(trx, 'basedata:locations', 'basedata:locations:edit', '编辑库位', 20);
    await ensureButton(trx, 'quality:traceability', 'quality:traceability:create', '创建追溯', 10);
    await ensureButton(trx, 'quality:traceability', 'quality:traceability:update', '编辑追溯', 11);
    await ensureButton(trx, 'system:admin', 'system:initialize', '系统初始化', 10);

    const qualityRoot = await firstMenu(trx, { permission: 'quality' });
    const productionRoot = await firstMenu(trx, { permission: 'production' });
    const financeGl = await firstMenu(trx, { permission: 'finance:gl' });

    const aql = await firstMenu(trx, { permission: 'quality:standards' });
    if (aql) {
      await trx('menus').where('id', aql.id).update({
        path: '/quality/aql-standards',
        permission: 'quality:settings',
        type: 1,
        updated_at: trx.fn.now(),
      });
    }

    const spc = await ensureMenu(trx, {
      parentId: qualityRoot?.id,
      name: 'SPC控制图',
      path: '/quality/spc',
      permission: 'quality:reports',
      type: 1,
      sort: 15,
    });
    await grantMenu(trx, spc.id, [
      ...(await roleIdsWithMenu(trx, qualityRoot?.id)),
      ...(await adminRoleIds(trx)),
    ]);

    const gantt = await ensureMenu(trx, {
      parentId: productionRoot?.id,
      name: '排程甘特图',
      path: '/production/gantt',
      permission: 'production:tasks',
      type: 1,
      sort: 90,
    });
    await grantMenu(trx, gantt.id, [
      ...(await roleIdsWithMenu(trx, productionRoot?.id)),
      ...(await adminRoleIds(trx)),
    ]);

    const opening = await ensureMenu(trx, {
      parentId: financeGl?.id,
      name: '期初余额',
      path: '/finance/gl/opening-balances',
      permission: 'finance:accounts:view',
      type: 1,
      sort: 6,
    });
    await grantMenu(trx, opening.id, [
      ...(await roleIdsWithMenu(trx, financeGl?.id)),
      ...(await adminRoleIds(trx)),
    ]);

    await trx('menus')
      .whereIn('permission', ['system:notifications', 'system:tech-comm'])
      .update({ type: 1, updated_at: trx.fn.now() });
  });
};

exports.down = async function down() {
  // Permission/menu hardening is data reconciliation and is intentionally not rolled back.
};
