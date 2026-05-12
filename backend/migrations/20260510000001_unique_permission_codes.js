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

async function grantMenuToRoles(trx, menuId, roleIds) {
  if (!menuId || roleIds.length === 0) return;

  for (const roleId of [...new Set(roleIds.filter(Boolean))]) {
    const exists = await trx('role_menus').where({ role_id: roleId, menu_id: menuId }).first();
    if (!exists) {
      await trx('role_menus').insert({ role_id: roleId, menu_id: menuId, created_at: trx.fn.now() });
    }
  }
}

async function updateMenuByPath(trx, path, permission) {
  const menu = await firstMenu(trx, { path });
  if (!menu) return null;

  await trx('menus').where('id', menu.id).update({
    permission,
    type: 1,
    status: 1,
    updated_at: trx.fn.now(),
  });

  return { ...menu, permission };
}

async function updateChildBySort(trx, parentId, sortOrder, permission, status = 1) {
  if (!parentId) return null;
  const menu = await trx('menus').where({ parent_id: parentId, sort_order: sortOrder, type: 2 }).orderBy('id').first();
  if (!menu) return null;

  await trx('menus').where('id', menu.id).update({
    permission,
    status,
    updated_at: trx.fn.now(),
  });

  return { ...menu, permission, status };
}

async function updateChildrenInOrder(trx, parentId, permissions) {
  if (!parentId) return;
  const menus = await trx('menus')
    .where({ parent_id: parentId, type: 2 })
    .where('status', 1)
    .orderBy('sort_order')
    .orderBy('id');

  for (let index = 0; index < permissions.length && index < menus.length; index += 1) {
    await trx('menus').where('id', menus[index].id).update({
      permission: permissions[index],
      sort_order: index,
      status: 1,
      updated_at: trx.fn.now(),
    });
  }
}

async function ensureButton(trx, parent, permission, name, sortOrder) {
  if (!parent?.id) return null;

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
    return menu.id;
  }

  const [id] = await trx('menus').insert({
    ...payload,
    created_at: trx.fn.now(),
  });

  await grantMenuToRoles(trx, id, [
    ...(await roleIdsWithMenu(trx, parent.id)),
    ...(await adminRoleIds(trx)),
  ]);

  return id;
}

async function disableChildBySort(trx, parentId, sortOrder) {
  if (!parentId) return;
  await trx('menus')
    .where({ parent_id: parentId, sort_order: sortOrder, type: 2 })
    .update({ status: 0, updated_at: trx.fn.now() });
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const mrp = await updateMenuByPath(trx, '/production/mrp', 'production:mrp');
    await updateChildBySort(trx, mrp?.id, 0, 'production:mrp:view');
    await updateChildBySort(trx, mrp?.id, 1, 'production:mrp:create');
    await updateChildBySort(trx, mrp?.id, 2, 'production:mrp:update');
    await updateChildBySort(trx, mrp?.id, 3, 'production:mrp:delete');

    await updateMenuByPath(trx, '/production/gantt', 'production:gantt');

    const ecn = await updateMenuByPath(trx, '/basedata/ecn', 'basedata:ecn');
    await updateChildBySort(trx, ecn?.id, 0, 'basedata:ecn:view');
    await updateChildBySort(trx, ecn?.id, 1, 'basedata:ecn:create');
    await updateChildBySort(trx, ecn?.id, 2, 'basedata:ecn:update');
    await updateChildBySort(trx, ecn?.id, 3, 'basedata:ecn:delete');

    const exchangeRates = await updateMenuByPath(trx, '/finance/settings/exchange-rates', 'finance:exchange-rates');
    await updateChildBySort(trx, exchangeRates?.id, 0, 'finance:exchange-rates:view');
    await updateChildBySort(trx, exchangeRates?.id, 1, 'finance:exchange-rates:update');

    const standardCashFlow = await updateMenuByPath(
      trx,
      '/finance/reports/standard-cash-flow',
      'finance:reports:standard-cash-flow'
    );
    await updateChildBySort(trx, standardCashFlow?.id, 0, 'finance:reports:standard-cash-flow:view');
    await updateChildBySort(trx, standardCashFlow?.id, 1, 'finance:reports:standard-cash-flow:create');
    await updateChildBySort(trx, standardCashFlow?.id, 2, 'finance:reports:standard-cash-flow:edit');
    await updateChildBySort(trx, standardCashFlow?.id, 3, 'finance:reports:standard-cash-flow:delete');

    const aql = await updateMenuByPath(trx, '/quality/aql-standards', 'quality:aql');
    await updateChildrenInOrder(trx, aql?.id, [
      'quality:aql:view',
      'quality:aql:create',
      'quality:aql:update',
      'quality:aql:delete',
    ]);
    await ensureButton(trx, aql, 'quality:aql:view', '查看', 0);
    await ensureButton(trx, aql, 'quality:aql:create', '创建', 1);
    await ensureButton(trx, aql, 'quality:aql:update', '编辑', 2);
    await ensureButton(trx, aql, 'quality:aql:delete', '删除', 3);

    const gauges = await updateMenuByPath(trx, '/quality/gauges', 'quality:gauges');
    await updateChildBySort(trx, gauges?.id, 0, 'quality:gauges:view');
    await updateChildBySort(trx, gauges?.id, 1, 'quality:gauges:create');
    await updateChildBySort(trx, gauges?.id, 2, 'quality:gauges:update');
    await updateChildBySort(trx, gauges?.id, 3, 'quality:gauges:delete');

    const supplierQuality = await updateMenuByPath(trx, '/quality/supplier-quality', 'quality:supplier-quality');
    await updateChildBySort(trx, supplierQuality?.id, 0, 'quality:supplier-quality:view');
    await disableChildBySort(trx, supplierQuality?.id, 1);
    await updateChildBySort(trx, supplierQuality?.id, 2, 'quality:supplier-quality:update');
    await disableChildBySort(trx, supplierQuality?.id, 3);

    const spc = await updateMenuByPath(trx, '/quality/spc', 'quality:spc');
    await ensureButton(trx, spc, 'quality:spc:view', '查看', 0);
    await ensureButton(trx, spc, 'quality:spc:update', '编辑', 1);

    const businessAlerts = await updateMenuByPath(trx, '/system/business-alerts', 'system:business-alerts');
    await updateChildBySort(trx, businessAlerts?.id, 0, 'system:business-alerts:view');
    await disableChildBySort(trx, businessAlerts?.id, 1);
    await updateChildBySort(trx, businessAlerts?.id, 2, 'system:business-alerts:edit');
    await disableChildBySort(trx, businessAlerts?.id, 3);
  });
};

exports.down = async function down() {
  // Permission code de-duplication is a data repair and is intentionally not rolled back.
};
